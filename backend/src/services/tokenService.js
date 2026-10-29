import crypto from 'node:crypto';
import config from '../config/index.js';

export class TokenService {
  constructor(secret = config.imageTokenSecret) {
    this.secret = secret;
  }

  /**
   * Generates a signed token for an image URL.
   * Matches the exact algorithm used in Spring Boot TokenService:
   * Payload: "eventId:filename:expiryTs"
   * HMAC: HmacSHA256 with secret
   * Encoding: URL-safe Base64 without padding (base64url)
   *
   * @param {string} eventId
   * @param {string} filename
   * @param {number} expiryTs - Expiration epoch timestamp in seconds
   * @returns {string} `${encodedPayload}.${encodedSignature}`
   */
  generateToken(eventId, filename, expiryTs) {
    try {
      const payload = `${eventId}:${filename}:${expiryTs}`;
      const encodedPayload = Buffer.from(payload, 'utf8').toString('base64url');
      const rawHmac = crypto
        .createHmac('sha256', this.secret)
        .update(payload, 'utf8')
        .digest();
      const encodedSignature = Buffer.from(rawHmac).toString('base64url');
      return `${encodedPayload}.${encodedSignature}`;
    } catch (err) {
      throw new Error(`Failed to generate token: ${err.message}`);
    }
  }
}

export const tokenService = new TokenService();
