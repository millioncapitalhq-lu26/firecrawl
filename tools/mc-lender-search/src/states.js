/** US states and DC. Names are matched longest-first. */

export const STATE_RECORDS = [
  ["Alabama", "AL"],
  ["Alaska", "AK"],
  ["Arizona", "AZ"],
  ["Arkansas", "AR"],
  ["California", "CA"],
  ["Colorado", "CO"],
  ["Connecticut", "CT"],
  ["Delaware", "DE"],
  ["District of Columbia", "DC"],
  ["Florida", "FL"],
  ["Georgia", "GA"],
  ["Hawaii", "HI"],
  ["Idaho", "ID"],
  ["Illinois", "IL"],
  ["Indiana", "IN"],
  ["Iowa", "IA"],
  ["Kansas", "KS"],
  ["Kentucky", "KY"],
  ["Louisiana", "LA"],
  ["Maine", "ME"],
  ["Maryland", "MD"],
  ["Massachusetts", "MA"],
  ["Michigan", "MI"],
  ["Minnesota", "MN"],
  ["Mississippi", "MS"],
  ["Missouri", "MO"],
  ["Montana", "MT"],
  ["Nebraska", "NE"],
  ["Nevada", "NV"],
  ["New Hampshire", "NH"],
  ["New Jersey", "NJ"],
  ["New Mexico", "NM"],
  ["New York", "NY"],
  ["North Carolina", "NC"],
  ["North Dakota", "ND"],
  ["Ohio", "OH"],
  ["Oklahoma", "OK"],
  ["Oregon", "OR"],
  ["Pennsylvania", "PA"],
  ["Rhode Island", "RI"],
  ["South Carolina", "SC"],
  ["South Dakota", "SD"],
  ["Tennessee", "TN"],
  ["Texas", "TX"],
  ["Utah", "UT"],
  ["Vermont", "VT"],
  ["Virginia", "VA"],
  ["Washington", "WA"],
  ["West Virginia", "WV"],
  ["Wisconsin", "WI"],
  ["Wyoming", "WY"],
];

const NAME_TO_ABBREV = new Map(
  STATE_RECORDS.map(([name, abbrev]) => [name.toLowerCase(), abbrev]),
);
NAME_TO_ABBREV.set("washington dc", "DC");
NAME_TO_ABBREV.set("washington d.c.", "DC");
NAME_TO_ABBREV.set("d.c.", "DC");

const ABBREV_TO_NAME = new Map(
  STATE_RECORDS.map(([name, abbrev]) => [abbrev, name]),
);

const CITY_SUFFIX_SKIP = new Set([
  "Kansas",
  "Oklahoma",
  "New York",
  "Texas",
  "Nevada",
  "Iowa",
  "Missouri",
]);

const SORTED_NAMES = [...NAME_TO_ABBREV.keys()]
  .filter((name) => name !== "d.c.")
  .sort((a, b) => b.length - a.length);

export function stateAbbrev(input) {
  if (!input) return null;
  const raw = String(input).trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();
  if (ABBREV_TO_NAME.has(upper)) return upper;
  return NAME_TO_ABBREV.get(raw.toLowerCase()) || null;
}

export function stateName(abbrev) {
  return ABBREV_TO_NAME.get(abbrev) || abbrev;
}

export function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

/** Exact comma-separated tokens, used for PLL addressRegion market lists. */
export function statesInCommaList(text) {
  if (!text) return [];
  const found = [];
  for (const token of String(text).split(",")) {
    const abbrev = stateAbbrev(token.trim());
    if (abbrev) found.push(abbrev);
  }
  return unique(found);
}

/**
 * Pull state names out of prose. Skips "Port Washington" and "Kansas City"
 * style false friends. "Washington, D.C." counts as DC.
 */
export function extractStatesFromProse(text) {
  if (!text) return [];
  const src = String(text)
    .replace(/Port Washington/gi, " ")
    .replace(/Washington,?\s*D\.?\s*C\.?/gi, " District of Columbia ");
  const alternation = SORTED_NAMES.map((name) =>
    name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  ).join("|");
  const re = new RegExp(`(?<![A-Za-z])(${alternation})(?![A-Za-z])`, "gi");
  const found = [];
  for (const match of src.matchAll(re)) {
    const canonical = match[1].toLowerCase();
    const abbrev = NAME_TO_ABBREV.get(canonical);
    const display = [...NAME_TO_ABBREV.entries()].find(
      ([key]) => key === canonical,
    );
    const label = display
      ? STATE_RECORDS.find(([, ab]) => ab === abbrev && ab !== "DC")?.[0] ||
        (abbrev === "DC" ? "District of Columbia" : match[1])
      : match[1];
    const before = src.slice(Math.max(0, match.index - 14), match.index);
    if (
      abbrev === "WA" &&
      /(?:Port|Fort|Mount|Mt\.?|Lake)\s+$/i.test(before)
    ) {
      continue;
    }
    const after = src.slice(
      match.index + match[1].length,
      match.index + match[1].length + 8,
    );
    if (/^\s+City\b/i.test(after) && CITY_SUFFIX_SKIP.has(label)) continue;
    if (abbrev) found.push(abbrev);
  }
  return unique(found);
}

export function marketsLabel({ nationwide, states, state_count }) {
  const count = Math.max(state_count || 0, states?.length || 0);
  if (nationwide && count >= 15) return `Nationwide (${count} states listed)`;
  if (nationwide) return "Nationwide";
  if (!states?.length && !count) return "Coverage not listed";
  if (count >= 20) return `${count} states`;
  if (!states?.length) return "Coverage not listed";
  if (states.length <= 8) return states.join(", ");
  return `${states.slice(0, 6).join(", ")} +${states.length - 6}`;
}
