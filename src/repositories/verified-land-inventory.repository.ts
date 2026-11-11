import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { db } from '../../db';
import {
  verifiedLandInventories,
  inventoryParcelSnapshots,
  verifiedLandInventoryWorkflowHistory,
  type VerifiedLandInventory,
  type NewVerifiedLandInventory,
  type InventoryParcelSnapshot,
  type NewInventoryParcelSnapshot,
  type VerifiedLandInventoryWorkflowHistory,
  type NewVerifiedLandInventoryWorkflowHistory,
} from '../../db/schema/verified-land-inventories';
import { acquisitionCases } from '../../db/schema/acquisition-cases';
import { projects } from '../../db/schema/projects';
import { administrativeUnits } from '../../db/schema/administrative-units';
import { users } from '../../db/schema/users';

type TransactionClient = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface InventoryWithDetails extends VerifiedLandInventory {
  preparer: {
    id: string;
    name: string;
    email: string;
  };
  submitter?: {
    id: string;
    name: string;
    email: string;
  } | null;
  reviewer?: {
    id: string;
    name: string;
    email: string;
  } | null;
  acquisitionCase: {
    id: string;
    caseReference: string;
    title: string;
    status: string;
    projectId: string;
    project: {
      id: string;
      projectCode: string;
      name: string;
      administrativeUnitId: string;
      administrativeUnit: {
        id: string;
        name: string;
        code: string;
      };
    };
  };
  snapshots: InventoryParcelSnapshot[];
  workflowHistory: (VerifiedLandInventoryWorkflowHistory & {
    actor: {
      id: string;
      name: string;
      email: string;
    };
  })[];
}

export class VerifiedLandInventoryRepository {
  /**
   * Creates a new verified land inventory record.
   */
  async createInventory(
    data: NewVerifiedLandInventory,
    txClient?: TransactionClient
  ): Promise<VerifiedLandInventory> {
    const executor = (txClient ?? db) as typeof db;
    const [inserted] = await executor
      .insert(verifiedLandInventories)
      .values(data)
      .returning();
    return inserted;
  }

  /**
   * Inserts snapshots in bulk for an inventory.
   */
  async createSnapshots(
    snapshots: NewInventoryParcelSnapshot[],
    txClient?: TransactionClient
  ): Promise<InventoryParcelSnapshot[]> {
    if (snapshots.length === 0) return [];
    const executor = (txClient ?? db) as typeof db;
    return executor
      .insert(inventoryParcelSnapshots)
      .values(snapshots)
      .returning();
  }

  /**
   * Deletes all snapshots for a given inventory ID (used during draft regeneration).
   */
  async deleteSnapshotsByInventoryId(
    inventoryId: string,
    txClient?: TransactionClient
  ): Promise<void> {
    const executor = (txClient ?? db) as typeof db;
    await executor
      .delete(inventoryParcelSnapshots)
      .where(eq(inventoryParcelSnapshots.inventoryId, inventoryId));
  }

