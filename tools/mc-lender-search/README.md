# MC Lender Search

Search tool for Million Capital. It crawls the public [Private Lender Link](https://privatelenderlink.com/) lender directory with this Firecrawl fork and keeps a local, filterable list of investment and commercial lenders.

Million Capital is a national commercial and investment real-estate brokerage. The tool keeps **business-purpose** loans: hard money, short-term bridge, fix and flip, DSCR, CRE bridge, construction, multifamily, and commercial long-term financing. Regular consumer residential and primary-home mortgages are stored only so they can be recognized, then left out of search (unless you opt in) and left out of every Top 20 list.

## What Firecrawl does here

This repository is Firecrawl's open-source monorepo.

- `apps/api` is the scrape, crawl, and map API plus workers. Self-host instructions are in the repo-root [SELF_HOST.md](../../SELF_HOST.md). Docker Compose publishes the API on port **3002**. With `USE_DB_AUTHENTICATION=false` (the Compose default) the API does not require a key.
- `apps/js-sdk` is the JavaScript client for `POST /v2/scrape`, `POST /v2/crawl`, and `POST /v2/map`.
- The hosted API is `https://api.firecrawl.dev` and uses `FIRECRAWL_API_KEY`.

The crawler calls that same v2 scrape contract:

- `formats: ["markdown", "rawHtml"]`
- one URL at a time, with a delay (default 1 second)
- `ignoreRobotsTxt` is never enabled
- paths under `/wp-admin/` are skipped, matching PLL's `robots.txt` (`Allow: /wp-admin/admin-ajax.php` only)

`src/firecrawl.js` also builds a `/v2/crawl` body (`delay: 1` second, `maxConcurrency: 1`, profile/directory include paths) for a server-side crawl. The default command uses sequential `/v2/scrape` calls so a run can resume from `data/cache/`.

If `FIRECRAWL_API_URL` and `FIRECRAWL_API_KEY` are both unset, and `MC_CRAWL_TRANSPORT` is not `firecrawl`, the crawler uses a local fetch transport with the same parser. That path does not start the Firecrawl server. Use it only when the API is unavailable. The committed seed dataset was produced that way: this environment had no API key and no Docker daemon for Compose.

## Scope

Included:

- Private / hard money / bridge lenders for investment property
- Fix and flip and rehab
- DSCR and other rental loans
- Ground-up construction
- Commercial and multifamily bridge
- Commercial long-term and mixed-use / small-business property purchases when the collateral is real estate

Excluded from Top 20, and from default search:

- Primary-residence, FHA, VA, and other consumer home loans
- Unsecured non-real-estate products

Priority ranking categories: **Hard Money, Short Term, Fix & Flip, DSCR**. CRE bridge, construction, multifamily, and commercial long-term lists are included under `also_useful` in `data/top20.json`.

## Ranking rules

Overall Top 20:

1. Lender is in MC scope (not a primary-home consumer lender).
2. At least one of hard money, short term, fix and flip, or DSCR.
3. **Participating** PLL profiles (active subscription, guidelines maintained) are listed before every non-participating profile. Non-participating lenders fill a list only when fewer than 20 participating lenders match.
4. Score inside that tier:
   - **Reach.** Nationwide, or 40 or more listed states, +25. Else 25–39 states +20, 10–24 +14, 4–9 +8, 2–3 +4, one state +1.
   - **Program fit.** Hard money +14, fix and flip +14, DSCR +12, short term +10, CRE bridge +6, construction +6, multifamily +4, commercial long-term +3, plus small weights for bridge, commercial, and rental.
   - **Loan size.** Overlap with $75k–$25M broker deals +8. Overlap with the $150k–$5M sweet spot +8. Minimum at or under $250k +4. Maximum at least $2M +4, and at least $10M +3. Maximum under $100k −8. Minimum above $5M −4. No overlap with $75k–$25M −12.
   - **Profile.** Quick facts +8, named programs +5, phone or email +4, published amount +3, direct lender +6, broker-only −10, broker-friendly +4, PLL pin +3.

Per-category Top 20 lists use the same rules after filtering to that tag. The overall list does not require all four tags at once.

## Setup

Node 22 or newer. No npm install. From this directory:

```bash
node --test
node src/cli.js search --category fix_flip --state TX --amount 500000
node src/cli.js top
node src/cli.js serve
```

Then open http://127.0.0.1:4173.

The UI filters by category, state, deal size, and property type. It has Top 20 views, JSON/CSV export of the current filter, and saved filters in browser local storage. Filters are also written to the query string so a view can be bookmarked.

## Re-crawl

Polite defaults: one request at a time, 1000 ms between uncached fetches, retries on 429 and 5xx, `User-Agent` identifies the crawler. Cached HTML lives in `data/cache/` (gitignored). Re-running skips cached profiles. `--refresh` fetches again.

### Firecrawl self-host

From the repo root, using this fork's Compose file (see [SELF_HOST.md](../../SELF_HOST.md)):

```bash
docker compose up --build
```

The API listens on port 3002. No key is required while `USE_DB_AUTHENTICATION=false`.

```bash
cd tools/mc-lender-search
FIRECRAWL_API_URL=http://localhost:3002 MC_CRAWL_TRANSPORT=firecrawl node src/cli.js crawl
```

### Firecrawl cloud

Do not commit the key.

```bash
FIRECRAWL_API_KEY=fc-your-key MC_CRAWL_TRANSPORT=firecrawl node src/cli.js crawl
```

`FIRECRAWL_API_URL` overrides the default `https://api.firecrawl.dev`.

### Local fetch (no Firecrawl process)

```bash
MC_CRAWL_TRANSPORT=local node src/cli.js crawl
```

`MC_CRAWL_TRANSPORT=auto` (default) uses Firecrawl when `FIRECRAWL_API_URL` or `FIRECRAWL_API_KEY` is set, and local fetch otherwise.

Useful flags:

```bash
node src/cli.js crawl --limit 20 --delay 1200
node src/cli.js crawl --refresh
node src/cli.js normalize   # rebuild lenders.json and top20.json from cache
```

`normalize` does not hit the network. Use it after ranking tweaks if `data/cache/` and `data/directory-index.json` are present.

## Search from the CLI

```bash
node src/cli.js search --category dscr --state FL --amount 750000 --property multifamily
node src/cli.js search --q "bridge" --participating --limit 15
node src/cli.js search --category cre_bridge --csv
node src/cli.js search --category hard_money --json
node src/cli.js top --category fix_flip
```

Categories: `hard_money`, `short_term`, `fix_flip`, `dscr`, `cre_bridge`, `construction`, `multifamily`, `commercial_long_term`, `bridge`, `commercial`.

`--participating` keeps active PLL profiles. Default search includes non-participating lenders but sorts active profiles first. `--all-scopes` includes consumer / out-of-scope rows.

The web API is the same filter set: `GET /api/search?category=fix_flip&state=TX&amount=500000&property=single_family`. Add `format=csv` to download.

## Seed data

| File | Contents |
| --- | --- |
| `data/lenders.json` | Normalized lender records |
| `data/top20.json` | Overall Top 20, four priority lists, and secondary lists |
| `data/crawl-report.json` | Transport, robots rules, page counts, gaps |
| `data/directory-index.json` | Directory cards used to mark participating vs non-participating |

## Crawl notes and gaps

- Start pages are `/lenders/` (every lender card) and `/search/` (browse). Individual records come from `/profile/{slug}/`.
- `robots.txt` allows those paths. It disallows `/wp-admin/` except `admin-ajax.php`, which this tool does not call.
- The browse page's loan-type and market dropdowns are filled in the browser by FacetWP. The HTML shell does not list every facet result. Coverage and loan type come from each profile instead.
- PLL's user sitemap includes vendors and staff. Only profiles linked from `/lenders/` are treated as lenders.
- Non-participating profiles often lack Lending Quick Facts. They stay in the dataset and rank below participating lenders. High-volume names that are public on PLL but not active subscribers (for example Anchor Loans, Lima One, Easy Street Capital, Visio, CoreVest) remain searchable and do not enter the Top 20 while 20 participating matches exist.
- One crawled profile, Option Funding Inc., is conventional/FHA/VA/USDA consumer mortgage credit and is marked out of scope. Other profiles that also do owner-occupied or SBA product stay in scope when they still publish investment or commercial programs.
- Some phone numbers sit behind a "show phone" button but are still present as `tel:` links.
- Loan-request, account, and funded-deal pages are not crawled.
- A full self-hosted crawl needs Docker (or another way to run `apps/api`, Redis, RabbitMQ, NuQ Postgres, and Playwright). A cloud crawl needs `FIRECRAWL_API_KEY`. Neither secret is invented by this tool.
