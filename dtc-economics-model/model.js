// DTC Economics Model: pure calculation engine (no DOM).
// All rates are decimals (0.022 = 2.2%). All money values are monthly, in the same currency.

// Illustrative scenarios, not industry benchmarks.
export const PRESETS = {
  launch: {
    label: 'DTC launch',
    inputs: {
      sessions: 20000, cvr: 0.018, aov: 75, trafficGrowth: 0.06,
      paidShare: 0.5, cpc: 0.9, otherMarketing: 2000,
      returningShare: 0.15,
      cogsPct: 0.35, fulfillmentPerOrder: 10, processingPct: 0.03, returnsPct: 0.07,
      fixedCosts: 12000,
    },
  },
  scaling: {
    label: 'Scaling DTC channel',
    inputs: {
      sessions: 80000, cvr: 0.022, aov: 85, trafficGrowth: 0.03,
      paidShare: 0.45, cpc: 1.1, otherMarketing: 5000,
      returningShare: 0.25,
      cogsPct: 0.32, fulfillmentPerOrder: 9, processingPct: 0.03, returnsPct: 0.06,
      fixedCosts: 40000,
    },
  },
  established: {
    label: 'Established DTC business',
    inputs: {
      sessions: 250000, cvr: 0.026, aov: 95, trafficGrowth: 0.015,
      paidShare: 0.35, cpc: 1.25, otherMarketing: 15000,
      returningShare: 0.4,
      cogsPct: 0.3, fulfillmentPerOrder: 8.5, processingPct: 0.029, returnsPct: 0.07,
      fixedCosts: 120000,
    },
  },
};

export const DEFAULT_PRESET = 'scaling';
export const MAX_RETURNING_SHARE = 0.9;
export const PROJECTION_MONTHS = 12;

const num = (v) => (Number.isFinite(+v) ? +v : 0);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Coerce and bound raw inputs so the engine never sees NaN or impossible rates. */
export function sanitizeInputs(raw) {
  return {
    sessions: Math.max(0, num(raw.sessions)),
    cvr: clamp(num(raw.cvr), 0, 1),
    aov: Math.max(0, num(raw.aov)),
    trafficGrowth: clamp(num(raw.trafficGrowth), -0.99, 10),
    paidShare: clamp(num(raw.paidShare), 0, 1),
    cpc: Math.max(0, num(raw.cpc)),
    otherMarketing: Math.max(0, num(raw.otherMarketing)),
    returningShare: clamp(num(raw.returningShare), 0, MAX_RETURNING_SHARE),
    cogsPct: clamp(num(raw.cogsPct), 0, 1),
    fulfillmentPerOrder: Math.max(0, num(raw.fulfillmentPerOrder)),
    processingPct: clamp(num(raw.processingPct), 0, 1),
    returnsPct: clamp(num(raw.returnsPct), 0, 1),
    fixedCosts: Math.max(0, num(raw.fixedCosts)),
  };
}

/** Division that returns null (rendered as "n/a") instead of NaN or Infinity. */
export function safeDiv(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
  const r = a / b;
  return Number.isFinite(r) ? r : null;
}

/**
 * One month of the P&L plus unit economics.
 * opts.returningOrderUplift: extra returning-customer orders as a fraction (0.1 = +10%),
 * applied as Orders × (1 + uplift × returning share) with no added marketing and
 * new customers unchanged. Used by the "returning-customer orders" profit lever.
 */
