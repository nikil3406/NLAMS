import { userAssignmentRepository } from '../../repositories/user-assignment.repository';
import { administrativeUnitRepository } from '../../repositories/administrative-unit.repository';
import { userRepository, type UserWithDetails } from '../../repositories/user.repository';
import { permissionService } from '../authorization/permission.service';
import { authorizationService } from '../authorization/authorization.service';
import { scopeService } from '../authorization/scope.service';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../types/errors';
import type {
  CreateAssignmentInput,
  UpdateAssignmentInput,
} from '../../validators/users';

/**
 * Service managing user assignments to administrative units with hierarchical scope boundary checks.
 */
export class UserAssignmentService {
  /**
   * Assigns a user to an administrative unit within the actor's authorized scope.
   */
  async createAssignment(
    actorUserId: string,
    targetUserId: string,
    input: CreateAssignmentInput
  ): Promise<UserWithDetails> {
    // 1. Prevent self-modification
    if (actorUserId === targetUserId) {
      throw new ForbiddenError(
        'Forbidden: self-modification of administrative assignments is not permitted'
      );
    }

    // 2. Permission check
    await permissionService.requirePermission(actorUserId, 'USER_ASSIGN');

    // 3. Target user existence & management authority check
    const targetUser = await userRepository.findUserDetailsById(targetUserId);
    if (!targetUser) {
      throw new NotFoundError('Target user not found');
    }

    await authorizationService.requireCanManageUser(actorUserId, targetUserId, {
      requiredPermission: 'USER_ASSIGN',
    });

    // 4. Target administrative unit existence & active status check
    const targetUnit = await administrativeUnitRepository.getAdministrativeUnitById(
      input.administrativeUnitId
    );
    if (!targetUnit) {
      throw new NotFoundError('Administrative unit not found');
    }
    if (!targetUnit.isActive) {
      throw new BadRequestError('Cannot assign user to an inactive administrative unit');
    }

    // 5. Scope containment check: target unit must be in actor's authorized administrative scope
    await scopeService.requireAdministrativeScope(
      actorUserId,
      input.administrativeUnitId
    );

    // 6. Duplicate active assignment prevention
    const existingActive =
      await userAssignmentRepository.findActiveAssignmentByUserAndUnit(
        targetUserId,
        input.administrativeUnitId
      );
    if (existingActive) {
      throw new ConflictError(
        'User already has an active assignment in this administrative unit'
      );
    }

    // 7. Date validation
    const today = new Date().toISOString().split('T')[0];
    const startDate = input.startDate ?? today;
    if (input.endDate && input.endDate < startDate) {
      throw new BadRequestError('End date cannot precede start date');
    }

    // 8. Create assignment
    await userAssignmentRepository.createAssignment({
      userId: targetUserId,
      administrativeUnitId: input.administrativeUnitId,
      assignedBy: actorUserId,
      startDate,
      endDate: input.endDate ?? null,
      status: 'ACTIVE',
    });

    // 9. Return updated user
    const updated = await userRepository.findUserDetailsById(targetUserId);
    if (!updated) {
      throw new NotFoundError('Target user not found after assignment');
    }

    return updated;
  }

  /**
   * Modifies an existing administrative assignment (e.g. status, endDate).
   */
  async updateAssignment(
    actorUserId: string,
    targetUserId: string,
    assignmentId: string,
    input: UpdateAssignmentInput
  ): Promise<UserWithDetails> {
    // 1. Prevent self-modification
    if (actorUserId === targetUserId) {
      throw new ForbiddenError(
        'Forbidden: self-modification of administrative assignments is not permitted'
      );
    }

    // 2. Permission check
    await permissionService.requirePermission(actorUserId, 'USER_ASSIGN');

    // 3. Target user existence & management authority check
    const targetUser = await userRepository.findUserDetailsById(targetUserId);
    if (!targetUser) {
      throw new NotFoundError('Target user not found');
    }

    await authorizationService.requireCanManageUser(actorUserId, targetUserId, {
      requiredPermission: 'USER_ASSIGN',
    });

    // 4. Assignment existence check
    const assignment = await userAssignmentRepository.findAssignmentById(assignmentId);
    if (!assignment || assignment.userId !== targetUserId) {
      throw new NotFoundError('Administrative assignment not found for this user');
    }

    // 5. Target unit of the assignment must be within actor's scope
    await scopeService.requireAdministrativeScope(
      actorUserId,
      assignment.administrativeUnitId
    );

    // 6. Validate dates if endDate is being modified
    if (input.endDate !== undefined && input.endDate !== null) {
      if (input.endDate < assignment.startDate) {
        throw new BadRequestError('End date cannot precede assignment start date');
      }
    }

    // 7. Update assignment
    await userAssignmentRepository.updateAssignment(assignmentId, {
      status: input.status,
      endDate: input.endDate,
    });

    // 8. Return updated user
    const updated = await userRepository.findUserDetailsById(targetUserId);
    if (!updated) {
      throw new NotFoundError('Target user not found after assignment update');
    }

    return updated;
  }
}

export const userAssignmentService = new UserAssignmentService();
