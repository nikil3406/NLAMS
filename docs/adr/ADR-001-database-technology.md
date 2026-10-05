# ADR-001: Database Technology Selection

**Status:** Accepted  
**Date:** 2026-10-04  
**Phase:** 1 — Step 2: Database Foundation

---

## Context

NLAMS requires a database capable of:

- Storing relational domain data (users, roles, projects, cases, compensations)
- Performing **geospatial queries** on land parcels, administrative boundaries, and survey boundaries
- Supporting complex hierarchical relationships (administrative units, approval chains)
- Scaling to handle national-level land acquisition data

The project uses Next.js without Docker. The database must run locally during development on a developer's machine.

---

## Decision

Use **PostgreSQL 15** with the **PostGIS 3.x** extension as the primary database.

Use **Drizzle ORM** as the database access layer with **drizzle-kit** for migrations.

Use the **`postgres`** (postgres.js) driver for the database connection.

---

## Rationale

### PostgreSQL + PostGIS

- PostgreSQL is the leading open-source relational database and has a long track record in government systems.
- PostGIS adds production-grade geospatial capabilities (geometry types, spatial indexing, spatial queries) required for land parcel and boundary management.
- The combination is widely deployed in GIS and government land information systems worldwide.
- Runs locally without Docker.

### Drizzle ORM

- Type-safe schema definition in TypeScript — no code generation from external files.
- SQL-first philosophy: generated SQL is readable and predictable.
- `drizzle-kit` generates real SQL migration files, making migration history auditable.
- Lighter weight than Prisma; does not require a Prisma schema language.
- Compatible with `postgres.js` driver which is high-performance and suitable for serverless/edge environments.

### Rejected Alternatives

| Option | Reason rejected |
|---|---|
| Prisma | Heavier binary, schema language separate from TypeScript, NLAMS uses Drizzle for type-safety and simplicity |
| TypeORM | Decorator-based, less idiomatic for Next.js App Router, less type-safe than Drizzle |
| Knex | Query builder only, no schema/migration type safety |
| MySQL / MariaDB | Lacks PostGIS; inferior geospatial support |
| MongoDB | No PostGIS, poor fit for relational RBAC and acquisition workflow data |

---

## Consequences

- All database schema changes must go through Drizzle migrations in `db/migrations/`.
- Schema is defined in `db/schema/`.
- The database client is server-side only — it must never be imported from client components.
- `DATABASE_URL` must always be provided via environment variable, never hard-coded.
