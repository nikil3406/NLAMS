import { administrativeUnitRepository } from '../../repositories/administrative-unit.repository';
import { permissionService } from '../authorization/permission.service';
import { scopeService } from '../authorization/scope.service';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  ForbiddenError,
} from '../../types/errors';
import type {
  CreateAdministrativeUnitInput,
  UpdateAdministrativeUnitInput,
} from '../../validators/administrative-units';
import type { AdministrativeUnit } from '../../../db/schema/administrative-units';

export interface AdministrativeUnitDetails extends AdministrativeUnit {
  status: 'ACTIVE' | 'INACTIVE';
  ancestors: AdministrativeUnit[];
  directChildrenCount: number;
  totalDescendantsCount: number;
}

export class AdministrativeUnitService {
  /**
   * Retrieves an administrative unit by ID with its hierarchy ancestors and child counts.
   * Requires ADMIN_UNIT_VIEW permission and actor must have administrative scope.
   */
  async getUnitById(id: string, actorUserId: string): Promise<AdministrativeUnitDetails> {
    await permissionService.requirePermission(actorUserId, 'ADMIN_UNIT_VIEW');

    const unit = await administrativeUnitRepository.getAdministrativeUnitById(id);
    if (!unit) {
      throw new NotFoundError(`Administrative unit with ID '${id}' not found`);
    }

    await scopeService.requireAdministrativeScope(actorUserId, id);

    const ancestors = await administrativeUnitRepository.getAdministrativeUnitAncestors(id);
    const directChildrenCount = await administrativeUnitRepository.countDirectChildren(id);
    const descendantIds = await administrativeUnitRepository.getDescendantUnitIds(id);
    const totalDescendantsCount = Math.max(0, descendantIds.length - 1);

    return {
      ...unit,
      status: unit.isActive ? 'ACTIVE' : 'INACTIVE',
      ancestors,
      directChildrenCount,
      totalDescendantsCount,
    };
  }

  /**
   * Retrieves all administrative units accessible to the actor.
   * Super Admins see all units; scoped users see their assigned units and subordinates.
   */
  async getAllUnits(
    actorUserId: string,
    options?: { activeOnly?: boolean }
  ): Promise<AdministrativeUnit[]> {
    await permissionService.requirePermission(actorUserId, 'ADMIN_UNIT_VIEW');

    const isSuperAdmin = await permissionService.isSuperAdmin(actorUserId);
    if (isSuperAdmin) {
      return administrativeUnitRepository.getAllAdministrativeUnits(options);
    }

    // For scoped users, resolve all authorized units (assigned units + all descendants)
    const assignedUnits = await scopeService.getUserAssignedUnits(actorUserId);
    if (assignedUnits.length === 0) {
      return [];
    }

    const authorizedUnitIds = new Set<string>();
    for (const unit of assignedUnits) {
      const descendantIds = await administrativeUnitRepository.getDescendantUnitIds(unit.id);
      for (const id of descendantIds) {
        authorizedUnitIds.add(id);
      }
    }

    const allUnits = await administrativeUnitRepository.getAllAdministrativeUnits(options);
    return allUnits.filter((unit) => authorizedUnitIds.has(unit.id));
  }

  /**
   * Retrieves root administrative units (parent_id IS NULL).
   * For scoped users whose scope does not contain national root, returns their top-level assigned units.
   */
  async getRootUnits(actorUserId: string): Promise<AdministrativeUnit[]> {
    await permissionService.requirePermission(actorUserId, 'ADMIN_UNIT_VIEW');

    const isSuperAdmin = await permissionService.isSuperAdmin(actorUserId);
    if (isSuperAdmin) {
      return administrativeUnitRepository.getRootAdministrativeUnits();
    }

    const assignedUnits = await scopeService.getUserAssignedUnits(actorUserId);
    return assignedUnits.filter((u) => u.isActive);
  }

  /**
   * Retrieves immediate child administrative units for a parent unit.
   */
  async getChildUnits(parentId: string, actorUserId: string): Promise<AdministrativeUnit[]> {
    await permissionService.requirePermission(actorUserId, 'ADMIN_UNIT_VIEW');
    await scopeService.requireAdministrativeScope(actorUserId, parentId);

    return administrativeUnitRepository.getChildAdministrativeUnits(parentId);
  }

