import assert from "node:assert/strict";
import test from "node:test";
import { buildCrawlPayload, buildScrapePayload, resolveTransport } from "../src/firecrawl.js";
import { buildLender, parseDirectory, parseProfile } from "../src/parse.js";
import { buildTop20, scoreLender, selectTop } from "../src/rank.js";
import { parseRobots, robotsAllowed } from "../src/robots.js";
import { classifyLender, parseMoneyRange } from "../src/scope.js";
import { searchLenders } from "../src/search.js";
import { extractStatesFromProse, statesInCommaList } from "../src/states.js";

const DIRECTORY = `
<section class="lender-tier lender-tier--featured">
  <div class="lender-card-wrap d-flex is-pinned">
    <a href="https://privatelenderlink.com/profile/malve-capital-llc/" class="card lender-card lender-card--featured">
      <h5 class="card-title">Malve Capital LLC</h5>
      <p class="lender-description">Nationwide bridge and fix-and-flip lender.</p>
      <p class="lender-amounts"><span>Loan Amounts:</span> $50,000 - $10,000,000</p>
    </a>
  </div>
  <div class="lender-card-wrap d-flex">
    <a href="https://privatelenderlink.com/profile/regional-fund/" class="card lender-card lender-card--featured">
      <h5 class="card-title">Regional Fund</h5>
      <p class="lender-description">Texas hard money.</p>
      <p class="lender-amounts">Loan Amounts: $100,000 - $1,000,000</p>
    </a>
  </div>
</section>
<section class="lender-tier lender-tier--non-participating">
  <a href="https://privatelenderlink.com/profile/stale-lender/" class="lender-card-active w-100">
    <span class="lender-card-active__name">Stale Lender</span>
  </a>
</section>
`;

const PROFILE = `
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [{
    "@type": "FinancialService",
    "name": "Malve Capital LLC",
    "url": "https://privatelenderlink.com/profile/malve-capital-llc/",
    "description": "New York private direct lender providing short-term bridge, fix-and-flip, ground-up construction, and DSCR rental loans for real estate investors nationwide.",
    "address": {
      "@type": "PostalAddress",
      "addressLocality": "Port Washington",
      "addressRegion": "Alabama, Birmingham, Florida, Miami, Texas, Austin, New York, Buffalo"
    },
    "additionalProperty": [
      {"@type": "PropertyValue", "name": "Loan Types", "value": "Fix & Flip, Ground-Up Construction, DSCR Rental, Bridge"},
      {"@type": "PropertyValue", "name": "Property Types", "value": "Single-family, condos, multifamily, and select commercial properties"},
      {"@type": "PropertyValue", "name": "Loan Amounts", "value": "$50,000 to $10,000,000"},
      {"@type": "PropertyValue", "name": "Geographic Areas Served", "value": "Nationwide for business-purpose investment properties"}
    ]
  }]
}
</script>
<h1>Malve Capital LLC</h1>
<section>
  <h3>Lending Quick Facts</h3>
  <ul class="profile-quick-facts">
    <li><span class="font-weight-bold">Loan Types: </span><span>Fix &amp; Flip, Ground-Up Construction, DSCR Rental</span></li>
    <li><span class="font-weight-bold">Maximum Purchase Financing: </span><span>Up to 90% of purchase, not to exceed 70% ARV</span></li>
  </ul>
</section>
<div>
  <button>Loan Programs</button>
  <h3>Bridge Loans</h3>
  <p>Short-term commercial and residential investment bridge loans. Maximum LTV 70%.</p>
  <h3>Fix &amp; Flip Loans</h3>
  <p>Rehab loans for non-owner-occupied rentals.</p>
</div>
<h3>Company Quick Facts</h3>
<ul><li><strong>Headquarters:</strong> Port Washington, New York</li></ul>
<p>We do NOT offer loans for owner-occupied homes.</p>
<a href="tel:(516)%20990-6943">(516) 990-6943</a>
<a href="mailto:deals@malvecapital.com">email</a>
<a href="https://malvecapital.com">site</a>
<p>Stay Informed About Private Lending</p>
<a href="https://example-should-not-count.com">footer</a>
`;

test("directory splits participating and non-participating lenders", () => {
  const lenders = parseDirectory(DIRECTORY);
  assert.equal(lenders.length, 3);
  assert.equal(lenders[0].participating, true);
  assert.equal(lenders[0].pinned, true);
  assert.equal(lenders[0].id, "malve-capital-llc");
  assert.equal(lenders[1].pinned, false);
  assert.equal(lenders[2].participating, false);
  assert.equal(lenders[2].name, "Stale Lender");
});

