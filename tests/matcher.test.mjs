// Run with: node tests/matcher.test.mjs
import assert from "node:assert";
import {
  matchDownload,
  extractGithubRepo,
  extractVersionFromUrl,
  compareVersions,
  looksLikeMacDownload,
} from "../src/lib/matcher.js";
import { buildLookups, extractGithubRepos } from "../src/lib/caskIndex.js";

const casks = [
  {
    token: "zed",
    name: "Zed",
    version: "1.2.7",
    desc: "Multiplayer code editor",
    homepage: "https://zed.dev/",
    hosts: ["zed.dev"],
    filenames: ["zed-aarch64.dmg", "zed-x86_64.dmg", "zed.app"],
    githubRepos: [],
  },
  {
    token: "copilot-money",
    name: "Copilot",
    version: "1.0",
    desc: "Personal finance",
    homepage: "https://copilot.money/",
    hosts: ["copilot.money"],
    filenames: ["copilot.dmg", "copilot.app"],
    githubRepos: [],
  },
  {
    token: "slack",
    name: "Slack",
    version: "4.41",
    desc: "Team communication",
    homepage: "https://slack.com/",
    hosts: ["downloads.slack-edge.com"],
    filenames: ["slack-4.41.0-macos.dmg", "slack.app"],
    githubRepos: [],
  },
  // A cask that's only resolvable via its GitHub repo, e.g. an OSS project
  // that releases via GitHub. Note: hosts[] is empty because github.com is
  // a shared host and shouldn't match by hostname alone — only the
  // githubRepos signal should resolve it.
  {
    token: "raycast-clone",
    name: "Raycast Clone",
    version: "0.5.0",
    desc: "Launcher (fictional)",
    homepage: "https://github.com/example/raycast-clone",
    hosts: [],
    filenames: ["raycast-clone-0.5.0.dmg", "raycast-clone.app"],
    githubRepos: ["example/raycast-clone"],
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
    confidence: "verified",
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
  {
    desc: "github release URL matches via owner/repo + filename -> verified",
    url: "https://github.com/example/raycast-clone/releases/download/v0.5.0/Raycast-Clone-0.5.0.dmg",
    token: "raycast-clone",
    confidence: "verified",
  },
  {
    desc: "github release URL with unmatched filename still hits via repo alone -> host",
    url: "https://github.com/example/raycast-clone/releases/download/v0.5.0/some-other.dmg",
    token: "raycast-clone",
    confidence: "host",
  },
  {
    desc: "github.com but unknown owner -> no match",
    url: "https://github.com/somebody/random-project/releases/download/v1/asset.dmg",
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

// Unit tests for the small helpers.

function check(desc, actual, expected) {
  try {
    assert.deepStrictEqual(actual, expected);
    console.log("PASS", desc);
  } catch (err) {
    failed++;
    console.error("FAIL", desc, "->", actual, "expected", expected);
  }
}

check("extractGithubRepo: release URL",
  extractGithubRepo("https://github.com/example/raycast-clone/releases/download/v1/x.dmg"),
  "example/raycast-clone");
check("extractGithubRepo: github.io",
  extractGithubRepo("https://example.github.io/raycast-clone/v1/x.dmg"),
  "example/raycast-clone");
check("extractGithubRepo: non-github",
  extractGithubRepo("https://example.com/whatever"),
  "");

check("extractVersionFromUrl: standard semver",
  extractVersionFromUrl("https://zed.dev/api/releases/stable/1.2.7/Zed-aarch64.dmg"),
  "1.2.7");
check("extractVersionFromUrl: v-prefixed in path",
  extractVersionFromUrl("https://github.com/foo/bar/releases/download/v0.5.0/asset.dmg"),
  "0.5.0");
check("extractVersionFromUrl: none",
  extractVersionFromUrl("https://example.com/Foo.dmg"),
  "");

check("compareVersions: newer", compareVersions("1.2.3", "1.2.5"), -1);
check("compareVersions: older", compareVersions("2.0.0", "1.9.9"), 1);
check("compareVersions: equal", compareVersions("1.2.0", "1.2"), 0);
check("compareVersions: empty", compareVersions("", "1.0"), null);

check("looksLikeMacDownload: dmg", looksLikeMacDownload("https://x/Foo.dmg", "Foo.dmg"), true);
check("looksLikeMacDownload: html", looksLikeMacDownload("https://x/index.html", "index.html"), false);
check("looksLikeMacDownload: extra ext", looksLikeMacDownload("https://x/Foo.7z", "Foo.7z", [".7z"]), true);

check("extractGithubRepos collects across URLs",
  extractGithubRepos([
    "https://github.com/foo/bar/releases/download/v1/x.dmg",
    "https://example.com/other",
    "https://github.com/foo/bar.git",
  ]),
  ["foo/bar"]);

if (failed) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log(`\nAll tests passed`);
