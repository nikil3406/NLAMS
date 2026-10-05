/**
 * Authentication and Session Configuration
 * Phase 1 — Step 3: Authentication Foundation
 */

const sessionDurationDays = parseInt(process.env.SESSION_EXPIRY_DAYS || '7', 10);

export const authConfig = {
  cookieName: 'nlams_session',
  sessionDurationDays,
  sessionDurationMs: sessionDurationDays * 24 * 60 * 60 * 1000,
  argon2: {
    algorithm: 2, // Argon2id
    memoryCost: 65536, // 64 MiB (OWASP recommendation)
    timeCost: 3,
    parallelism: 4,
  },
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
  },
} as const;
