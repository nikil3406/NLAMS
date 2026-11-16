import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { db } from '../../db';
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
  type NewProposalAuthorityAssignment,
} from '../../db/schema/competent-authorities';
import { administrativeUnits } from '../../db/schema/administrative-units';
import { users } from '../../db/schema/users';

type TransactionClient = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface AuthorityFilterOptions {
  level?: string;
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
  includeJurisdictions?: boolean;
}

export interface AuthorityJurisdictionWithUnits extends AuthorityJurisdiction {
  state: { id: string; name: string; code: string; type: string };
  district?: { id: string; name: string; code: string; type: string } | null;
  taluk?: { id: string; name: string; code: string; type: string } | null;
  village?: { id: string; name: string; code: string; type: string } | null;
}

export interface AuthorityUserAssignmentWithUser extends AuthorityUserAssignment {
  user: { id: string; name: string; email: string; status: string };
  assigner: { id: string; name: string; email: string };
}

export interface AuthorityWithDetails extends CompetentAuthority {
  jurisdictions: AuthorityJurisdictionWithUnits[];
  userAssignments: AuthorityUserAssignmentWithUser[];
}

export class CompetentAuthorityRepository {
  /**
   * Creates a new Competent Authority record.
   */
  async createAuthority(
    data: NewCompetentAuthority,
    txClient?: TransactionClient
  ): Promise<CompetentAuthority> {
    const executor = (txClient ?? db) as typeof db;
    const [inserted] = await executor
      .insert(competentAuthorities)
      .values(data)
      .returning();
    return inserted;
  }

  /**
   * Finds a Competent Authority by ID with jurisdictions and assigned users.
   */
  async findAuthorityById(
    id: string,
    txClient?: TransactionClient
  ): Promise<AuthorityWithDetails | null> {
    const executor = (txClient ?? db) as typeof db;

    const [authority] = await executor
      .select()
      .from(competentAuthorities)
      .where(eq(competentAuthorities.id, id))
      .limit(1);

    if (!authority) return null;

    const jurisdictions = await this.findJurisdictionsByAuthorityId(id, txClient);
    const userAssignments = await this.findUserAssignmentsByAuthorityId(id, txClient);

    return {
      ...authority,
      jurisdictions,
      userAssignments,
    };
  }

  /**
   * Finds authority by unique code.
   */
  async findAuthorityByCode(
    code: string,
    txClient?: TransactionClient
  ): Promise<CompetentAuthority | null> {
    const executor = (txClient ?? db) as typeof db;
    const [authority] = await executor
      .select()
      .from(competentAuthorities)
      .where(eq(competentAuthorities.authorityCode, code))
      .limit(1);
    return authority ?? null;
  }

