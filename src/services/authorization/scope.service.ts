import { userAssignmentRepository } from '../../repositories/user-assignment.repository';
import { administrativeUnitRepository } from '../../repositories/administrative-unit.repository';
import { permissionService } from './permission.service';
import { ForbiddenError } from '../../types/authorization';
import type { AdministrativeUnit } from '../../../db/schema/administrative-units';

/**
 * Service managing administrative unit scopes and hierarchical authority boundaries.
 * All hierarchy traversal is completely data-driven via parent_id relationships.
 */
export class ScopeService {
  /**
   * Retrieves all active administrative units directly assigned to a user.
   */
  async getUserAssignedUnits(userId: string): Promise<AdministrativeUnit[]> {
    const assignments =
      await userAssignmentRepository.findActiveAssignmentsWithUnitsByUserId(userId);
    return assignments.map((a) => a.administrativeUnit);
  }

  /**
   * Checks whether targetAdministrativeUnitId falls within the actor's administrative scope.
   *
   * A target unit is within scope if:
   * 1. Actor is Super Admin (system-wide scope).
   * 2. Target unit is identical to one of actor's assigned units.
   * 3. Target unit is a subordinate/descendant of one of actor's assigned units.
   */
  async isWithinAdministrativeScope(
    actorUserId: string,
    targetAdministrativeUnitId: string
  ): Promise<boolean> {
    if (!targetAdministrativeUnitId) {
      return false;
    }

    // Super Admin has unrestricted national administrative scope
    if (await permissionService.isSuperAdmin(actorUserId)) {
      return true;
    }

    const assignedUnits = await this.getUserAssignedUnits(actorUserId);
    if (assignedUnits.length === 0) {
      return false;
    }

    // Check each assigned unit against the target unit
    for (const assignedUnit of assignedUnits) {
      const inScope = await administrativeUnitRepository.isDescendantOrSelf(
        assignedUnit.id,
        targetAdministrativeUnitId
      );
      if (inScope) {
        return true;
      }
    }

    return false;
  }

  /**
   * Checks whether targetAdministrativeUnitId is strictly subordinate (descendant)
   * to all of the actor's assigned units.
   */
  async isSubordinateScope(
    actorUserId: string,
    targetAdministrativeUnitId: string
  ): Promise<boolean> {
    if (!targetAdministrativeUnitId) {
      return false;
    }

    if (await permissionService.isSuperAdmin(actorUserId)) {
      return true;
    }

    const assignedUnits = await this.getUserAssignedUnits(actorUserId);
    if (assignedUnits.length === 0) {
      return false;
    }

    for (const assignedUnit of assignedUnits) {
      const subordinate = await administrativeUnitRepository.isSubordinate(
        assignedUnit.id,
        targetAdministrativeUnitId
      );
      if (subordinate) {
        return true;
      }
    }

    return false;
  }

  /**
   * Enforces that targetAdministrativeUnitId is within the actor's administrative scope.
   * Throws ForbiddenError (403) if outside scope.
   */
  async requireAdministrativeScope(
    userId: string,
    administrativeUnitId: string
  ): Promise<void> {
    const inScope = await this.isWithinAdministrativeScope(userId, administrativeUnitId);
    if (!inScope) {
      throw new ForbiddenError(
        'Forbidden: administrative unit is outside your authorized administrative scope'
      );
    }
  }

  /**
   * Resolves all descendant unit IDs for an administrative unit (including self).
   */
  async getDescendantUnitIds(unitId: string): Promise<string[]> {
    return administrativeUnitRepository.getDescendantUnitIds(unitId);
  }

  /**
   * Resolves all ancestor unit IDs for an administrative unit (including self).
   */
  async getAncestorUnitIds(unitId: string): Promise<string[]> {
    return administrativeUnitRepository.getAncestorUnitIds(unitId);
  }
}

export const scopeService = new ScopeService();
