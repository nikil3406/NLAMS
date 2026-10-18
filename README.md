# NLAMS

National Land Acquisition Management System (NLAMS) is an enterprise platform designed to digitize, manage, and monitor land acquisition lifecycles, compensation disbursements, and geospatial parcel administration.

## Current Status

```text
Phase 2 — Step 2: User & Authority Management UI/API          ✓
Phase 2 — Step 1: Administrative Hierarchy Foundation + UI Shell ✓
Phase 1 — Step 4: Authorization Foundation                     ✓
Phase 1 — Step 3: Authentication Foundation                    ✓
Phase 1 — Step 2: Database Foundation                          ✓
Phase 1 — Step 1: Project Foundation                           ✓

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

---

## Phase 1 — Step 4: Authorization Foundation

NLAMS enforces a **three-layer authorization model** that strictly separates identity (authentication) from capability (authorization):

```text
requireAuthentication()     ← Who are you?        (Step 3)
        ↓
requirePermission(name)     ← What can you do?    (Step 4)
        ↓
requireAdministrativeScope  ← Where can you do it? (Step 4)
        ↓
canManageUser(actor, target) ← Can you act on this user? (Step 4)
```

### Authorization Model

- **RBAC:** Permissions are assigned to roles (`role_permissions`), not users. Users hold roles (`user_roles`). Changing a role's permissions propagates to all holders.
- **Administrative Scope:** Users are assigned to administrative units (`user_assignments`). Their scope includes their assigned units **plus all descendants**, resolved via PostgreSQL recursive CTEs at arbitrary hierarchy depth.
- **Hierarchical Authority:** `canManageUser()` enforces: (1) required permission, (2) Super Admin bypass, (3) no downgrade of Super Admins, (4) role weight prevents lower-tier managing higher-tier, (5) target's units must be within actor's scope.
- **Data-Driven Hierarchy:** No `if role === 'STATE_ADMIN'` hard-coding. All hierarchy traversal uses `administrative_units.parent_id` relationships.

### 401 vs 403 Distinction

| Condition | Status |
|---|---|
| Missing / expired session cookie | `401 Unauthorized` |
| Authenticated but missing permission or scope | `403 Forbidden` |

### Authorization Endpoints

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/auth/permissions` | Returns full authorization context (roles, permissions, assignments) | Yes |

### Authorization Service Structure

```text
src/services/authorization/
├── permission.service.ts   # hasPermission(), hasRole(), requirePermission()
├── scope.service.ts        # isWithinAdministrativeScope(), requireAdministrativeScope()
└── authorization.service.ts # getUserAuthorizationContext(), canManageUser()

src/repositories/
├── role.repository.ts               # findRolesByUserId(), findRoleByName()
├── permission.repository.ts         # findPermissionsByUserId(), hasPermission()
├── administrative-unit.repository.ts # getDescendantUnitIds(), isDescendantOrSelf() (CTE)
└── user-assignment.repository.ts    # findActiveAssignmentsWithUnitsByUserId()
```

### Development Hierarchy (extended for authorization tests)

```text
Central Government (IND)
  ├── Karnataka (KA)
  │     ├── Bengaluru Urban (KA-BLR)
  │     │     └── Bengaluru North (KA-BLR-N)
  │     └── Mysuru (KA-MYS)
  └── Maharashtra (MH)
```

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

## Phase 2 — Step 1: Administrative Hierarchy & Application UI Shell

### Administrative Hierarchy Model
- Data-driven hierarchy via self-referencing `administrative_units.parent_id`.
- Arbitrary hierarchy depth ($Level_1 \rightarrow Level_2 \dots Level_N$) with no fixed tier columns.
- PostgreSQL recursive Common Table Expressions (CTEs) for ancestor and descendant traversal.
- Circular hierarchy prevention at the service layer: units cannot be their own parent and cannot set a descendant as parent.

### Administrative Hierarchy API
Protected route handlers enforcing authentication, Zod validation, permissions, and administrative scope:

