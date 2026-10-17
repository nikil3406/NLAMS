import { administrativeUnitRepository } from '../../repositories/administrative-unit.repository';
import { permissionService } from '../authorization/permission.service';
import { scopeService } from '../authorization/scope.service';
import { NotFoundError } from '../../types/errors';
import type { AdministrativeUnit } from '../../../db/schema/administrative-units';

export interface AdministrativeUnitTreeNode {
  id: string;
  name: string;
  code: string;
  type: string;
  parentId: string | null;
  isActive: boolean;
  status: 'ACTIVE' | 'INACTIVE';
  children: AdministrativeUnitTreeNode[];
  childCount: number;
}

export class AdministrativeUnitTreeService {
  /**
   * Builds a complete hierarchical tree of administrative units visible to the actor.
   * Super Admins receive the full national hierarchy tree.
   * Scoped officers receive hierarchy trees rooted at their assigned administrative units.
   */
  async getFullTree(actorUserId: string): Promise<AdministrativeUnitTreeNode[]> {
    await permissionService.requirePermission(actorUserId, 'ADMIN_UNIT_VIEW');

    const isSuperAdmin = await permissionService.isSuperAdmin(actorUserId);

    let units: AdministrativeUnit[];
    let rootIds: Set<string> | null = null;

    if (isSuperAdmin) {
      units = await administrativeUnitRepository.getAllAdministrativeUnits();
    } else {
      const assignedUnits = await scopeService.getUserAssignedUnits(actorUserId);
      if (assignedUnits.length === 0) {
        return [];
      }

      rootIds = new Set(assignedUnits.map((u) => u.id));
      const authorizedUnitIds = new Set<string>();

      for (const unit of assignedUnits) {
        const descendantIds = await administrativeUnitRepository.getDescendantUnitIds(unit.id);
        for (const id of descendantIds) {
          authorizedUnitIds.add(id);
        }
      }

      const allUnits = await administrativeUnitRepository.getAllAdministrativeUnits();
      units = allUnits.filter((u) => authorizedUnitIds.has(u.id));
    }

    return this.buildTreeFromUnits(units, rootIds);
  }

  /**
   * Retrieves a hierarchical subtree rooted at a specific administrative unit.
   */
  async getUnitSubtree(
    rootUnitId: string,
    actorUserId: string
  ): Promise<AdministrativeUnitTreeNode> {
    await permissionService.requirePermission(actorUserId, 'ADMIN_UNIT_VIEW');
    await scopeService.requireAdministrativeScope(actorUserId, rootUnitId);

    const rootUnit = await administrativeUnitRepository.getAdministrativeUnitById(rootUnitId);
    if (!rootUnit) {
      throw new NotFoundError(`Administrative unit '${rootUnitId}' not found`);
    }

    const descendants = await administrativeUnitRepository.getAdministrativeUnitDescendants(
      rootUnitId,
      { activeOnly: false }
    );

    const allUnitsInSubtree = [rootUnit, ...descendants];
    const tree = this.buildTreeFromUnits(allUnitsInSubtree, new Set([rootUnit.id]));

    if (tree.length === 0) {
      return {
        id: rootUnit.id,
        name: rootUnit.name,
        code: rootUnit.code,
        type: rootUnit.type,
        parentId: rootUnit.parentId,
        isActive: rootUnit.isActive,
        status: rootUnit.isActive ? 'ACTIVE' : 'INACTIVE',
        children: [],
        childCount: 0,
      };
    }

    return tree[0];
  }

  /**
   * Assembles flat array of units into a hierarchical tree structure.
   * If rootIds is provided, only nodes with IDs in rootIds (or parentId = null) become top-level roots.
   */
  private buildTreeFromUnits(
    units: AdministrativeUnit[],
    explicitRootIds: Set<string> | null = null
  ): AdministrativeUnitTreeNode[] {
    const nodeMap = new Map<string, AdministrativeUnitTreeNode>();

    // 1. Initialize nodes
    for (const unit of units) {
      nodeMap.set(unit.id, {
        id: unit.id,
        name: unit.name,
        code: unit.code,
        type: unit.type,
        parentId: unit.parentId,
        isActive: unit.isActive,
        status: unit.isActive ? 'ACTIVE' : 'INACTIVE',
        children: [],
        childCount: 0,
      });
    }

    const roots: AdministrativeUnitTreeNode[] = [];

    // 2. Link children to parents
    for (const unit of units) {
      const node = nodeMap.get(unit.id)!;

      if (explicitRootIds && explicitRootIds.has(unit.id)) {
        roots.push(node);
      } else if (!explicitRootIds && unit.parentId === null) {
        roots.push(node);
      } else if (unit.parentId && nodeMap.has(unit.parentId)) {
        nodeMap.get(unit.parentId)!.children.push(node);
      } else if (!explicitRootIds) {
        // Orphan or detached node whose parent isn't in current list
        roots.push(node);
      }
    }

    // 3. Compute childCount and sort children alphabetically
    const finalizeNode = (node: AdministrativeUnitTreeNode) => {
      node.childCount = node.children.length;
      node.children.sort((a, b) => a.name.localeCompare(b.name));
      for (const child of node.children) {
        finalizeNode(child);
      }
    };

    roots.sort((a, b) => a.name.localeCompare(b.name));
    for (const root of roots) {
      finalizeNode(root);
    }

    return roots;
  }
}

export const administrativeUnitTreeService = new AdministrativeUnitTreeService();
