import { decodeHtml, externalWebsite, findFinancialService, slugFromProfileUrl, textContent } from "./html.js";
import { classifyLender, parseMoneyRange, propertyTypesFromText, statedStateCount } from "./scope.js";
import { extractStatesFromProse, marketsLabel, statesInCommaList, unique } from "./states.js";

const NATIONWIDE =
  /\bnationwide\b|\bnation[- ]wide\b|\ball 50\b|\b50 states\b|\bacross the (?:united states|u\.s\.|usa|country)\b|\bthroughout the (?:united states|u\.s\.|usa|country)\b|\bmost (?:of the )?(?:u\.s\.|united states) states\b|\bnationally\b|\bcoast to coast\b|\bmost u\.s\. states\b/i;

function labeledList(html, heading) {
  const idx = html.toLowerCase().indexOf(heading.toLowerCase());
  if (idx < 0) return {};
  const slice = html.slice(idx, idx + 12000);
  const ul = slice.match(/<ul[\s\S]*?<\/ul>/i);
  if (!ul) return {};
  const facts = {};
  for (const li of ul[0].match(/<li[\s\S]*?<\/li>/gi) || []) {
    const labelRaw = li.match(/<(?:strong|span)[^>]*>([\s\S]*?)<\/(?:strong|span)>/i);
    const label = textContent(labelRaw?.[1] || "").replace(/:$/, "").trim();
    if (!label) continue;
    let value = textContent(li);
    if (value.toLowerCase().startsWith(label.toLowerCase())) {
      value = value.slice(label.length).replace(/^:\s*/, "").trim();
    }
    facts[label] = value;
  }
  return facts;
}

function parsePrograms(html) {
  let idx = html.indexOf('id="loanprogramms-section"');
  if (idx < 0) idx = html.toLowerCase().lastIndexOf("loan programs");
  if (idx < 0) return [];
  const slice = html.slice(idx, idx + 80000);
  const end = slice.search(
    /Company Quick Facts|Questions\s*(?:&amp;|&)\s*Answers|Office Locations/i,
  );
  const body = end > 0 ? slice.slice(0, end) : slice.slice(0, 30000);
  const programs = [];
  for (const part of body.split(/<h3[^>]*>/i).slice(1)) {
    const name = textContent(part.split(/<\/h3>/i)[0]);
    if (!name || name.length > 90) continue;
    if (/quick facts|questions|loan programs|testimonials|our team/i.test(name)) continue;
    const summary = textContent(part.split(/<\/h3>/i)[1] || "")
      .replace(/\s+/g, " ")
      .slice(0, 360);
    programs.push({ name, summary });
  }
  return programs.slice(0, 12);
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseContact(html) {
  const main = html.split(/Stay Informed About Private Lending/i)[0];
  const phones = unique(
    [...main.matchAll(/href="tel:([^"]+)"/gi)].map((match) =>
      safeDecode(match[1]).replace(/\s+/g, " ").trim(),
    ),
  );
  const emails = [];
  for (const match of main.matchAll(/<a[^>]*href="mailto:([^"?\s]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const hrefEmail = decodeHtml(safeDecode(match[1]));
    const visible = textContent(match[2]);
    emails.push(visible.includes("@") ? visible : hrefEmail);
  }
  const uniqueEmails = unique(emails);
  const websites = [];
  for (const match of main.matchAll(/href="(https?:\/\/[^"]+)"/gi)) {
    const site = externalWebsite(match[1]);
    if (site) websites.push(site.split("?")[0]);
  }
  return {
    phone: phones[0] || null,
    phones,
    email: uniqueEmails[0] || null,
    emails: uniqueEmails,
    website: websites[0] || null,
  };
}

function parseHeadquarters(html, address, company) {
  if (company.Headquarters) return company.Headquarters;
  const idx = html.indexOf("Office Locations");
  if (idx >= 0) {
    const block = textContent(html.slice(idx, idx + 1800));
    const line = block.match(
      /\d{1,6}\s+[^,\n]{3,60},\s*[^,\n]{2,40},\s*[A-Za-z .]{2,30}\s+\d{5}/,
    );
    if (line) return line[0].replace(/^Headquarters\s*/, "").trim();
  }
  if (address?.addressLocality) {
    const regionStates = statesInCommaList(address.addressRegion || "");
    const tokens = String(address.addressRegion || "")
      .split(",")
      .map((token) => token.trim())
      .filter(Boolean);
    const region =
      regionStates.length === 1 && tokens.length <= 2 ? regionStates[0] : null;
    return [address.addressLocality, region, address.postalCode]
      .filter(Boolean)
      .join(", ");
  }
  return null;
}

