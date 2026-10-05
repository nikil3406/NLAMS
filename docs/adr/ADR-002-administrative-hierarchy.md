# ADR-002: Administrative Unit Hierarchy Design

**Status:** Accepted  
**Date:** 2026-10-04  
**Phase:** 1 — Step 2: Database Foundation

---

## Context

NLAMS operates across multiple levels of the Indian government administrative hierarchy:

```
Central Government
       │
       ├── State (e.g., Karnataka, Maharashtra)
       │       │
       │       ├── District (e.g., Bengaluru Urban, Mysuru)
       │       │       │
       │       │       └── Taluk / Sub-district
       │       │
       │       └── ...
       │
       └── ...
```

The number of administrative levels varies across states. Some states use additional levels (Block, Circle, Village). The schema must be flexible enough to accommodate:

1. Current known levels (Central → State → District → Taluk)
2. Future levels without requiring schema changes

---

## Decision

### Self-Referencing Hierarchy

Use a **single `administrative_units` table** with a `parent_id` self-referencing foreign key.

```sql
administrative_units
  id          UUID PRIMARY KEY
  name        VARCHAR(255) NOT NULL
  code        VARCHAR(50) UNIQUE NOT NULL
  type        VARCHAR(50) NOT NULL       -- flexible: CENTRAL, STATE, DISTRICT, TALUK, ...
  parent_id   UUID REFERENCES administrative_units(id)
  is_active   BOOLEAN NOT NULL DEFAULT true
  created_at  TIMESTAMP WITH TIME ZONE
  updated_at  TIMESTAMP WITH TIME ZONE
```

### Type as VARCHAR (not PostgreSQL enum)

The `type` field is stored as `VARCHAR(50)` rather than a PostgreSQL `ENUM`.

Known values are defined as TypeScript constants:

```ts
export const ADMIN_UNIT_TYPES = ['CENTRAL', 'STATE', 'DISTRICT', 'TALUK'] as const;
```

---

## Rationale

### Self-Referencing Table

- Represents **unlimited depth** — no assumption about how many levels exist.
- Avoids creating separate tables per level (`states`, `districts`, `taluks`) which would require JOIN chains and schema changes when new levels are added.
- Allows querying the full hierarchy using recursive CTEs when needed.
- Standard pattern for organizational/geographic hierarchies in relational databases.

### VARCHAR type instead of PostgreSQL ENUM

Adding a new value to a PostgreSQL `ENUM` type requires:

```sql
ALTER TYPE admin_unit_type ADD VALUE 'VILLAGE';
```

- This is a DDL statement that cannot easily be rolled back.
- Requires a migration for what should be a data-level change.
- Can cause issues in concurrent production deployments.

Using `VARCHAR` with application-level validation via TypeScript constants:
- Allows adding new types by adding a seed row or configuration value.
- New types do not require DDL migrations.
- TypeScript constants provide type safety at the application layer.
- Zod validators can enforce the known set of values at API boundaries.

### Rejected Alternatives

| Alternative | Reason rejected |
|---|---|
| Separate `states`, `districts`, `taluks` tables | Fixed levels; schema changes required for each new level |
| Nested set model | Complex insertion/update logic; harder to maintain |
| Closure table | More complex; overkill for Phase 1 |
| PostgreSQL ENUM for type | Inflexible DDL; ALTER TYPE not rollback-safe |

---

## Consequences

- The self-referencing FK (`parent_id → id`) is enforced at the database level via migration SQL.
- Drizzle ORM's schema builder does not natively express circular self-references, so the FK is added directly in the migration file.
- Querying the full hierarchy path will require recursive CTEs (`WITH RECURSIVE`) — this is standard SQL and supported by PostgreSQL.
- Application code must validate `type` against the known constant set (`ADMIN_UNIT_TYPES`) using Zod before persisting.
- New administrative levels can be added by inserting new rows with new `type` values — **no schema migration required**.
