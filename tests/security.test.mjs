import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, signJwt, verifyJwt } from '../server/security.mjs';

test('password hashing is salted and verifiable', () => {
  const hash = hashPassword('a-strong-test-password');
  assert.notEqual(hash, 'a-strong-test-password');
  assert.equal(verifyPassword('a-strong-test-password', hash), true);
  assert.equal(verifyPassword('wrong-password', hash), false);
});

test('JWT signs and verifies claims and rejects tampering', () => {
  const secret = 'ci-secret-that-is-long-enough-for-eureach';
  const token = signJwt({ sub:'u1', tid:'t1', permissions:['records.read'] }, secret, 60);
  assert.equal(verifyJwt(token, secret).tid, 't1');
  const parts = token.split('.');
  parts[1] = parts[1].slice(0,-1) + (parts[1].endsWith('A') ? 'B' : 'A');
  assert.throws(() => verifyJwt(parts.join('.'), secret), /signature|Invalid/);
});
