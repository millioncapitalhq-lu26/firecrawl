import { createReadStream } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { DATA_DIR } from "./crawl.js";
import { lendersToCsv, searchLenders } from "./search.js";

const PUBLIC_DIR = path.resolve(import.meta.dirname, "..", "public");
const FILES = {
  "/": { file: "index.html", type: "text/html; charset=utf-8" },
  "/index.html": { file: "index.html", type: "text/html; charset=utf-8" },
  "/app.js": { file: "app.js", type: "text/javascript; charset=utf-8" },
  "/styles.css": { file: "styles.css", type: "text/css; charset=utf-8" },
};

async function loadDataset() {
  const raw = await readFile(path.join(DATA_DIR, "lenders.json"), "utf8");
  const topRaw = await readFile(path.join(DATA_DIR, "top20.json"), "utf8");
  return { lenders: JSON.parse(raw), top: JSON.parse(topRaw) };
}

function sendJson(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(payload);
}

function queryObject(url) {
  const query = {};
  for (const [key, value] of url.searchParams.entries()) query[key] = value;
  return query;
}

export function createAppServer() {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      if (url.pathname === "/api/search") {
        const { lenders } = await loadDataset();
        const query = queryObject(url);
        const found = searchLenders(lenders, query);
        if (query.format === "csv") {
          response.writeHead(200, {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": "attachment; filename=mc-lenders.csv",
          });
          response.end(lendersToCsv(found.results));
          return;
        }
        sendJson(response, 200, found);
        return;
      }
      if (url.pathname === "/api/top20") {
        const { top } = await loadDataset();
        sendJson(response, 200, top);
        return;
      }
      if (url.pathname === "/api/meta") {
        const { lenders, top } = await loadDataset();
        sendJson(response, 200, {
          lenders: lenders.length,
          generated_at: top.generated_at,
          rules: top.rules,
        });
        return;
      }
      const asset = FILES[url.pathname];
      if (!asset) {
        sendJson(response, 404, { error: "Not found" });
        return;
      }
      const filePath = path.join(PUBLIC_DIR, asset.file);
      await access(filePath);
      response.writeHead(200, { "Content-Type": asset.type });
      createReadStream(filePath).pipe(response);
    } catch (error) {
      const missing = error.code === "ENOENT";
      sendJson(response, missing ? 500 : 500, {
        error: missing
          ? "Dataset missing. From tools/mc-lender-search run: node src/cli.js crawl"
          : error.message,
      });
    }
  });
}

export function startServer(port = 4173) {
  const server = createAppServer();
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}
