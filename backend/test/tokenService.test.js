import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { TokenService } from '../src/services/tokenService.js';

describe('TokenService', () => {
  const secret = 'my-test-secret-key-123';
  const tokenService = new TokenService(secret);

  test('generates valid token with payload and signature parts', () => {
    const eventId = 'test-event-uuid-1234';
    const filename = 'photo1.jpg';
    const expiryTs = 1750000000;

    const token = tokenService.generateToken(eventId, filename, expiryTs);
    assert.ok(token);
    assert.ok(token.includes('.'));

    const parts = token.split('.');
    assert.equal(parts.length, 2);

    const [encodedPayload, encodedSignature] = parts;

    // Decode base64url payload
    const decodedPayload = Buffer.from(encodedPayload, 'base64url').toString('utf8');
    assert.equal(decodedPayload, `${eventId}:${filename}:${expiryTs}`);

    // Verify HMAC-SHA256 signature
    const expectedRawMac = crypto
      .createHmac('sha256', secret)
      .update(decodedPayload, 'utf8')
      .digest();
    const expectedSignature = Buffer.from(expectedRawMac).toString('base64url');

    assert.equal(encodedSignature, expectedSignature);
  });

  test('matches Python ai-service verify_token logic', () => {
    const eventId = '550e8400-e29b-41d4-a716-446655440000';
    const filename = 'face.jpg';
    const expiryTs = 9999999999;

    const token = tokenService.generateToken(eventId, filename, expiryTs);
    const [encodedPayload, encodedSignature] = token.split('.');

    // Python-style verification:
    // 1. decode base64url payload with padding restoration
    const pad = '='.repeat((4 - (encodedPayload.length % 4)) % 4);
    const payloadStr = Buffer.from(encodedPayload + pad, 'base64url').toString('utf8');
    const [pEventId, pFilename, pExp] = payloadStr.split(':');

    assert.equal(pEventId, eventId);
    assert.equal(pFilename, filename);
    assert.equal(parseInt(pExp, 10), expiryTs);

    // 2. compute HMAC
    const hmac = crypto.createHmac('sha256', secret).update(payloadStr, 'utf8').digest('base64url');
    assert.equal(encodedSignature, hmac);
  });
});