| Method | Endpoint | Description | Required Permission | Scope Enforced |
|---|---|---|---|---|
| `GET` | `/api/administrative-units` | List units (or hierarchy tree with `?tree=true`) | `ADMIN_UNIT_VIEW` | Scoped to assigned units |
| `POST` | `/api/administrative-units` | Create administrative unit | `ADMIN_UNIT_CREATE` | Scoped to parent unit |
| `GET` | `/api/administrative-units/:id` | Get unit details, ancestors, and child counts | `ADMIN_UNIT_VIEW` | Unit within scope |
| `PATCH` | `/api/administrative-units/:id` | Update unit details or parent relationship | `ADMIN_UNIT_UPDATE` | Unit and new parent within scope |
| `GET` | `/api/administrative-units/:id/children` | List immediate child administrative units | `ADMIN_UNIT_VIEW` | Unit within scope |
| `GET` | `/api/administrative-units/:id/tree` | Retrieve nested subtree rooted at unit | `ADMIN_UNIT_VIEW` | Unit within scope |

### Application UI Shell
- Reusable authenticated layout (`AppShell`, `Sidebar`, `Header`, `UserMenu`, `Breadcrumb`).
- `/login`: Government officer sign-in portal with Argon2id authentication.
- `/dashboard`: Welcome banner, authenticated officer role and scope summary, real administrative metrics from PostgreSQL, and roadmap modules grid.
- `/administrative-units`: Interactive hierarchy tree with node expansion, quick search/filter, unit detail panel, ancestor breadcrumbs, and permission-aware Create/Edit modals.

## Phase 2 — Step 2: User & Authority Management UI/API

### Module Structure
```text
src/
├── app/
│   ├── (dashboard)/
│   │   └── users/
│   │       ├── page.tsx                      # User list server component
│   │       ├── users-client.tsx              # Interactive table, search, filters, pagination
│   │       ├── new/
│   │       │   ├── page.tsx                  # Create user server component
│   │       │   └── create-user-client.tsx    # User provisioning form + temporary password display
│   │       └── [id]/
│   │           ├── page.tsx                  # User profile server component
│   │           └── user-details-client.tsx   # Profile info, roles & assignments management modals
│   └── api/
│       ├── users/
│       │   ├── route.ts                      # GET /api/users, POST /api/users
│       │   └── [id]/
│       │       ├── route.ts                  # GET /api/users/[id], PATCH /api/users/[id]
│       │       ├── roles/
│       │       │   ├── route.ts              # POST /api/users/[id]/roles
│       │       │   └── [roleId]/route.ts     # DELETE /api/users/[id]/roles/[roleId]
│       │       └── assignments/
│       │           ├── route.ts              # POST /api/users/[id]/assignments
│       │           └── [assignmentId]/route.ts # PATCH /api/users/[id]/assignments/[assignmentId]
│       └── roles/
│           └── route.ts                      # GET /api/roles (delegatable roles for actor)
├── repositories/
│   ├── user.repository.ts                    # User queries, paginated scope listing, atomic transactions
│   ├── user-assignment.repository.ts         # User administrative assignments data access
│   └── role.repository.ts                    # Roles, user-role associations, Super Admin count
├── services/
│   └── users/
│       ├── user.service.ts                   # User listing, details, atomic creation, profile update
│       ├── user-role.service.ts              # Role delegation, authority weights, assignment/revocation
│       └── user-assignment.service.ts        # Unit assignment, scope boundary checks, status updates
└── validators/
    └── users/
        ├── create-user.schema.ts             # Zod validation for user provisioning
        ├── update-user.schema.ts             # Zod validation for profile modification
        ├── assign-role.schema.ts             # Zod validation for role assignment
        ├── create-assignment.schema.ts       # Zod validation for administrative unit assignment
        ├── update-assignment.schema.ts       # Zod validation for assignment status/dates
        └── list-users.schema.ts              # Zod validation for paginated filtering
```

### API Endpoints

