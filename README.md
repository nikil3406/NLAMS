# NLAMS

National Land Acquisition Management System (NLAMS) is an enterprise platform designed to digitize, manage, and monitor land acquisition lifecycles, compensation disbursements, and geospatial parcel administration.

## Current Status

```text
Phase 1 — Step 3: Authentication Foundation ✓
Phase 1 — Step 2: Database Foundation       ✓
Phase 1 — Step 1: Project Foundation        ✓
```

## Stack

- **Next.js** (App Router)
- **React**
- **TypeScript** (Strict Mode)
- **pnpm** (Package Manager)
- **Zod** (Schema Validation)
- **PostgreSQL 15 + PostGIS 3.x**
- **Drizzle ORM 0.45** + drizzle-kit
- **postgres.js** (database driver)
- **@node-rs/argon2** (password hashing)

## Database Setup

### Prerequisites

- PostgreSQL 15 installed locally with PostGIS extension
- Create the database and enable PostGIS:

```sql
CREATE DATABASE nlams;
\c nlams
CREATE EXTENSION IF NOT EXISTS postgis;
```

### Environment

Create `.env.local` based on `.env.example`:

```env
DATABASE_URL=postgresql://postgres:<password>@localhost:5432/nlams
SEED_ADMIN_EMAIL=admin@nlams.gov.in
SEED_ADMIN_PASSWORD=YourSecurePassword
```

### Database Commands

```bash
# Generate migration from schema
pnpm db:generate

# Apply migrations to database
pnpm db:migrate

# Seed roles, permissions, hierarchy, and Super Admin
pnpm db:seed

# Verify database health
pnpm db:verify

# Open Drizzle Studio (visual DB browser)
pnpm db:studio
```

### Schema

8 Phase 1 tables in `db/schema/`:

| Table | Description |
|---|---|
| `users` | System user accounts with Argon2id-hashed passwords |
| `roles` | System roles (SUPER_ADMIN, MINISTRY_ADMIN, etc.) |
| `permissions` | Individual action permissions |
| `role_permissions` | Many-to-many: roles → permissions |
| `user_roles` | Many-to-many: users → roles (with assignment tracking) |
| `administrative_units` | Self-referencing hierarchy (Central → State → District) |
| `user_assignments` | User → Administrative unit assignments |
| `sessions` | Server-side sessions storing SHA-256 hashed tokens with expiration |

## Phase 1 — Step 3: Authentication Foundation

NLAMS implements a secure, server-side session authentication architecture designed strictly around identity verification (*"Who are you?"*), completely decoupled from authorization and permissions (*"What can you do?"*).

```text
Browser
  │  HttpOnly Session Cookie (`nlams_session`)
  ▼
Next.js Route Handlers / Server Components
  │  Reads cookie via `getCurrentUser()` / `requireAuthentication()`
  ▼
Authentication Service (`src/services/auth/`)
  │  Hashes candidate token (SHA-256) & validates session state
  ▼
Repositories (`src/repositories/`)
  │  Drizzle ORM queries
  ▼
PostgreSQL (`sessions` + `users` tables)
```

### Core Authentication Features

