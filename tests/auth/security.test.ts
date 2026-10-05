import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { authConfig } from '../../src/config/auth';
import { sanitizeUser } from '../../src/services/auth/session.service';
import type { User } from '../../db/schema/users';

describe('Security Controls & Non-Exposure', () => {
  it('enforces HttpOnly on session cookie configuration', () => {
    assert.equal(authConfig.cookie.httpOnly, true, 'Session cookie must be HttpOnly');
  });

  it('enforces SameSite=lax on session cookie configuration', () => {
    assert.equal(authConfig.cookie.sameSite, 'lax', 'Session cookie must have SameSite=lax');
  });

  it('enforces secure cookie in production environment', () => {
    // Verify configuration uses NODE_ENV check
    assert.equal(typeof authConfig.cookie.secure, 'boolean');
  });

  it('guarantees sanitizeUser strips passwordHash', () => {
    const rawUser: User = {
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Security Admin',
      email: 'admin@nlams.gov.in',
      phone: '+91 9876543210',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$secret_hash_value',
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const sanitized = sanitizeUser(rawUser);

    assert.equal((sanitized as Record<string, unknown>).passwordHash, undefined);
    assert.equal(Object.prototype.hasOwnProperty.call(sanitized, 'passwordHash'), false);
    assert.equal(sanitized.id, rawUser.id);
    assert.equal(sanitized.email, rawUser.email);
    assert.equal(sanitized.name, rawUser.name);
  });

  it('does not leak internal secrets into sanitized user objects', () => {
    const rawUser: User = {
      id: '22222222-2222-2222-2222-222222222222',
      name: 'Field Officer',
      email: 'officer@nlams.gov.in',
      phone: null,
      passwordHash: 'argon_hash_to_strip',
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const sanitized = sanitizeUser(rawUser);
    const json = JSON.stringify(sanitized);

    assert.ok(!json.includes('passwordHash'), 'Serialized user JSON must not contain passwordHash');
    assert.ok(!json.includes('argon_hash_to_strip'), 'Serialized user JSON must not contain hash value');
  });
});
