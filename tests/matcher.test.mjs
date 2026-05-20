// Run with: node tests/matcher.test.mjs
import assert from "node:assert";
import { matchDownload } from "../src/lib/matcher.js";
import { buildLookups } from "../src/lib/caskIndex.js";

const casks = [
  {
    token: "zed",
    name: "Zed",
    version: "1.2.7",
    desc: "Multiplayer code editor",
    homepage: "https://zed.dev/",
    hosts: ["zed.dev"],
    filenames: ["zed-aarch64.dmg", "zed-x86_64.dmg", "zed.app"],
  },
  {
    token: "copilot-money",
    name: "Copilot",
    version: "1.0",
    desc: "Personal finance",
    homepage: "https://copilot.money/",
    hosts: ["copilot.money"],
    filenames: ["copilot.dmg", "copilot.app"],
  },
  {
    token: "slack",
    name: "Slack",
    version: "4.41",
    desc: "Team communication",
    homepage: "https://slack.com/",
    hosts: ["downloads.slack-edge.com"],
    filenames: ["slack-4.41.0-macos.dmg", "slack.app"],
  },
];

const lookups = buildLookups(casks);

function head(url) {
  const hits = matchDownload({ url }, lookups);
  return hits[0] || null;
}

const cases = [
  {
    desc: "host + filename agree -> verified",
    url: "https://zed.dev/api/releases/stable/1.2.7/Zed-aarch64.dmg",
    token: "zed",
    confidence: "verified",
  },
  {
    desc: "version-suffixed slack matches via .app filename",
    url: "https://downloads.slack-edge.com/releases/macos/4.41.0/Slack-4.41.0-macOS.dmg",
    token: "slack",
  },
  {
    desc: "filename-only fallback",
    url: "https://example.com/Copilot.dmg",
    token: "copilot-money",
    confidence: "filename",
  },
  {
    desc: "unknown download returns nothing",
    url: "https://example.com/totally-unknown.dmg",
    token: null,
  },
];

let failed = 0;
for (const c of cases) {
  const top = head(c.url);
  try {
    if (c.token === null) {
      assert.strictEqual(top, null, "expected no match");
    } else {
      assert.ok(top, "expected a match");
      assert.strictEqual(top.cask.token, c.token);
      if (c.confidence) assert.strictEqual(top.confidence, c.confidence);
    }
    console.log("PASS", c.desc);
  } catch (err) {
    failed++;
    console.error("FAIL", c.desc, "->", top, "\n     ", err.message);
  }
}

if (failed) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log(`\nAll ${cases.length} tests passed`);
