// Given a download URL and the prebuilt lookup maps, return zero or more
// cask matches with a confidence score.
//
// Confidence ladder:
//   "verified" - a strong host signal (cask hostname OR github owner/repo)
//                AND a filename hit agree on the same cask
//   "likely"   - a strong host signal matches AND a filename hit exists, but
//                they pointed at different casks; the host-side wins
//   "host"     - only the strong host signal matched
//   "filename" - only the filename matched a cask artifact

const ARCHIVE_SUFFIXES = [
  ".dmg", ".pkg", ".zip", ".tar.gz", ".tar.xz", ".tgz", ".tbz",
];

export function looksLikeMacDownload(url, filename, extraExtensions = []) {
  const target = (filename || url || "").toLowerCase();
  return [...ARCHIVE_SUFFIXES, ...extraExtensions].some((s) => target.endsWith(s));
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

function stripVersionAndArch(name) {
  let n = name.toLowerCase();
  for (const ext of ARCHIVE_SUFFIXES) {
    if (n.endsWith(ext)) {
      n = n.slice(0, -ext.length);
      break;
    }
  }
  n = n.replace(/[-_.](aarch64|arm64|x86_64|amd64|intel|apple[-_.]?silicon|universal|mac(os)?|osx|darwin)$/i, "");
  n = n.replace(/[-_. ]v?\d+(\.\d+){0,3}([-_.][a-z0-9]+)?$/i, "");
  n = n.replace(/[-_. ]+$/, "");
  return n;
}

function filenameCandidates(basename) {
  const out = new Set();
  if (!basename) return [...out];
  const lower = basename.toLowerCase();
  out.add(lower);
  const stripped = stripVersionAndArch(lower);
  if (stripped) {
    out.add(stripped);
    out.add(stripped + ".app");
  }
  return [...out];
}

// If the URL is a github.com release URL, return "owner/repo".  Handles:
//   github.com/owner/repo/releases/download/...
//   github.com/owner/repo/raw/...
//   owner.github.io/repo/...
export function extractGithubRepo(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host === "github.com" || host === "www.github.com") {
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts.length >= 2) {
        return `${parts[0].toLowerCase()}/${parts[1].replace(/\.git$/, "").toLowerCase()}`;
      }
    } else if (host.endsWith(".github.io")) {
      const owner = host.replace(/\.github\.io$/, "");
      const parts = u.pathname.split("/").filter(Boolean);
      if (owner && parts.length >= 1) {
        return `${owner.toLowerCase()}/${parts[0].toLowerCase()}`;
      }
    }
  } catch {}
  return "";
}

// Pull a version-looking string out of a URL.  Prefers the most specific
// (longest) match found in path segments or the filename.
export function extractVersionFromUrl(url) {
  let parsed;
  try { parsed = new URL(url); } catch { return ""; }
  const candidates = [];
  const segs = parsed.pathname.split("/").filter(Boolean);
  for (const seg of segs) {
    const re = /v?(\d+\.\d+(?:\.\d+){0,2})/gi;
    let m;
    while ((m = re.exec(seg)) !== null) candidates.push(m[1]);
  }
  candidates.sort((a, b) => b.length - a.length);
  return candidates[0] || "";
}

// Compare semver-ish version strings. Returns -1, 0, 1, or null when either
// side is empty/unparseable.
export function compareVersions(a, b) {
  if (!a || !b) return null;
  const parse = (s) => s.split(".").map((n) => parseInt(n, 10)).filter((n) => !Number.isNaN(n));
  const pa = parse(a);
  const pb = parse(b);
  if (!pa.length || !pb.length) return null;
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

export function matchDownload({ url, filename }, lookups) {
  const bn = (filename || basenameFromUrl(url || "")).toLowerCase();
  let host = "";
  try { host = new URL(url).hostname.toLowerCase(); } catch {}

  const hostHits = host ? (lookups.byHost.get(host) || []) : [];

  // GitHub URLs are a more specific kind of "host" match: github.com is
  // shared by countless projects, so the owner/repo path identifies a
  // single project just as well as a vendor hostname.
  const repo = extractGithubRepo(url || "");
  const ghHits = repo && lookups.byGithubRepo ? (lookups.byGithubRepo.get(repo) || []) : [];

  // Merge host and github hits, deduped by token.
  const strongHits = [];
  const strongSeen = new Set();
  for (const c of [...hostHits, ...ghHits]) {
    if (strongSeen.has(c.token)) continue;
    strongSeen.add(c.token);
    strongHits.push(c);
  }

  const fileHits = [];
  for (const cand of filenameCandidates(bn)) {
    const hits = lookups.byFilename.get(cand);
    if (hits) fileHits.push(...hits);
  }

  const strongTokens = new Set(strongHits.map((c) => c.token));
  const fileTokens = new Set(fileHits.map((c) => c.token));
  const both = [...strongTokens].filter((t) => fileTokens.has(t));

  if (both.length) {
    const map = new Map(strongHits.map((c) => [c.token, c]));
    return both.map((t) => ({ cask: map.get(t), confidence: "verified" }));
  }
  if (strongHits.length && fileHits.length) {
    return strongHits.map((c) => ({ cask: c, confidence: "likely" }));
  }
  if (strongHits.length) {
    return strongHits.map((c) => ({ cask: c, confidence: "host" }));
  }
  if (fileHits.length) {
    const seen = new Set();
    const out = [];
    for (const c of fileHits) {
      if (seen.has(c.token)) continue;
      seen.add(c.token);
      out.push({ cask: c, confidence: "filename" });
    }
    return out;
  }
  return [];
}