| Method | Endpoint | Description | Required Permission | Authorization Enforced |
|---|---|---|---|---|
| `GET` | `/api/users` | List users with pagination, search, and filters | `USER_VIEW` | Scoped to caller's administrative subtree |
| `POST` | `/api/users` | Create user with initial role and unit assignment | `USER_CREATE`, `ROLE_ASSIGN`, `USER_ASSIGN` | Unit within scope; role within delegatable rank |
| `GET` | `/api/users/[id]` | Retrieve user profile, roles, and assignments | `USER_VIEW` | In-scope or self (returns 404 for out-of-scope) |
| `PATCH` | `/api/users/[id]` | Update name, phone, or status | `USER_UPDATE` | Management authority; self status escalation blocked |
| `POST` | `/api/users/[id]/roles` | Assign an authorized role to a user | `ROLE_ASSIGN` | Cannot assign self; role weight $\le$ actor weight |
| `DELETE` | `/api/users/[id]/roles/[roleId]` | Revoke an authorized role from a user | `ROLE_ASSIGN` | Cannot revoke self; prevents removing last SUPER_ADMIN |
| `POST` | `/api/users/[id]/assignments` | Assign user to an administrative unit | `USER_ASSIGN` | Cannot assign self; target unit within scope |
| `PATCH` | `/api/users/[id]/assignments/[assignmentId]` | Update assignment status or end date | `USER_ASSIGN` | Cannot modify self; target unit within scope |
| `GET` | `/api/roles` | List roles that actor is authorized to delegate | `ROLE_ASSIGN` | Scoped by actor's maximum role authority weight |

### Role Delegation Rules
1. **Conservative Deny-by-Default**: Role delegation is governed strictly by the actor's permissions and relative authority weights (`SUPER_ADMIN`: 100, `MINISTRY_ADMIN`: 80, `PROJECT_OFFICER`: 60, `LAND_OFFICER`: 40, `FIELD_OFFICER`: 20).
2. **Super Admin Authority**: Super Admins possess national scope and can delegate any system role.
3. **Non-Super-Admin Restriction**: Non-Super-Admins can **never** grant `SUPER_ADMIN` privileges under any circumstance.
4. **Authority Inversion Prevention**: Officers cannot grant or revoke roles with authority weight exceeding their own highest role.
5. **Self-Escalation Prohibition**: Users cannot assign roles or administrative units to themselves, nor can they alter their own account status.
6. **Last Super Admin Protection**: The system enforces that at least one active `SUPER_ADMIN` must remain in the platform; revoking or deactivating the last Super Admin is rejected.
7. **Documented Limitation**: Role hierarchy is currently mapped through system roles and authority weights defined in code. Dynamic role delegation policies (e.g. per-ministry custom roles or temporary delegable powers) will be formalized in later governance steps.

### Administrative Scope Restrictions
1. **Data-Driven Subtree Scope**: Administrative scopes are derived dynamically from `user_assignments` joined with `administrative_units.parent_id` recursive CTEs.
2. **Branch Isolation**: Officers assigned to one branch (e.g., Karnataka) cannot view, manage, or assign users to another branch (e.g., Maharashtra).
3. **Peer Isolation**: Officers assigned to a district (e.g., Bengaluru Urban) cannot manage users in peer districts (e.g., Mysuru).
4. **Superior Protection**: Lower-level officers cannot manage officers at higher or superior tiers, even within the same administrative jurisdiction.
5. **Information Disclosure Policy**: Requesting user details or resources outside an officer's authorized administrative scope returns HTTP 404 (Not Found) rather than 403 (Forbidden) to prevent user ID enumeration.

### User Creation and Password Handling
1. **Atomic Creation**: User provisioning executes within a PostgreSQL transaction (`db.transaction`) ensuring the user record, role link, and administrative unit assignment succeed or fail together.
2. **Password Security**:
   - Initial passwords are generated as cryptographically secure random temporary passphrases (or accepted via validation).
   - Passwords are exclusively hashed using Argon2id with OWASP-recommended memory and parallelism settings via `@node-rs/argon2`.
   - Plaintext passwords and `password_hash` fields are never stored in plain text and are strictly omitted from all client responses and sanitized objects.
3. **Development Relay Limitation**: In the absence of an external transactional email provider (SMTP/SES), generated temporary passwords are presented to the administrator in a one-time secure visual alert with a copy button during provisioning. This limitation is intentional to avoid unauthorized external dependencies during Phase 2.

### Running Tests

```bash
# Run all automated tests (126 tests across all modules)
pnpm test

# Run User & Authority Management tests only
pnpm tsx --test tests/users/users.test.ts
```

