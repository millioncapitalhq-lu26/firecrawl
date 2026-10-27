/**
 * Million Capital scope: investment, commercial, and business-purpose loans.
 * Regular consumer residential / primary-home products are out of scope.
 */

export const PRIORITY_TAGS = ["hard_money", "short_term", "fix_flip", "dscr"];

export const TAGS = [
  ...PRIORITY_TAGS,
  "bridge",
  "cre_bridge",
  "construction",
  "multifamily",
  "commercial",
  "commercial_long_term",
  "rental",
  "land",
  "small_business",
];

export const TAG_LABELS = {
  hard_money: "Hard Money",
  short_term: "Short Term",
  fix_flip: "Fix & Flip",
  dscr: "DSCR",
  bridge: "Bridge",
  cre_bridge: "CRE Bridge",
  construction: "Construction",
  multifamily: "Multifamily",
  commercial: "Commercial",
  commercial_long_term: "Commercial Long-Term",
  rental: "Rental",
  land: "Land",
  small_business: "Small Business",
};

const PROPERTY_RULES = [
  ["single_family", /single[-\s]?family|\bsfr\b|1-4 unit|one to four/i],
  ["condo", /\bcondo/i],
  ["townhouse", /townho(?:me|use)/i],
  ["two_to_four", /2-4|2 to 4|duplex|triplex|fourplex/i],
  ["multifamily", /multifamily|multi-family|apartment/i],
  ["mixed_use", /mixed[-\s]?use/i],
  ["retail", /\bretail\b/i],
  ["office", /\boffice\b/i],
  ["industrial", /industrial|warehouse/i],
  ["hospitality", /hospitality|\bhotel\b|\bmotel\b/i],
  ["self_storage", /self[-\s]?storage/i],
  ["land", /\bland\b/i],
  ["agricultural", /agricultural|\bfarm\b|\branch\b/i],
  ["commercial", /commercial|retail|office|industrial|warehouse|hospitality|mixed[-\s]?use/i],
];

const INVESTMENT_TAGS = new Set([
  "hard_money",
  "short_term",
  "fix_flip",
  "dscr",
  "bridge",
  "cre_bridge",
  "construction",
  "multifamily",
  "commercial",
  "commercial_long_term",
  "rental",
  "land",
]);

export function propertyTypesFromText(text) {
  const found = [];
  for (const [id, pattern] of PROPERTY_RULES) {
    if (pattern.test(text || "")) found.push(id);
  }
  return found;
}

function has(text, pattern) {
  return pattern.test(text || "");
}

