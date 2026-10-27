import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { scrapeUrl, resolveTransport } from "./firecrawl.js";
import { buildLender, parseDirectory, parseProfile } from "./parse.js";
import { buildTop20, summarizeTop, withScores } from "./rank.js";
import { parseRobots, robotsAllowed } from "./robots.js";

export const LENDERS_URL = "https://privatelenderlink.com/lenders/";
export const SEARCH_URL = "https://privatelenderlink.com/search/";
export const ROBOTS_URL = "https://privatelenderlink.com/robots.txt";

const ROOT = path.resolve(import.meta.dirname, "..");
export const DATA_DIR = path.join(ROOT, "data");
export const CACHE_DIR = path.join(DATA_DIR, "cache");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readText(file) {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export async function fetchPolite(url, transport, { fetchImpl, retries = 3 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await scrapeUrl(url, transport, fetchImpl);
    } catch (error) {
      lastError = error;
      const status = error.status;
      const retryable = status == null || status === 429 || status >= 500;
      if (!retryable || attempt === retries) break;
      const backoff = status === 429 ? 5000 * attempt : 1500 * attempt;
      await sleep(backoff);
    }
  }
  throw lastError;
}

export async function crawlDirectory(options = {}) {
  const transport = options.transport || resolveTransport(options.env);
  const fetchImpl = options.fetchImpl;
  const delayMs = options.delayMs ?? 1000;
  const limit = options.limit ?? Infinity;
  const refresh = Boolean(options.refresh);
  const log = options.log || ((message) => console.log(message));

  await mkdir(CACHE_DIR, { recursive: true });
  await mkdir(DATA_DIR, { recursive: true });

  log(`Transport: ${transport.mode}${transport.apiUrl ? ` (${transport.apiUrl})` : ""}`);
  const robotsDoc = await fetchPolite(ROBOTS_URL, transport, { fetchImpl });
  const robots = parseRobots(robotsDoc.markdown || robotsDoc.html);
  if (!robotsAllowed(LENDERS_URL, robots)) {
    throw new Error("robots.txt disallows the lender directory. Crawl stopped.");
  }

  const directoryDoc = await loadOrFetch(LENDERS_URL, "lenders.html", {
    transport,
    fetchImpl,
    refresh,
    delayMs: 0,
    log,
  });
  const directory = parseDirectory(directoryDoc.html || directoryDoc.markdown);
  if (!directory.length) {
    throw new Error(
      "No lender cards found on /lenders/. The page shape may have changed, or the scrape returned empty HTML.",
    );
  }
  await writeFile(
    path.join(DATA_DIR, "directory-index.json"),
    JSON.stringify(directory, null, 2),
  );

  const searchDoc = await loadOrFetch(SEARCH_URL, "search.html", {
    transport,
    fetchImpl,
    refresh,
    delayMs,
    log,
  });
  const browseLinks = [
    ...new Set(
      [...(searchDoc.html || "").matchAll(/href="(https:\/\/privatelenderlink\.com\/region\/[^"]+)"/g)].map(
        (match) => match[1],
      ),
    ),
  ];

  const targets = directory.filter((entry) => robotsAllowed(entry.profile_url, robots));
  const skippedByRobots = directory.length - targets.length;
  const selected = targets.slice(0, limit);
  log(
    `Directory lenders: ${directory.length} (${directory.filter((entry) => entry.participating).length} participating). Fetching ${selected.length} profiles.`,
  );

  const failures = [];
  let fetched = 0;
  let cached = 0;
  for (let index = 0; index < selected.length; index += 1) {
    const entry = selected[index];
    const cacheName = `${entry.id || "lender"}.html`;
    const existing = refresh ? null : await readText(path.join(CACHE_DIR, cacheName));
    if (existing) {
      cached += 1;
    } else {
      try {
        await loadOrFetch(entry.profile_url, cacheName, {
          transport,
          fetchImpl,
          refresh,
          delayMs,
          log,
        });
        fetched += 1;
      } catch (error) {
        failures.push({ url: entry.profile_url, error: error.message });
        log(`Failed ${entry.profile_url}: ${error.message}`);
      }
    }
    if ((index + 1) % 25 === 0 || index + 1 === selected.length) {
      log(`Profiles ${index + 1}/${selected.length} (fetched ${fetched}, cache ${cached}, failed ${failures.length})`);
    }
  }

  const lenders = await normalizeFromCache({ log });
  const report = {
    crawled_at: new Date().toISOString(),
    transport: transport.mode,
    firecrawl_api_url: transport.apiUrl || null,
    source: {
      directory: LENDERS_URL,
      browse: SEARCH_URL,
      robots: ROBOTS_URL,
    },
    robots: {
      disallow: robots.disallow,
      allow: robots.allow,
      sitemaps: robots.sitemaps,
    },
    pages: {
      directory_lenders: directory.length,
      participating: directory.filter((entry) => entry.participating).length,
      non_participating: directory.filter((entry) => !entry.participating).length,
      profiles_targeted: selected.length,
      profiles_fetched: fetched,
      profiles_from_cache: cached,
      profiles_failed: failures,
      skipped_by_robots: skippedByRobots,
      browse_region_links_seen: browseLinks.length,
    },
    counts: countLenders(lenders),
    gaps: [
      "The /search/ browse page is a FacetWP shell. Loan-type and market options render in the browser, so this crawl records the page and any server-rendered region links rather than every facet combination.",
      "Non-participating profiles often omit Lending Quick Facts. Ranking prefers participating lenders with structured programs.",
      "Phone numbers are taken from published tel: links. Some profiles hide the number behind a button while still including it in the HTML.",
      "Sitemap profile URLs outside /lenders/ (vendors, staff, software) are not treated as lenders.",
      transport.mode === "local"
        ? "This run used the local fetch transport because FIRECRAWL_API_URL / FIRECRAWL_API_KEY were not configured. Re-crawl with MC_CRAWL_TRANSPORT=firecrawl when the self-hosted API (port 3002) or a cloud key is available."
        : "This run used Firecrawl POST /v2/scrape with rawHtml + markdown, one URL at a time, with a delay between requests.",
    ],
  };
  await writeFile(path.join(DATA_DIR, "crawl-report.json"), JSON.stringify(report, null, 2));
  log(`Wrote ${lenders.length} lenders to data/lenders.json`);
  return { lenders, report };
}