  /**
   * Lists competent authorities matching filters.
   */
  async findAuthorities(
    options: AuthorityFilterOptions = {}
  ): Promise<CompetentAuthority[]> {
    const conditions = [];

    if (options.status) {
      conditions.push(eq(competentAuthorities.status, options.status));
    }

    if (options.level) {
      conditions.push(eq(competentAuthorities.authorityLevel, options.level));
    }

    if (options.search && options.search.trim()) {
      const term = `%${options.search.trim()}%`;
      conditions.push(
        or(
          ilike(competentAuthorities.authorityCode, term),
          ilike(competentAuthorities.authorityName, term),
          ilike(competentAuthorities.designation, term)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    let query = db
      .select()
      .from(competentAuthorities)
      .orderBy(desc(competentAuthorities.createdAt))
      .$dynamic();

    if (whereClause) {
      query = query.where(whereClause);
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    if (options.offset) {
      query = query.offset(options.offset);
    }

    return query;
  }

  /**
   * Counts authorities matching filters.
   */
  async countAuthorities(options: AuthorityFilterOptions = {}): Promise<number> {
    const conditions = [];

    if (options.status) {
      conditions.push(eq(competentAuthorities.status, options.status));
    }

    if (options.level) {
      conditions.push(eq(competentAuthorities.authorityLevel, options.level));
    }

    if (options.search && options.search.trim()) {
      const term = `%${options.search.trim()}%`;
      conditions.push(
        or(
          ilike(competentAuthorities.authorityCode, term),
          ilike(competentAuthorities.authorityName, term),
          ilike(competentAuthorities.designation, term)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    let query = db
      .select({ count: sql<number>`count(*)::int` })
      .from(competentAuthorities)
      .$dynamic();

    if (whereClause) {
      query = query.where(whereClause);
    }

    const [row] = await query;
    return row?.count ?? 0;
  }

  /**
   * Updates a Competent Authority record.
   */
  async updateAuthority(
    id: string,
    data: Partial<NewCompetentAuthority>,
    txClient?: TransactionClient
  ): Promise<CompetentAuthority | null> {
    const executor = (txClient ?? db) as typeof db;
    const [updated] = await executor
      .update(competentAuthorities)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(competentAuthorities.id, id))
      .returning();
    return updated ?? null;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // JURISDICTION MANAGEMENT
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Adds a jurisdiction record to an authority.
   */
  async addJurisdiction(
    data: NewAuthorityJurisdiction,
    txClient?: TransactionClient
  ): Promise<AuthorityJurisdiction> {
    const executor = (txClient ?? db) as typeof db;
    const [inserted] = await executor
      .insert(authorityJurisdictions)
      .values(data)
      .returning();
    return inserted;
  }

  /**
   * Retrieves jurisdictions for an authority with administrative unit details.
   */
  async findJurisdictionsByAuthorityId(
    authorityId: string,
    txClient?: TransactionClient
  ): Promise<AuthorityJurisdictionWithUnits[]> {
    const executor = (txClient ?? db) as typeof db;

    const rows = await executor
      .select()
      .from(authorityJurisdictions)
      .where(eq(authorityJurisdictions.authorityId, authorityId))
      .orderBy(desc(authorityJurisdictions.createdAt));

    const result: AuthorityJurisdictionWithUnits[] = [];

    for (const r of rows) {
      const [state] = await executor
        .select({ id: administrativeUnits.id, name: administrativeUnits.name, code: administrativeUnits.code, type: administrativeUnits.type })
        .from(administrativeUnits)
        .where(eq(administrativeUnits.id, r.stateId))
        .limit(1);

      let district = null;
      if (r.districtId) {
        const [d] = await executor
          .select({ id: administrativeUnits.id, name: administrativeUnits.name, code: administrativeUnits.code, type: administrativeUnits.type })
          .from(administrativeUnits)
          .where(eq(administrativeUnits.id, r.districtId))
          .limit(1);
        district = d ?? null;
      }

      let taluk = null;
      if (r.talukId) {
        const [t] = await executor
          .select({ id: administrativeUnits.id, name: administrativeUnits.name, code: administrativeUnits.code, type: administrativeUnits.type })
          .from(administrativeUnits)
          .where(eq(administrativeUnits.id, r.talukId))
          .limit(1);
        taluk = t ?? null;
      }

      let village = null;
      if (r.villageId) {
        const [v] = await executor
          .select({ id: administrativeUnits.id, name: administrativeUnits.name, code: administrativeUnits.code, type: administrativeUnits.type })
          .from(administrativeUnits)
          .where(eq(administrativeUnits.id, r.villageId))
          .limit(1);
        village = v ?? null;
      }

      result.push({
        ...r,
        state: state ?? { id: r.stateId, name: 'Unknown', code: 'UNK', type: 'STATE' },
        district,
        taluk,
        village,
      });
    }

    return result;
  }

  /**
   * Finds a jurisdiction by ID.
   */
  async findJurisdictionById(
    id: string,
    txClient?: TransactionClient
  ): Promise<AuthorityJurisdiction | null> {
    const executor = (txClient ?? db) as typeof db;
    const [row] = await executor
      .select()
      .from(authorityJurisdictions)
      .where(eq(authorityJurisdictions.id, id))
      .limit(1);
    return row ?? null;
  }

  /**
   * Updates a jurisdiction record.
   */
  async updateJurisdiction(
    id: string,
    data: Partial<NewAuthorityJurisdiction>,
    txClient?: TransactionClient
  ): Promise<AuthorityJurisdiction | null> {
    const executor = (txClient ?? db) as typeof db;
    const [updated] = await executor
      .update(authorityJurisdictions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(authorityJurisdictions.id, id))
      .returning();
    return updated ?? null;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // USER ASSIGNMENTS
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Assigns a user to a Competent Authority.
   */
  async assignUser(
    data: NewAuthorityUserAssignment,
    txClient?: TransactionClient
  ): Promise<AuthorityUserAssignment> {
    const executor = (txClient ?? db) as typeof db;
    const [inserted] = await executor
      .insert(authorityUserAssignments)
      .values(data)
      .returning();
    return inserted;
  }

  /**
   * Retrieves users assigned to an authority.
   */
  async findUserAssignmentsByAuthorityId(
    authorityId: string,
    txClient?: TransactionClient
  ): Promise<AuthorityUserAssignmentWithUser[]> {
    const executor = (txClient ?? db) as typeof db;

    const rows = await executor
      .select({
        assignment: authorityUserAssignments,
        user: {
          id: users.id,
          name: users.name,
          email: users.email,
          status: users.status,
        },
      })
      .from(authorityUserAssignments)
      .innerJoin(users, eq(authorityUserAssignments.userId, users.id))
      .where(eq(authorityUserAssignments.authorityId, authorityId))
      .orderBy(desc(authorityUserAssignments.createdAt));

    const result: AuthorityUserAssignmentWithUser[] = [];

    for (const r of rows) {
      const [assigner] = await executor
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, r.assignment.assignedBy))
        .limit(1);

      result.push({
        ...r.assignment,
        user: r.user,
        assigner: assigner ?? { id: r.assignment.assignedBy, name: 'System', email: '' },
      });
    }

    return result;
  }

  /**
   * Finds user assignment by ID.
   */
  async findUserAssignmentById(
    id: string,
    txClient?: TransactionClient
  ): Promise<AuthorityUserAssignment | null> {
    const executor = (txClient ?? db) as typeof db;
    const [row] = await executor
      .select()
      .from(authorityUserAssignments)
      .where(eq(authorityUserAssignments.id, id))
      .limit(1);
    return row ?? null;
  }

  /**
   * Updates user assignment.
   */
  async updateUserAssignment(
    id: string,
    data: Partial<NewAuthorityUserAssignment>,
    txClient?: TransactionClient
  ): Promise<AuthorityUserAssignment | null> {
    const executor = (txClient ?? db) as typeof db;
    const [updated] = await executor
      .update(authorityUserAssignments)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(authorityUserAssignments.id, id))
      .returning();
    return updated ?? null;
  }

  /**
   * Finds all active Competent Authorities where the user has an active assignment
   * with current valid effective dates.
   */
  async findActiveAuthoritiesForUser(
    userId: string,
    txClient?: TransactionClient
  ): Promise<CompetentAuthority[]> {
    const executor = (txClient ?? db) as typeof db;
    const today = new Date().toISOString().slice(0, 10);

    const rows = await executor
      .select({
        authority: competentAuthorities,
      })
      .from(authorityUserAssignments)
      .innerJoin(
        competentAuthorities,
        eq(authorityUserAssignments.authorityId, competentAuthorities.id)
      )
      .where(
        and(
          eq(authorityUserAssignments.userId, userId),
          eq(authorityUserAssignments.status, 'ACTIVE'),
          sql`${authorityUserAssignments.effectiveFrom} <= ${today}::date`,
          or(
            sql`${authorityUserAssignments.effectiveUntil} IS NULL`,
            sql`${authorityUserAssignments.effectiveUntil} >= ${today}::date`
          ),
          eq(competentAuthorities.status, 'ACTIVE'),
          sql`${competentAuthorities.effectiveFrom} <= ${today}::date`,
          or(
            sql`${competentAuthorities.effectiveUntil} IS NULL`,
            sql`${competentAuthorities.effectiveUntil} >= ${today}::date`
          )
        )
      );

    return rows.map((r) => r.authority);
  }

  /**
   * Checks if a user has an active, valid assignment to a specific Competent Authority.
   */
  async hasActiveAssignment(
    userId: string,
    authorityId: string,
    txClient?: TransactionClient
  ): Promise<boolean> {
    const executor = (txClient ?? db) as typeof db;
    const today = new Date().toISOString().slice(0, 10);

    const [row] = await executor
      .select({ id: authorityUserAssignments.id })
      .from(authorityUserAssignments)
      .innerJoin(
        competentAuthorities,
        eq(authorityUserAssignments.authorityId, competentAuthorities.id)
      )
      .where(
        and(
          eq(authorityUserAssignments.userId, userId),
          eq(authorityUserAssignments.authorityId, authorityId),
          eq(authorityUserAssignments.status, 'ACTIVE'),
          sql`${authorityUserAssignments.effectiveFrom} <= ${today}::date`,
          or(
            sql`${authorityUserAssignments.effectiveUntil} IS NULL`,
            sql`${authorityUserAssignments.effectiveUntil} >= ${today}::date`
          ),
          eq(competentAuthorities.status, 'ACTIVE')
        )
      )
      .limit(1);

    return !!row;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // PROPOSAL AUTHORITY ASSIGNMENTS
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Creates a proposal authority assignment record.
   */
  async createProposalAuthorityAssignment(
    data: NewProposalAuthorityAssignment,
    txClient?: TransactionClient
  ): Promise<ProposalAuthorityAssignment> {
    const executor = (txClient ?? db) as typeof db;
    const [inserted] = await executor
      .insert(proposalAuthorityAssignments)
      .values(data)
      .returning();
    return inserted;
  }

  /**
   * Retrieves the current ACTIVE authority assignment for a proposal version.
   */
  async findActiveProposalAuthorityAssignment(
    proposalVersionId: string,
    txClient?: TransactionClient
  ): Promise<(ProposalAuthorityAssignment & { authority: CompetentAuthority }) | null> {
    const executor = (txClient ?? db) as typeof db;

    const [row] = await executor
      .select({
        assignment: proposalAuthorityAssignments,
        authority: competentAuthorities,
      })
      .from(proposalAuthorityAssignments)
      .innerJoin(
        competentAuthorities,
        eq(proposalAuthorityAssignments.authorityId, competentAuthorities.id)
      )
      .where(
        and(
          eq(proposalAuthorityAssignments.proposalVersionId, proposalVersionId),
          eq(proposalAuthorityAssignments.assignmentStatus, 'ACTIVE')
        )
      )
      .orderBy(desc(proposalAuthorityAssignments.assignedAt))
      .limit(1);

    if (!row) return null;

    return {
      ...row.assignment,
      authority: row.authority,
    };
  }

  /**
   * Marks previous ACTIVE authority assignments for a proposal version as SUPERSEDED.
   */
  async supersedeProposalAuthorityAssignments(
    proposalVersionId: string,
    txClient?: TransactionClient
  ): Promise<void> {
    const executor = (txClient ?? db) as typeof db;
    await executor
      .update(proposalAuthorityAssignments)
      .set({ assignmentStatus: 'SUPERSEDED', updatedAt: new Date() })
      .where(
        and(
          eq(proposalAuthorityAssignments.proposalVersionId, proposalVersionId),
          eq(proposalAuthorityAssignments.assignmentStatus, 'ACTIVE')
        )
      );
  }

  /**
   * Loads all active authorities along with their active jurisdictions for discovery.
   */
  async findActiveAuthoritiesWithJurisdictions(
    txClient?: TransactionClient
  ): Promise<AuthorityWithDetails[]> {
    const executor = (txClient ?? db) as typeof db;
    const today = new Date().toISOString().split('T')[0];

    const authorities = await executor
      .select()
      .from(competentAuthorities)
      .where(
        and(
          eq(competentAuthorities.status, 'ACTIVE'),
          sql`${competentAuthorities.effectiveFrom} <= ${today}::date`,
          or(
            sql`${competentAuthorities.effectiveUntil} IS NULL`,
            sql`${competentAuthorities.effectiveUntil} >= ${today}::date`
          )
        )
      );

    const result: AuthorityWithDetails[] = [];
    for (const auth of authorities) {
      const jurisdictions = await this.findJurisdictionsByAuthorityId(auth.id, txClient);
      const activeJurisdictions = jurisdictions.filter(
        (j) =>
          j.status === 'ACTIVE' &&
          j.effectiveFrom <= today &&
          (!j.effectiveUntil || j.effectiveUntil >= today)
      );

      result.push({
        ...auth,
        jurisdictions: activeJurisdictions,
        userAssignments: [],
      });
    }

    return result;
  }
}

export const competentAuthorityRepository = new CompetentAuthorityRepository();

