# ADR-003: Authentication and Session Strategy

**Status:** Accepted  
**Date:** 2026-10-05  
**Phase:** 1 — Step 3: Authentication Foundation

---

## Context

NLAMS requires a secure, production-grade authentication foundation to identify system users before granting access to land acquisition, compensation, and geospatial workflows.

The system is built on Next.js (App Router), TypeScript, PostgreSQL 15, and Drizzle ORM, without Redis or external authentication SaaS dependencies.

Key security and architectural requirements:
- Server-side identity verification ("Who are you?").
- Passwords must be hashed using modern algorithms and never exposed or logged.
- Sessions must support immediate revocation upon user logout or account deactivation.
- Authentication tokens must never be accessible to client-side JavaScript (`localStorage`/`sessionStorage`).
- Separation of concerns between Authentication (Step 3) and Authorization/RBAC (Step 4).

---

## Decision

1. **Password Hashing:** Use **Argon2id** via `@node-rs/argon2` with OWASP-recommended parameters (memoryCost: 65536 KiB, timeCost: 3 iterations, parallelism: 4).
2. **Session Storage:** Implement a single server-side `sessions` table in PostgreSQL.
3. **Token Security:** Generate 32 bytes (256 bits) of cryptographic entropy for raw session tokens. Store only the **SHA-256 hash** of the token in the `sessions` table.
4. **Cookie Transport:** Transmit the raw token to the browser exclusively through an **HttpOnly**, **SameSite=Lax**, **Path=/** cookie (`nlams_session`), marked **Secure** in production environments.
5. **Architectural Separation:** Establish repository, service, and validator layers:
   - Repositories (`UserRepository`, `SessionRepository`) abstract all Drizzle queries.
   - Services (`PasswordService`, `SessionService`, `AuthService`) encapsulate authentication business rules.
   - Route Handlers (`/api/auth/login`, `/api/auth/logout`, `/api/auth/me`) handle HTTP transport and cookie lifecycle.
   - Server-side helpers (`getCurrentUser()`, `requireAuthentication()`) provide the foundation for protecting future routes without embedding permission checks yet.

---

## Rationale

### Database-Backed Sessions with SHA-256 Hashing

- **Immediate Server-Side Revocation:** In enterprise government systems, user accounts may be suspended or compromised. Database-backed sessions allow immediate invalidation upon logout or user deactivation, unlike purely stateless tokens.
- **Hash-at-Rest Security:** Storing the SHA-256 hash of the session token ensures that even in the event of an unauthorized database dump, active session tokens cannot be used by an attacker to hijack user sessions.
- **Simplicity & Zero Bloat:** Requires only a single table (`sessions`) with indexed foreign keys and expiration timestamps. No external key-value cache (Redis) or multi-token refresh complexity is introduced prematurely.

### HttpOnly Cookies vs. Client-Side Storage

- Storing tokens in `localStorage` or `sessionStorage` exposes sessions to Cross-Site Scripting (XSS) attacks.
- Secure, HttpOnly cookies are immune to JavaScript inspection, preventing client-side credential theft.
- `SameSite=Lax` defends against Cross-Site Request Forgery (CSRF) for state-changing browser navigations.

### Argon2id Hashing

- Argon2id is the winner of the Password Hashing Competition (PHC) and the current OWASP gold standard.
- It provides hybrid protection against both side-channel cache attacks (Argon2i) and GPU/ASIC brute-force cracking (Argon2d).

### Decoupling Authentication from Authorization

- Step 3 strictly answers: *"Who are you?"* (Identity verification and session provisioning).
- Step 4 will answer: *"What can you do?"* (RBAC, permissions) and *"Where can you do it?"* (Administrative scope).
- Keeping these layers distinct prevents coupling session validation with permission graphs.

---

## Rejected Alternatives

| Option | Reason Rejected |
|---|---|
| **Stateless JWTs in Cookies** | Cannot be revoked server-side immediately upon logout or user account suspension without maintaining a revocation blacklist, negating statelessness advantages. |
| **Tokens in localStorage** | High vulnerability to XSS attacks; client-side JavaScript should never access session secrets. |
| **Redis for Session Store** | Adds operational and deployment complexity (NLAMS explicitly maintains a lean stack without Redis in Phase 1). PostgreSQL handles session lookups efficiently via primary key index. |
| **NextAuth.js / Auth0 / Clerk** | Adds heavy abstractions, external cloud lock-in, or opinionated schemas that conflict with the custom Indian administrative hierarchy and strict government data sovereignty requirements. |

---

## Consequences

- The `sessions` table is managed via Drizzle migrations (`0001_tired_mercury.sql`).
- Route handlers and server components access user identity via `getCurrentUser()` and `requireAuthentication()`.
- Expired sessions are automatically cleared during session validation or can be purged via `sessionRepository.deleteExpiredSessions()`.
- Client requests must include credentials (`credentials: 'include'`) for cookie transmission.