function coverageFromParts({ facts, company, addressRegion, description }) {
  const geoBits = [
    facts["Geographic Areas Served"],
    facts["Geographic Coverage"],
    company["Geographic Coverage"],
    description,
  ].filter(Boolean);
  const geoText = geoBits.join("\n");
  const nationwide = NATIONWIDE.test(geoText) || statedStateCount(geoText) >= 40;
  const regionStates = statesInCommaList(addressRegion || "");
  const regionTokens = String(addressRegion || "")
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
  const regionIsMarketList = regionStates.length >= 3 || regionTokens.length >= 8;
  const proseStates = extractStatesFromProse(geoText);
  const states = regionIsMarketList
    ? unique([...regionStates, ...proseStates])
    : proseStates;
  const hint = Math.max(
    ...geoBits.map((bit) => statedStateCount(bit) || 0),
    0,
  );
  return {
    nationwide,
    states,
    state_count: Math.max(states.length, hint || 0),
  };
}

function ltvNotes(facts, programs) {
  const blobs = [
    ...Object.entries(facts).map(([key, value]) => `${key}: ${value}`),
    ...programs.map((program) =>
      program.summary ? `${program.name}: ${program.summary}` : program.name,
    ),
  ];
  const notes = [];
  for (const blob of blobs) {
    if (
      /ltv|ltc|\barv\b|loan-to-value|loan to cost|%\s*(?:of|ltv|ltc)|maximum purchase|max(?:imum)? (?:ltv|purchase|financing|loan)/i.test(
        blob,
      )
    ) {
      notes.push(blob.slice(0, 300));
    }
  }
  return notes.slice(0, 8);
}

function mergeAmounts(profileAmounts, directoryAmounts) {
  const profile = profileAmounts || { min: null, max: null, text: "" };
  const directory = directoryAmounts || { min: null, max: null, text: "" };
  const profileHas = profile.min != null || profile.max != null;
  const directoryHas = directory.min != null || directory.max != null;
  if (!profileHas) return directory;
  if (!directoryHas) return profile;
  return {
    min: profile.min ?? directory.min,
    max: profile.max ?? directory.max,
    text: profile.text || directory.text,
  };
}

function fact(facts, ...keys) {
  for (const key of keys) {
    if (facts[key]) return facts[key];
  }
  return "";
}

export function parseDirectory(html) {
  const source = String(html || "");
  const featuredStart = source.search(/lender-tier--featured/);
  const nonStart = source.search(/lender-tier--non-participating/);
  const featuredHtml =
    featuredStart >= 0
      ? source.slice(featuredStart, nonStart >= 0 ? nonStart : undefined)
      : "";
  const nonHtml = nonStart >= 0 ? source.slice(nonStart) : "";
  const lenders = [];

  for (const chunk of featuredHtml.split("lender-card-wrap").slice(1)) {
    const url = chunk.match(
      /href="(https:\/\/privatelenderlink\.com\/profile\/[^"]+)"/,
    )?.[1];
    if (!url) continue;
    const name = textContent(chunk.match(/card-title">([\s\S]*?)<\/h5/i)?.[1]);
    const blurb = textContent(
      chunk.match(/lender-description">([\s\S]*?)<\/p/i)?.[1],
    );
    const amountText = textContent(
      chunk.match(/lender-amounts">([\s\S]*?)<\/p/i)?.[1],
    );
    lenders.push({
      id: slugFromProfileUrl(url),
      name,
      profile_url: url.split("?")[0],
      blurb,
      amount_text: amountText.replace(/^Loan Amounts:\s*/i, ""),
      participating: true,
      pinned: /is-pinned/.test(chunk.slice(0, 80)),
    });
  }

  const seen = new Set(lenders.map((lender) => lender.profile_url));
  const nonRe =
    /href="(https:\/\/privatelenderlink\.com\/profile\/[^"]+)"[^>]*class="[^"]*lender-card-active[^"]*"[\s\S]*?lender-card-active__name">([\s\S]*?)<\/span>/gi;
  for (const match of nonHtml.matchAll(nonRe)) {
    const profileUrl = match[1].split("?")[0];
    if (seen.has(profileUrl)) continue;
    seen.add(profileUrl);
    lenders.push({
      id: slugFromProfileUrl(profileUrl),
      name: textContent(match[2]),
      profile_url: profileUrl,
      blurb: "",
      amount_text: "",
      participating: false,
      pinned: false,
    });
  }
  return lenders;
}

