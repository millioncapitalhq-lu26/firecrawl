export function parseRobots(text) {
  const disallow = [];
  const allow = [];
  const sitemaps = [];
  let applies = false;
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.split("#")[0].trim();
    if (!line) continue;
    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (!match) continue;
    const key = match[1].trim().toLowerCase();
    const value = match[2].trim();
    if (key === "user-agent") {
      applies = value === "*";
    } else if (key === "sitemap" && value) {
      sitemaps.push(value);
    } else if (applies && key === "disallow" && value) {
      disallow.push(value);
    } else if (applies && key === "allow" && value) {
      allow.push(value);
    }
  }
  return { disallow, allow, sitemaps };
}

export function robotsAllowed(url, robots) {
  const path = new URL(url).pathname;
  let allowed = true;
  let best = -1;
  for (const rule of robots?.disallow || []) {
    if (rule !== "/" && path.startsWith(rule) && rule.length > best) {
      best = rule.length;
      allowed = false;
    }
  }
  for (const rule of robots?.allow || []) {
    if (path.startsWith(rule) && rule.length >= best) {
      best = rule.length;
      allowed = true;
    }
  }
  return allowed;
}
