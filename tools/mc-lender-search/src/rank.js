import { PRIORITY_TAGS } from "./scope.js";

/**
 * Ranking rules (Million Capital):
 * 1. Top 20 lists only include in-scope lenders (no primary-home consumer loans).
 * 2. The overall list requires a Hard Money, Short Term, Fix & Flip, or DSCR tag.
 * 3. Participating (active PLL subscription) lenders are taken before any
 *    non-participating lender. Non-participating profiles are used only to fill
 *    a list that has fewer than 20 participating matches.
 * 4. Inside that tier, score is nationwide reach + priority program fit +
 *    loan size usefulness for broker deals + profile completeness.
 */

const PROGRAM_WEIGHTS = {
  hard_money: 14,
  fix_flip: 14,
  dscr: 12,
  short_term: 10,
  cre_bridge: 6,
  construction: 6,
  multifamily: 4,
  commercial_long_term: 3,
  bridge: 2,
  commercial: 2,
  rental: 2,
};

export function scoreLender(lender) {
  const breakdown = {
    reach: 0,
    programs: 0,
    loan_size: 0,
    profile: 0,
    direct: 0,
    broker: 0,
    pinned: 0,
  };
  const count = lender.state_count || lender.states?.length || 0;
  if (lender.nationwide) breakdown.reach = 25;
  else if (count >= 25) breakdown.reach = 20;
  else if (count >= 10) breakdown.reach = 14;
  else if (count >= 4) breakdown.reach = 8;
  else if (count >= 2) breakdown.reach = 4;
  else if (count === 1) breakdown.reach = 1;

  for (const tag of lender.tags || []) {
    breakdown.programs += PROGRAM_WEIGHTS[tag] || 0;
  }

  const min = lender.min_amount;
  const max = lender.max_amount;
  if (min == null && max == null) {
    breakdown.loan_size = 0;
  } else {
    const lo = min ?? 0;
    const hi = max ?? min ?? 0;
    const overlapsBrokerBand = hi >= 75_000 && lo <= 25_000_000;
    const overlapsSweetSpot = hi >= 150_000 && lo <= 5_000_000;
    if (overlapsBrokerBand) breakdown.loan_size += 8;
    else breakdown.loan_size -= 12;
    if (overlapsSweetSpot) breakdown.loan_size += 8;
    if (lo > 0 && lo <= 250_000) breakdown.loan_size += 4;
    if (hi >= 2_000_000) breakdown.loan_size += 4;
    if (hi >= 10_000_000) breakdown.loan_size += 3;
    if (hi > 0 && hi < 100_000) breakdown.loan_size -= 8;
    if (lo > 5_000_000) breakdown.loan_size -= 4;
  }

  if (lender.has_quick_facts) breakdown.profile += 8;
  if (lender.programs?.length) breakdown.profile += 5;
  if (lender.contact?.phone || lender.contact?.email) breakdown.profile += 4;
  if (lender.min_amount != null || lender.max_amount != null) breakdown.profile += 3;
  if (lender.direct_lender) breakdown.direct += 6;
  if (lender.broker_only) breakdown.direct -= 10;
  if (lender.broker_friendly) breakdown.broker += 4;
  if (lender.pinned) breakdown.pinned += 3;

  const score = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
  return { score, score_breakdown: breakdown };
}

export function withScores(lenders) {
  return lenders.map((lender) => {
    const scored = scoreLender(lender);
    return { ...lender, ...scored };
  });
}

function compareLenders(a, b) {
  if (b.score !== a.score) return b.score - a.score;
  const aPriority = (a.tags || []).filter((tag) => PRIORITY_TAGS.includes(tag)).length;
  const bPriority = (b.tags || []).filter((tag) => PRIORITY_TAGS.includes(tag)).length;
  if (bPriority !== aPriority) return bPriority - aPriority;
  if ((b.state_count || 0) !== (a.state_count || 0)) {
    return (b.state_count || 0) - (a.state_count || 0);
  }
  return String(a.name).localeCompare(String(b.name));
}

export function selectTop(lenders, { tag = null, limit = 20 } = {}) {
  let pool = lenders.filter((lender) => lender.in_scope && !lender.consumer_primary);
  if (tag) pool = pool.filter((lender) => (lender.tags || []).includes(tag));
  else {
    pool = pool.filter((lender) =>
      (lender.tags || []).some((item) => PRIORITY_TAGS.includes(item)),
    );
  }
  const participating = pool
    .filter((lender) => lender.participating)
    .sort(compareLenders);
  const rest = pool.filter((lender) => !lender.participating).sort(compareLenders);
  return [...participating, ...rest].slice(0, limit).map((lender, index) => ({
    rank: index + 1,
    ...lender,
  }));
}

export function buildTop20(lenders) {
  const lists = {
    overall: selectTop(lenders),
    hard_money: selectTop(lenders, { tag: "hard_money" }),
    short_term: selectTop(lenders, { tag: "short_term" }),
    fix_flip: selectTop(lenders, { tag: "fix_flip" }),
    dscr: selectTop(lenders, { tag: "dscr" }),
  };
  const alsoUseful = {
    cre_bridge: selectTop(lenders, { tag: "cre_bridge" }),
    construction: selectTop(lenders, { tag: "construction" }),
    multifamily: selectTop(lenders, { tag: "multifamily" }),
    commercial_long_term: selectTop(lenders, { tag: "commercial_long_term" }),
  };
  return {
    generated_at: new Date().toISOString(),
    rules: [
      "In-scope only: investment, commercial, and business-purpose loans. Primary-residence consumer lenders are excluded.",
      "Overall Top 20 requires Hard Money, Short Term, Fix & Flip, or DSCR.",
      "Participating PLL profiles outrank every non-participating profile.",
      "Score = nationwide reach (or 40+ listed states) + priority program fit + loan amount overlap with $75k-$25M broker deals (sweet spot $150k-$5M) + active profile detail + direct lender + broker-friendly.",
    ],
    lists,
    also_useful: alsoUseful,
  };
}

export function summarizeTop(list) {
  return list.map((lender) => ({
    rank: lender.rank,
    id: lender.id,
    name: lender.name,
    score: lender.score,
    participating: lender.participating,
    tags: lender.tags,
    markets_label: lender.markets_label,
    min_amount: lender.min_amount,
    max_amount: lender.max_amount,
    amount_text: lender.amount_text,
    profile_url: lender.profile_url,
    score_breakdown: lender.score_breakdown,
  }));
}
