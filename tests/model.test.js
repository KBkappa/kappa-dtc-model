import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PRESETS, computeMonth, project, rankLevers, healthChecks, runModel, sanitizeInputs, safeDiv, LEVERS,
  encodeScenario, decodeScenario, SCENARIO_FIELDS, DEFAULT_PRESET,
} from '../dtc-economics-model/model.js';

// "Scaling DTC channel" is the scenario the brief called Growth-stage (same numbers).
const growth = PRESETS.scaling.inputs;
const close = (actual, expected, places = 2, msg) =>
  assert.ok(Math.abs(actual - expected) < 0.5 * Math.pow(10, -places), `${msg ?? ''} expected ${expected}, got ${actual}`);

// Recursively assert no NaN / Infinity anywhere in a result object.
function assertAllFinite(obj, path = 'result') {
  if (typeof obj === 'number') return assert.ok(Number.isFinite(obj), `${path} is ${obj}`);
  if (obj && typeof obj === 'object') for (const [k, v] of Object.entries(obj)) assertAllFinite(v, `${path}.${k}`);
}

test('Scaling DTC channel preset: monthly P&L', () => {
  const r = computeMonth(growth);
  close(r.orders, 1760, 6, 'orders');
  close(r.grossRevenue, 149600, 6, 'gross revenue');
  close(r.netRevenue, 140624, 6, 'net revenue');
  close(r.cm1, 75296.32, 2, 'CM1');
  close(r.marketing, 44600, 6, 'marketing');
  close(r.operatingProfit, -9303.68, 2, 'operating profit');
});

test('Scaling DTC channel preset: unit economics', () => {
  const r = computeMonth(growth);
  close(r.newCustomers, 1320, 6, 'new customers');
  close(r.cac, 33.79, 2, 'CAC');
  close(r.ltvToCac, 1.69, 2, 'LTV:CAC');
  close(r.mer, 3.15, 2, 'MER');
  close(r.breakEvenCvr * 100, 2.47, 2, 'break-even CVR %');
  close(r.adSpend, 39600, 6, 'ad spend');
  close(r.lifetimeOrders, 4 / 3, 9, 'lifetime orders');
  close(r.breakEvenNetRevenue, 84600 / (75296.32 / 140624), 4, 'break-even net revenue');
  close(r.firstOrderProfit, 75296.32 / 1760 - 44600 / 1320, 6, 'first-order profit');
});

test('Scaling DTC channel preset: 12-month projection', () => {
  const p = project(growth);
  assert.equal(p.months.length, 12);
  close(p.months[0].operatingProfit, -9303.68, 2, 'month 1 = current inputs');
  close(p.months[11].sessions, 80000 * Math.pow(1.03, 11), 6, 'month 12 sessions');
  // The brief expected month 10. Applying the brief's own formulas, month 8 is −$1,098.03 and
  // month 9 is +$219.03, so the first profitable month is 9. See README "Test expectations".
  assert.equal(p.firstProfitableMonth, 9);
  close(p.months[8].operatingProfit, 219.03, 2, 'month 9 operating profit');
  close(p.peakCumulativeLoss, 42576.33, 2, 'peak cumulative loss');
  const sum = p.months.reduce((s, m) => s + m.operatingProfit, 0);
  close(p.totals.operatingProfit, sum, 6, 'totals add up');
});

test('Profit levers: ranked best first, all nine present', () => {
  const levers = rankLevers(growth);
  assert.equal(levers.length, LEVERS.length);
  assert.equal(levers.length, 9);
  for (let k = 1; k < levers.length; k++) assert.ok(levers[k - 1].delta >= levers[k].delta);
  assert.equal(levers[0].id, 'aov');
  // Fixed costs −10% saves exactly 12 × $4,000.
  close(levers.find((l) => l.id === 'fixed').delta, 48000, 6, 'fixed-cost lever');
});

test('Returning-orders lever adds orders without changing new customers or marketing', () => {
  const base = computeMonth(growth);
  const up = computeMonth(growth, { returningOrderUplift: 0.1 });
  close(up.orders, 1760 * (1 + 0.1 * 0.25), 6, 'orders');
  close(up.newCustomers, base.newCustomers, 9, 'new customers');
  close(up.marketing, base.marketing, 9, 'marketing');
});

test('Health checks for Scaling DTC channel preset', () => {
  const h = Object.fromEntries(healthChecks(computeMonth(growth)).map((c) => [c.id, c.status]));
  assert.deepEqual(h, { ltvcac: 'amber', firstorder: 'green', cm1: 'green', op: 'red' });
});

test('Edge case: zero sessions never produces NaN or Infinity', () => {
  const r = runModel({ ...growth, sessions: 0 });
  assertAllFinite(r);
  const m = r.month;
  assert.equal(m.orders, 0);
  assert.equal(m.cac, null);
  assert.equal(m.contributionPerOrder, null);
  assert.equal(m.ltvToCac, null);
  assert.equal(m.ordersToRecoverCac, null);
  assert.equal(m.breakEvenCvr, null, 'CM1 is 0, so break-even is not reachable');
  assert.equal(m.breakEvenNetRevenue, null);
  assert.equal(m.operatingMargin, null);
  assert.equal(m.operatingProfit, -(5000 + 40000));
  assert.equal(r.projection.firstProfitableMonth, null);
  assert.equal(r.projection.peakCumulativeLoss, 45000 * 12);
});