export function classifyLender(text) {
  const source = text || "";
  const tags = [];
  const fixFlip = has(
    source,
    /fix(?:\s*&|\s*and|\s*-and-|\s*-)\s*flip|fix-and-flip|fix & flip|rehab loan|rehabilitation loan/i,
  );
  const bridge = has(source, /\bbridge\b/i);
  const dscr = has(source, /\bdscr\b|debt service coverage/i);
  const construction = has(
    source,
    /ground[-\s]?up|new construction|construction loan|construction financing/i,
  );
  const explicitHardMoney = has(source, /hard[-\s]?money/i);
  const privateLender = has(
    source,
    /direct lender|private lender|private money|private direct|direct private|balance sheet|mortgage fund|asset-based/i,
  );
  const shortPhrase = has(source, /short[-\s]?term|\bbridge\b/i);
  const hardMoney =
    explicitHardMoney || (privateLender && (fixFlip || bridge || shortPhrase));
  const shortTerm = shortPhrase || fixFlip || explicitHardMoney;
  const commercial = has(
    source,
    /\bcommercial\b|mixed[-\s]?use|retail|office|industrial|warehouse/i,
  );
  const multifamily = has(source, /multifamily|multi-family|apartment/i);
  const creBridge = bridge && commercial;
  const commercialLongTerm = has(
    source,
    /permanent commercial|long-term commercial|commercial permanent|30-year commercial|SBA\s*(?:504|7\(a\)|loan)|owner-user (?:loan|financ|propert)|cmbs/i,
  );
  const rental = has(source, /\brental\b|\bdscr\b|buy[-\s]?and[-\s]?hold/i);
  const land = has(
    source,
    /\bland loans?\b|vacant land|raw land|unimproved land|entitled land/i,
  );
  const smallBusiness = has(source, /\bSBA\b|small business/i);

  if (hardMoney) tags.push("hard_money");
  if (shortTerm) tags.push("short_term");
  if (fixFlip) tags.push("fix_flip");
  if (dscr) tags.push("dscr");
  if (bridge) tags.push("bridge");
  if (creBridge) tags.push("cre_bridge");
  if (construction) tags.push("construction");
  if (multifamily) tags.push("multifamily");
  if (commercial) tags.push("commercial");
  if (commercialLongTerm && commercial) tags.push("commercial_long_term");
  else if (
    commercialLongTerm &&
    !fixFlip &&
    !dscr &&
    !bridge &&
    !explicitHardMoney
  ) {
    tags.push("commercial_long_term");
  }
  if (rental) tags.push("rental");
  if (land) tags.push("land");
  if (smallBusiness) tags.push("small_business");

  const deniesOwnerOccupied = has(
    source,
    /(?:do not|don't|does not|not)\s+offer[^.]{0,140}owner-?occupied|no owner-?occupied|not (?:a )?primary residence|we do not[^.]{0,80}owner-?occupied/i,
  );
  const consumerPhrase =
    !deniesOwnerOccupied &&
    has(
      source,
      /(?<!non-)owner-?occupied (?:home|homes|house|houses|residential)|\bprimary residence\b|\bFHA\b|\bUSDA\b|\bVA\b(?=\s*,|\s+loan)|\bconventional (?:fixed|mortgages?|home)|\badjustable-rate mortgages?\b/i,
    );
  const investment = tags.some((tag) => INVESTMENT_TAGS.has(tag));
  const nonRealEstate =
    !investment &&
    has(
      source,
      /unsecured|not secured by real estate|luxury automobile|jewelry|art loan/i,
    ) &&
    !has(source, /real estate|mortgage|investment propert/i);

  const consumerPrimary = consumerPhrase && !investment;
  let inScope = !consumerPrimary && !nonRealEstate;
  let scopeNote = "";
  if (consumerPrimary) {
    scopeNote =
      "Primary-residence or consumer residential program, excluded from MC scope.";
  } else if (nonRealEstate) {
    scopeNote = "Not secured by investment or commercial real estate.";
  } else if (consumerPhrase && investment) {
    scopeNote =
      "Also mentions owner-occupied or consumer terms; investment programs keep it in scope.";
  } else if (!investment && !tags.includes("small_business")) {
    scopeNote =
      "No explicit investment program detected. Kept in the directory, kept out of Top 20.";
  }

  const directLender = has(
    source,
    /direct lender|private direct|direct private|balance sheet|direct hard money|mortgage fund|private lender|private money/i,
  );
  const brokerOnly =
    !directLender &&
    has(source, /mortgage broker|loan broker|we broker loans|brokerage only/i);
  const brokerFriendly = has(
    source,
    /broker program|work(?:s|ing)? with brokers|mortgage brokers|broker protection|wholesale/i,
  );

  return {
    tags,
    in_scope: inScope,
    scope_note: scopeNote,
    consumer_primary: consumerPrimary,
    direct_lender: directLender,
    broker_only: brokerOnly,
    broker_friendly: brokerFriendly,
    has_investment_program: investment,
  };
}

export function parseMoneyRange(text) {
  if (!text) return { min: null, max: null, text: "" };
  const cleaned = String(text).replace(/\s+/g, " ").trim();
  const values = [];
  const re = /\$\s*([\d,]+(?:\.\d+)?)\s*(million|billion|m|k)?/gi;
  for (const match of cleaned.matchAll(re)) {
    let amount = Number(match[1].replace(/,/g, ""));
    if (!Number.isFinite(amount)) continue;
    const suffix = (match[2] || "").toLowerCase();
    if (suffix.startsWith("b")) amount *= 1_000_000_000;
    else if (suffix.startsWith("m")) amount *= 1_000_000;
    else if (suffix === "k") amount *= 1_000;
    values.push(amount);
  }
  if (!values.length) return { min: null, max: null, text: cleaned };
  const upTo = /\bup to\b|\bmax(?:imum)?\b/i.test(cleaned) && values.length === 1;
  const atLeast =
    /\b(?:from|min(?:imum)?|starting at)\b/i.test(cleaned) && values.length === 1;
  if (upTo) return { min: null, max: values[0], text: cleaned };
  if (atLeast) return { min: values[0], max: null, text: cleaned };
  if (values.length === 1) return { min: values[0], max: values[0], text: cleaned };
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    text: cleaned,
  };
}

export function statedStateCount(text) {
  const match = String(text || "").match(/\b(\d{1,2})\s*\+?\s+states\b/i);
  if (!match) return null;
  const count = Number(match[1]);
  return Number.isFinite(count) ? count : null;
}
