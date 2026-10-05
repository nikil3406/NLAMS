import { hash, verify } from '@node-rs/argon2';
import { authConfig } from '../../config/auth';

/**
 * Service responsible for cryptographic password hashing and verification.
 * Uses Argon2id with OWASP-recommended memory and parallelism settings.
 */
export class PasswordService {
  /**
   * Hashes a plaintext password using Argon2id.
   */
  async hashPassword(password: string): Promise<string> {
    return hash(password, {
      algorithm: authConfig.argon2.algorithm,
      memoryCost: authConfig.argon2.memoryCost,
      timeCost: authConfig.argon2.timeCost,
      parallelism: authConfig.argon2.parallelism,
    });
  }

  /**
   * Verifies a candidate plaintext password against an existing Argon2id hash.
   * Never throws on mismatch; returns boolean.
   */
  async verifyPassword(password: string, passwordHash: string): Promise<boolean> {
    try {
      if (!password || !passwordHash) {
        return false;
      }
      return await verify(passwordHash, password);
    } catch {
      // In case of malformed hash string or verification error, fail securely
      return false;
    }
  }
}

export const passwordService = new PasswordService();
