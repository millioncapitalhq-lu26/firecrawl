const STATES = [
  ["", "Any state"],
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"],
  ["CA", "California"], ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"],
  ["DC", "District of Columbia"], ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"],
  ["ID", "Idaho"], ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"],
  ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"],
  ["MD", "Maryland"], ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"],
  ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"],
  ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"],
  ["NY", "New York"], ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"],
  ["OK", "Oklahoma"], ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"],
  ["SC", "South Carolina"], ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"],
  ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"],
  ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
];

const TOP_VIEWS = [
  ["overall", "Overall"],
  ["hard_money", "Hard Money"],
  ["short_term", "Short Term"],
  ["fix_flip", "Fix & Flip"],
  ["dscr", "DSCR"],
  ["cre_bridge", "CRE Bridge"],
  ["construction", "Construction"],
  ["multifamily", "Multifamily"],
  ["commercial_long_term", "Commercial long-term"],
];

const TAG_LABELS = {
  hard_money: "Hard Money",
  short_term: "Short Term",
  fix_flip: "Fix & Flip",
  dscr: "DSCR",
  bridge: "Bridge",
  cre_bridge: "CRE Bridge",
  construction: "Construction",
  multifamily: "Multifamily",
  commercial: "Commercial",
  commercial_long_term: "Commercial LT",
  rental: "Rental",
  land: "Land",
  small_business: "Small Business",
};

const form = document.querySelector("#search-form");
const stateSelect = document.querySelector("#state");
const results = document.querySelector("#results");
const topResults = document.querySelector("#top-results");
const status = document.querySelector("#status");
const bookmarkSelect = document.querySelector("#bookmarks");
let topPayload = null;
let activeTop = "overall";
let view = "search";

for (const [value, label] of STATES) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  stateSelect.append(option);
}

const chips = document.querySelector("#top-chips");
for (const [id, label] of TOP_VIEWS) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `chip${id === "overall" ? " active" : ""}`;
  button.textContent = label;
  button.dataset.top = id;
  button.addEventListener("click", () => {
    activeTop = id;
    for (const chip of chips.querySelectorAll(".chip")) {
      chip.classList.toggle("active", chip.dataset.top === id);
    }
    renderTop();
    writeUrl();
  });
  chips.append(button);
}

function currentQuery() {
  const data = new FormData(form);
  const query = new URLSearchParams();
  for (const [key, value] of data.entries()) {
    if (!value || value === "on") continue;
    query.set(key, String(value));
  }
  if (document.querySelector("#participating").checked) query.set("participating", "true");
  if (document.querySelector("#all-scopes").checked) query.set("scope", "all");
  return query;
}

function writeUrl() {
  const query = currentQuery();
  query.set("view", view);
  if (view === "top") query.set("top", activeTop);
  const next = `${location.pathname}?${query.toString()}`;
  history.replaceState(null, "", next);
  const exportQuery = currentQuery();
  exportQuery.set("limit", "500");
  document.querySelector("#export-csv").href = `/api/search?${exportQuery.toString()}&format=csv`;
  const jsonQuery = new URLSearchParams(exportQuery);
  jsonQuery.delete("format");
  document.querySelector("#export-json").href = `/api/search?${jsonQuery.toString()}`;
}

