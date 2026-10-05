import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { passwordService } from '../../src/services/auth/password.service';

describe('PasswordService', () => {
  it('hashes password successfully using Argon2id', async () => {
    const password = 'SecurePassword#2026';
    const hash = await passwordService.hashPassword(password);

    assert.ok(typeof hash === 'string', 'Hash should be a string');
    assert.ok(hash.startsWith('$argon2id$'), 'Hash should use the Argon2id variant');
    assert.notEqual(hash, password, 'Hash must not equal plaintext password');
  });

  it('produces unique hashes for the same password due to random salting', async () => {
    const password = 'SamePasswordEveryTime';
    const hash1 = await passwordService.hashPassword(password);
    const hash2 = await passwordService.hashPassword(password);

    assert.notEqual(hash1, hash2, 'Hashes of identical passwords must have unique salts');
  });

  it('verifies the correct password successfully', async () => {
    const password = 'CorrectHorseBatteryStaple!';
    const hash = await passwordService.hashPassword(password);

    const isValid = await passwordService.verifyPassword(password, hash);
    assert.equal(isValid, true, 'Correct password must verify to true');
  });

  it('fails verification for an incorrect password without throwing', async () => {
    const password = 'CorrectPassword';
    const wrongPassword = 'WrongPassword';
    const hash = await passwordService.hashPassword(password);

    const isValid = await passwordService.verifyPassword(wrongPassword, hash);
    assert.equal(isValid, false, 'Incorrect password must verify to false');
  });

  it('fails safely when passed empty or invalid credentials', async () => {
    assert.equal(await passwordService.verifyPassword('', 'somehash'), false);
    assert.equal(await passwordService.verifyPassword('password', ''), false);
    assert.equal(await passwordService.verifyPassword('password', 'malformed-hash-string'), false);
  });
});
