import { stateAbbrev } from "./states.js";

function amountOverlap(lender, amount) {
  if (amount == null || Number.isNaN(amount)) return true;
  const min = lender.min_amount;
  const max = lender.max_amount;
  if (min == null && max == null) return true;
  if (min != null && amount < min) return false;
  if (max != null && amount > max) return false;
  return true;
}

function stateMatch(lender, abbrev) {
  if (!abbrev) return true;
  if (lender.nationwide) return true;
  return (lender.states || []).includes(abbrev);
}

function compareResults(a, b) {
  if (a.participating !== b.participating) return a.participating ? -1 : 1;
  if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
  return String(a.name).localeCompare(String(b.name));
}

export function searchLenders(lenders, query = {}) {
  const category = query.category || query.tag || "";
  const property = query.property || "";
  const text = (query.q || query.query || "").trim().toLowerCase();
  const state = stateAbbrev(query.state || "") || "";
  const amount =
    query.amount == null || query.amount === ""
      ? null
      : Number(String(query.amount).replace(/[$,\s]/g, ""));
  const scope = query.scope || "investment";
  const participating =
    query.participating == null || query.participating === ""
      ? "any"
      : String(query.participating);
  const limit = Math.max(1, Math.min(Number(query.limit) || 50, 500));
  const offset = Math.max(0, Number(query.offset) || 0);

  const filtered = lenders.filter((lender) => {
    if (scope !== "all" && (!lender.in_scope || lender.consumer_primary)) return false;
    if (category && !(lender.tags || []).includes(category)) return false;
    if (property && !(lender.property_types || []).includes(property)) return false;
    if (!stateMatch(lender, state)) return false;
    if (!amountOverlap(lender, amount)) return false;
    if (participating === "1" || participating === "true") {
      if (!lender.participating) return false;
    } else if (participating === "0" || participating === "false") {
      if (lender.participating) return false;
    }
    if (text) {
      const haystack = [
        lender.name,
        lender.blurb,
        ...(lender.loan_types || []),
        ...(lender.tags || []),
        lender.headquarters,
        lender.markets_label,
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(text)) return false;
    }
    return true;
  });

  filtered.sort(compareResults);
  return {
    total: filtered.length,
    limit,
    offset,
    results: filtered.slice(offset, offset + limit),
  };
}

export const CSV_COLUMNS = [
  "rank",
  "name",
  "score",
  "participating",
  "tags",
  "markets_label",
  "min_amount",
  "max_amount",
  "property_types",
  "phone",
  "email",
  "website",
  "profile_url",
  "blurb",
];

export function lendersToCsv(lenders) {
  const lines = [CSV_COLUMNS.join(",")];
  lenders.forEach((lender, index) => {
    const row = {
      rank: lender.rank || index + 1,
      name: lender.name,
      score: lender.score ?? "",
      participating: lender.participating ? "yes" : "no",
      tags: (lender.tags || []).join("|"),
      markets_label: lender.markets_label || "",
      min_amount: lender.min_amount ?? "",
      max_amount: lender.max_amount ?? "",
      property_types: (lender.property_types || []).join("|"),
      phone: lender.contact?.phone || "",
      email: lender.contact?.email || "",
      website: lender.website || lender.contact?.website || "",
      profile_url: lender.profile_url || "",
      blurb: lender.blurb || "",
    };
    lines.push(
      CSV_COLUMNS.map((column) => csvEscape(row[column])).join(","),
    );
  });
  return `${lines.join("\n")}\n`;
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}