test("profile parser keeps MC program fields and ignores footer links", () => {
  const profile = parseProfile(PROFILE, "https://privatelenderlink.com/profile/malve-capital-llc/");
  const lender = buildLender(
    { id: "malve-capital-llc", participating: true, pinned: true, profile_url: profile.profile_url },
    profile,
  );
  assert.equal(lender.min_amount, 50000);
  assert.equal(lender.max_amount, 10000000);
  assert.equal(lender.nationwide, true);
  assert.ok(lender.states.includes("TX"));
  assert.ok(lender.states.includes("NY"));
  assert.equal(lender.states.includes("WA"), false);
  assert.ok(lender.tags.includes("fix_flip"));
  assert.ok(lender.tags.includes("dscr"));
  assert.ok(lender.tags.includes("hard_money"));
  assert.ok(lender.tags.includes("construction"));
  assert.equal(lender.consumer_primary, false);
  assert.equal(lender.in_scope, true);
  assert.equal(lender.contact.phone, "(516) 990-6943");
  assert.equal(lender.contact.email, "deals@malvecapital.com");
  assert.equal(lender.website, "https://malvecapital.com/");
  assert.equal(lender.headquarters, "Port Washington, New York");
  assert.ok(lender.ltv_notes.length >= 1);
  assert.ok(lender.property_types.includes("multifamily"));
  assert.ok(lender.property_types.includes("commercial"));
});

test("non-owner-occupied and bank-statement months are not consumer or short-term signals", () => {
  const investment = classifyLender(
    "Direct private lender for non-owner-occupied residential investment properties. 12 months of bank statements. Fix-and-flip loans.",
  );
  assert.equal(investment.consumer_primary, false);
  assert.equal(investment.in_scope, true);
  assert.equal(investment.tags.includes("fix_flip"), true);
  const consumer = classifyLender(
    "Residential purchase and refinance financing, including conventional fixed-rate mortgages, FHA, VA, USDA, and jumbo loans.",
  );
  assert.equal(consumer.consumer_primary, true);
  assert.equal(consumer.in_scope, false);
  const commercial = classifyLender(
    "Direct lender for commercial DSCR and SBA 504 loans. Documentation: 12 or 24 months of business bank statements.",
  );
  assert.equal(commercial.tags.includes("short_term"), false);
  assert.equal(commercial.tags.includes("hard_money"), false);
  assert.equal(commercial.tags.includes("dscr"), true);
});

test("primary-residence lenders are out of scope and off the Top 20", () => {
  const classification = classifyLender(
    "Conventional home loans and FHA loans for primary residence owner-occupied homes.",
  );
  assert.equal(classification.consumer_primary, true);
  assert.equal(classification.in_scope, false);
  const consumer = {
    ...buildLender({
      id: "home-lender",
      name: "Home Lender",
      participating: true,
      profile_url: "https://privatelenderlink.com/profile/home-lender/",
      blurb: "FHA loans for primary residence owner-occupied homes.",
    }),
    tags: ["small_business"],
    in_scope: false,
    consumer_primary: true,
    participating: true,
    score: 200,
  };
  const investor = {
    id: "flip-lender",
    name: "Flip Lender",
    participating: true,
    in_scope: true,
    consumer_primary: false,
    tags: ["fix_flip", "hard_money", "short_term"],
    states: ["TX"],
    state_count: 1,
    nationwide: false,
    min_amount: 100000,
    max_amount: 2000000,
    has_quick_facts: true,
    programs: [{ name: "Fix & Flip" }],
    contact: { phone: "555" },
    direct_lender: true,
    profile_url: "https://privatelenderlink.com/profile/flip-lender/",
  };
  const scored = [consumer, { ...investor, ...scoreLender(investor) }];
  const top = selectTop(scored);
  assert.equal(top.some((lender) => lender.id === "home-lender"), false);
  assert.equal(top[0].id, "flip-lender");
});

test("participating lenders fill Top 20 before stronger non-participating scores", () => {
  const base = {
    in_scope: true,
    consumer_primary: false,
    tags: ["hard_money", "fix_flip", "short_term", "dscr"],
    nationwide: true,
    states: ["TX", "FL"],
    state_count: 40,
    min_amount: 100000,
    max_amount: 5000000,
    has_quick_facts: true,
    programs: [{ name: "Bridge" }],
    contact: {},
    direct_lender: true,
  };
  const lenders = [
    { ...base, id: "stale", name: "Stale Nationwide", participating: false, score: 500 },
    { ...base, id: "active", name: "Active Regional", participating: true, score: 10, nationwide: false, state_count: 1 },
  ];
  const top = selectTop(lenders);
  assert.equal(top[0].id, "active");
  const payload = buildTop20(lenders.map((lender) => ({ ...lender, score_breakdown: {} })));
  assert.equal(payload.lists.overall[0].id, "active");
  assert.ok(payload.lists.fix_flip.length >= 1);
});

