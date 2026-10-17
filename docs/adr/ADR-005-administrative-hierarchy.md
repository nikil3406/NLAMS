# ADR-005: Data-Driven Administrative Hierarchy & Application UI Architecture

**Status:** Accepted  
**Date:** 2026-10-17  
**Phase:** 2 — Step 1: Administrative Hierarchy Foundation + Application UI Shell

---

## Context

Phase 1 established the PostgreSQL + Drizzle ORM schema, Argon2id authentication, RBAC authorization, and hierarchical administrative-scope authorization.

Phase 2, Step 1 initiates the first real NLAMS application user interface and the management of administrative boundaries. The administrative hierarchy in India is multi-tiered and varies by state (e.g. Center → State → District → Sub-District/Taluk → Revenue Village/Circle). 

Hardcoding tier-specific columns (e.g., `state_id`, `district_id`) would tightly couple the database schema to specific state structures, breaking support for Union Territories, metropolitan administrative areas, or deeper revenue village hierarchies.

Furthermore, management actions (create and update) introduce critical integrity requirements:
1. An administrative unit cannot be its own parent.
2. An administrative unit cannot have one of its descendants as its parent (circular reference).
3. Officers must be restricted by administrative scope and fine-grained permissions (`ADMIN_UNIT_CREATE`, `ADMIN_UNIT_UPDATE`, `ADMIN_UNIT_VIEW`).
4. The application shell must establish a reusable, authenticated government-system interface for all subsequent phases.

---

## Decisions

### 1. Arbitrary Depth via Self-Referential Adjacency List & Recursive CTEs

We maintain the data-driven hierarchy using `administrative_units.parent_id` with no fixed-tier columns.
Arbitrary depth queries (ancestor breadcrumbs, subordinate descendant trees, and scope containment) are resolved using PostgreSQL Recursive Common Table Expressions (CTEs):

```sql
WITH RECURSIVE descendants AS (
  SELECT id FROM administrative_units WHERE id = $1::uuid AND is_active = true
  UNION ALL
  SELECT u.id FROM administrative_units u
  INNER JOIN descendants d ON u.parent_id = d.id
  WHERE u.is_active = true
)
SELECT id FROM descendants;
```

### 2. Circular Hierarchy Prevention at the Service Layer

Before any parent relationship mutation is committed in `updateAdministrativeUnit`:
1. **Self-Parenting Guard**: `parentId !== unitId` is strictly asserted.
2. **Circular Ancestor Guard**: The system checks if the proposed new parent is currently an existing descendant of the unit being updated using `administrativeUnitRepository.isDescendantOrSelf(targetId, newParentId)`. If true, a `ConflictError` (HTTP 409) is raised.

### 3. Server-Side Administrative Scope Enforcement

Mutations are never trusted from the client:
- Creating a child unit requires the actor to possess administrative scope over the target `parentId`.
- Creating a root unit (`parentId = null`) is restricted exclusively to `SUPER_ADMIN`.
- Modifying a unit requires administrative scope over both the unit itself and the new parent unit.
- Scoped officers receive hierarchy views rooted at their assigned jurisdictional boundaries rather than the entire national tree.

### 4. Application UI Shell Architecture

The authenticated application shell is structured as:
```text
src/app/
├── (auth)/
│   └── login/page.tsx               # Official government sign-in portal
└── (dashboard)/
    ├── layout.tsx                   # Server Component auth check & shell provider
    ├── dashboard/page.tsx           # Officer welcome, real metrics, module roadmap
    └── administrative-units/        # Interactive hierarchy tree & CRUD interface
        ├── page.tsx                 # Server Component resolving auth context
        └── administrative-units-client.tsx # Client Component managing tree & modals
```

- **Server Component Boundary**: Protected route layouts execute server-side authentication (`getCurrentUser()`) and redirect unauthenticated requests before rendering HTML.
- **Client Components (`"use client"`)**: Restricted strictly to interactive widgets: tree node expansion, unit selection, and create/edit modal dialogs.
- **Real Statistics Only**: The dashboard displays live administrative counts directly from PostgreSQL; placeholder land parcels or financial figures are omitted until future phases.

---

## Consequences

- Arbitrary depth is supported across all Indian states and Union Territories without DDL changes.
- In-memory tree reconstruction runs in $O(N)$ linear time by hashing nodes into a lookup map.
- The UI dynamically adapts based on officer permissions (view-only vs. administrative rights), backed by server-side authorization enforcement.
- Future modules (Users, Projects, Land Acquisition, GIS) plug directly into the established AppShell without restructuring navigation.
