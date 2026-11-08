import { eq, sql } from 'drizzle-orm';
import { db } from '../../../db';
import {
  verifiedLandInventories,
  inventoryParcelSnapshots,
  verifiedLandInventoryWorkflowHistory,
  type NewInventoryParcelSnapshot,
} from '../../../db/schema/verified-land-inventories';
import { acquisitionCases } from '../../../db/schema/acquisition-cases';
import {
  verifiedLandInventoryRepository,
  type InventoryWithDetails,
} from '../../repositories/verified-land-inventory.repository';
import { acquisitionCaseRepository } from '../../repositories/acquisition-case.repository';
import { userRepository } from '../../repositories/user.repository';
import { permissionService } from '../authorization/permission.service';
import { scopeService } from '../authorization/scope.service';
import {
  fieldVerificationCompletionService,
  type TransactionClient,
} from '../acquisition-cases/field-verification-completion.service';
import { convertAreaToSqm } from '../../lib/geo-utils';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../types/errors';

interface CaseParcelRow {
  caseParcelId: string;
  parcelId: string;
  proposedAffectedArea: string;
  affectedAreaUnit: string;
  state: string;
  district: string;
  taluk: string;
  village: string;
  surveyNumber: string;
  subdivisionNumber: string | null;
  landRecordReference: string | null;
  totalArea: string;
  areaUnit: string;
  geometry: unknown;
}

interface ReportRow {
  id: string;
  caseParcelId: string;
  status: string;
  outcome: string | null;
  measuredArea: string | null;
  measuredAreaUnit: string | null;
  verificationDate: string | Date | null;
  reviewedBy: string | null;
  revisionNumber: number;
  submittedAt: string | Date | null;
  createdAt: string | Date;
  evidenceCount: number;
}

interface DiscrepancyRow {
  discrepancyId: string;
  caseParcelId: string;
  category: string;
  description: string;
  status: string;
  resolutionDecision: string | null;
  resolutionRemarks: string | null;
  resolvedBy: string | null;
  resolvedAt: string | Date | null;
}

export class VerifiedLandInventoryService {
  /**
   * Asserts caller is an active, verified Land Officer with administrative scope over the case.
   */
  async assertAuthorizedLandOfficer(caseId: string, userId: string) {
    const user = await userRepository.findUserById(userId);
    if (!user) {
      throw new ForbiddenError('Forbidden: User not found');
    }
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenError(
        `Forbidden: User account status is '${user.status}'. Only active Land Officers may manage verified land inventories.`
      );
    }

    const isSuper = await permissionService.isSuperAdmin(userId);
    const callerRoles = await permissionService.getUserRoles(userId);

    if (!callerRoles.includes('LAND_OFFICER') && !isSuper) {
      throw new ForbiddenError(
        'Forbidden: Only an authorized Land Officer may prepare or submit verified land inventories'
      );
    }

    // Role verification: Non-super admin Land Officer must have active unit assignment
    if (!isSuper) {
      const assignedUnits = await scopeService.getUserAssignedUnits(userId);
      if (assignedUnits.length === 0) {
        throw new ForbiddenError(
          'Forbidden: Land Officer has no active administrative unit assignment (unverified status)'
        );
      }
    }

    const acqCase = await acquisitionCaseRepository.findCaseById(caseId);
    if (!acqCase) {
      throw new NotFoundError(`Acquisition case with ID '${caseId}' not found`);
    }

    const inScope = await scopeService.isWithinAdministrativeScope(
      userId,
      acqCase.project.administrativeUnitId
    );
    if (!inScope) {
      throw new ForbiddenError(
        'Forbidden: Acquisition case is outside your authorized administrative scope'
      );
    }

