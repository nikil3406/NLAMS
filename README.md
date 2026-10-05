# NLAMS

National Land Acquisition Management System (NLAMS) is an enterprise platform designed to digitize, manage, and monitor land acquisition lifecycles, compensation disbursements, and geospatial parcel administration.

## Current Status

```text
Phase 1 — Step 2: Database Foundation ✓
Phase 1 — Step 1: Project Foundation  ✓
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

7 Phase 1 tables in `db/schema/`:

| Table | Description |
|---|---|
| `users` | System user accounts with Argon2id-hashed passwords |
| `roles` | System roles (SUPER_ADMIN, MINISTRY_ADMIN, etc.) |
| `permissions` | Individual action permissions |
| `role_permissions` | Many-to-many: roles → permissions |
| `user_roles` | Many-to-many: users → roles (with assignment tracking) |
| `administrative_units` | Self-referencing hierarchy (Central → State → District) |
| `user_assignments` | User → Administrative unit assignments |

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
