import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../../../db';
import {
  competentAuthorities,
  authorityJurisdictions,
  authorityUserAssignments,
  proposalAuthorityAssignments,
  type CompetentAuthority,
  type NewCompetentAuthority,
  type AuthorityJurisdiction,
  type NewAuthorityJurisdiction,
  type AuthorityUserAssignment,
  type NewAuthorityUserAssignment,
  type ProposalAuthorityAssignment,
} from '../../../db/schema/competent-authorities';
import { administrativeUnits } from '../../../db/schema/administrative-units';
import { users } from '../../../db/schema/users';
import { landParcels } from '../../../db/schema/land-parcels';
import { verifiedLandInventories, inventoryParcelSnapshots } from '../../../db/schema/verified-land-inventories';
import { acquisitionCases } from '../../../db/schema/acquisition-cases';
import {
  competentAuthorityRepository,
  type AuthorityFilterOptions,
  type AuthorityWithDetails,
  type AuthorityJurisdictionWithUnits,
  type AuthorityUserAssignmentWithUser,
} from '../../repositories/competent-authority.repository';
import { administrativeUnitRepository } from '../../repositories/administrative-unit.repository';
import { userRepository } from '../../repositories/user.repository';
import { permissionService } from '../authorization/permission.service';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../types/errors';
import type {
  CreateAuthorityInput,
  UpdateAuthorityInput,
  AddJurisdictionInput,
  UpdateJurisdictionInput,
  AssignAuthorityUserInput,
  UpdateAuthorityUserAssignmentInput,
} from '../../validators/competent-authorities';

export interface EligibleAuthoritiesResult {
  authorities: AuthorityWithDetails[];
  isMultiDistrict: boolean;
  affectedDistricts: Array<{ id?: string; name: string; code?: string }>;
  affectedStates: Array<{ id?: string; name: string; code?: string }>;
  totalParcels: number;
  notice: string | null;
}

export class CompetentAuthorityService {
  /**
   * Asserts that the actor is an active administrator (Super Admin or Ministry Admin)
   * authorized to configure Competent Authorities, jurisdictions, and user assignments.
   */
  async assertCanManageAuthorities(userId: string): Promise<void> {
    const user = await userRepository.findUserById(userId);
    if (!user) {
      throw new ForbiddenError('Forbidden: User not found');
    }
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenError(
        `Forbidden: User account status is '${user.status}'. Only active administrators may manage Competent Authorities.`
      );
    }

    const callerRoles = await permissionService.getUserRoles(userId);
    const isAdmin =
      callerRoles.includes('SUPER_ADMIN') ||
      callerRoles.includes('MINISTRY_ADMIN');

