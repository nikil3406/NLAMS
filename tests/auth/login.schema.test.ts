import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loginSchema } from '../../src/validators/auth/login.schema';

describe('LoginSchema Validation', () => {
  it('accepts valid credentials', () => {
    const result = loginSchema.safeParse({
      email: 'officer@nlams.gov.in',
      password: 'StrongPassword123!',
    });

    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.email, 'officer@nlams.gov.in');
      assert.equal(result.data.password, 'StrongPassword123!');
    }
  });

  it('trims whitespace around email', () => {
    const result = loginSchema.safeParse({
      email: '  officer@nlams.gov.in  ',
      password: 'StrongPassword123!',
    });

    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.email, 'officer@nlams.gov.in');
    }
  });

  it('rejects invalid email formats', () => {
    const invalidEmails = ['plainaddress', 'missingatsign.com', '@missingusername.com', 'user@'];

    for (const email of invalidEmails) {
      const result = loginSchema.safeParse({ email, password: 'ValidPassword' });
      assert.equal(result.success, false, `Expected ${email} to fail validation`);
    }
  });

  it('rejects empty password', () => {
    const result = loginSchema.safeParse({
      email: 'user@nlams.gov.in',
      password: '',
    });

    assert.equal(result.success, false);
    if (!result.success) {
      assert.ok(result.error.flatten().fieldErrors.password);
    }
  });

  it('rejects missing fields', () => {
    const result = loginSchema.safeParse({});
    assert.equal(result.success, false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      assert.ok(errors.email);
      assert.ok(errors.password);
    }
  });

  it('rejects passwords exceeding length limits', () => {
    const longPassword = 'a'.repeat(129);
    const result = loginSchema.safeParse({
      email: 'user@nlams.gov.in',
      password: longPassword,
    });

    assert.equal(result.success, false);
  });
});
