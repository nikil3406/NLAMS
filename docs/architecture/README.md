# NLAMS Architecture Overview

## Purpose

The **National Land Acquisition Management System (NLAMS)** is designed to digitize, manage, and monitor end-to-end national land acquisition processes, compensation disbursements, and geospatial parcel administration across multiple levels of government.

---

## Core Components

### 1. Next.js Primary Application (`src/`)

The primary user-facing application built with Next.js (App Router), React, and TypeScript. Provides:
- Government officer interfaces
- API route handlers for server-side data access
- Server-side rendering with no database access on the client

Layered architecture:

```
Next.js (App Router / Route Handlers)
          ↓
Services (src/services/) — Business logic & workflow orchestration
          ↓
Repositories (src/repositories/) — Data access abstraction
          ↓
Database Client (db/index.ts) — Drizzle ORM + postgres.js
          ↓
PostgreSQL 15 + PostGIS (nlams database)
```

### 2. Database Layer (`db/`)

- **Engine:** PostgreSQL 15 with PostGIS 3.x extension
- **ORM:** Drizzle ORM
- **Driver:** postgres.js
- **Migrations:** drizzle-kit generates SQL migration files in `db/migrations/`
- **Schema:** Defined in TypeScript in `db/schema/`

#### Phase 1 Tables (Step 2)

| Table | Purpose |
|---|---|
| `users` | System user accounts |
| `roles` | Role definitions (SUPER_ADMIN, MINISTRY_ADMIN, etc.) |
| `permissions` | Individual action permissions |
| `role_permissions` | Many-to-many: role → permissions |
| `user_roles` | Many-to-many: user → roles (with assignedBy tracking) |
| `administrative_units` | Self-referencing hierarchy (Central → State → District → Taluk) |
| `user_assignments` | User → Administrative unit assignment records |

### 3. Background Worker Process (`worker/`)

Placeholder for a future asynchronous job processor. Will handle:
- Document processing and generation
- Notification dispatch
- Scheduled data exports
- Async workflow state transitions

Infrastructure and queue technology to be decided in a future phase.

### 4. External Mock Services (`mock-services/`)

Standalone simulations of external government/financial systems:

| Service | Purpose |
|---|---|
| `land-records/` | Land ownership, cadastral maps, registry verification |
| `payment/` | Compensation disbursements and treasury tracking |
| `identity/` | Citizen and stakeholder identity verification |

### 5. Machine Learning Component (`ml/`)

A Python-based service for land acquisition **delay prediction** and bottleneck detection. To be implemented in a future phase.

### 6. Tests (`tests/`)

End-to-end tests using Playwright (to be configured in a future phase).

---

## Architectural Rules

1. **No Express.** Next.js is the primary application server.
2. **No Docker.** PostgreSQL/PostGIS run locally on the developer's machine.
3. **Database is server-side only.** The `db/` client must never be imported from browser/client code.
4. **Credentials via environment variables only.** Never hard-code `DATABASE_URL` or secrets.
5. **Migrations are required.** Use `drizzle-kit generate` + `drizzle-kit migrate`. Do not use `db:push` as the only path.
6. **Separation of concerns:** App → Services → Repositories → Database. Each layer has a distinct responsibility.

---

## ADRs

| ADR | Decision |
|---|---|
| [ADR-001](../adr/ADR-001-database-technology.md) | PostgreSQL + PostGIS + Drizzle ORM |
| [ADR-002](../adr/ADR-002-administrative-hierarchy.md) | Self-referencing `administrative_units` table with VARCHAR type |