export function computeMonth(rawInputs, opts = {}) {
  const i = sanitizeInputs(rawInputs);
  const uplift = num(opts.returningOrderUplift);

  const baseOrders = i.sessions * i.cvr;
  const orders = baseOrders * (1 + uplift * i.returningShare);
  const grossRevenue = orders * i.aov;
  const returns = grossRevenue * i.returnsPct;
  const netRevenue = grossRevenue - returns;
  const cogs = netRevenue * i.cogsPct;
  const fulfillment = orders * i.fulfillmentPerOrder;
  const paymentFees = grossRevenue * i.processingPct;
  const cm1 = netRevenue - cogs - fulfillment - paymentFees;
  const adSpend = i.sessions * i.paidShare * i.cpc;
  const marketing = adSpend + i.otherMarketing;
  const cm2 = cm1 - marketing;
  const operatingProfit = cm2 - i.fixedCosts;

  const newCustomers = baseOrders * (1 - i.returningShare);
  const cac = safeDiv(marketing, newCustomers);
  const contributionPerOrder = safeDiv(cm1, orders);
  const firstOrderProfit =
    contributionPerOrder !== null && cac !== null ? contributionPerOrder - cac : null;
  const lifetimeOrders = safeDiv(1, 1 - i.returningShare);
  const ltv =
    contributionPerOrder !== null && lifetimeOrders !== null
      ? contributionPerOrder * lifetimeOrders
      : null;
  const ltvToCac = ltv !== null && cac !== null && cac > 0 ? safeDiv(ltv, cac) : null;
  const ordersToRecoverCac =
    cac !== null && contributionPerOrder !== null && contributionPerOrder > 0
      ? safeDiv(cac, contributionPerOrder)
      : null;
  const mer = safeDiv(netRevenue, marketing);

  // Break-even metrics only exist when each order makes a positive contribution.
  const cm1Positive = cm1 > 0;
  const cm1Margin = safeDiv(cm1, netRevenue);
  const breakEvenCvr = cm1Positive ? safeDiv(i.cvr * (marketing + i.fixedCosts), cm1) : null;
  const breakEvenNetRevenue =
    cm1Positive && cm1Margin > 0 ? safeDiv(marketing + i.fixedCosts, cm1Margin) : null;

  return {
    inputs: i,
    orders, grossRevenue, returns, netRevenue, cogs, fulfillment, paymentFees,
    cm1, adSpend, otherMarketing: i.otherMarketing, marketing, cm2,
    fixedCosts: i.fixedCosts, operatingProfit,
    operatingMargin: safeDiv(operatingProfit, netRevenue),
    cm1Margin,
    cm2Margin: safeDiv(cm2, netRevenue),
    newCustomers, cac, contributionPerOrder, firstOrderProfit,
    lifetimeOrders, ltv, ltvToCac, ordersToRecoverCac, mer,
    breakEvenCvr,
    breakEvenCvrReachable: breakEvenCvr !== null && breakEvenCvr <= 1,
    breakEvenNetRevenue,
  };
}

/**
 * 12-month projection. Month 1 = current inputs; sessions compound at trafficGrowth.
 * Rates stay constant, ad spend scales with sessions, other marketing and fixed costs stay flat.
 */
export function project(rawInputs, opts = {}) {
  const i = sanitizeInputs(rawInputs);
  const months = [];
  let cumulative = 0;
  let minCumulative = 0;
  let firstProfitableMonth = null;
  const totals = { netRevenue: 0, cm2: 0, operatingProfit: 0, newCustomers: 0 };

  for (let m = 1; m <= PROJECTION_MONTHS; m++) {
    const sessions = i.sessions * Math.pow(1 + i.trafficGrowth, m - 1);
    const r = computeMonth({ ...i, sessions }, opts);
    cumulative += r.operatingProfit;
    minCumulative = Math.min(minCumulative, cumulative);
    if (firstProfitableMonth === null && r.operatingProfit >= 0) firstProfitableMonth = m;
    totals.netRevenue += r.netRevenue;
    totals.cm2 += r.cm2;
    totals.operatingProfit += r.operatingProfit;
    totals.newCustomers += r.newCustomers;
    months.push({
      month: m, sessions, netRevenue: r.netRevenue, cm2: r.cm2,
      operatingProfit: r.operatingProfit, newCustomers: r.newCustomers,
      cumulativeOperatingProfit: cumulative,
    });
  }

  const last = months[months.length - 1];
  return {
    months,
    totals,
    month12: {
      netRevenue: last.netRevenue,
      operatingProfit: last.operatingProfit,
      annualizedNetRevenue: last.netRevenue * 12,
      annualizedOperatingProfit: last.operatingProfit * 12,
    },
    firstProfitableMonth, // null = not within 12 months
    peakCumulativeLoss: Math.max(0, -minCumulative), // operating losses to fund before break-even
  };
}

/** Each lever improves one input by 10% on its own. */
export const LEVERS = [
  { id: 'sessions', label: 'Sessions +10%', name: 'traffic (sessions)', apply: (i) => ({ ...i, sessions: i.sessions * 1.1 }) },
  { id: 'cvr', label: 'Conversion rate +10%', name: 'conversion rate', apply: (i) => ({ ...i, cvr: i.cvr * 1.1 }) },
  { id: 'aov', label: 'Average order value +10%', name: 'average order value', apply: (i) => ({ ...i, aov: i.aov * 1.1 }) },
  { id: 'returning', label: 'Returning-customer orders +10%', name: 'returning-customer orders', apply: (i) => i, opts: { returningOrderUplift: 0.1 } },
  { id: 'cogs', label: 'COGS % −10%', name: 'product cost (COGS)', apply: (i) => ({ ...i, cogsPct: i.cogsPct * 0.9 }) },
  { id: 'cpc', label: 'Cost per paid session −10%', name: 'cost per paid session', apply: (i) => ({ ...i, cpc: i.cpc * 0.9 }) },
  { id: 'fulfillment', label: 'Fulfillment per order −10%', name: 'fulfillment cost', apply: (i) => ({ ...i, fulfillmentPerOrder: i.fulfillmentPerOrder * 0.9 }) },
  { id: 'returns', label: 'Returns rate −10%', name: 'returns rate', apply: (i) => ({ ...i, returnsPct: i.returnsPct * 0.9 }) },
  { id: 'fixed', label: 'Fixed costs −10%', name: 'fixed costs', apply: (i) => ({ ...i, fixedCosts: i.fixedCosts * 0.9 }) },
];