    return acqCase;
  }

  /**
   * Asserts caller is an authorized Ministry Admin for review and decisions.
   * Enforces:
   * - Only MINISTRY_ADMIN can approve/review.
   * - Inventory preparer cannot approve their own inventory.
   * - PROJECT_OFFICER and FIELD_OFFICER cannot approve.
   * - SUPER_ADMIN cannot bypass approval through ordinary workflow endpoints.
   */
  async assertAuthorizedMinistryReviewer(
    userId: string,
    inventory: InventoryWithDetails
  ) {
    const user = await userRepository.findUserById(userId);
    if (!user) {
      throw new ForbiddenError('Forbidden: User not found');
    }
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenError(
        `Forbidden: User account status is '${user.status}'. Only active Ministry Admins may review inventories.`
      );
    }

    const callerRoles = await permissionService.getUserRoles(userId);

    // Business rule: Only MINISTRY_ADMIN can approve inventories.
    // SUPER_ADMIN cannot bypass approval through ordinary workflow endpoints.
    // PROJECT_OFFICER and FIELD_OFFICER cannot approve.
    if (!callerRoles.includes('MINISTRY_ADMIN')) {
      throw new ForbiddenError(
        'Forbidden: Only MINISTRY_ADMIN can review, request corrections, or approve verified land inventories'
      );
    }

    // Role verification: Non-super admin must have active unit assignment
    const isSuper = await permissionService.isSuperAdmin(userId);
    if (!isSuper) {
      const assignedUnits = await scopeService.getUserAssignedUnits(userId);
      if (assignedUnits.length === 0) {
        throw new ForbiddenError(
          'Forbidden: Ministry Admin has no active administrative unit assignment (unverified status)'
        );
      }
    }

    // Administrative scope enforcement
    const inScope = await scopeService.isWithinAdministrativeScope(
      userId,
      inventory.acquisitionCase.project.administrativeUnitId
    );
    if (!inScope) {
      throw new ForbiddenError(
        'Forbidden: Verified land inventory is outside your authorized administrative scope'
      );
    }

    // Separation of duties: "Inventory preparer cannot approve their own inventory."
    if (inventory.preparedBy === userId) {
      throw new ForbiddenError(
        'Forbidden: Inventory preparer cannot approve their own inventory'
      );
    }

    return user;
  }

  /**
   * Asserts caller has access to view an inventory.
   */
  async assertAuthorizedViewer(
    userId: string,
    inventory: InventoryWithDetails
  ) {
    const user = await userRepository.findUserById(userId);
    if (!user) {
      throw new ForbiddenError('Forbidden: User not found');
    }
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenError(
        `Forbidden: User account status is '${user.status}'.`
      );
    }

    const isSuper = await permissionService.isSuperAdmin(userId);
    if (isSuper) {
      return user;
    }

    const inScope = await scopeService.isWithinAdministrativeScope(
      userId,
      inventory.acquisitionCase.project.administrativeUnitId
    );
    if (!inScope) {
      throw new ForbiddenError(
        'Forbidden: Verified land inventory is outside your authorized administrative scope'
      );
    }

    return user;
  }

  /**
   * Generates a verified land inventory for an acquisition case.
   * Runs in an atomic database transaction with row-level locking.
   */
  async generateInventory(
    caseId: string,
    userId: string,
    remarks?: string
  ): Promise<InventoryWithDetails> {
    // 1. Authorize caller as Land Officer
    await this.assertAuthorizedLandOfficer(caseId, userId);

    return db.transaction(async (tx: TransactionClient) => {
      // 2. Lock the acquisition case row for update
      const [lockedCase] = await tx
        .select({
          id: acquisitionCases.id,
          caseReference: acquisitionCases.caseReference,
          status: acquisitionCases.status,
          projectId: acquisitionCases.projectId,
        })
        .from(acquisitionCases)
        .where(eq(acquisitionCases.id, caseId))
        .for('update');

      if (!lockedCase) {
        throw new NotFoundError(`Acquisition case with ID '${caseId}' not found`);
      }

      // 3. Check field verification completion
      if (lockedCase.status !== 'FIELD_VERIFICATION_COMPLETED') {
        throw new BadRequestError(
          `Cannot generate inventory: field verification has not been completed for this acquisition case (current case status: '${lockedCase.status}'). Case must be in 'FIELD_VERIFICATION_COMPLETED' status.`
        );
      }

      // Revalidate completion business rules via completion validation service
      const completionEligibility =
        await fieldVerificationCompletionService.validateCaseCompletion(
          caseId,
          tx
        );
      const unmet = completionEligibility.unmetConditions.filter(
        (c) => c.code !== 'INVALID_CASE_STATUS'
      );
      if (unmet.length > 0) {
        const details = unmet.map((c) => c.message).join('; ');
        throw new BadRequestError(
          `Cannot generate inventory: unmet field verification conditions: ${details}`
        );
      }

      // 4. Fetch all case-parcel associations
      const caseParcelRows = (await tx.execute(sql`
        SELECT
          acp.id AS "caseParcelId",
          acp.parcel_id AS "parcelId",
          acp.proposed_affected_area AS "proposedAffectedArea",
          acp.affected_area_unit AS "affectedAreaUnit",
          lp.state,
          lp.district,
          lp.taluk,
          lp.village,
          lp.survey_number AS "surveyNumber",
          lp.subdivision_number AS "subdivisionNumber",
          lp.land_record_reference AS "landRecordReference",
          lp.total_area AS "totalArea",
          lp.area_unit AS "areaUnit",
          lp.geometry
        FROM acquisition_case_parcels acp
        INNER JOIN land_parcels lp ON lp.id = acp.parcel_id
        WHERE acp.case_id = ${caseId}::uuid
        ORDER BY lp.survey_number ASC, lp.subdivision_number ASC NULLS LAST
      `)) as unknown as CaseParcelRow[];

      if (caseParcelRows.length === 0) {
        throw new BadRequestError(
          'Cannot generate inventory: the acquisition case has no linked parcels'
        );
      }

      // 5. Fetch accepted reports for all case parcels
      const reportRows = (await tx.execute(sql`
        SELECT
          fvr.id,
          fvr.case_parcel_id AS "caseParcelId",
          fvr.status,
          fvr.outcome,
          fvr.measured_area AS "measuredArea",
          fvr.measured_area_unit AS "measuredAreaUnit",
          fvr.verification_date AS "verificationDate",
          fvr.reviewed_by AS "reviewedBy",
          fvr.revision_number AS "revisionNumber",
          fvr.submitted_at AS "submittedAt",
          fvr.created_at AS "createdAt",
          (
            SELECT COUNT(*)::int
            FROM field_verification_evidence fve
            WHERE fve.report_id = fvr.id
          ) AS "evidenceCount"
        FROM field_verification_reports fvr
        INNER JOIN acquisition_case_parcels acp ON acp.id = fvr.case_parcel_id
        WHERE acp.case_id = ${caseId}::uuid
        ORDER BY fvr.case_parcel_id, fvr.revision_number DESC, fvr.submitted_at DESC NULLS LAST, fvr.created_at DESC
      `)) as unknown as ReportRow[];

      const reportsByCaseParcel = new Map<string, ReportRow[]>();
      for (const rpt of reportRows) {
        const cpId = String(rpt.caseParcelId);
        if (!reportsByCaseParcel.has(cpId)) {
          reportsByCaseParcel.set(cpId, []);
        }
        reportsByCaseParcel.get(cpId)!.push(rpt);
      }

      // 6. Fetch discrepancies and resolutions
      const discrepancyRows = (await tx.execute(sql`
        SELECT
          pd.id AS "discrepancyId",
          pd.case_parcel_id AS "caseParcelId",
          pd.category,
          pd.description,
          pd.status,
          drh.decision AS "resolutionDecision",
          drh.remarks AS "resolutionRemarks",
          drh.resolved_by AS "resolvedBy",
          drh.created_at AS "resolvedAt"
        FROM parcel_discrepancies pd
        LEFT JOIN discrepancy_resolution_history drh ON drh.discrepancy_id = pd.id AND drh.decision = 'RESOLVED'
        WHERE pd.case_id = ${caseId}::uuid
      `)) as unknown as DiscrepancyRow[];

      // Confirm no unresolved discrepancies
      for (const disc of discrepancyRows) {
        if (disc.status !== 'RESOLVED' || !disc.resolutionDecision) {
          throw new BadRequestError(
            `Cannot generate inventory: parcel discrepancy '${disc.discrepancyId}' is unresolved`
          );
        }
        if (disc.resolutionRemarks && /exception/i.test(disc.resolutionRemarks)) {
          throw new BadRequestError(
            `Cannot generate inventory: discrepancy '${disc.discrepancyId}' was closed as an administrative exception`
          );
        }
      }

      const discrepanciesByCaseParcel = new Map<
        string,
        Array<{
          discrepancyId: string;
          category: string;
          description: string;
          resolutionDecision?: string;
          resolutionRemarks?: string;
          resolvedBy?: string;
          resolvedAt?: string;
        }>
      >();
      for (const d of discrepancyRows) {
        const cpId = String(d.caseParcelId);
        if (!discrepanciesByCaseParcel.has(cpId)) {
          discrepanciesByCaseParcel.set(cpId, []);
        }
        discrepanciesByCaseParcel.get(cpId)!.push({
          discrepancyId: String(d.discrepancyId),
          category: String(d.category),
          description: String(d.description),
          resolutionDecision: d.resolutionDecision ? String(d.resolutionDecision) : undefined,
          resolutionRemarks: d.resolutionRemarks ? String(d.resolutionRemarks) : undefined,
          resolvedBy: d.resolvedBy ? String(d.resolvedBy) : undefined,
          resolvedAt: d.resolvedAt ? new Date(d.resolvedAt).toISOString() : undefined,
        });
      }

      // Check versioning & draft regeneration
      const existingInventories = await tx
        .select()
        .from(verifiedLandInventories)
        .where(eq(verifiedLandInventories.caseId, caseId))
        .orderBy(sql`${verifiedLandInventories.versionNumber} DESC`)
        .for('update');

      const latest = existingInventories[0];

      let targetInventoryId: string;
      let targetVersionNumber: number;
      let previousVersionId: string | null = null;
      let isRegeneration = false;

      if (latest) {
        if (latest.status === 'SUBMITTED' || latest.status === 'UNDER_REVIEW') {
          throw new ConflictError(
            `Cannot generate inventory: Version ${latest.versionNumber} is currently pending Ministry review (status: '${latest.status}'). Decisions must be recorded before generating subsequent versions.`
          );
        }

        if (latest.status === 'DRAFT') {
          // Regenerate draft version
          targetInventoryId = latest.id;
          targetVersionNumber = latest.versionNumber;
          previousVersionId = latest.previousVersionId;
          isRegeneration = true;
        } else {
          // Previous version is CORRECTION_REQUESTED, REJECTED, or APPROVED
          targetVersionNumber = latest.versionNumber + 1;
          previousVersionId = latest.id;
        }
      } else {
        targetVersionNumber = 1;
        previousVersionId = null;
      }

      // 7. Validate and build parcel snapshots
      const snapshotsToInsert: Omit<NewInventoryParcelSnapshot, 'inventoryId'>[] = [];
      let aggregateRecordedArea = 0;
      let aggregateAffectedArea = 0;

      const firstUnit = String(caseParcelRows[0].areaUnit || 'SQ_M');
      const allUnitsMatch = caseParcelRows.every(
        (p) => String(p.areaUnit) === firstUnit && String(p.affectedAreaUnit) === firstUnit
      );
      const inventoryAreaUnit = allUnitsMatch ? firstUnit : 'SQ_M';

      for (const cp of caseParcelRows) {
        const cpId = String(cp.caseParcelId);
        const parcelReports = reportsByCaseParcel.get(cpId) || [];

        if (parcelReports.length === 0) {
          throw new BadRequestError(
            `Cannot generate inventory: Parcel ${cp.surveyNumber} has no field verification reports`
          );
        }

        // Check for reports currently submitted awaiting review
        const awaiting = parcelReports.find((r) => r.status === 'SUBMITTED');
        if (awaiting) {
          throw new BadRequestError(
            `Cannot generate inventory: Parcel ${cp.surveyNumber} has a report awaiting review`
          );
        }

        const latestReport = parcelReports[0];
        if (latestReport.status !== 'ACCEPTED') {
          throw new BadRequestError(
            `Cannot generate inventory: Parcel ${cp.surveyNumber} does not have an accepted field verification report (status: '${latestReport.status}')`
          );
        }

        if (latestReport.outcome === 'INCONCLUSIVE') {
          throw new BadRequestError(
            `Cannot generate inventory: Parcel ${cp.surveyNumber} accepted report has an inconclusive outcome`
          );
        }

        const evidenceCount = Number(latestReport.evidenceCount || 0);
        if (evidenceCount < 1) {
          throw new BadRequestError(
            `Cannot generate inventory: Parcel ${cp.surveyNumber} accepted report has no attached evidence`
          );
        }

        const recArea = parseFloat(String(cp.totalArea));
        const recUnit = String(cp.areaUnit);
        const affArea = parseFloat(String(cp.proposedAffectedArea));
        const affUnit = String(cp.affectedAreaUnit);

        aggregateRecordedArea +=
          recUnit === inventoryAreaUnit
            ? recArea
            : convertAreaToSqm(recArea, recUnit);

        aggregateAffectedArea +=
          affUnit === inventoryAreaUnit
            ? affArea
            : convertAreaToSqm(affArea, affUnit);

        const parcelDiscList = discrepanciesByCaseParcel.get(cpId) || [];

        snapshotsToInsert.push({
          parcelId: String(cp.parcelId),
          caseParcelId: cpId,
          state: String(cp.state),
          district: String(cp.district),
          taluk: String(cp.taluk),
          village: String(cp.village),
          surveyNumber: String(cp.surveyNumber),
          hissaNumber: cp.subdivisionNumber ? String(cp.subdivisionNumber) : null,
          landRecordReference: cp.landRecordReference
            ? String(cp.landRecordReference)
            : null,
          recordedArea: cp.totalArea.toString(),
          recordedAreaUnit: recUnit,
          proposedAffectedArea: cp.proposedAffectedArea.toString(),
          proposedAffectedAreaUnit: affUnit,
          fieldMeasuredArea: latestReport.measuredArea
            ? latestReport.measuredArea.toString()
            : null,
          fieldMeasuredAreaUnit: latestReport.measuredAreaUnit
            ? String(latestReport.measuredAreaUnit)
            : null,
          acceptedReportId: String(latestReport.id),
          verificationDate: latestReport.verificationDate
            ? new Date(latestReport.verificationDate)
            : null,
          reviewingOfficerId: latestReport.reviewedBy
            ? String(latestReport.reviewedBy)
            : null,
          geometry: cp.geometry ?? null,
          discrepancyDetails: parcelDiscList,
        });
      }

      const totalParcelCount = snapshotsToInsert.length;
      const now = new Date();

      if (isRegeneration) {
        // Controlled regeneration of existing DRAFT
        await tx
          .delete(inventoryParcelSnapshots)
          .where(eq(inventoryParcelSnapshots.inventoryId, targetInventoryId!));

        await tx
          .update(verifiedLandInventories)
          .set({
            totalParcelCount,
            aggregateRecordedArea: aggregateRecordedArea.toFixed(4),
            aggregateAffectedArea: aggregateAffectedArea.toFixed(4),
            areaUnit: inventoryAreaUnit,
            preparedBy: userId,
            generatedAt: now,
            updatedAt: now,
          })
          .where(eq(verifiedLandInventories.id, targetInventoryId!));

        // Insert new snapshots
        await tx.insert(inventoryParcelSnapshots).values(
          snapshotsToInsert.map((s) => ({
            ...s,
            inventoryId: targetInventoryId!,
            createdAt: now,
          }))
        );

        // Audit log
        await tx.insert(verifiedLandInventoryWorkflowHistory).values({
          inventoryId: targetInventoryId!,
          caseId,
          versionNumber: targetVersionNumber,
          action: 'REGENERATE',
          fromStatus: 'DRAFT',
          toStatus: 'DRAFT',
          actorId: userId,
          remarks:
            remarks?.trim() ||
            `Regenerated draft inventory Version ${targetVersionNumber}`,
          createdAt: now,
        });
      } else {
        // Insert new inventory header
        const [newInv] = await tx
          .insert(verifiedLandInventories)
          .values({
            caseId,
            versionNumber: targetVersionNumber,
            status: 'DRAFT',
            totalParcelCount,
            aggregateRecordedArea: aggregateRecordedArea.toFixed(4),
            aggregateAffectedArea: aggregateAffectedArea.toFixed(4),
            areaUnit: inventoryAreaUnit,
            preparedBy: userId,
            generatedAt: now,
            previousVersionId,
            createdAt: now,
            updatedAt: now,
          })
          .returning();

        targetInventoryId = newInv.id;

        // Insert snapshots
        await tx.insert(inventoryParcelSnapshots).values(
          snapshotsToInsert.map((s) => ({
            ...s,
            inventoryId: targetInventoryId,
            createdAt: now,
          }))
        );

        // Audit log
        await tx.insert(verifiedLandInventoryWorkflowHistory).values({
          inventoryId: targetInventoryId,
          caseId,
          versionNumber: targetVersionNumber,
          action: 'GENERATE',
          fromStatus: null,
          toStatus: 'DRAFT',
          actorId: userId,
          remarks:
            remarks?.trim() ||
            `Generated draft verified land inventory Version ${targetVersionNumber}`,
          createdAt: now,
        });
      }

      const fullInventory =
        await verifiedLandInventoryRepository.findInventoryWithDetails(
          targetInventoryId!,
          tx
        );
      return fullInventory!;
    });
  }

  /**
   * Submits a DRAFT inventory for Ministry review.
   */
  async submitInventory(
    inventoryId: string,
    userId: string,
    remarks?: string
  ): Promise<InventoryWithDetails> {
    const existing =
      await verifiedLandInventoryRepository.findInventoryWithDetails(inventoryId);
    if (!existing) {
      throw new NotFoundError(
        `Verified land inventory with ID '${inventoryId}' not found`
      );
    }

    // Authorize caller as Land Officer
    await this.assertAuthorizedLandOfficer(existing.caseId, userId);

    return db.transaction(async (tx: TransactionClient) => {
      const locked =
        await verifiedLandInventoryRepository.findInventoryForUpdate(
          inventoryId,
          tx
        );
      if (!locked) {
        throw new NotFoundError(
          `Verified land inventory with ID '${inventoryId}' not found`
        );
      }

      if (locked.status !== 'DRAFT') {
        throw new ConflictError(
          `Cannot submit inventory: only DRAFT inventories can be submitted (current status: '${locked.status}')`
        );
      }

      const now = new Date();

      await tx
        .update(verifiedLandInventories)
        .set({
          status: 'SUBMITTED',
          submittedBy: userId,
          submittedAt: now,
          updatedAt: now,
        })
        .where(
          sql`${verifiedLandInventories.id} = ${inventoryId}::uuid AND ${verifiedLandInventories.status} = 'DRAFT'`
        );

      await tx.insert(verifiedLandInventoryWorkflowHistory).values({
        inventoryId,
        caseId: locked.caseId,
        versionNumber: locked.versionNumber,
        action: 'SUBMIT',
        fromStatus: 'DRAFT',
        toStatus: 'SUBMITTED',
        actorId: userId,
        remarks:
          remarks?.trim() ||
          `Submitted verified land inventory Version ${locked.versionNumber} for Ministry review`,
        createdAt: now,
      });

      const updated =
        await verifiedLandInventoryRepository.findInventoryWithDetails(
          inventoryId,
          tx
        );
      return updated!;
    });
  }

  /**
   * Records a Ministry decision: APPROVE, REQUEST_CORRECTIONS, REJECT, or START_REVIEW.
   */
  async reviewInventory(
    inventoryId: string,
    userId: string,
    decisionInput: string,
    remarks?: string
  ): Promise<InventoryWithDetails> {
    const existing =
      await verifiedLandInventoryRepository.findInventoryWithDetails(inventoryId);
    if (!existing) {
      throw new NotFoundError(
        `Verified land inventory with ID '${inventoryId}' not found`
      );
    }

    // Authorize caller as Ministry Admin
    await this.assertAuthorizedMinistryReviewer(userId, existing);

    // Normalize decision
    const normalized = decisionInput.toUpperCase();
    let toStatus: 'APPROVED' | 'CORRECTION_REQUESTED' | 'REJECTED' | 'UNDER_REVIEW';
    let action: 'APPROVE' | 'REQUEST_CORRECTIONS' | 'REJECT' | 'START_REVIEW';

    switch (normalized) {
      case 'APPROVE':
      case 'APPROVED':
        toStatus = 'APPROVED';
        action = 'APPROVE';
        break;
      case 'REQUEST_CORRECTIONS':
      case 'CORRECTION_REQUESTED':
        toStatus = 'CORRECTION_REQUESTED';
        action = 'REQUEST_CORRECTIONS';
        break;
      case 'REJECT':
      case 'REJECTED':
        toStatus = 'REJECTED';
        action = 'REJECT';
        break;
      case 'START_REVIEW':
      case 'UNDER_REVIEW':
        toStatus = 'UNDER_REVIEW';
        action = 'START_REVIEW';
        break;
      default:
        throw new BadRequestError(
          `Invalid review decision '${decisionInput}'. Must be APPROVE, REQUEST_CORRECTIONS, or REJECT.`
        );
    }

    // Mandatory remarks check
    if (toStatus === 'REJECTED' && (!remarks || !remarks.trim())) {
      throw new BadRequestError('Remarks are mandatory when rejecting an inventory');
    }

    if (toStatus === 'CORRECTION_REQUESTED' && (!remarks || !remarks.trim())) {
      throw new BadRequestError(
        'Remarks are mandatory when requesting corrections for an inventory'
      );
    }

    return db.transaction(async (tx: TransactionClient) => {
      const locked =
        await verifiedLandInventoryRepository.findInventoryForUpdate(
          inventoryId,
          tx
        );
      if (!locked) {
        throw new NotFoundError(
          `Verified land inventory with ID '${inventoryId}' not found`
        );
      }

      // Check current status
      if (locked.status === 'APPROVED') {
        throw new ConflictError(
          'Approved inventory is immutable and cannot be modified'
        );
      }

      if (
        locked.status === 'REJECTED' ||
        locked.status === 'CORRECTION_REQUESTED'
      ) {
        throw new ConflictError(
          `Inventory has already been reviewed (current status: '${locked.status}')`
        );
      }

      if (locked.status === 'DRAFT') {
        throw new BadRequestError(
          'Cannot review an inventory in DRAFT status. Inventory must be SUBMITTED first.'
        );
      }

      const now = new Date();

      await tx
        .update(verifiedLandInventories)
        .set({
          status: toStatus,
          reviewedBy: userId,
          reviewedAt: now,
          reviewRemarks: remarks?.trim() || null,
          updatedAt: now,
        })
        .where(
          sql`${verifiedLandInventories.id} = ${inventoryId}::uuid AND ${verifiedLandInventories.status} IN ('SUBMITTED', 'UNDER_REVIEW')`
        );

      await tx.insert(verifiedLandInventoryWorkflowHistory).values({
        inventoryId,
        caseId: locked.caseId,
        versionNumber: locked.versionNumber,
        action,
        fromStatus: locked.status,
        toStatus,
        actorId: userId,
        remarks: remarks?.trim() || `Ministry review decision: ${toStatus}`,
        createdAt: now,
      });

      const updated =
        await verifiedLandInventoryRepository.findInventoryWithDetails(
          inventoryId,
          tx
        );
      return updated!;
    });
  }

  /**
   * Retrieves full details and snapshots of an inventory by ID.
   */
  async getInventory(
    inventoryId: string,
    userId: string
  ): Promise<InventoryWithDetails> {
    const inventory =
      await verifiedLandInventoryRepository.findInventoryWithDetails(inventoryId);
    if (!inventory) {
      throw new NotFoundError(
        `Verified land inventory with ID '${inventoryId}' not found`
      );
    }

    await this.assertAuthorizedViewer(userId, inventory);
    return inventory;
  }

  /**
   * Lists all inventory versions for an acquisition case.
   */
  async listInventoryVersions(caseId: string, userId: string) {
    const acqCase = await acquisitionCaseRepository.findCaseById(caseId);
    if (!acqCase) {
      throw new NotFoundError(`Acquisition case with ID '${caseId}' not found`);
    }

    const isSuper = await permissionService.isSuperAdmin(userId);
    if (!isSuper) {
      const inScope = await scopeService.isWithinAdministrativeScope(
        userId,
        acqCase.project.administrativeUnitId
      );
      if (!inScope) {
        throw new ForbiddenError(
          'Forbidden: Acquisition case is outside your authorized administrative scope'
        );
      }
    }

    return verifiedLandInventoryRepository.listInventoriesByCaseId(caseId);
  }

  /**
   * Lists submitted inventories awaiting review for authorized Ministry users.
   */
  async listSubmittedInventories(userId: string) {
    const user = await userRepository.findUserById(userId);
    if (!user) {
      throw new ForbiddenError('Forbidden: User not found');
    }
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenError(
        `Forbidden: User account status is '${user.status}'.`
      );
    }

    const isSuper = await permissionService.isSuperAdmin(userId);
    const roles = await permissionService.getUserRoles(userId);

    if (!roles.includes('MINISTRY_ADMIN') && !isSuper) {
      throw new ForbiddenError(
        'Forbidden: Only Ministry Admins may view submitted inventories'
      );
    }

    let scopedUnitIds: string[] | undefined;
    if (!isSuper) {
      const assignedUnits = await scopeService.getUserAssignedUnits(userId);
      if (assignedUnits.length === 0) {
        return [];
      }
      const unitIdSet = new Set<string>();
      for (const u of assignedUnits) {
        const descendants = await scopeService.getDescendantUnitIds(u.id);
        for (const d of descendants) {
          unitIdSet.add(d);
        }
      }
      scopedUnitIds = Array.from(unitIdSet);
    }

    return verifiedLandInventoryRepository.listSubmittedInventories(scopedUnitIds);
  }
}

export const verifiedLandInventoryService = new VerifiedLandInventoryService();
