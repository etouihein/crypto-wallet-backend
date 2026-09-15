'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { userHash, calldataHash } = require('../src/revenue/hash');

const SECRET = 'x'.repeat(40);
const ADDR = '0xFD749d841FFF1f87e81D58e4a186261e62FbcbCC';

test("userHash : HMAC stable, insensible à la casse, jamais l'adresse en clair", () => {
  const h = userHash(ADDR, SECRET);
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(h, userHash(ADDR.toLowerCase(), SECRET));
  assert.ok(!h.includes(ADDR.slice(2).toLowerCase()));
  assert.notEqual(h, userHash(ADDR, 'y'.repeat(40))); // autre secret, autre empreinte
});

test('userHash refuse de produire une empreinte faible', () => {
  assert.equal(userHash(ADDR, undefined), null);
  assert.equal(userHash(ADDR, 'trop-court'), null);
  assert.equal(userHash(undefined, SECRET), null);
});

test('calldataHash normalise la casse et rejette les données invalides', () => {
  const h = calldataHash('0xABCDEF');
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(h, calldataHash('0xabcdef'));
  assert.equal(calldataHash('0x'), null);
  assert.equal(calldataHash('pas-hex'), null);
  assert.equal(calldataHash(undefined), null);
});