async function loadOrFetch(url, cacheName, { transport, fetchImpl, refresh, delayMs, log }) {
  const file = path.join(CACHE_DIR, cacheName);
  if (!refresh) {
    const cached = await readText(file);
    if (cached) return { url, html: cached, markdown: "", transport: "cache" };
  }
  if (delayMs) await sleep(delayMs);
  log(`GET ${url}`);
  const doc = await fetchPolite(url, transport, { fetchImpl });
  const body = doc.html || doc.markdown || "";
  await writeFile(file, body);
  return doc;
}

export async function normalizeFromCache({ log = () => {} } = {}) {
  const indexRaw = await readText(path.join(DATA_DIR, "directory-index.json"));
  if (!indexRaw) {
    throw new Error("Missing data/directory-index.json. Run the crawl first.");
  }
  const directory = JSON.parse(indexRaw);
  const lenders = [];
  for (const entry of directory) {
    const html = await readText(path.join(CACHE_DIR, `${entry.id}.html`));
    const profile = html ? parseProfile(html, entry.profile_url) : null;
    lenders.push(buildLender(entry, profile));
  }
  const scored = withScores(lenders);
  const top = buildTop20(scored);
  const compactTop = {
    ...top,
    lists: Object.fromEntries(
      Object.entries(top.lists).map(([key, list]) => [key, summarizeTop(list)]),
    ),
    also_useful: Object.fromEntries(
      Object.entries(top.also_useful).map(([key, list]) => [key, summarizeTop(list)]),
    ),
  };
  await writeFile(path.join(DATA_DIR, "lenders.json"), JSON.stringify(scored, null, 2));
  await writeFile(path.join(DATA_DIR, "top20.json"), JSON.stringify(compactTop, null, 2));
  log(`Normalized ${scored.length} lenders.`);
  return scored;
}

function countLenders(lenders) {
  return {
    lenders: lenders.length,
    participating: lenders.filter((lender) => lender.participating).length,
    in_scope: lenders.filter((lender) => lender.in_scope).length,
    consumer_primary: lenders.filter((lender) => lender.consumer_primary).length,
    with_priority_tag: lenders.filter((lender) =>
      (lender.tags || []).some((tag) =>
        ["hard_money", "short_term", "fix_flip", "dscr"].includes(tag),
      ),
    ).length,
  };
}
