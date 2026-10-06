# ADR-004: Authorization Model and Administrative Scope

**Status:** Accepted  
**Date:** 2026-10-06  
**Phase:** 1 — Step 4: Authorization Foundation

---

## Context

NLAMS requires a multi-layered authorization system that enforces:

1. **Role-Based Permissions** — What actions is a user allowed to perform?
2. **Administrative Scope** — Within which geographic/administrative boundaries may a user operate?
3. **Hierarchical Authority** — Which users may a given actor manage or administer?

The system operates within a government land acquisition framework with a strict national → state → district → taluk administrative hierarchy. Authorization failures must result in explicit HTTP 403 Forbidden responses — enforced server-side regardless of client-side UI state.

---

## Decision

### 1. Role-Based Access Control (RBAC)

Permissions are NOT assigned directly to users. They are assigned to roles, and roles are assigned to users:

```
roles
  └── role_permissions
           └── permissions
```

**System roles (seeded):**

| Role | Authority Level |
|---|---|
| `SUPER_ADMIN` | National — all permissions, all scopes |
| `MINISTRY_ADMIN` | Central/State Ministry — full user & unit management |
| `PROJECT_OFFICER` | Project view access |
| `LAND_OFFICER` | Land record view access |
| `FIELD_OFFICER` | Field data view access |

### 2. Administrative Scope

Every user may hold one or more administrative unit assignments (`user_assignments` → `administrative_units`). A user's **scope** is the set of administrative units they are assigned to **plus all their descendants**, resolved at runtime through PostgreSQL recursive CTEs:

```sql
WITH RECURSIVE descendants AS (
  SELECT id FROM administrative_units WHERE id = $actorUnit
  UNION ALL
  SELECT u.id FROM administrative_units u
  INNER JOIN descendants d ON u.parent_id = d.id
  WHERE u.is_active = true
)
SELECT id FROM descendants
```

This means scope checks work for **arbitrary hierarchy depth** without code changes when new administrative levels are introduced.

### 3. Hierarchical Authority (canManageUser)

An actor may manage a target user only when ALL of the following hold:

1. **Permission**: Actor possesses the required permission (e.g. `USER_UPDATE`, `USER_ASSIGN`).
2. **Super Admin bypass**: Super Admins automatically satisfy all scope and permission requirements.
3. **No Super Admin downgrade**: Non-Super-Admins can never manage Super Admins.
4. **Role weight**: Actor's highest-weighted role must be ≥ target's highest-weighted role (prevents lower-tier officers from managing higher-tier officers, even within the same unit).
5. **Scope containment**: Target's administrative units must all be within the actor's administrative scope.

### 4. Error Semantics

| Condition | HTTP Response |
|---|---|
| Missing or expired authentication session | `401 Unauthorized` |
| Authenticated but insufficient permission or scope | `403 Forbidden` |

`ForbiddenError` (extends `Error`) is used internally, caught by route handlers, and mapped to `403`.

---

## Rationale

### Why data-driven hierarchy instead of hard-coded role names/types?

The requirement spec explicitly forbids:
```
if role === "STATE_ADMIN"
if unit.type === "STATE"
```

India's administrative structure may vary, and NLAMS must accommodate future levels (e.g. sub-district, taluk, village panchayat) without modifying authorization logic. The `parent_id` self-referencing column in `administrative_units` enables recursive traversal of arbitrary depth.

### Why are permissions on roles, not on users?

Direct user-permission assignments create management complexity at scale (hundreds of officers across dozens of administrative units). Role-based assignment centralizes permission management: changing a role's permissions propagates to all users holding that role.

### Why store role authority weights in application code?

The authority weight map (`SUPER_ADMIN: 100, MINISTRY_ADMIN: 80, ...`) is a deliberate application-level policy, not database configuration. This prevents circumvention through database manipulation while keeping the policy visible and auditable in version control.

### Why no new database tables?

The existing seven tables (`users`, `roles`, `permissions`, `role_permissions`, `user_roles`, `administrative_units`, `user_assignments`) fully represent the required authorization model. No additional tables were introduced.

### Why is authorization enforced server-side?

Authorization must never depend on UI state (hidden buttons, disabled fields). Every API route enforces authorization independently. A direct HTTP request to a protected endpoint must receive `403 Forbidden` regardless of what the frontend shows.

---

## Authorization vs. Authentication Boundary

| Concern | Responsibility | Step |
|---|---|---|
| Who is this user? | Authentication (JWT/session validation) | Step 3 |
| What can this user do? | Permission check via RBAC | Step 4 |
| Where can this user do it? | Administrative scope check | Step 4 |
| Who can this user manage? | Hierarchical authority check | Step 4 |

These concerns are strictly decoupled. `requireAuthentication()` (Step 3) establishes identity; authorization services (Step 4) enforce what that identity may do.

---

## What is Intentionally Deferred

| Feature | Reason Deferred |
|---|---|
| Project-scoped permissions | Requires project schema (Phase 2) |
| Bottom-up / top-down approval workflows | Requires workflow engine (Phase 3+) |
| Field-level data visibility rules | Requires domain entity schemas |
| Audit logging of authorization decisions | Requires audit infrastructure |
| Caching of permission/scope results | Performance optimization — premature at this stage |

---

## Consequences

- All protected route handlers must call `requireAuthentication()` before any authorization check.
- Authorization decisions (`requirePermission`, `requireAdministrativeScope`, `requireCanManageUser`) must only be made in the service layer — never in repositories or route handlers directly.
- New administrative levels can be introduced without modifying authorization logic by inserting rows into `administrative_units` with appropriate `parent_id` relationships.
- New permissions can be introduced without code changes by inserting rows into `permissions` and assigning them to roles via `role_permissions`.
