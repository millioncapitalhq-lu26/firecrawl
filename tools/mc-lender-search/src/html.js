const NAMED = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "-",
  mdash: "-",
  rsquo: "'",
  lsquo: "'",
  rdquo: '"',
  ldquo: '"',
  hellip: "...",
};

export function decodeHtml(value) {
  if (!value) return "";
  return String(value)
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => {
      const code = Number.parseInt(n, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/&([a-z]+);/gi, (entity, name) => NAMED[name.toLowerCase()] || entity);
}

export function stripTags(html) {
  return decodeHtml(
    String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim(),
  );
}

export function textContent(fragment) {
  return stripTags(fragment).replace(/\s+/g, " ").trim();
}

export function extractJsonLd(html) {
  const blocks = [];
  const re =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of String(html || "").matchAll(re)) {
    try {
      blocks.push(JSON.parse(match[1]));
    } catch {
      // PLL occasionally emits a second, escaped block. Ignore malformed JSON.
    }
  }
  return blocks;
}

export function findFinancialService(html) {
  for (const block of extractJsonLd(html)) {
    const graph = Array.isArray(block?.["@graph"])
      ? block["@graph"]
      : [block];
    for (const node of graph) {
      const type = node?.["@type"];
      const types = Array.isArray(type) ? type : [type];
      if (types.includes("FinancialService")) return node;
    }
  }
  return null;
}

export function slugFromProfileUrl(url) {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    const idx = parts.indexOf("profile");
    return (idx >= 0 ? parts[idx + 1] : parts.at(-1)) || "";
  } catch {
    return "";
  }
}

const SKIP_HOSTS = new Set([
  "privatelenderlink.com",
  "www.privatelenderlink.com",
  "facebook.com",
  "www.facebook.com",
  "linkedin.com",
  "www.linkedin.com",
  "instagram.com",
  "www.instagram.com",
  "twitter.com",
  "www.twitter.com",
  "x.com",
  "www.x.com",
  "youtube.com",
  "www.youtube.com",
  "schema.org",
  "www.schema.org",
  "google.com",
  "www.google.com",
  "maps.google.com",
  "goo.gl",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "www.googletagmanager.com",
  "gmpg.org",
  "wordpress.org",
]);

export function externalWebsite(href) {
  try {
    const url = new URL(href);
    if (!/^https?:$/.test(url.protocol)) return null;
    if (SKIP_HOSTS.has(url.hostname.toLowerCase())) return null;
    return url.toString();
  } catch {
    return null;
  }
}
