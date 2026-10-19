import {
  implementingAgencyRepository,
  type AgencyFilterOptions,
  type AgencyWithRelations,
} from '../../repositories/implementing-agency.repository';
import type { ImplementingAgency } from '../../../db/schema/implementing-agencies';
import { NotFoundError, BadRequestError } from '../../types';

export interface PaginatedAgenciesResult {
  data: AgencyWithRelations[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface ListAgenciesQueryOptions {
  search?: string;
  type?: string;
  status?: string;
  page?: number;
  limit?: number;
  activeOnly?: boolean;
}

export class ImplementingAgencyService {
  /**
   * Retrieves a paginated list of agencies based on query parameters.
   */
  async listAgencies(options: ListAgenciesQueryOptions = {}): Promise<PaginatedAgenciesResult> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 20));
    const offset = (page - 1) * limit;

    const filterOptions: AgencyFilterOptions = {
      search: options.search,
      type: options.type,
      status: options.activeOnly ? 'ACTIVE' : options.status,
      limit,
      offset,
    };

    const [data, total] = await Promise.all([
      implementingAgencyRepository.findAgencies(filterOptions),
      implementingAgencyRepository.countAgencies(filterOptions),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      data,
      pagination: {
        total,
        page,
        limit,
        totalPages,
      },
    };
  }

  /**
   * Retrieves an agency by ID, including its parent and administrative unit info.
   * Throws NotFoundError if the agency does not exist.
   */
  async getAgencyById(id: string): Promise<AgencyWithRelations> {
    const agency = await implementingAgencyRepository.findAgencyById(id);
    if (!agency) {
      throw new NotFoundError(`Implementing agency with ID '${id}' not found`);
    }
    return agency;
  }

  /**
   * Retrieves an agency by unique code.
   */
  async getAgencyByCode(code: string): Promise<ImplementingAgency | null> {
    return implementingAgencyRepository.findAgencyByCode(code);
  }

  /**
   * Validates that an agency exists and is active for association with a project.
   * Throws BadRequestError if missing or inactive.
   */
  async validateActiveAgency(id: string): Promise<ImplementingAgency> {
    const agency = await implementingAgencyRepository.findAgencyById(id);
    if (!agency) {
      throw new BadRequestError(`Implementing agency with ID '${id}' does not exist`);
    }
    if (agency.status !== 'ACTIVE') {
      throw new BadRequestError(`Implementing agency '${agency.name}' (${agency.code}) is not active`);
    }
    return agency;
  }
}

export const implementingAgencyService = new ImplementingAgencyService();
