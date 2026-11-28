/**
 * Authorization Types and Errors
 * Phase 1 — Step 4: Authorization Foundation
 */

import type { SafeUser } from './auth';

/**
 * Representation of an active administrative assignment for client/service consumption.
 */
export interface AdministrativeAssignmentInfo {
  id: string;
  administrativeUnitId: string;
  administrativeUnitName: string;
  administrativeUnitCode: string;
  administrativeUnitType: string;
  status: 'ACTIVE' | 'INACTIVE';
  startDate: string;
  endDate: string | null;
}

/**
 * Representation of an active Implementing Agency association for client/service consumption.
 */
export interface ImplementingAgencyInfo {
  id: string;
  code: string;
  name: string;
  agencyType: string;
  status: string;
}

/**
 * Consolidated authorization context resolved for an authenticated user.
 */
export interface UserAuthorizationContext {
  user: SafeUser;
  roles: string[];
  permissions: string[];
  assignments: AdministrativeAssignmentInfo[];
  implementingAgency: ImplementingAgencyInfo | null;
  isSuperAdmin: boolean;
}

/**
 * Error thrown when an authenticated user lacks the required permission
 * or administrative scope to perform an action.
 * Maps to HTTP 403 Forbidden.
 */
export class ForbiddenError extends Error {
  constructor(message = 'Forbidden: insufficient permissions or administrative scope') {
    super(message);
    this.name = 'ForbiddenError';
  }
}
