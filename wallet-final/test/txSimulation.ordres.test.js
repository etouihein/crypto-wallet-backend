'use strict';
// Signatures d'ordres de place de marche (Seaport/OpenSea, Blur...) :
// avant le 24/11/2026, analyzeTypedData les jugeait sans risque ("none").
const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeTypedData } = require('../lib/txSimulation');

const MOI = '0x9858effd232b4033e47d90003d41ec34ecaeda94';
const PIRATE = '0x000000000000000000000000000000000000beef';
const seaport = (consideration) => ({
  primaryType: 'OrderComponents',
  domain: { name: 'Seaport', version: '1.6', chainId: 1, verifyingContract: '0x0000000000000068f116a894984e2db1123eb395' },
  message: {
    offerer: MOI,
    offer: [{ itemType: 2, token: '0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d', identifierOrCriteria: '1', startAmount: '1', endAmount: '1' }],
    consideration,
  },
});

test("arnaque Seaport : l'utilisateur donne son NFT et le paiement part chez un autre -> risque eleve, 'SANS RIEN recevoir'", () => {
  const r = analyzeTypedData(seaport([{ itemType: 0, startAmount: '1', endAmount: '1', recipient: PIRATE }]));
  assert.equal(r.risk, 'high');
  assert.match(r.warnings[0], /ORDRE de place de marché NFT \(Seaport\)/);
  assert.match(r.warnings[0], /1 objet\(s\) SANS RIEN recevoir/);
});

test('vraie mise en vente (paiement pour moi) : toujours signalee, en disant ce que je recois', () => {
  const r = analyzeTypedData(JSON.stringify(seaport([{ itemType: 0, startAmount: '1000', endAmount: '1000', recipient: MOI.toUpperCase().replace('0X', '0x') }, { itemType: 0, startAmount: '25', endAmount: '25', recipient: '0x0000a26b00c1f0df003000390027140000faa719' }])));
  assert.equal(r.risk, 'high');
  assert.match(r.warnings[0], /contre 1 paiement\(s\) pour toi/);
});

test('Blur et ordres groupes (BulkOrder) : risque eleve ; ordres d echange (CowSwap, 1inch) : risque moyen', () => {
  assert.equal(analyzeTypedData({ primaryType: 'Order', domain: { name: 'Blur Exchange' }, message: { trader: MOI } }).risk, 'high');
  assert.equal(analyzeTypedData({ primaryType: 'BulkOrder', domain: { name: 'Seaport' }, message: { tree: [] } }).risk, 'high');
  assert.equal(analyzeTypedData({ primaryType: 'Order', domain: { name: 'Gnosis Protocol' }, message: { sellToken: '0x1' } }).risk, 'medium');
  assert.equal(analyzeTypedData({ primaryType: 'Order', domain: { name: '1inch Aggregation Router' }, message: {} }).risk, 'medium');
});

test('rien change pour le reste : message ordinaire sans risque, Permit toujours eleve, donnees abimees sans plantage', () => {
  assert.equal(analyzeTypedData({ primaryType: 'Mail', domain: { name: 'Ether Mail' }, message: { contents: 'Hello' } }).risk, 'none');
  assert.equal(analyzeTypedData({ primaryType: 'Permit', domain: { name: 'USDC' }, message: { spender: PIRATE, value: '1' } }).risk, 'high');
  assert.equal(analyzeTypedData('{pas du json').risk, 'none');
  assert.equal(analyzeTypedData({ primaryType: 'OrderComponents', message: { offer: 'x', consideration: null } }).risk, 'high');
});
