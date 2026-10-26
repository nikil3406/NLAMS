import { db } from '../../../db';
import {
  parcelRepository,
  type CaseParcelWithDetails,
  type ListCaseParcelsResult,
} from '../../repositories/parcel.repository';
import { acquisitionCaseRepository } from '../../repositories/acquisition-case.repository';
import { permissionService } from '../authorization/permission.service';
import { scopeService } from '../authorization/scope.service';
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
} from '../../types/errors';
import { convertAreaToSqm } from '../../lib/geo-utils';
import type {
  CreateAndAssociateParcelInput,
  AssociateExistingParcelInput,
  UpdateCaseParcelInput,
  CaseParcelsQueryInput,
} from '../../validators/parcels';

export interface PaginatedCaseParcelsResult {
  data: CaseParcelWithDetails[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export class ParcelService {
  /**
   * Asserts that the caller is authorized to view case parcels.
   * Case must exist and be accessible within the user's administrative scope.
   */
  private async assertCaseViewAccess(caseId: string, userId: string) {
    await permissionService.requirePermission(userId, 'ACQUISITION_CASE_VIEW');

    const acqCase = await acquisitionCaseRepository.findCaseById(caseId);
    if (!acqCase) {
      throw new NotFoundError(`Acquisition case with ID '${caseId}' not found`);
    }

    const inScope = await scopeService.isWithinAdministrativeScope(
      userId,
      acqCase.project.administrativeUnitId
    );
    if (!inScope) {
      throw new NotFoundError(`Acquisition case with ID '${caseId}' not found`);
    }

    return acqCase;
  }

  /**
   * Asserts that the caller is authorized to manage parcels for this case.
   * Requirements:
   * - Caller must have ACQUISITION_CASE_VIEW permission.
   * - Caller must hold the FIELD_OFFICER role (separation of duties; SUPER_ADMIN cannot bypass).
   * - Linked project must be within caller's administrative scope.
   * - Acquisition case must be in AWAITING_FIELD_VERIFICATION status.
   */
  private async assertParcelManagementAccess(caseId: string, userId: string) {
    await permissionService.requirePermission(userId, 'ACQUISITION_CASE_VIEW');

    // Role check: Only FIELD_OFFICER may add or update parcels during field verification
    const callerRoles = await permissionService.getUserRoles(userId);
    if (!callerRoles.includes('FIELD_OFFICER')) {
      throw new ForbiddenError(
        'Forbidden: Only an authorized Field Officer may add or update parcel details during field verification'
      );
    }

    const acqCase = await acquisitionCaseRepository.findCaseById(caseId);
    if (!acqCase) {
      throw new NotFoundError(`Acquisition case with ID '${caseId}' not found`);
    }

    // Administrative scope check
    const inScope = await scopeService.isWithinAdministrativeScope(
      userId,
      acqCase.project.administrativeUnitId
    );
    if (!inScope) {
      throw new ForbiddenError(
        'Forbidden: case is outside your authorized administrative scope'
      );
    }

    // Workflow state check: Must be in AWAITING_FIELD_VERIFICATION
    if (acqCase.status !== 'AWAITING_FIELD_VERIFICATION') {
      throw new BadRequestError(
        `Cannot manage parcels: case is in '${acqCase.status}' status. Parcels can only be added or updated when the case is in 'AWAITING_FIELD_VERIFICATION' status.`
      );
    }

    return acqCase;
  }

  /**
   * Lists parcels associated with an acquisition case.
   */
  async getCaseParcels(
    caseId: string,
    query: CaseParcelsQueryInput,
    userId: string
  ): Promise<PaginatedCaseParcelsResult> {
    await this.assertCaseViewAccess(caseId, userId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const { data, total } = await parcelRepository.listParcelsByCaseId(caseId, {
      search: query.search,
      limit,
      offset,
    });

    return {
      data,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Associates an existing parcel or creates and associates a new canonical parcel.
   */
  async addParcelToCase(
    caseId: string,
    input: CreateAndAssociateParcelInput | AssociateExistingParcelInput,
    userId: string
  ): Promise<CaseParcelWithDetails> {
    const acqCase = await this.assertParcelManagementAccess(caseId, userId);

    try {
      // Branch 1: Associate existing parcel by parcelId/UUID
      if ('parcelId' in input && !('surveyNumber' in input)) {
        const existingParcel = await parcelRepository.findParcelById(input.parcelId);
        if (!existingParcel) {
          throw new NotFoundError(`Land parcel '${input.parcelId}' not found`);
        }

        // Check if already linked to this case
        const existingAssoc = await parcelRepository.findCaseParcel(caseId, existingParcel.id);
        if (existingAssoc) {
          throw new ConflictError('This parcel is already associated with this acquisition case');
        }

        // Validate area rule: proposed affected area cannot exceed recorded parcel area
        const totalSqm = convertAreaToSqm(Number(existingParcel.totalArea), existingParcel.areaUnit);
        const proposedSqm = convertAreaToSqm(input.proposedAffectedArea, input.affectedAreaUnit);
        if (proposedSqm > totalSqm + 1e-4) {
          throw new BadRequestError(
            `Proposed affected area (${input.proposedAffectedArea} ${input.affectedAreaUnit}) cannot exceed the recorded total parcel area (${existingParcel.totalArea} ${existingParcel.areaUnit})`
          );
        }

        // Create association
        const caseParcel = await parcelRepository.createCaseParcel({
          caseId,
          parcelId: existingParcel.id,
          proposedAffectedArea: String(input.proposedAffectedArea),
          affectedAreaUnit: input.affectedAreaUnit,
          createdBy: userId,
        });

        const result = await parcelRepository.findCaseParcelById(caseParcel.id);
        if (!result) {
          throw new Error('Failed to retrieve created parcel association');
        }
        return result;
      }

      // Branch 2: Create new canonical parcel or reuse locality-matched existing parcel
      const createInput = input as CreateAndAssociateParcelInput;

      // Validate area rule
      const totalSqm = convertAreaToSqm(createInput.totalArea, createInput.areaUnit);
      const proposedSqm = convertAreaToSqm(createInput.proposedAffectedArea, createInput.affectedAreaUnit);
      if (proposedSqm > totalSqm + 1e-4) {
        throw new BadRequestError(
          `Proposed affected area (${createInput.proposedAffectedArea} ${createInput.affectedAreaUnit}) cannot exceed the recorded total parcel area (${createInput.totalArea} ${createInput.areaUnit})`
        );
      }

      // Check for locality-aware duplicate in canonical registry
      const existingLocalityParcel = await parcelRepository.findExistingLocalityParcel({
        state: createInput.state,
        district: createInput.district,
        taluk: createInput.taluk,
        village: createInput.village,
        surveyNumber: createInput.surveyNumber,
        subdivisionNumber: createInput.subdivisionNumber,
      });

      if (existingLocalityParcel) {
        // Parcel already exists in registry! Check if already associated with this case
        const existingAssoc = await parcelRepository.findCaseParcel(caseId, existingLocalityParcel.id);
        if (existingAssoc) {
          throw new ConflictError('This parcel is already associated with this acquisition case');
        }

        // Validate proposed affected area against existing canonical recorded area
        const canonicalTotalSqm = convertAreaToSqm(
          Number(existingLocalityParcel.totalArea),
          existingLocalityParcel.areaUnit
        );
        if (proposedSqm > canonicalTotalSqm + 1e-4) {
          throw new BadRequestError(
            `Proposed affected area (${createInput.proposedAffectedArea} ${createInput.affectedAreaUnit}) cannot exceed existing recorded total parcel area (${existingLocalityParcel.totalArea} ${existingLocalityParcel.areaUnit})`
          );
        }

        // Associate existing canonical parcel to case
        const caseParcel = await parcelRepository.createCaseParcel({
          caseId,
          parcelId: existingLocalityParcel.id,
          proposedAffectedArea: String(createInput.proposedAffectedArea),
          affectedAreaUnit: createInput.affectedAreaUnit,
          createdBy: userId,
        });

        const result = await parcelRepository.findCaseParcelById(caseParcel.id);
        if (!result) {
          throw new Error('Failed to retrieve created parcel association');
        }
        return result;
      }

      // Parcel does not exist in registry; create canonical parcel & association in a single transaction
      const caseParcelId = await db.transaction(async (tx) => {
        let parcelIdToUse = createInput.parcelId?.trim();
        if (parcelIdToUse) {
          const checkExisting = await parcelRepository.findParcelById(parcelIdToUse, tx);
          if (checkExisting) {
            throw new ConflictError(`A parcel with Parcel ID '${parcelIdToUse}' already exists`);
          }
        } else {
          parcelIdToUse = await parcelRepository.generateParcelId();
        }

        const newParcel = await parcelRepository.createParcel(
          {
            parcelId: parcelIdToUse,
            administrativeUnitId:
              createInput.administrativeUnitId ?? acqCase.project.administrativeUnitId,
            state: createInput.state,
            district: createInput.district,
            taluk: createInput.taluk,
            village: createInput.village,
            surveyNumber: createInput.surveyNumber,
            subdivisionNumber: createInput.subdivisionNumber ?? null,
            landRecordReference: createInput.landRecordReference ?? null,
            totalArea: String(createInput.totalArea),
            areaUnit: createInput.areaUnit,
            landUse: createInput.landUse ?? null,
            physicalDescription: createInput.physicalDescription ?? null,
            geometry: createInput.geometry ?? null,
            createdBy: userId,
          },
          tx
        );

        const newCaseParcel = await parcelRepository.createCaseParcel(
          {
            caseId,
            parcelId: newParcel.id,
            proposedAffectedArea: String(createInput.proposedAffectedArea),
            affectedAreaUnit: createInput.affectedAreaUnit,
            createdBy: userId,
          },
          tx
        );

        return newCaseParcel.id;
      });

      const result = await parcelRepository.findCaseParcelById(caseParcelId);
      if (!result) {
        throw new Error('Failed to retrieve newly created parcel association');
      }
      return result;
    } catch (err: unknown) {
      // Catch PostgreSQL unique constraint violations (e.g. acq_case_parcels_case_parcel_idx)
      if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505') {
        throw new ConflictError('This parcel is already associated with this acquisition case');
      }
      throw err;
    }
  }

  /**
   * Updates permitted case-specific parcel details (proposedAffectedArea, affectedAreaUnit).
   * Does NOT overwrite canonical parcel recorded total area.
   */
  async updateCaseParcel(
    caseId: string,
    caseParcelId: string,
    input: UpdateCaseParcelInput,
    userId: string
  ): Promise<CaseParcelWithDetails> {
    await this.assertParcelManagementAccess(caseId, userId);

    const existing = await parcelRepository.findCaseParcelById(caseParcelId);
    if (!existing || existing.caseId !== caseId) {
      throw new NotFoundError(
        `Parcel association with ID '${caseParcelId}' not found for this acquisition case`
      );
    }

    const effectiveProposedArea =
      input.proposedAffectedArea !== undefined
        ? input.proposedAffectedArea
        : Number(existing.proposedAffectedArea);

    const effectiveUnit =
      input.affectedAreaUnit !== undefined
        ? input.affectedAreaUnit
        : existing.affectedAreaUnit;

    // Validate proposed affected area against canonical recorded area
    const totalSqm = convertAreaToSqm(Number(existing.parcel.totalArea), existing.parcel.areaUnit);
    const proposedSqm = convertAreaToSqm(effectiveProposedArea, effectiveUnit);

    if (proposedSqm > totalSqm + 1e-4) {
      throw new BadRequestError(
        `Proposed affected area (${effectiveProposedArea} ${effectiveUnit}) cannot exceed the recorded total parcel area (${existing.parcel.totalArea} ${existing.parcel.areaUnit})`
      );
    }

    await parcelRepository.updateCaseParcel(caseParcelId, {
      proposedAffectedArea:
        input.proposedAffectedArea !== undefined ? String(input.proposedAffectedArea) : undefined,
      affectedAreaUnit: input.affectedAreaUnit,
    });

    const updated = await parcelRepository.findCaseParcelById(caseParcelId);
    if (!updated) {
      throw new Error('Failed to retrieve updated parcel association');
    }
    return updated;
  }
}

export const parcelService = new ParcelService();