    if (!isAdmin) {
      throw new ForbiddenError(
        'Forbidden: Only Super Admin or Ministry Admin can configure Competent Authorities'
      );
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // COMPETENT AUTHORITY CRUD
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Creates a new Competent Authority.
   */
  async createAuthority(
    input: CreateAuthorityInput,
    actorUserId: string
  ): Promise<AuthorityWithDetails> {
    await this.assertCanManageAuthorities(actorUserId);

    // Verify code uniqueness
    const existing = await competentAuthorityRepository.findAuthorityByCode(
      input.authorityCode.trim()
    );
    if (existing) {
      throw new ConflictError(
        `Competent Authority with code '${input.authorityCode}' already exists`
      );
    }

    // Verify effective dates if provided
    if (input.effectiveUntil && input.effectiveFrom > input.effectiveUntil) {
      throw new BadRequestError('effectiveUntil cannot be before effectiveFrom');
    }

    const created = await competentAuthorityRepository.createAuthority({
      authorityCode: input.authorityCode.trim(),
      authorityName: input.authorityName.trim(),
      designation: input.designation.trim(),
      authorityLevel: input.authorityLevel,
      status: input.status ?? 'ACTIVE',
      effectiveFrom: input.effectiveFrom,
      effectiveUntil: input.effectiveUntil ?? null,
    });

    const full = await competentAuthorityRepository.findAuthorityById(created.id);
    if (!full) {
      throw new Error('Failed to load created Competent Authority');
    }
    return full;
  }

  /**
   * Updates an existing Competent Authority.
   */
  async updateAuthority(
    id: string,
    input: UpdateAuthorityInput,
    actorUserId: string
  ): Promise<AuthorityWithDetails> {
    await this.assertCanManageAuthorities(actorUserId);

    const existing = await competentAuthorityRepository.findAuthorityById(id);
    if (!existing) {
      throw new NotFoundError(`Competent Authority with ID '${id}' not found`);
    }

    // Verify effective dates
    const effectiveFrom = input.effectiveFrom ?? existing.effectiveFrom;
    const effectiveUntil =
      input.effectiveUntil !== undefined
        ? input.effectiveUntil
        : existing.effectiveUntil;

    if (effectiveUntil && effectiveFrom > effectiveUntil) {
      throw new BadRequestError('effectiveUntil cannot be before effectiveFrom');
    }

    const updateData: Partial<NewCompetentAuthority> = {};
    if (input.authorityName !== undefined) updateData.authorityName = input.authorityName.trim();
    if (input.designation !== undefined) updateData.designation = input.designation.trim();
    if (input.authorityLevel !== undefined) updateData.authorityLevel = input.authorityLevel;
    if (input.status !== undefined) updateData.status = input.status;
    if (input.effectiveFrom !== undefined) updateData.effectiveFrom = input.effectiveFrom;
    if (input.effectiveUntil !== undefined) updateData.effectiveUntil = input.effectiveUntil;

    await competentAuthorityRepository.updateAuthority(id, updateData);

    const updated = await competentAuthorityRepository.findAuthorityById(id);
    if (!updated) {
      throw new Error('Failed to load updated Competent Authority');
    }
    return updated;
  }

  /**
   * Retrieves a Competent Authority by ID with jurisdictions and assigned users.
   */
  async getAuthorityById(id: string): Promise<AuthorityWithDetails> {
    const authority = await competentAuthorityRepository.findAuthorityById(id);
    if (!authority) {
      throw new NotFoundError(`Competent Authority with ID '${id}' not found`);
    }
    return authority;
  }

  /**
   * Lists Competent Authorities with optional search/status/level filters.
   */
  async listAuthorities(
    options: AuthorityFilterOptions = {}
  ): Promise<{ data: (CompetentAuthority & { jurisdictions?: AuthorityJurisdictionWithUnits[] })[]; total: number }> {
    const [data, total] = await Promise.all([
      competentAuthorityRepository.findAuthorities(options),
      competentAuthorityRepository.countAuthorities(options),
    ]);

    if (options.includeJurisdictions) {
      const enriched = await Promise.all(
        data.map(async (auth) => {
          const jurisdictions =
            await competentAuthorityRepository.findJurisdictionsByAuthorityId(auth.id);
          return {
            ...auth,
            jurisdictions: jurisdictions.filter((j) => j.status === 'ACTIVE'),
          };
        })
      );
      return { data: enriched, total };
    }

    return { data, total };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // JURISDICTION MANAGEMENT
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Validates administrative unit hierarchy for jurisdiction assignment.
   */
  private async validateJurisdictionHierarchy(data: {
    stateId: string;
    districtId?: string | null;
    talukId?: string | null;
    villageId?: string | null;
  }): Promise<void> {
    // 1. Validate state
    const state = await administrativeUnitRepository.getAdministrativeUnitById(data.stateId);
    if (!state) {
      throw new NotFoundError(`Administrative unit (State) with ID '${data.stateId}' not found`);
    }
    if (state.type !== 'STATE') {
      throw new BadRequestError(
        `Selected state unit '${state.name}' has type '${state.type}', expected 'STATE'`
      );
    }

    // 2. Validate district if provided
    if (data.districtId) {
      const district = await administrativeUnitRepository.getAdministrativeUnitById(data.districtId);
      if (!district) {
        throw new NotFoundError(`Administrative unit (District) with ID '${data.districtId}' not found`);
      }
      if (district.type !== 'DISTRICT') {
        throw new BadRequestError(
          `Selected district unit '${district.name}' has type '${district.type}', expected 'DISTRICT'`
        );
      }
      if (district.parentId !== data.stateId) {
        throw new BadRequestError(
          `District '${district.name}' does not belong to state '${state.name}'`
        );
      }

      // 3. Validate taluk if provided
      if (data.talukId) {
        const taluk = await administrativeUnitRepository.getAdministrativeUnitById(data.talukId);
        if (!taluk) {
          throw new NotFoundError(`Administrative unit (Taluk) with ID '${data.talukId}' not found`);
        }
        if (taluk.type !== 'TALUK') {
          throw new BadRequestError(
            `Selected taluk unit '${taluk.name}' has type '${taluk.type}', expected 'TALUK'`
          );
        }
        if (taluk.parentId !== data.districtId) {
          throw new BadRequestError(
            `Taluk '${taluk.name}' does not belong to district '${district.name}'`
          );
        }

        // 4. Validate village if provided
        if (data.villageId) {
          const village = await administrativeUnitRepository.getAdministrativeUnitById(data.villageId);
          if (!village) {
            throw new NotFoundError(`Administrative unit (Village) with ID '${data.villageId}' not found`);
          }
          if (village.parentId !== data.talukId) {
            throw new BadRequestError(
              `Village '${village.name}' does not belong to taluk '${taluk.name}'`
            );
          }
        }
      } else if (data.villageId) {
        throw new BadRequestError('Cannot specify villageId without talukId');
      }
    } else {
      if (data.talukId) {
        throw new BadRequestError('Cannot specify talukId without districtId');
      }
      if (data.villageId) {
        throw new BadRequestError('Cannot specify villageId without districtId and talukId');
      }
    }
  }

  /**
   * Adds a jurisdiction record to an existing Competent Authority.
   */
  async addJurisdiction(
    authorityId: string,
    input: AddJurisdictionInput,
    actorUserId: string
  ): Promise<AuthorityJurisdiction> {
    await this.assertCanManageAuthorities(actorUserId);

    const authority = await competentAuthorityRepository.findAuthorityById(authorityId);
    if (!authority) {
      throw new NotFoundError(`Competent Authority with ID '${authorityId}' not found`);
    }

    if (input.effectiveUntil && input.effectiveFrom > input.effectiveUntil) {
      throw new BadRequestError('effectiveUntil cannot be before effectiveFrom');
    }

    await this.validateJurisdictionHierarchy({
      stateId: input.stateId,
      districtId: input.districtId,
      talukId: input.talukId,
      villageId: input.villageId,
    });

    return competentAuthorityRepository.addJurisdiction({
      authorityId,
      stateId: input.stateId,
      districtId: input.districtId ?? null,
      talukId: input.talukId ?? null,
      villageId: input.villageId ?? null,
      status: input.status ?? 'ACTIVE',
      effectiveFrom: input.effectiveFrom,
      effectiveUntil: input.effectiveUntil ?? null,
    });
  }

  /**
   * Updates an existing jurisdiction record.
   */
  async updateJurisdiction(
    jurisdictionId: string,
    input: UpdateJurisdictionInput,
    actorUserId: string
  ): Promise<AuthorityJurisdiction> {
    await this.assertCanManageAuthorities(actorUserId);

    const existing = await competentAuthorityRepository.findJurisdictionById(jurisdictionId);
    if (!existing) {
      throw new NotFoundError(`Authority jurisdiction with ID '${jurisdictionId}' not found`);
    }

    const effectiveFrom = input.effectiveFrom ?? existing.effectiveFrom;
    const effectiveUntil =
      input.effectiveUntil !== undefined ? input.effectiveUntil : existing.effectiveUntil;

    if (effectiveUntil && effectiveFrom > effectiveUntil) {
      throw new BadRequestError('effectiveUntil cannot be before effectiveFrom');
    }

    const updateData: Partial<NewAuthorityJurisdiction> = {};
    if (input.status !== undefined) updateData.status = input.status;
    if (input.effectiveFrom !== undefined) updateData.effectiveFrom = input.effectiveFrom;
    if (input.effectiveUntil !== undefined) updateData.effectiveUntil = input.effectiveUntil;

    const updated = await competentAuthorityRepository.updateJurisdiction(
      jurisdictionId,
      updateData
    );
    if (!updated) {
      throw new Error('Failed to update authority jurisdiction');
    }
    return updated;
  }

  /**
   * Lists jurisdictions for a given authority.
   */
  async listJurisdictions(
    authorityId: string
  ): Promise<AuthorityJurisdictionWithUnits[]> {
    const authority = await competentAuthorityRepository.findAuthorityById(authorityId);
    if (!authority) {
      throw new NotFoundError(`Competent Authority with ID '${authorityId}' not found`);
    }
    return competentAuthorityRepository.findJurisdictionsByAuthorityId(authorityId);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // USER ASSIGNMENT MANAGEMENT
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Assigns an authorized user to a Competent Authority.
   */
  async assignUser(
    authorityId: string,
    input: AssignAuthorityUserInput,
    actorUserId: string
  ): Promise<AuthorityUserAssignment> {
    await this.assertCanManageAuthorities(actorUserId);

    const authority = await competentAuthorityRepository.findAuthorityById(authorityId);
    if (!authority) {
      throw new NotFoundError(`Competent Authority with ID '${authorityId}' not found`);
    }

    const targetUser = await userRepository.findUserById(input.userId);
    if (!targetUser) {
      throw new NotFoundError(`User with ID '${input.userId}' not found`);
    }
    if (targetUser.status !== 'ACTIVE') {
      throw new BadRequestError(
        `Cannot assign user: account status is '${targetUser.status}'. Only active users can be assigned.`
      );
    }

    if (input.effectiveUntil && input.effectiveFrom > input.effectiveUntil) {
      throw new BadRequestError('effectiveUntil cannot be before effectiveFrom');
    }

    // Check duplicate active assignment for this user to this authority
    const existingAssignments =
      await competentAuthorityRepository.findUserAssignmentsByAuthorityId(authorityId);
    const hasActiveAssignment = existingAssignments.some(
      (a) => a.userId === input.userId && a.status === 'ACTIVE'
    );
    if (hasActiveAssignment) {
      throw new ConflictError(
        `User '${targetUser.name}' already has an active assignment with Competent Authority '${authority.authorityName}'`
      );
    }

    return competentAuthorityRepository.assignUser({
      authorityId,
      userId: input.userId,
      status: input.status ?? 'ACTIVE',
      effectiveFrom: input.effectiveFrom,
      effectiveUntil: input.effectiveUntil ?? null,
      assignedBy: actorUserId,
    });
  }

  /**
   * Updates an existing user assignment.
   */
  async updateUserAssignment(
    assignmentId: string,
    input: UpdateAuthorityUserAssignmentInput,
    actorUserId: string
  ): Promise<AuthorityUserAssignment> {
    await this.assertCanManageAuthorities(actorUserId);

    const existing = await competentAuthorityRepository.findUserAssignmentById(assignmentId);
    if (!existing) {
      throw new NotFoundError(`Authority user assignment with ID '${assignmentId}' not found`);
    }

    const effectiveFrom = input.effectiveFrom ?? existing.effectiveFrom;
    const effectiveUntil =
      input.effectiveUntil !== undefined ? input.effectiveUntil : existing.effectiveUntil;

    if (effectiveUntil && effectiveFrom > effectiveUntil) {
      throw new BadRequestError('effectiveUntil cannot be before effectiveFrom');
    }

    const updateData: Partial<NewAuthorityUserAssignment> = {};
    if (input.status !== undefined) updateData.status = input.status;
    if (input.effectiveFrom !== undefined) updateData.effectiveFrom = input.effectiveFrom;
    if (input.effectiveUntil !== undefined) updateData.effectiveUntil = input.effectiveUntil;

    const updated = await competentAuthorityRepository.updateUserAssignment(
      assignmentId,
      updateData
    );
    if (!updated) {
      throw new Error('Failed to update authority user assignment');
    }
    return updated;
  }

  /**
   * Lists assigned users for an authority.
   */
  async listUserAssignments(
    authorityId: string
  ): Promise<AuthorityUserAssignmentWithUser[]> {
    const authority = await competentAuthorityRepository.findAuthorityById(authorityId);
    if (!authority) {
      throw new NotFoundError(`Competent Authority with ID '${authorityId}' not found`);
    }
    return competentAuthorityRepository.findUserAssignmentsByAuthorityId(authorityId);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // JURISDICTION-BASED AUTHORITY DISCOVERY (OPTION A: COMMON HIGHER AUTHORITY)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Discovers eligible Competent Authorities for an Acquisition Case based on the
   * geography of affected parcels in the linked approved Verified Land Inventory.
   *
   * Implements Option A (Common Higher Authority):
   * - If all parcels fall under a single district, district-level authorities for that
   *   district as well as encompassing regional/state/central authorities are eligible.
   * - If parcels span multiple districts, district-level authorities for individual
   *   districts are strictly INELIGIBLE. Only a common higher authority encompassing
   *   all affected districts (e.g. Divisional Commissioner, State-level authority,
   *   or Central authority) is eligible.
   * - If no single authority has jurisdiction covering all affected districts, an empty
   *   list is returned with a structured notification that administrative resolution is required.
   */
  async getEligibleAuthoritiesForCase(caseId: string): Promise<EligibleAuthoritiesResult> {
    // 1. Fetch acquisition case
    const [acqCase] = await db
      .select()
      .from(acquisitionCases)
      .where(eq(acquisitionCases.id, caseId))
      .limit(1);

    if (!acqCase) {
      throw new NotFoundError(`Acquisition case with ID '${caseId}' not found`);
    }

    // 2. Fetch latest approved verified land inventory for this case
    const [approvedInventory] = await db
      .select()
      .from(verifiedLandInventories)
      .where(
        and(
          eq(verifiedLandInventories.caseId, caseId),
          eq(verifiedLandInventories.status, 'APPROVED')
        )
      )
      .orderBy(desc(verifiedLandInventories.versionNumber))
      .limit(1);

    if (!approvedInventory) {
      return {
        authorities: [],
        isMultiDistrict: false,
        affectedDistricts: [],
        affectedStates: [],
        totalParcels: 0,
        notice: 'No Ministry-approved Verified Land Inventory found for this acquisition case. An approved inventory is required to identify eligible Competent Authorities.',
      };
    }

    // 3. Fetch snapshots for the approved inventory
    const snapshots = await db
      .select()
      .from(inventoryParcelSnapshots)
      .where(eq(inventoryParcelSnapshots.inventoryId, approvedInventory.id));

    if (snapshots.length === 0) {
      return {
        authorities: [],
        isMultiDistrict: false,
        affectedDistricts: [],
        affectedStates: [],
        totalParcels: 0,
        notice: 'No parcels found in the approved land inventory snapshot.',
      };
    }

    // 4. Resolve geographic units for each parcel
    // Fetch all administrative units to do hierarchy mapping
    const allUnits = await db.select().from(administrativeUnits);
    const unitById = new Map(allUnits.map((u) => [u.id, u]));
    const unitByNameAndType = new Map<string, typeof allUnits[0]>();
    const unitByCode = new Map<string, typeof allUnits[0]>();

    for (const u of allUnits) {
      unitByNameAndType.set(`${u.type}:${u.name.trim().toLowerCase()}`, u);
      unitByCode.set(u.code.trim().toUpperCase(), u);
    }

    // Fetch the physical land_parcels to inspect administrativeUnitId
    const parcelIds = Array.from(new Set(snapshots.map((s) => s.parcelId)));
    const parcelRows = await db
      .select()
      .from(landParcels)
      .where(inArray(landParcels.id, parcelIds));
    const parcelMap = new Map(parcelRows.map((p) => [p.id, p]));

    // Resolve geography per snapshot
    interface ParcelGeo {
      stateId?: string;
      stateName: string;
      districtId?: string;
      districtName: string;
      talukId?: string;
      talukName?: string;
    }

    const resolvedParcels: ParcelGeo[] = [];
    const districtMap = new Map<string, { id?: string; name: string; code?: string }>();
    const stateMap = new Map<string, { id?: string; name: string; code?: string }>();

    for (const snap of snapshots) {
      const physicalParcel = parcelMap.get(snap.parcelId);
      let stateId: string | undefined;
      let districtId: string | undefined;
      let talukId: string | undefined;

      // Method 1: Traverse through physical parcel's administrativeUnitId hierarchy
      if (physicalParcel?.administrativeUnitId) {
        let curr = unitById.get(physicalParcel.administrativeUnitId);
        while (curr) {
          if (curr.type === 'TALUK' && !talukId) talukId = curr.id;
          if (curr.type === 'DISTRICT' && !districtId) districtId = curr.id;
          if (curr.type === 'STATE' && !stateId) stateId = curr.id;
          if (!curr.parentId) break;
          curr = unitById.get(curr.parentId);
        }
      }

      // Method 2: Fallback to string matching with administrativeUnits table
      if (!districtId && snap.district) {
        const found =
          unitByNameAndType.get(`DISTRICT:${snap.district.trim().toLowerCase()}`) ||
          unitByCode.get(snap.district.trim().toUpperCase());
        if (found) {
          districtId = found.id;
          if (!stateId && found.parentId) {
            stateId = found.parentId;
          }
        }
      }

      if (!stateId && snap.state) {
        const found =
          unitByNameAndType.get(`STATE:${snap.state.trim().toLowerCase()}`) ||
          unitByCode.get(snap.state.trim().toUpperCase());
        if (found) stateId = found.id;
      }

      const distKey = districtId ?? snap.district.trim();
      if (!districtMap.has(distKey)) {
        const distUnit = districtId ? unitById.get(districtId) : undefined;
        districtMap.set(distKey, {
          id: districtId,
          name: distUnit?.name ?? snap.district,
          code: distUnit?.code,
        });
      }

      const stateKey = stateId ?? snap.state.trim();
      if (!stateMap.has(stateKey)) {
        const stateUnit = stateId ? unitById.get(stateId) : undefined;
        stateMap.set(stateKey, {
          id: stateId,
          name: stateUnit?.name ?? snap.state,
          code: stateUnit?.code,
        });
      }

      resolvedParcels.push({
        stateId,
        stateName: snap.state,
        districtId,
        districtName: snap.district,
        talukId,
        talukName: snap.taluk,
      });
    }

    const isMultiDistrict = districtMap.size > 1;

    // 5. Fetch all active authorities with active jurisdictions
    const activeAuthorities =
      await competentAuthorityRepository.findActiveAuthoritiesWithJurisdictions();

    // 6. Check eligibility for each authority
    const eligibleAuthorities: AuthorityWithDetails[] = [];

    for (const auth of activeAuthorities) {
      // Option A rule: In multi-district cases, district-level authorities are strictly ineligible
      if (isMultiDistrict && auth.authorityLevel === 'DISTRICT') {
        continue;
      }

      // An authority is eligible if every resolved parcel is covered by at least one of its jurisdictions
      const coversAllParcels = resolvedParcels.every((parcel) => {
        return auth.jurisdictions.some((j) => {
          // Check state match
          if (j.stateId) {
            if (parcel.stateId && j.stateId !== parcel.stateId) {
              return false;
            }
          }

          // Check district match
          if (j.districtId) {
            if (!parcel.districtId || j.districtId !== parcel.districtId) {
              return false;
            }

            // Check taluk match if specified on jurisdiction
            if (j.talukId) {
              if (!parcel.talukId || j.talukId !== parcel.talukId) {
                return false;
              }
            }
          }

          // If jurisdiction has no districtId specified, it encompasses the entire state!
          return true;
        });
      });

      if (coversAllParcels) {
        eligibleAuthorities.push(auth);
      }
    }

    let notice: string | null = null;
    if (eligibleAuthorities.length === 0) {
      if (isMultiDistrict) {
        notice =
          'No single Competent Authority has jurisdiction covering all affected districts. Administrative resolution is required.';
      } else {
        notice =
          'No active Competent Authority found with jurisdiction covering the affected area. Administrative resolution is required.';
      }
    }

    return {
      authorities: eligibleAuthorities,
      isMultiDistrict,
      affectedDistricts: Array.from(districtMap.values()),
      affectedStates: Array.from(stateMap.values()),
      totalParcels: snapshots.length,
      notice,
    };
  }

  /**
   * Discovers eligible authorities for an existing proposal.
   */
  async getEligibleAuthoritiesForProposal(
    proposalId: string
  ): Promise<EligibleAuthoritiesResult> {
    const [proposal] = await db
      .select({ acquisitionCaseId: acquisitionCases.id })
      .from(acquisitionCases)
      .innerJoin(
        // We can find the case from proposal directly
        // db/schema/acquisition-proposals
        sql`acquisition_proposals`,
        sql`acquisition_proposals.acquisition_case_id = acquisition_cases.id`
      )
      .where(sql`acquisition_proposals.id = ${proposalId}::uuid`)
      .limit(1);

    if (!proposal) {
      throw new NotFoundError(`Acquisition proposal with ID '${proposalId}' not found`);
    }

    return this.getEligibleAuthoritiesForCase(proposal.acquisitionCaseId);
  }
}

export const competentAuthorityService = new CompetentAuthorityService();