/** Rank levers by change in 12-month operating profit, best first. */
export function rankLevers(rawInputs) {
  const i = sanitizeInputs(rawInputs);
  const base = project(i).totals.operatingProfit;
  return LEVERS.map((l) => ({
    id: l.id,
    label: l.label,
    name: l.name,
    delta: project(l.apply(i), l.opts).totals.operatingProfit - base,
  })).sort((a, b) => b.delta - a.delta);
}

/** Rules-of-thumb health checks. status: 'green' | 'amber' | 'red' | 'na'. */
export function healthChecks(r) {
  const band = (v, fn) => (v === null || v === undefined ? 'na' : fn(v));
  return [
    { id: 'ltvcac', label: 'LTV:CAC', value: r.ltvToCac,
      status: band(r.ltvToCac, (v) => (v >= 3 ? 'green' : v >= 1.5 ? 'amber' : 'red')),
      rule: 'Green at 3 or above, amber from 1.5 to 3, red below 1.5' },
    { id: 'firstorder', label: 'First-order profit', value: r.firstOrderProfit,
      status: band(r.firstOrderProfit, (v) => (v >= 0 ? 'green' : 'amber')),
      rule: 'Green when the first order covers its acquisition cost' },
    { id: 'cm1', label: 'Contribution margin before marketing (CM1)', value: r.cm1Margin,
      status: band(r.cm1Margin, (v) => (v >= 0.5 ? 'green' : v >= 0.35 ? 'amber' : 'red')),
      rule: 'Green at 50% of net revenue or above, amber from 35% to 50%, red below 35%' },
    { id: 'op', label: 'Operating profit', value: r.operatingProfit,
      status: r.operatingProfit >= 0 ? 'green' : 'red',
      rule: 'Green when contribution covers marketing and fixed costs' },
  ];
}

/** Convenience: everything the UI needs in one call. */
export function runModel(rawInputs) {
  const inputs = sanitizeInputs(rawInputs);
  const month = computeMonth(inputs);
  return {
    inputs,
    month,
    projection: project(inputs),
    levers: rankLevers(inputs),
    health: healthChecks(month),
  };
}

/* ----- Scenario links: every input encoded in the URL fragment (#s=...) ----- */

/** Fixed field order for scenario links. Append new fields at the end and bump SCENARIO_VERSION. */
export const SCENARIO_FIELDS = [
  'sessions', 'cvr', 'aov', 'trafficGrowth',
  'paidShare', 'cpc', 'otherMarketing',
  'returningShare',
  'cogsPct', 'fulfillmentPerOrder', 'processingPct', 'returnsPct',
  'fixedCosts',
];
export const SCENARIO_VERSION = 1;

/** Encode inputs as "1,80000,0.022,85,..." (version first, then SCENARIO_FIELDS order). */
export function encodeScenario(rawInputs) {
  const i = sanitizeInputs(rawInputs);
  const vals = SCENARIO_FIELDS.map((k) => String(+i[k].toPrecision(10)));
  return [SCENARIO_VERSION, ...vals].join(',');
}

/** Decode a scenario string (with or without a leading "#s="). Returns sanitized inputs, or null if invalid. */
export function decodeScenario(str) {
  if (typeof str !== 'string') return null;
  let s = str.trim().replace(/^#/, '');
  if (s.startsWith('s=')) s = s.slice(2);
  try { s = decodeURIComponent(s); } catch { return null; }
  const parts = s.split(',');
  if (parts.length !== SCENARIO_FIELDS.length + 1 || +parts[0] !== SCENARIO_VERSION) return null;
  const vals = parts.slice(1).map((p) => (p.trim() === '' ? NaN : Number(p)));
  if (!vals.every(Number.isFinite)) return null;
  return sanitizeInputs(Object.fromEntries(SCENARIO_FIELDS.map((k, n) => [k, vals[n]])));
}
