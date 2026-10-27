import { readFile } from "node:fs/promises";
import path from "node:path";
import { crawlDirectory, DATA_DIR, normalizeFromCache } from "./crawl.js";
import { resolveTransport } from "./firecrawl.js";
import { lendersToCsv, searchLenders } from "./search.js";
import { startServer } from "./server.js";

function argValue(argv, flag) {
  const index = argv.indexOf(flag);
  if (index < 0) return null;
  return argv[index + 1] ?? null;
}

function hasFlag(argv, flag) {
  return argv.includes(flag);
}

function printLender(lender, index) {
  const amount =
    lender.amount_text ||
    [lender.min_amount, lender.max_amount].filter((value) => value != null).join("–");
  console.log(
    `${String(lender.rank || index + 1).padStart(2, " ")}. ${lender.name}  [${lender.score}]  ${lender.participating ? "participating" : "non-participating"}`,
  );
  console.log(`    ${lender.markets_label || ""}  ${amount}`);
  console.log(`    ${(lender.tags || []).join(", ")}`);
  console.log(`    ${lender.profile_url}`);
}

async function loadLenders() {
  const raw = await readFile(path.join(DATA_DIR, "lenders.json"), "utf8");
  return JSON.parse(raw);
}

async function commandCrawl(argv) {
  const limitRaw = argValue(argv, "--limit");
  const delayRaw = argValue(argv, "--delay");
  await crawlDirectory({
    limit: limitRaw ? Number(limitRaw) : undefined,
    delayMs: delayRaw ? Number(delayRaw) : Number(process.env.MC_CRAWL_DELAY_MS || 1000),
    refresh: hasFlag(argv, "--refresh"),
    transport: resolveTransport(),
  });
}

async function commandSearch(argv) {
  const lenders = await loadLenders();
  const found = searchLenders(lenders, {
    category: argValue(argv, "--category") || argValue(argv, "--tag"),
    state: argValue(argv, "--state"),
    amount: argValue(argv, "--amount"),
    property: argValue(argv, "--property"),
    q: argValue(argv, "--q"),
    participating: hasFlag(argv, "--participating")
      ? "true"
      : hasFlag(argv, "--include-non-participating")
        ? "any"
        : argValue(argv, "--participating"),
    scope: hasFlag(argv, "--all-scopes") ? "all" : "investment",
    limit: argValue(argv, "--limit") || 25,
  });
  if (hasFlag(argv, "--json")) {
    console.log(JSON.stringify(found, null, 2));
    return;
  }
  if (hasFlag(argv, "--csv")) {
    process.stdout.write(lendersToCsv(found.results));
    return;
  }
  console.log(`${found.total} match${found.total === 1 ? "" : "es"}`);
  found.results.forEach(printLender);
}

async function commandTop(argv) {
  const raw = await readFile(path.join(DATA_DIR, "top20.json"), "utf8");
  const top = JSON.parse(raw);
  const category = argValue(argv, "--category") || "overall";
  const list = top.lists[category] || top.also_useful?.[category];
  if (!list) {
    console.error(
      `Unknown category "${category}". Use overall, hard_money, short_term, fix_flip, dscr, cre_bridge, construction, multifamily, commercial_long_term.`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(`Top ${list.length} — ${category}`);
  list.forEach((lender) => printLender(lender));
}

async function main() {
  const argv = process.argv.slice(2);
  const command = argv[0] || "help";
  if (command === "crawl") return commandCrawl(argv);
  if (command === "normalize") return normalizeFromCache({ log: console.log });
  if (command === "search") return commandSearch(argv);
  if (command === "top") return commandTop(argv);
  if (command === "serve") {
    const port = Number(argValue(argv, "--port") || process.env.PORT || 4173);
    await startServer(port);
    console.log(`MC Lender Search at http://127.0.0.1:${port}`);
    return;
  }
  console.log(`MC Lender Search

  node src/cli.js crawl [--limit N] [--delay ms] [--refresh]
  node src/cli.js normalize
  node src/cli.js search [--category fix_flip] [--state TX] [--amount 500000] [--property multifamily] [--q kiavi] [--participating] [--json|--csv]
  node src/cli.js top [--category dscr]
  node src/cli.js serve [--port 4173]

Firecrawl: set FIRECRAWL_API_URL (self-host, usually http://localhost:3002) or FIRECRAWL_API_KEY.
MC_CRAWL_TRANSPORT=auto|firecrawl|local. auto uses Firecrawl when either variable is set.
`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