test('Edge case: returning share at 90% (and capped above it)', () => {
  const r = computeMonth({ ...growth, returningShare: 0.9 });
  close(r.lifetimeOrders, 10, 9, 'lifetime orders');
  close(r.newCustomers, 176, 6, 'new customers');
  assertAllFinite(r);
  const capped = computeMonth({ ...growth, returningShare: 1 });
  assert.equal(capped.inputs.returningShare, 0.9);
  close(capped.lifetimeOrders, 10, 9, 'capped lifetime orders');
});

test('Edge case: CM1 ≤ 0 makes break-even "not reachable"', () => {
  const r = computeMonth({ ...growth, cogsPct: 0.9 });
  assert.ok(r.cm1 <= 0);
  assert.equal(r.breakEvenCvr, null);
  assert.equal(r.breakEvenCvrReachable, false);
  assert.equal(r.breakEvenNetRevenue, null);
  assert.equal(r.ordersToRecoverCac, null);
  assertAllFinite(runModel({ ...growth, cogsPct: 0.9 }));
});

test('Edge case: zero marketing gives n/a CAC-based ratios', () => {
  const r = computeMonth({ ...growth, paidShare: 0, otherMarketing: 0 });
  assert.equal(r.marketing, 0);
  assert.equal(r.cac, 0);
  assert.equal(r.ltvToCac, null);
  assert.equal(r.mer, null);
});

test('Break-even CVR above 100% is flagged as not reachable', () => {
  const r = computeMonth({ ...growth, fixedCosts: 5e7 });
  assert.equal(r.breakEvenCvrReachable, false);
});

test('Input sanitizing and safe division', () => {
  const s = sanitizeInputs({ sessions: 'abc', cvr: -1, returnsPct: 2 });
  assert.equal(s.sessions, 0);
  assert.equal(s.cvr, 0);
  assert.equal(s.returnsPct, 1);
  assert.equal(safeDiv(1, 0), null);
  assert.equal(safeDiv(NaN, 1), null);
  assert.equal(safeDiv(6, 3), 2);
});

test('Scenario presets: names, default and unchanged numbers', () => {
  assert.equal(DEFAULT_PRESET, 'scaling');
  assert.deepEqual(Object.values(PRESETS).map((p) => p.label), ['DTC launch', 'Scaling DTC channel', 'Established DTC business']);
  assert.deepEqual(PRESETS.launch.inputs, {
    sessions: 20000, cvr: 0.018, aov: 75, trafficGrowth: 0.06, paidShare: 0.5, cpc: 0.9, otherMarketing: 2000,
    returningShare: 0.15, cogsPct: 0.35, fulfillmentPerOrder: 10, processingPct: 0.03, returnsPct: 0.07, fixedCosts: 12000,
  });
  assert.deepEqual(PRESETS.established.inputs, {
    sessions: 250000, cvr: 0.026, aov: 95, trafficGrowth: 0.015, paidShare: 0.35, cpc: 1.25, otherMarketing: 15000,
    returningShare: 0.4, cogsPct: 0.3, fulfillmentPerOrder: 8.5, processingPct: 0.029, returnsPct: 0.07, fixedCosts: 120000,
  });
});

test('Scenario link: encode/decode round-trips every input', () => {
  for (const p of Object.values(PRESETS)) {
    const enc = encodeScenario(p.inputs);
    assert.match(enc, /^1(,[-0-9.e]+){13}$/);
    assert.deepEqual(decodeScenario('#s=' + enc), p.inputs);
    assert.deepEqual(decodeScenario(enc), p.inputs);
  }
  assert.equal(SCENARIO_FIELDS.length, 13);
  assert.equal(encodeScenario(growth), '1,80000,0.022,85,0.03,0.45,1.1,5000,0.25,0.32,9,0.03,0.06,40000');
  const odd = { ...growth, aov: 87.35, trafficGrowth: -0.025, cvr: 0.0213 };
  assert.deepEqual(decodeScenario(encodeScenario(odd)), odd);
});

test('Scenario link: invalid or tampered links are rejected or sanitized', () => {
  assert.equal(decodeScenario(''), null);
  assert.equal(decodeScenario('#s=garbage'), null);
  assert.equal(decodeScenario('#s=2,80000,0.022,85,0.03,0.45,1.1,5000,0.25,0.32,9,0.03,0.06,40000'), null, 'unknown version');
  assert.equal(decodeScenario('#s=1,80000,0.022'), null, 'too few fields');
  assert.equal(decodeScenario('#s=1,80000,abc,85,0.03,0.45,1.1,5000,0.25,0.32,9,0.03,0.06,40000'), null, 'non-numeric');
  assert.equal(decodeScenario('#s=1,80000,,85,0.03,0.45,1.1,5000,0.25,0.32,9,0.03,0.06,40000'), null, 'empty value');
  const capped = decodeScenario('#s=1,-5,0.022,85,0.03,0.45,1.1,5000,0.99,0.32,9,0.03,0.06,40000');
  assert.equal(capped.sessions, 0);
  assert.equal(capped.returningShare, 0.9);
});
