import { Injectable } from '@nestjs/common';
import jwt from 'jsonwebtoken';

const EXPIRY = '12h';

/** Signs and verifies session tokens: HS256, `sub` = user id, secret only from AUTH_SECRET. */
@Injectable()
export class TokenService {
  private secret(): string {
    const secret = process.env['AUTH_SECRET'] ?? '';
    if (secret.length < 32) throw new Error('AUTH_SECRET must be at least 32 characters.');
    return secret;
  }

  sign(userId: string): string {
    return jwt.sign({}, this.secret(), { algorithm: 'HS256', subject: userId, expiresIn: EXPIRY });
  }

  /** The user id the token was issued for, or null when it is invalid, expired or forged. */
  verify(token: string): string | null {
    try {
      const payload = jwt.verify(token, this.secret(), { algorithms: ['HS256'] });
      return typeof payload === 'object' && typeof payload.sub === 'string' ? payload.sub : null;
    } catch {
      return null;
    }
  }
}
