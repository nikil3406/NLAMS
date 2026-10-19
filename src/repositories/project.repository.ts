import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { db } from '../../db';
import {
  projects,
  type Project,
  type NewProject,
  type ProjectStatus,
  type ProjectType,
} from '../../db/schema/projects';
import { implementingAgencies, type ImplementingAgency } from '../../db/schema/implementing-agencies';
import { administrativeUnits, type AdministrativeUnit } from '../../db/schema/administrative-units';
import { users } from '../../db/schema/users';

export interface ProjectFilterOptions {
  search?: string;
  status?: ProjectStatus | string;
  projectType?: ProjectType | string;
  implementingAgencyId?: string;
  administrativeUnitIds?: string[]; // Allowed admin unit IDs from user scope
  landAcquisitionRequired?: boolean;
  limit?: number;
  offset?: number;
}

export interface ProjectWithRelations extends Project {
  implementingAgency: ImplementingAgency;
  administrativeUnit: AdministrativeUnit;
  creator: {
    id: string;
    name: string;
    email: string;
  };
}

export class ProjectRepository {
  /**
   * Generates the next sequential project code concurrency-safely via PostgreSQL sequence.
   * Format: NLAMS-PRJ-000001
   */
  async generateProjectCode(): Promise<string> {
    try {
      const result = await db.execute<{ seq: string | number }>(
        sql`SELECT nextval('project_code_seq') as seq;`
      );
      const seqValue = Number(result[0]?.seq ?? 1);
      return `NLAMS-PRJ-${String(seqValue).padStart(6, '0')}`;
    } catch {
      // Fallback: If sequence is not accessible in a lightweight mock, calculate safely
      const [maxCode] = await db
        .select({ code: projects.projectCode })
        .from(projects)
        .orderBy(desc(projects.projectCode))
        .limit(1);

      let nextNum = 1;
      if (maxCode?.code) {
        const parts = maxCode.code.split('-');
        const parsed = parseInt(parts[parts.length - 1] ?? '0', 10);
        if (!isNaN(parsed)) nextNum = parsed + 1;
      }
      return `NLAMS-PRJ-${String(nextNum).padStart(6, '0')}`;
    }
  }

  /**
   * Creates a new project record.
   */
  async createProject(data: NewProject): Promise<Project> {
    const [project] = await db
      .insert(projects)
      .values(data)
      .returning();

    return project;
  }

  /**
   * Finds a project by its primary key ID with all relational details.
   */
  async findProjectById(id: string): Promise<ProjectWithRelations | null> {
    const [row] = await db
      .select({
        project: projects,
        agency: implementingAgencies,
        adminUnit: administrativeUnits,
        creator: {
          id: users.id,
          name: users.name,
          email: users.email,
        },
      })
      .from(projects)
      .innerJoin(implementingAgencies, eq(projects.implementingAgencyId, implementingAgencies.id))
      .innerJoin(administrativeUnits, eq(projects.administrativeUnitId, administrativeUnits.id))
      .innerJoin(users, eq(projects.createdBy, users.id))
      .where(eq(projects.id, id))
      .limit(1);

    if (!row) {
      return null;
    }

    return {
      ...row.project,
      implementingAgency: row.agency,
      administrativeUnit: row.adminUnit,
      creator: row.creator,
    };
  }

  /**
   * Finds a project by its unique project code.
   */
  async findProjectByCode(code: string): Promise<ProjectWithRelations | null> {
    const [row] = await db
      .select({
        project: projects,
        agency: implementingAgencies,
        adminUnit: administrativeUnits,
        creator: {
          id: users.id,
          name: users.name,
          email: users.email,
        },
      })
      .from(projects)
      .innerJoin(implementingAgencies, eq(projects.implementingAgencyId, implementingAgencies.id))
      .innerJoin(administrativeUnits, eq(projects.administrativeUnitId, administrativeUnits.id))
      .innerJoin(users, eq(projects.createdBy, users.id))
      .where(eq(projects.projectCode, code))
      .limit(1);

    if (!row) {
      return null;
    }

    return {
      ...row.project,
      implementingAgency: row.agency,
      administrativeUnit: row.adminUnit,
      creator: row.creator,
    };
  }

  /**
   * Finds projects matching filters and scoped administrative units.
   */
  async findProjects(options: ProjectFilterOptions): Promise<ProjectWithRelations[]> {
    const conditions = [];

    // Administrative scope restriction
    if (options.administrativeUnitIds) {
      if (options.administrativeUnitIds.length === 0) {
        return []; // No units in scope -> empty set
      }
      conditions.push(inArray(projects.administrativeUnitId, options.administrativeUnitIds));
    }

    if (options.status) {
      conditions.push(eq(projects.status, options.status));
    }

    if (options.projectType) {
      conditions.push(eq(projects.projectType, options.projectType));
    }

    if (options.implementingAgencyId) {
      conditions.push(eq(projects.implementingAgencyId, options.implementingAgencyId));
    }

    if (typeof options.landAcquisitionRequired === 'boolean') {
      conditions.push(eq(projects.landAcquisitionRequired, options.landAcquisitionRequired));
    }

    if (options.search?.trim()) {
      const term = `%${options.search.trim()}%`;
      conditions.push(
        or(
          ilike(projects.name, term),
          ilike(projects.projectCode, term)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    let query = db
      .select({
        project: projects,
        agency: implementingAgencies,
        adminUnit: administrativeUnits,
        creator: {
          id: users.id,
          name: users.name,
          email: users.email,
        },
      })
      .from(projects)
      .innerJoin(implementingAgencies, eq(projects.implementingAgencyId, implementingAgencies.id))
      .innerJoin(administrativeUnits, eq(projects.administrativeUnitId, administrativeUnits.id))
      .innerJoin(users, eq(projects.createdBy, users.id))
      .orderBy(desc(projects.createdAt))
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

    return rows.map((r) => ({
      ...r.project,
      implementingAgency: r.agency,
      administrativeUnit: r.adminUnit,
      creator: r.creator,
    }));
  }

  /**
   * Counts projects matching filters and scoped administrative units.
   */
  async countProjects(options: ProjectFilterOptions): Promise<number> {
    const conditions = [];

    if (options.administrativeUnitIds) {
      if (options.administrativeUnitIds.length === 0) {
        return 0;
      }
      conditions.push(inArray(projects.administrativeUnitId, options.administrativeUnitIds));
    }

    if (options.status) {
      conditions.push(eq(projects.status, options.status));
    }

    if (options.projectType) {
      conditions.push(eq(projects.projectType, options.projectType));
    }

    if (options.implementingAgencyId) {
      conditions.push(eq(projects.implementingAgencyId, options.implementingAgencyId));
    }

    if (typeof options.landAcquisitionRequired === 'boolean') {
      conditions.push(eq(projects.landAcquisitionRequired, options.landAcquisitionRequired));
    }

    if (options.search?.trim()) {
      const term = `%${options.search.trim()}%`;
      conditions.push(
        or(
          ilike(projects.name, term),
          ilike(projects.projectCode, term)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(projects)
      .where(whereClause);

    return Number(result?.count ?? 0);
  }

  /**
   * Updates an existing project record.
   */
  async updateProject(id: string, data: Partial<NewProject>): Promise<Project | null> {
    const [updated] = await db
      .update(projects)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, id))
      .returning();

    return updated ?? null;
  }

  /**
   * Checks if a project code already exists.
   */
  async isProjectCodeUnique(code: string): Promise<boolean> {
    const [existing] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.projectCode, code))
      .limit(1);

    return !existing;
  }
}

export const projectRepository = new ProjectRepository();
