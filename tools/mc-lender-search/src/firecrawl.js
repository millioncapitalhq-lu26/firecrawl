/**
 * Client for this fork's Firecrawl v2 scrape/crawl API.
 * Self-host (USE_DB_AUTHENTICATION=false) omits the Authorization header.
 * Cloud uses FIRECRAWL_API_KEY. See SELF_HOST.md at the repo root.
 */

export const USER_AGENT =
  "MCLenderSearch/1.0 (Million Capital research; respects robots.txt; polite rate limit)";

export function resolveTransport(env = process.env) {
  const forced = (env.MC_CRAWL_TRANSPORT || "auto").toLowerCase();
  const apiUrl = (env.FIRECRAWL_API_URL || "").replace(/\/$/, "");
  const apiKey = env.FIRECRAWL_API_KEY || "";
  if (forced === "local") return { mode: "local" };
  if (forced === "firecrawl") {
    return {
      mode: "firecrawl",
      apiUrl: apiUrl || "https://api.firecrawl.dev",
      apiKey,
    };
  }
  if (apiUrl || apiKey) {
    return {
      mode: "firecrawl",
      apiUrl: apiUrl || "https://api.firecrawl.dev",
      apiKey,
    };
  }
  return { mode: "local" };
}

export function buildScrapePayload(url) {
  return {
    url,
    formats: ["markdown", "rawHtml"],
    onlyMainContent: false,
    timeout: 60000,
  };
}

export function buildCrawlPayload(url, { limit = 500 } = {}) {
  return {
    url,
    includePaths: ["lenders/?", "search/?", "profile/[^/]+/?"],
    excludePaths: ["wp-admin/"],
    sitemap: "skip",
    maxDiscoveryDepth: 1,
    limit,
    delay: 1,
    maxConcurrency: 1,
    ignoreRobotsTxt: false,
    allowExternalLinks: false,
    crawlEntireDomain: false,
    scrapeOptions: {
      formats: ["markdown", "rawHtml"],
      onlyMainContent: false,
    },
  };
}

export async function scrapeWithFirecrawl(url, transport, fetchImpl = fetch) {
  const endpoint = `${transport.apiUrl}/v2/scrape`;
  const headers = { "Content-Type": "application/json" };
  if (transport.apiKey) headers.Authorization = `Bearer ${transport.apiKey}`;
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(buildScrapePayload(url)),
    signal: AbortSignal.timeout(90000),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.success === false) {
    const message = json.error || json.message || `Firecrawl scrape failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  const data = json.data || {};
  return {
    url,
    html: data.rawHtml || data.html || "",
    markdown: data.markdown || "",
    metadata: data.metadata || {},
    transport: "firecrawl",
  };
}

export async function scrapeLocal(url, fetchImpl = fetch) {
  const response = await fetchImpl(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(45000),
  });
  const body = await response.text();
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status} for ${url}`);
    error.status = response.status;
    throw error;
  }
  const title = body.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim() || "";
  return {
    url,
    html: body,
    markdown: "",
    metadata: { sourceURL: url, statusCode: response.status, title },
    transport: "local",
  };
}

export async function scrapeUrl(url, transport, fetchImpl = fetch) {
  if (transport.mode === "firecrawl") {
    return scrapeWithFirecrawl(url, transport, fetchImpl);
  }
  return scrapeLocal(url, fetchImpl);
}