- **Password Security:** Passwords hashed with **Argon2id** via `@node-rs/argon2` (OWASP parameters: 64 MiB memory, 3 iterations, 4 parallelism). Plaintext passwords and hashes are never exposed or logged.
- **Session Architecture:** 32-byte (256-bit) cryptographically random session tokens. Stored in PostgreSQL as **SHA-256 hashes** to protect against database compromise.
- **Immediate Revocation:** Immediate session invalidation upon logout or user deactivation (`status !== 'ACTIVE'`).
- **Transport Security:** Session tokens transmitted exclusively via **HttpOnly**, **SameSite=Lax**, **Path=/** cookies. Never stored in `localStorage` or `sessionStorage`.
- **Timing Attack Mitigation:** Generic `"Invalid email or password"` responses combined with dummy Argon2id verifications on non-existent accounts to eliminate timing side-channels and prevent email enumeration.

### Authentication Endpoints

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/auth/login` | Authenticate credentials, create server-side session, set HttpOnly cookie | No |
| `POST` | `/api/auth/logout` | Invalidate active session and clear cookie (idempotent) | Yes (safe if unauth) |
| `GET` | `/api/auth/me` | Retrieve profile of currently authenticated user | Yes |

### Server-Side Helpers

- `getCurrentUser(request?)`: Returns `SafeUser | null`. Works in both Route Handlers (`NextRequest`) and Server Components (`next/headers`).
- `requireAuthentication(request?)`: Asserts user is authenticated, throws `AuthenticationError` (401) if not. Serves as the protected route foundation for future modules.

## Project Structure

```text
nlams/
├── src/                    # Primary Next.js application source
│   ├── app/                # App Router pages, layouts, and route handlers
│   ├── components/         # Reusable UI components
│   ├── features/           # Domain-specific feature modules
│   ├── lib/                # Generic utilities and helper functions
│   ├── services/           # Business and service layer
│   ├── repositories/       # Database access and persistence layer
│   ├── validators/         # Zod validation schemas
│   ├── types/              # Application-wide TypeScript type definitions
│   └── config/             # Minimal application configuration
├── worker/                 # Background worker process placeholder
│   ├── jobs/               # Background job definitions
│   ├── scheduler/          # Task scheduling logic
│   └── index.ts            # Worker initialization placeholder
├── db/                     # Database layer placeholder (Phase 1 Step 2)
│   ├── schema/             # Drizzle schemas
│   ├── migrations/         # Database migrations
│   ├── seeds/              # Database seed data
│   └── queries/            # Reusable SQL queries
├── mock-services/          # External integration simulation placeholders
│   ├── land-records/       # Land Records API mock
│   ├── payment/            # Payment API mock
│   └── identity/           # Identity / Verification API mock
├── ml/                     # Machine learning components
│   └── delay-prediction/  # Delay prediction model placeholder
├── public/                 # Static public assets
├── tests/                  # Automated testing directory
│   └── e2e/                # End-to-end tests placeholder (Playwright)
├── docs/                   # Architecture and project documentation
│   ├── architecture/       # Architectural overviews and specifications
│   ├── diagrams/           # C4 and system diagrams
│   ├── openapi/            # OpenAPI/Swagger specifications
│   └── adr/                # Architecture Decision Records
├── scripts/                # Administrative and operational scripts
│   ├── reset-db/           # Database reset script placeholder
│   ├── seed-admin/         # Admin account seeding placeholder
│   └── backup/             # Database backup script placeholder
├── .github/
│   └── workflows/          # GitHub Actions CI/CD workflows
├── next.config.ts          # Next.js configuration
├── tsconfig.json           # TypeScript configuration with strict mode
├── package.json            # Project manifest, dependencies, and scripts
├── .env.example            # Environment variable template
├── .gitignore              # Git ignore rules
└── README.md               # Project documentation
```

## Running Locally

### Prerequisites

- Node.js (v20+ recommended)
- pnpm (v9+ / v11+)

### Installation

```bash
pnpm install
```

### Development Server

Start the local Next.js development server:

```bash
pnpm dev
```

The application will be available at `http://localhost:3000`.

### Code Quality & Build Verification

```bash
# Run automated test suite
pnpm test

# Run ESLint checks
pnpm lint

# Run TypeScript typecheck
pnpm typecheck

# Build production bundle
pnpm build
```

## Architecture Direction

The application enforces a clean separation of concerns across distinct layers:

```text
Next.js (App Router / Route Handlers)
   ↓
Services (Business Logic & Orchestration)
   ↓
Repositories (Data Access Abstraction)
   ↓
PostgreSQL / PostGIS (Relational & Spatial Database)
```

- **Next.js** handles routing, server-rendered views, and API entrypoints.
- **Services** encapsulate validation and business rules without direct database coupling.
- **Repositories** abstract query execution and data persistence.
- **PostgreSQL + PostGIS** will store relational domain data and geospatial boundary geometries starting in Phase 1 — Step 2.