  /**
   * Updates an inventory record.
   */
  async updateInventory(
    id: string,
    data: Partial<NewVerifiedLandInventory>,
    txClient?: TransactionClient
  ): Promise<VerifiedLandInventory | null> {
    const executor = (txClient ?? db) as typeof db;
    const [updated] = await executor
      .update(verifiedLandInventories)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(verifiedLandInventories.id, id))
      .returning();
    return updated ?? null;
  }

  /**
   * Finds an inventory by ID with row-level locking for update.
   */
  async findInventoryForUpdate(
    id: string,
    txClient: TransactionClient
  ): Promise<VerifiedLandInventory | null> {
    const [row] = await txClient
      .select()
      .from(verifiedLandInventories)
      .where(eq(verifiedLandInventories.id, id))
      .for('update');
    return row ?? null;
  }

  /**
   * Finds an inventory by ID without relations.
   */
  async findInventoryByIdSimple(
    id: string,
    txClient?: TransactionClient
  ): Promise<VerifiedLandInventory | null> {
    const executor = (txClient ?? db) as typeof db;
    const [row] = await executor
      .select()
      .from(verifiedLandInventories)
      .where(eq(verifiedLandInventories.id, id))
      .limit(1);
    return row ?? null;
  }

  /**
   * Finds the latest inventory version for an acquisition case.
   */
  async findLatestInventoryByCaseId(
    caseId: string,
    txClient?: TransactionClient
  ): Promise<VerifiedLandInventory | null> {
    const executor = (txClient ?? db) as typeof db;
    const [row] = await executor
      .select()
      .from(verifiedLandInventories)
      .where(eq(verifiedLandInventories.caseId, caseId))
      .orderBy(desc(verifiedLandInventories.versionNumber))
      .limit(1);
    return row ?? null;
  }

  /**
   * Lists all inventory versions for an acquisition case, ordered by version number ascending.
   */
  async listInventoriesByCaseId(
    caseId: string,
    txClient?: TransactionClient
  ): Promise<
    (VerifiedLandInventory & {
      preparer: { id: string; name: string; email: string };
      reviewer?: { id: string; name: string; email: string } | null;
    })[]
  > {
    const executor = (txClient ?? db) as typeof db;
    const rows = await executor
      .select({
        inventory: verifiedLandInventories,
        preparer: {
          id: users.id,
          name: users.name,
          email: users.email,
        },
      })
      .from(verifiedLandInventories)
      .innerJoin(users, eq(verifiedLandInventories.preparedBy, users.id))
      .where(eq(verifiedLandInventories.caseId, caseId))
      .orderBy(verifiedLandInventories.versionNumber);

    // Fetch reviewers for those that have one
    const results = await Promise.all(
      rows.map(async (r) => {
        let reviewer: { id: string; name: string; email: string } | null = null;
        if (r.inventory.reviewedBy) {
          const [revUser] = await executor
            .select({ id: users.id, name: users.name, email: users.email })
            .from(users)
            .where(eq(users.id, r.inventory.reviewedBy))
            .limit(1);
          if (revUser) reviewer = revUser;
        }
        return {
          ...r.inventory,
          preparer: r.preparer,
          reviewer,
        };
      })
    );

    return results;
  }

  /**
   * Retrieves full inventory details including snapshots, case and project details,
   * preparer, reviewer, and workflow history.
   */
  async findInventoryWithDetails(
    id: string,
    txClient?: TransactionClient
  ): Promise<InventoryWithDetails | null> {
    const executor = (txClient ?? db) as typeof db;

    const [row] = await executor
      .select({
        inventory: verifiedLandInventories,
        preparer: {
          id: users.id,
          name: users.name,
          email: users.email,
        },
      })
      .from(verifiedLandInventories)
      .innerJoin(users, eq(verifiedLandInventories.preparedBy, users.id))
      .where(eq(verifiedLandInventories.id, id))
      .limit(1);

    if (!row) return null;

    // Submitter
    let submitter: { id: string; name: string; email: string } | null = null;
    if (row.inventory.submittedBy) {
      const [subUser] = await executor
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, row.inventory.submittedBy))
        .limit(1);
      if (subUser) submitter = subUser;
    }

    // Reviewer
    let reviewer: { id: string; name: string; email: string } | null = null;
    if (row.inventory.reviewedBy) {
      const [revUser] = await executor
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, row.inventory.reviewedBy))
        .limit(1);
      if (revUser) reviewer = revUser;
    }

    // Acquisition case and project details
    const [caseData] = await executor
      .select({
        caseId: acquisitionCases.id,
        caseReference: acquisitionCases.caseReference,
        title: acquisitionCases.title,
        status: acquisitionCases.status,
        projectId: acquisitionCases.projectId,
        projectCode: projects.projectCode,
        projectName: projects.name,
        administrativeUnitId: projects.administrativeUnitId,
        adminUnitId: administrativeUnits.id,
        adminUnitName: administrativeUnits.name,
        adminUnitCode: administrativeUnits.code,
      })
      .from(acquisitionCases)
      .innerJoin(projects, eq(acquisitionCases.projectId, projects.id))
      .innerJoin(
        administrativeUnits,
        eq(projects.administrativeUnitId, administrativeUnits.id)
      )
      .where(eq(acquisitionCases.id, row.inventory.caseId))
      .limit(1);

    const mappedCase = caseData
      ? {
          id: caseData.caseId,
          caseReference: caseData.caseReference,
          title: caseData.title,
          status: caseData.status,
          projectId: caseData.projectId,
          project: {
            id: caseData.projectId,
            projectCode: caseData.projectCode,
            name: caseData.projectName,
            administrativeUnitId: caseData.administrativeUnitId,
            administrativeUnit: {
              id: caseData.adminUnitId,
              name: caseData.adminUnitName,
              code: caseData.adminUnitCode,
            },
          },
        }
      : null;

    // Snapshots
    const snapshots = await executor
      .select()
      .from(inventoryParcelSnapshots)
      .where(eq(inventoryParcelSnapshots.inventoryId, id))
      .orderBy(
        inventoryParcelSnapshots.surveyNumber,
        inventoryParcelSnapshots.hissaNumber
      );

    // Workflow history
    const historyRows = await executor
      .select({
        history: verifiedLandInventoryWorkflowHistory,
        actor: {
          id: users.id,
          name: users.name,
          email: users.email,
        },
      })
      .from(verifiedLandInventoryWorkflowHistory)
      .innerJoin(users, eq(verifiedLandInventoryWorkflowHistory.actorId, users.id))
      .where(eq(verifiedLandInventoryWorkflowHistory.inventoryId, id))
      .orderBy(desc(verifiedLandInventoryWorkflowHistory.createdAt));

    return {
      ...row.inventory,
      preparer: row.preparer,
      submitter,
      reviewer,
      acquisitionCase: mappedCase!,
      snapshots,
      workflowHistory: historyRows.map((h) => ({
        ...h.history,
        actor: h.actor,
      })),
    };
  }

  /**
   * Appends an audit workflow history entry.
   */
  async createWorkflowHistory(
    data: NewVerifiedLandInventoryWorkflowHistory,
    txClient?: TransactionClient
  ): Promise<VerifiedLandInventoryWorkflowHistory> {
    const executor = (txClient ?? db) as typeof db;
    const [inserted] = await executor
      .insert(verifiedLandInventoryWorkflowHistory)
      .values(data)
      .returning();
    return inserted;
  }

  /**
   * Lists submitted inventories awaiting review for Ministry admins.
   * Can filter by administrative unit scope.
   */
  async listSubmittedInventories(
    scopedUnitIds?: string[],
    txClient?: TransactionClient
  ): Promise<
    {
      inventory: VerifiedLandInventory;
      preparer: { id: string; name: string; email: string };
      acquisitionCase: {
        id: string;
        caseReference: string;
        title: string;
        status: string;
        projectId: string;
        project: {
          id: string;
          projectCode: string;
          name: string;
          administrativeUnitId: string;
          administrativeUnit: {
            id: string;
            name: string;
            code: string;
          };
        };
      };
    }[]
  > {
    const executor = (txClient ?? db) as typeof db;

    const rows = await executor
      .select({
        inventory: verifiedLandInventories,
        preparer: {
          id: users.id,
          name: users.name,
          email: users.email,
        },
        caseId: acquisitionCases.id,
        caseReference: acquisitionCases.caseReference,
        caseTitle: acquisitionCases.title,
        caseStatus: acquisitionCases.status,
        projectId: acquisitionCases.projectId,
        projectCode: projects.projectCode,
        projectName: projects.name,
        administrativeUnitId: projects.administrativeUnitId,
        adminUnitId: administrativeUnits.id,
        adminUnitName: administrativeUnits.name,
        adminUnitCode: administrativeUnits.code,
      })
      .from(verifiedLandInventories)
      .innerJoin(users, eq(verifiedLandInventories.preparedBy, users.id))
      .innerJoin(acquisitionCases, eq(verifiedLandInventories.caseId, acquisitionCases.id))
      .innerJoin(projects, eq(acquisitionCases.projectId, projects.id))
      .innerJoin(
        administrativeUnits,
        eq(projects.administrativeUnitId, administrativeUnits.id)
      )
      .where(
        scopedUnitIds && scopedUnitIds.length > 0
          ? and(
              inArray(verifiedLandInventories.status, ['SUBMITTED', 'UNDER_REVIEW']),
              inArray(projects.administrativeUnitId, scopedUnitIds)
            )
          : inArray(verifiedLandInventories.status, ['SUBMITTED', 'UNDER_REVIEW'])
      )
      .orderBy(desc(verifiedLandInventories.submittedAt), desc(verifiedLandInventories.updatedAt));

    return rows.map((r) => ({
      inventory: r.inventory,
      preparer: r.preparer,
      acquisitionCase: {
        id: r.caseId,
        caseReference: r.caseReference,
        title: r.caseTitle,
        status: r.caseStatus,
        projectId: r.projectId,
        project: {
          id: r.projectId,
          projectCode: r.projectCode,
          name: r.projectName,
          administrativeUnitId: r.administrativeUnitId,
          administrativeUnit: {
            id: r.adminUnitId,
            name: r.adminUnitName,
            code: r.adminUnitCode,
          },
        },
      },
    }));
  }

  /**
   * Retrieves summary metric counts across all inventories in the authorized scope.
   */
  async getInventorySummaryMetrics(
    scopedUnitIds?: string[],
    txClient?: TransactionClient
  ): Promise<InventorySummaryMetrics> {
    const executor = (txClient ?? db) as typeof db;
    const conditions = [];
    if (scopedUnitIds && scopedUnitIds.length > 0) {
      conditions.push(inArray(projects.administrativeUnitId, scopedUnitIds));
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    let query = executor
      .select({
        status: verifiedLandInventories.status,
        count: sql<number>`count(*)::int`,
      })
      .from(verifiedLandInventories)
      .innerJoin(acquisitionCases, eq(verifiedLandInventories.caseId, acquisitionCases.id))
      .innerJoin(projects, eq(acquisitionCases.projectId, projects.id))
      .groupBy(verifiedLandInventories.status)
      .$dynamic();

    if (whereClause) {
      query = query.where(whereClause);
    }

    const rows = await query;
    let total = 0;
    let draft = 0;
    let pendingReview = 0;
    let approved = 0;
    let correctionRequested = 0;

    for (const r of rows) {
      const cnt = Number(r.count || 0);
      total += cnt;
      if (r.status === 'DRAFT') {
        draft += cnt;
      } else if (r.status === 'SUBMITTED' || r.status === 'UNDER_REVIEW') {
        pendingReview += cnt;
      } else if (r.status === 'APPROVED') {
        approved += cnt;
      } else if (r.status === 'CORRECTION_REQUESTED') {
        correctionRequested += cnt;
      }
    }

    return { total, draft, pendingReview, approved, correctionRequested };
  }

  /**
   * Lists inventories with filtering by status, search term, and pagination for dashboard.
   */
  async listInventories(
    options: InventoryListFilterOptions,
    txClient?: TransactionClient
  ): Promise<{
    items: {
      inventory: VerifiedLandInventory;
      preparer: { id: string; name: string; email: string };
      acquisitionCase: {
        id: string;
        caseReference: string;
        title: string;
        status: string;
        projectId: string;
        project: {
          id: string;
          projectCode: string;
          name: string;
          administrativeUnitId: string;
          administrativeUnit: {
            id: string;
            name: string;
            code: string;
          };
        };
      };
    }[];
    total: number;
  }> {
    const executor = (txClient ?? db) as typeof db;
    const conditions = [];

    if (options.scopedUnitIds && options.scopedUnitIds.length > 0) {
      conditions.push(inArray(projects.administrativeUnitId, options.scopedUnitIds));
    }

    if (options.status) {
      const st = options.status.toUpperCase();
      if (st === 'PENDING_REVIEW') {
        conditions.push(inArray(verifiedLandInventories.status, ['SUBMITTED', 'UNDER_REVIEW']));
      } else {
        conditions.push(eq(verifiedLandInventories.status, st));
      }
    }

    if (options.search?.trim()) {
      const term = `%${options.search.trim()}%`;
      conditions.push(
        or(
          ilike(acquisitionCases.caseReference, term),
          ilike(acquisitionCases.title, term),
          ilike(projects.name, term),
          ilike(projects.projectCode, term),
          ilike(sql`${verifiedLandInventories.id}::text`, term)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Count query
    let countQuery = executor
      .select({ count: sql<number>`count(*)::int` })
      .from(verifiedLandInventories)
      .innerJoin(acquisitionCases, eq(verifiedLandInventories.caseId, acquisitionCases.id))
      .innerJoin(projects, eq(acquisitionCases.projectId, projects.id))
      .$dynamic();

    if (whereClause) {
      countQuery = countQuery.where(whereClause);
    }

    const [countRow] = await countQuery;
    const total = Number(countRow?.count || 0);

    // Data query
    let query = executor
      .select({
        inventory: verifiedLandInventories,
        preparer: {
          id: users.id,
          name: users.name,
          email: users.email,
        },
        caseId: acquisitionCases.id,
        caseReference: acquisitionCases.caseReference,
        caseTitle: acquisitionCases.title,
        caseStatus: acquisitionCases.status,
        projectId: acquisitionCases.projectId,
        projectCode: projects.projectCode,
        projectName: projects.name,
        administrativeUnitId: projects.administrativeUnitId,
        adminUnitId: administrativeUnits.id,
        adminUnitName: administrativeUnits.name,
        adminUnitCode: administrativeUnits.code,
      })
      .from(verifiedLandInventories)
      .innerJoin(users, eq(verifiedLandInventories.preparedBy, users.id))
      .innerJoin(acquisitionCases, eq(verifiedLandInventories.caseId, acquisitionCases.id))
      .innerJoin(projects, eq(acquisitionCases.projectId, projects.id))
      .innerJoin(
        administrativeUnits,
        eq(projects.administrativeUnitId, administrativeUnits.id)
      )
      .orderBy(desc(verifiedLandInventories.updatedAt))
      .$dynamic();

    if (whereClause) {
      query = query.where(whereClause);
    }

    if (typeof options.limit === 'number') {
      query = query.limit(options.limit);
    }

    if (typeof options.offset === 'number') {
      query = query.offset(options.offset);
    }

    const rows = await query;

    return {
      items: rows.map((r) => ({
        inventory: r.inventory,
        preparer: r.preparer,
        acquisitionCase: {
          id: r.caseId,
          caseReference: r.caseReference,
          title: r.caseTitle,
          status: r.caseStatus,
          projectId: r.projectId,
          project: {
            id: r.projectId,
            projectCode: r.projectCode,
            name: r.projectName,
            administrativeUnitId: r.administrativeUnitId,
            administrativeUnit: {
              id: r.adminUnitId,
              name: r.adminUnitName,
              code: r.adminUnitCode,
            },
          },
        },
      })),
      total,
    };
  }
}

export interface InventoryListFilterOptions {
  scopedUnitIds?: string[];
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface InventorySummaryMetrics {
  total: number;
  draft: number;
  pendingReview: number;
  approved: number;
  correctionRequested: number;
}

export const verifiedLandInventoryRepository = new VerifiedLandInventoryRepository();