  /**
   * Creates a new administrative unit.
   *
   * Business Rules:
   * 1. Requires ADMIN_UNIT_CREATE permission.
   * 2. Code must be unique.
   * 3. If parentId is provided:
   *    - Parent unit must exist and be active.
   *    - Actor must have administrative scope over the parent unit.
   * 4. If parentId is null (creating a root unit):
   *    - Only Super Admin can create root units.
   */
  async createAdministrativeUnit(
    input: CreateAdministrativeUnitInput,
    actorUserId: string
  ): Promise<AdministrativeUnit> {
    await permissionService.requirePermission(actorUserId, 'ADMIN_UNIT_CREATE');

    // Check code uniqueness
    const existingWithCode = await administrativeUnitRepository.findUnitByCode(input.code);
    if (existingWithCode) {
      throw new ConflictError(
        `Administrative unit with code '${input.code}' already exists`
      );
    }

    // Check parent validity and scope
    if (input.parentId) {
      const parentUnit = await administrativeUnitRepository.getAdministrativeUnitById(input.parentId);
      if (!parentUnit) {
        throw new BadRequestError(`Parent administrative unit '${input.parentId}' does not exist`);
      }
      if (!parentUnit.isActive) {
        throw new BadRequestError(`Parent administrative unit '${parentUnit.name}' is inactive`);
      }

      await scopeService.requireAdministrativeScope(actorUserId, input.parentId);
    } else {
      // Creating root unit requires Super Admin
      const isSuperAdmin = await permissionService.isSuperAdmin(actorUserId);
      if (!isSuperAdmin) {
        throw new ForbiddenError(
          'Forbidden: only Super Administrators have authority to create root administrative units'
        );
      }
    }

    // Resolve isActive
    let isActive = true;
    if (input.isActive !== undefined) {
      isActive = input.isActive;
    } else if (input.status !== undefined) {
      isActive = input.status === 'ACTIVE';
    }

    const created = await administrativeUnitRepository.createAdministrativeUnit({
      name: input.name,
      code: input.code,
      type: input.type,
      parentId: input.parentId ?? null,
      isActive,
    });

    return created;
  }

  /**
   * Updates an existing administrative unit.
   *
   * Business Rules:
   * 1. Requires ADMIN_UNIT_UPDATE permission.
   * 2. Target unit must exist.
   * 3. Actor must have administrative scope over target unit.
   * 4. If code is changed, it must remain unique.
   * 5. If parentId is changed:
   *    - Unit cannot be its own parent.
   *    - New parent cannot be a descendant of the unit (circular hierarchy prevention).
   *    - New parent must exist and be active.
   *    - Actor must have administrative scope over new parent.
   *    - Promoting to root level requires Super Admin.
   */
  async updateAdministrativeUnit(
    id: string,
    input: UpdateAdministrativeUnitInput,
    actorUserId: string
  ): Promise<AdministrativeUnit> {
    await permissionService.requirePermission(actorUserId, 'ADMIN_UNIT_UPDATE');

    const existing = await administrativeUnitRepository.getAdministrativeUnitById(id);
    if (!existing) {
      throw new NotFoundError(`Administrative unit with ID '${id}' not found`);
    }

    // Actor must have administrative scope over the target unit being modified
    await scopeService.requireAdministrativeScope(actorUserId, id);

    // Code uniqueness check if code is being changed
    if (input.code && input.code !== existing.code) {
      const existingWithCode = await administrativeUnitRepository.findUnitByCode(input.code);
      if (existingWithCode && existingWithCode.id !== id) {
        throw new ConflictError(
          `Administrative unit with code '${input.code}' already exists`
        );
      }
    }

    // Parent relationship validation if parentId is being updated
    if (input.parentId !== undefined && input.parentId !== existing.parentId) {
      // 1. Prevent self-parenting
      if (input.parentId === id) {
        throw new BadRequestError('An administrative unit cannot be its own parent');
      }

      if (input.parentId !== null) {
        // 2. Validate new parent exists and is active
        const newParent = await administrativeUnitRepository.getAdministrativeUnitById(input.parentId);
        if (!newParent) {
          throw new BadRequestError(`New parent administrative unit '${input.parentId}' does not exist`);
        }
        if (!newParent.isActive) {
          throw new BadRequestError(`New parent administrative unit '${newParent.name}' is inactive`);
        }

        // 3. Actor must have administrative scope over the new parent
        await scopeService.requireAdministrativeScope(actorUserId, input.parentId);

        // 4. Circular hierarchy check: newParent cannot be an existing descendant of id
        const isDescendant = await administrativeUnitRepository.isDescendantOrSelf(id, input.parentId);
        if (isDescendant) {
          throw new ConflictError(
            'Circular hierarchy detected: an administrative unit cannot have one of its descendants as parent'
          );
        }
      } else {
        // Promoting to root level (parentId = null) requires Super Admin
        const isSuperAdmin = await permissionService.isSuperAdmin(actorUserId);
        if (!isSuperAdmin) {
          throw new ForbiddenError(
            'Forbidden: only Super Administrators have authority to promote an administrative unit to root level'
          );
        }
      }
    }

    // Resolve isActive if provided
    let isActive = existing.isActive;
    if (input.isActive !== undefined) {
      isActive = input.isActive;
    } else if (input.status !== undefined) {
      isActive = input.status === 'ACTIVE';
    }

    const updatePayload: Partial<AdministrativeUnit> = {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.code !== undefined && { code: input.code }),
      ...(input.type !== undefined && { type: input.type }),
      ...(input.parentId !== undefined && { parentId: input.parentId }),
      isActive,
    };

    const updated = await administrativeUnitRepository.updateAdministrativeUnit(id, updatePayload);
    if (!updated) {
      throw new NotFoundError(`Administrative unit with ID '${id}' could not be updated`);
    }

    return updated;
  }
}

export const administrativeUnitService = new AdministrativeUnitService();