function money(value) {
  if (value == null || value === "") return "";
  return Number(value).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function amountLabel(lender) {
  if (lender.amount_text) return lender.amount_text;
  if (lender.min_amount == null && lender.max_amount == null) return "Amount not listed";
  return `${money(lender.min_amount) || "?"} – ${money(lender.max_amount) || "?"}`;
}

function card(lender) {
  const article = document.createElement("article");
  article.className = "card";
  const tags = (lender.tags || [])
    .map((tag) => `<span class="badge tag">${TAG_LABELS[tag] || tag}</span>`)
    .join("");
  const participation = lender.participating
    ? `<span class="badge">Participating</span>`
    : `<span class="badge quiet">Non-participating</span>`;
  const programs = (lender.programs || [])
    .slice(0, 4)
    .map((program) => program.name)
    .join(" · ");
  const ltv = (lender.ltv_notes || []).slice(0, 2).map((note) => `<li>${escapeHtml(note)}</li>`).join("");
  article.innerHTML = `
    <div class="card-top">
      <h2>${lender.rank ? `<span class="rank">${lender.rank}</span> ` : ""}${escapeHtml(lender.name)}</h2>
      <div class="meta">Score ${lender.score ?? "—"}</div>
    </div>
    <div>${participation}${tags}</div>
    <p class="blurb">${escapeHtml(lender.blurb || "No public blurb on the directory card.")}</p>
    <p class="meta">${escapeHtml(lender.markets_label || "")} · ${escapeHtml(amountLabel(lender))}</p>
    ${programs ? `<p class="meta">${escapeHtml(programs)}</p>` : ""}
    ${ltv ? `<ul>${ltv}</ul>` : ""}
    <p class="actions">
      <a href="${lender.profile_url}" target="_blank" rel="noreferrer">PLL profile</a>
      ${lender.contact?.phone ? `<a href="tel:${encodeURIComponent(lender.contact.phone)}">${escapeHtml(lender.contact.phone)}</a>` : ""}
      ${lender.contact?.email ? `<a href="mailto:${encodeURIComponent(lender.contact.email)}">${escapeHtml(lender.contact.email)}</a>` : ""}
      ${lender.website ? `<a href="${lender.website}" target="_blank" rel="noreferrer">Website</a>` : ""}
    </p>
  `;
  return article;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function runSearch() {
  const query = currentQuery();
  query.set("limit", "500");
  writeUrl();
  status.textContent = "Searching…";
  const response = await fetch(`/api/search?${query.toString()}`);
  const payload = await response.json();
  if (!response.ok) {
    results.innerHTML = `<p class="empty">${escapeHtml(payload.error || "Search failed")}</p>`;
    status.textContent = "";
    return;
  }
  status.textContent =
    payload.total > payload.results.length
      ? `Showing ${payload.results.length} of ${payload.total}`
      : `${payload.total} lender${payload.total === 1 ? "" : "s"}`;
  results.replaceChildren();
  if (!payload.results.length) {
    results.innerHTML = `<p class="empty">No lenders match these filters.</p>`;
    return;
  }
  for (const lender of payload.results) results.append(card(lender));
}

function renderTop() {
  if (!topPayload) return;
  const list = topPayload.lists?.[activeTop] || topPayload.also_useful?.[activeTop] || [];
  document.querySelector("#rules").textContent = (topPayload.rules || []).join(" ");
  topResults.replaceChildren();
  if (!list.length) {
    topResults.innerHTML = `<p class="empty">No ranked lenders for this category.</p>`;
    return;
  }
  for (const lender of list) topResults.append(card(lender));
}

async function loadTop() {
  const response = await fetch("/api/top20");
  topPayload = await response.json();
  renderTop();
}

function setView(next) {
  view = next;
  document.querySelector("#search-panel").hidden = next !== "search";
  document.querySelector("#top-panel").hidden = next !== "top";
  for (const tab of document.querySelectorAll(".tab")) {
    tab.classList.toggle("active", tab.dataset.view === next);
  }
  writeUrl();
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => setView(tab.dataset.view));
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  setView("search");
  runSearch();
});

document.querySelector("#reset").addEventListener("click", () => {
  form.reset();
  setView("search");
  runSearch();
});

const BOOKMARK_KEY = "mc-lender-bookmarks";

function loadBookmarks() {
  const saved = JSON.parse(localStorage.getItem(BOOKMARK_KEY) || "[]");
  bookmarkSelect.replaceChildren(new Option("Choose a bookmark", ""));
  for (const bookmark of saved) {
    bookmarkSelect.append(new Option(bookmark.name, bookmark.query));
  }
  return saved;
}

document.querySelector("#save-bookmark").addEventListener("click", () => {
  const name = document.querySelector("#bookmark-name").value.trim();
  if (!name) return;
  const saved = loadBookmarks().filter((bookmark) => bookmark.name !== name);
  saved.push({ name, query: currentQuery().toString() });
  localStorage.setItem(BOOKMARK_KEY, JSON.stringify(saved));
  loadBookmarks();
  bookmarkSelect.value = currentQuery().toString();
  document.querySelector("#bookmark-name").value = "";
});

bookmarkSelect.addEventListener("change", () => {
  if (!bookmarkSelect.value) return;
  applyQuery(new URLSearchParams(bookmarkSelect.value));
  setView("search");
  runSearch();
});

function applyQuery(params) {
  for (const field of ["q", "category", "state", "amount", "property"]) {
    const element = document.querySelector(`#${field}`);
    if (element) element.value = params.get(field) || "";
  }
  document.querySelector("#participating").checked = params.get("participating") === "true";
  document.querySelector("#all-scopes").checked = params.get("scope") === "all";
  if (params.get("top")) activeTop = params.get("top");
}

function readInitialUrl() {
  const params = new URLSearchParams(location.search);
  applyQuery(params);
  for (const chip of chips.querySelectorAll(".chip")) {
    chip.classList.toggle("active", chip.dataset.top === activeTop);
  }
  setView(params.get("view") === "top" ? "top" : "search");
}

loadBookmarks();
readInitialUrl();
loadTop();
runSearch();