test("search filters category, state, amount, and property", () => {
  const lenders = [
    {
      id: "a",
      name: "Texas Flip Co",
      participating: true,
      in_scope: true,
      consumer_primary: false,
      tags: ["fix_flip", "hard_money"],
      states: ["TX"],
      nationwide: false,
      property_types: ["single_family"],
      min_amount: 75000,
      max_amount: 1500000,
      score: 20,
      blurb: "fix and flip in Texas",
      contact: {},
    },
    {
      id: "b",
      name: "National DSCR",
      participating: false,
      in_scope: true,
      consumer_primary: false,
      tags: ["dscr"],
      states: [],
      nationwide: true,
      property_types: ["multifamily"],
      min_amount: 100000,
      max_amount: 3000000,
      score: 90,
      blurb: "rental",
      contact: {},
    },
  ];
  const found = searchLenders(lenders, {
    category: "fix_flip",
    state: "Texas",
    amount: "500000",
    property: "single_family",
  });
  assert.equal(found.total, 1);
  assert.equal(found.results[0].id, "a");
  const nationwide = searchLenders(lenders, { state: "CA", category: "dscr" });
  assert.equal(nationwide.results[0].id, "b");
  const tooBig = searchLenders(lenders, { amount: 20000000 });
  assert.equal(tooBig.total, 0);
});

test("direct private lenders keep directory minimums when a profile only states a maximum", () => {
  const classification = classifyLender(
    "American Heritage Lending is a direct private lender for bridge and fix-and-flip loans.",
  );
  assert.equal(classification.tags.includes("hard_money"), true);
  const lender = buildLender(
    {
      id: "cap",
      name: "Cap",
      participating: true,
      profile_url: "https://privatelenderlink.com/profile/cap/",
      amount_text: "$75,000 - $1,250,000",
      blurb: "Direct private lender.",
    },
    {
      amounts: parseMoneyRange("Up to approximately $3.5 million"),
      amount_text: "Up to approximately $3.5 million",
      description: "Direct private bridge lender.",
      coverage: { nationwide: false, states: ["TX"], state_count: 1 },
      contact: {},
      programs: [],
      ltv_notes: [],
      has_quick_facts: false,
    },
  );
  assert.equal(lender.min_amount, 75000);
  assert.equal(lender.max_amount, 3500000);
});

test("money, states, and robots helpers", () => {
  assert.deepEqual(parseMoneyRange("$1.5 million to $15 million"), {
    min: 1_500_000,
    max: 15_000_000,
    text: "$1.5 million to $15 million",
  });
  assert.deepEqual(parseMoneyRange("up to $2,000,000").max, 2_000_000);
  assert.ok(statesInCommaList("Florida, Miami, Texas, Austin, New York").includes("NY"));
  const prose = extractStatesFromProse(
    "Port Washington, New York and Kansas City deals in Texas.",
  );
  assert.deepEqual(prose.sort(), ["NY", "TX"]);
  const robots = parseRobots(`User-agent: *\nDisallow: /wp-admin/\nAllow: /wp-admin/admin-ajax.php\nSitemap: https://privatelenderlink.com/sitemap.xml\n`);
  assert.equal(robotsAllowed("https://privatelenderlink.com/lenders/", robots), true);
  assert.equal(robotsAllowed("https://privatelenderlink.com/wp-admin/admin.php", robots), false);
  assert.equal(robotsAllowed("https://privatelenderlink.com/wp-admin/admin-ajax.php", robots), true);
});

test("firecrawl transport selection and payloads", () => {
  assert.equal(resolveTransport({}).mode, "local");
  assert.equal(resolveTransport({ MC_CRAWL_TRANSPORT: "local", FIRECRAWL_API_KEY: "fc-x" }).mode, "local");
  const cloud = resolveTransport({ FIRECRAWL_API_KEY: "fc-x" });
  assert.equal(cloud.mode, "firecrawl");
  assert.equal(cloud.apiUrl, "https://api.firecrawl.dev");
  const selfHost = resolveTransport({ FIRECRAWL_API_URL: "http://localhost:3002/" });
  assert.equal(selfHost.apiUrl, "http://localhost:3002");
  assert.equal(selfHost.apiKey, "");
  const scrape = buildScrapePayload("https://privatelenderlink.com/lenders/");
  assert.deepEqual(scrape.formats, ["markdown", "rawHtml"]);
  const crawl = buildCrawlPayload("https://privatelenderlink.com/lenders/");
  assert.equal(crawl.ignoreRobotsTxt, false);
  assert.equal(crawl.maxConcurrency, 1);
  assert.equal(crawl.delay, 1);
  assert.ok(crawl.includePaths.some((pattern) => pattern.includes("profile")));
});
