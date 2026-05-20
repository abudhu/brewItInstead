// Given a download URL and the prebuilt lookup maps, return zero or more
// cask matches with a confidence score.
//
// Confidence ladder:
//   "verified" - host AND filename agree on the same cask
//   "likely"   - host matches AND a filename matches, but on different casks;
//                we return the host-side results
//   "host"     - only the hostname matched a cask download host
//   "filename" - only the filename (e.g. Slack.dmg) matched a cask artifact

const ARCHIVE_SUFFIXES = [
  ".dmg", ".pkg", ".zip", ".tar.gz", ".tar.xz", ".tgz", ".tbz",
];

export function looksLikeMacDownload(url, filename) {
  const target = (filename || url || "").toLowerCase();
  return ARCHIVE_SUFFIXES.some((s) => target.endsWith(s));
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

export function matchDownload({ url, filename }, lookups) {
  const bn = (filename || basenameFromUrl(url || "")).toLowerCase();
  let host = "";
  try { host = new URL(url).hostname.toLowerCase(); } catch {}

  const hostHits = host ? (lookups.byHost.get(host) || []) : [];
  const fileHits = [];
  for (const cand of filenameCandidates(bn)) {
    const hits = lookups.byFilename.get(cand);
    if (hits) fileHits.push(...hits);
  }

  const hostTokens = new Set(hostHits.map((c) => c.token));
  const fileTokens = new Set(fileHits.map((c) => c.token));
  const both = [...hostTokens].filter((t) => fileTokens.has(t));

  if (both.length) {
    const map = new Map(hostHits.map((c) => [c.token, c]));
    return both.map((t) => ({ cask: map.get(t), confidence: "verified" }));
  }
  if (hostHits.length && fileHits.length) {
    return hostHits.map((c) => ({ cask: c, confidence: "likely" }));
  }
  if (hostHits.length) {
    return hostHits.map((c) => ({ cask: c, confidence: "host" }));
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
