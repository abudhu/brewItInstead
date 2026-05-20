// Cask index: fetch the full cask catalog from formulae.brew.sh, prune it down
// to what we need for matching, and persist it in chrome.storage.local.
//
// The full cask.json is ~5MB. After pruning to (token, name, version, desc,
// homepage, hosts, filenames) it's roughly 300-600KB which fits comfortably
// in storage.local.

const CASK_API = "https://formulae.brew.sh/api/cask.json";
const STORAGE_KEY = "caskIndex_v1";
const STORAGE_META_KEY = "caskIndex_v1_meta";

export const REFRESH_INTERVAL_MIN = 60 * 24; // daily

function collectUrls(cask) {
  const urls = new Set();
  if (cask.url) urls.add(cask.url);
  if (cask.variations && typeof cask.variations === "object") {
    for (const variant of Object.values(cask.variations)) {
      if (variant && variant.url) urls.add(variant.url);
    }
  }
  return [...urls];
}

function collectAppNames(cask) {
  const apps = new Set();
  if (Array.isArray(cask.artifacts)) {
    for (const artifact of cask.artifacts) {
      if (!artifact || typeof artifact !== "object") continue;
      if (Array.isArray(artifact.app)) {
        for (const entry of artifact.app) {
          if (typeof entry === "string") apps.add(entry);
          else if (entry && typeof entry === "object" && typeof entry.target === "string") {
            apps.add(entry.target);
          }
        }
      }
    }
  }
  return [...apps];
}

function basenameFromUrl(url) {
  try {
    const u = new URL(url);
    const segs = u.pathname.split("/").filter(Boolean);
    return segs.length ? segs[segs.length - 1] : "";
  } catch {
    return "";
  }
}

function shrinkCask(cask) {
  const urls = collectUrls(cask);
  const hosts = new Set();
  const filenames = new Set();
  for (const url of urls) {
    try {
      const u = new URL(url);
      hosts.add(u.hostname.toLowerCase());
    } catch {}
    const bn = basenameFromUrl(url);
    if (bn) filenames.add(bn.toLowerCase());
  }
  for (const app of collectAppNames(cask)) {
    filenames.add(app.toLowerCase());
  }
  return {
    token: cask.token,
    name: Array.isArray(cask.name) ? cask.name[0] : cask.name || cask.token,
    version: cask.version || "",
    desc: cask.desc || "",
    homepage: cask.homepage || "",
    hosts: [...hosts],
    filenames: [...filenames],
  };
}

export async function fetchAndShrink() {
  const res = await fetch(CASK_API, { cache: "no-cache" });
  if (!res.ok) throw new Error(`cask.json fetch failed: ${res.status}`);
  const arr = await res.json();
  if (!Array.isArray(arr)) throw new Error("cask.json did not return an array");
  return arr.map(shrinkCask).filter((c) => c.token);
}

export async function refreshIndex() {
  const casks = await fetchAndShrink();
  const meta = {
    fetchedAt: Date.now(),
    count: casks.length,
  };
  await chrome.storage.local.set({
    [STORAGE_KEY]: casks,
    [STORAGE_META_KEY]: meta,
  });
  return meta;
}

export async function loadIndex() {
  const got = await chrome.storage.local.get([STORAGE_KEY, STORAGE_META_KEY]);
  return {
    casks: got[STORAGE_KEY] || null,
    meta: got[STORAGE_META_KEY] || null,
  };
}

export function buildLookups(casks) {
  const byHost = new Map();
  const byFilename = new Map();
  for (const c of casks) {
    for (const h of c.hosts) {
      if (!byHost.has(h)) byHost.set(h, []);
      byHost.get(h).push(c);
    }
    for (const f of c.filenames) {
      if (!byFilename.has(f)) byFilename.set(f, []);
      byFilename.get(f).push(c);
    }
  }
  return { byHost, byFilename };
}