export function parseProfile(html, url = "") {
  const source = String(html || "");
  const service = findFinancialService(source) || {};
  const facts = {
    ...labeledList(source, "Lending Quick Facts"),
  };
  for (const item of service.additionalProperty || []) {
    if (item?.name && item?.value && !facts[item.name]) {
      facts[item.name] = textContent(String(item.value));
    }
  }
  const company = labeledList(source, "Company Quick Facts");
  const programs = parsePrograms(source);
  const contact = parseContact(source);
  const description = textContent(
    service.description ||
      source.match(/profile-content__summary[^>]*>([\s\S]*?)<\/(?:p|div)>/i)?.[1] ||
      "",
  );
  const name =
    textContent(service.name) ||
    textContent(source.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]) ||
    "";
  const address =
    service.address && !Array.isArray(service.address) ? service.address : null;
  const coverage = coverageFromParts({
    facts,
    company,
    addressRegion: address?.addressRegion || "",
    description,
  });
  const amountSource =
    fact(facts, "Loan Amounts", "Loan Amount") ||
    fact(company, "Loan Amounts", "Loan Amount");
  const phonesFromLd = service.telephone ? [String(service.telephone)] : [];
  return {
    name,
    description,
    facts,
    company,
    programs,
    contact: {
      phone: contact.phone || phonesFromLd[0] || null,
      email: contact.email,
      website: contact.website,
    },
    headquarters: parseHeadquarters(source, address, company),
    coverage,
    amounts: parseMoneyRange(amountSource),
    amount_text: amountSource,
    loan_types_text: fact(facts, "Loan Types", "Loan Type"),
    property_notes: fact(facts, "Property Types", "Property Type"),
    terms_text: fact(facts, "Loan Terms", "Term"),
    ltv_notes: ltvNotes(facts, programs),
    has_quick_facts: /Lending Quick Facts/i.test(source) || Object.keys(facts).length > 0,
    profile_url: (service.url || url || "").split("?")[0],
  };
}

export function buildLender(directoryEntry, profile = null) {
  const entry = directoryEntry || {};
  const parsed = profile || {};
  const profileUrl = (parsed.profile_url || entry.profile_url || "").split("?")[0];
  const directoryAmounts = parseMoneyRange(entry.amount_text || "");
  const amounts = mergeAmounts(parsed.amounts, directoryAmounts);
  const blurb = (parsed.description || entry.blurb || "").replace(/\s+/g, " ").slice(0, 700);
  const programText = (parsed.programs || [])
    .map((program) => `${program.name} ${program.summary || ""}`)
    .join("\n");
  const corpus = [
    blurb,
    parsed.loan_types_text,
    parsed.property_notes,
    parsed.terms_text,
    programText,
    parsed.company?.["Company Type"],
    parsed.company?.["Primary Focus"],
    parsed.company?.["Primary Customers"],
    entry.blurb,
  ]
    .filter(Boolean)
    .join("\n");
  const classification = classifyLender(corpus);
  const notedPropertyTypes = unique([
    ...propertyTypesFromText(parsed.property_notes || ""),
    ...propertyTypesFromText(parsed.loan_types_text || ""),
  ]);
  const propertyTypes = notedPropertyTypes.length
    ? notedPropertyTypes
    : propertyTypesFromText(programText);
  const coverage = parsed.coverage || {
    nationwide: false,
    states: extractStatesFromProse(blurb),
    state_count: 0,
  };
  if (!parsed.coverage) {
    coverage.state_count = Math.max(
      coverage.states.length,
      statedStateCount(blurb) || 0,
    );
    coverage.nationwide =
      coverage.nationwide ||
      NATIONWIDE.test(blurb) ||
      (statedStateCount(blurb) || 0) >= 40;
  }
  const lender = {
    id: entry.id || slugFromProfileUrl(profileUrl),
    name: parsed.name || entry.name || entry.id,
    profile_url: profileUrl,
    website: parsed.contact?.website || null,
    participating: Boolean(entry.participating),
    pinned: Boolean(entry.pinned),
    headquarters: parsed.headquarters || null,
    nationwide: Boolean(coverage.nationwide),
    states: coverage.states || [],
    state_count: coverage.state_count || (coverage.states || []).length,
    loan_types: splitList(parsed.loan_types_text),
    property_types: propertyTypes,
    property_type_notes: parsed.property_notes || "",
    min_amount: amounts.min,
    max_amount: amounts.max,
    amount_text: (parsed.amount_text || entry.amount_text || "").replace(
      /^Loan Amounts:\s*/i,
      "",
    ),
    terms_text: parsed.terms_text || "",
    ltv_notes: parsed.ltv_notes || [],
    programs: parsed.programs || [],
    contact: {
      phone: parsed.contact?.phone || null,
      email: parsed.contact?.email || null,
      website: parsed.contact?.website || null,
      profile_url: profileUrl,
    },
    blurb,
    tags: classification.tags,
    in_scope: classification.in_scope,
    scope_note: classification.scope_note,
    consumer_primary: classification.consumer_primary,
    has_investment_program: classification.has_investment_program,
    direct_lender: classification.direct_lender,
    broker_only: classification.broker_only,
    broker_friendly: classification.broker_friendly,
    has_quick_facts: Boolean(parsed.has_quick_facts),
    source: "privatelenderlink.com",
  };
  if (lender.state_count >= 40) lender.nationwide = true;
  lender.markets_label = marketsLabel(lender);
  return lender;
}

function splitList(value) {
  if (!value) return [];
  return value
    .split(/\s*,\s*|\s+\/\s+|\s+and\s+/i)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter((part) => part.length > 1 && part.length < 80)
    .slice(0, 12);
}
