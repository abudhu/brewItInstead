# brewItInstead

A browser extension that nudges you toward Homebrew. When you click a `.dmg`, `.pkg` or `.zip` link on any page, **brewItInstead** checks whether that download is also available as a [Homebrew cask](https://formulae.brew.sh/cask/) and — if so — pops a modal with a one-line `brew install --cask <token>` command you can copy.

It's the browser companion to [`convertToHomeBrew`](https://github.com/abudhu/convertToHomeBrew): `cthb` cleans up the apps you already installed by drag-and-drop, and this extension stops you from adding new ones.

```
┌────────────────────────────────────────────────┐
│ BREW IT INSTEAD                            ×   │
│                                                │
│ Zed is on Homebrew                             │
│ Multiplayer code editor                        │
│                                                │
│ ┌──────┐ ┌─────────────────┐ homepage          │
│ │v1.2.7│ │ verified match  │                   │
│ └──────┘ └─────────────────┘                   │
│                                                │
│ ┌────────────────────────────────────┐ ┌─────┐ │
│ │ brew install --cask zed            │ │Copy │ │
│ └────────────────────────────────────┘ └─────┘ │
│                                                │
│                      [ Cancel ] [ Download… ]  │
└────────────────────────────────────────────────┘
```

## What it does

1. On install, the background service worker downloads `https://formulae.brew.sh/api/cask.json`, prunes it to just the fields needed for matching (token, name, version, desc, homepage, download hostnames, artifact filenames) and caches it in `chrome.storage.local`.
2. The catalog is refreshed daily via `chrome.alarms`.
3. A content script on every page listens for primary-button clicks on `<a href>` links whose path ends in `.dmg`, `.pkg`, `.zip`, `.tar.gz`, `.tar.xz`, `.tgz`, or `.tbz`.
4. When such a click fires, the click is intercepted (`preventDefault`) and the URL is sent to the service worker for matching.
5. If a cask matches, a shadow-DOM modal appears with the cask details and a **Copy** button that puts `brew install --cask <token>` on your clipboard.
6. **Cancel** dismisses the modal. **Download anyway** snoozes that cask token for the rest of the session and re-triggers the original download.
7. As a fallback, `chrome.downloads.onCreated` fires a system notification for any matched download that bypassed the click interceptor (programmatic navigation, form posts, etc.).

## Matching

The matcher considers three signals and ranks results by how many agree:

| Confidence | Meaning |
|---|---|
| `verified` | A strong host signal (the cask's download hostname **or** its GitHub `owner/repo`) **and** the filename point at the same cask. |
| `likely` | A strong host signal matches, and the filename matches some cask, but not the same one — the host-side winner is shown. |
| `host` | Only the host signal matched a cask (vendor hostname or GitHub `owner/repo`). |
| `filename` | Only the filename matched a cask artifact (e.g. `Slack.dmg`). |

Filenames are normalised by stripping common arch/version suffixes (`-aarch64`, `_v1.2.3`, `.dmg`, etc.) before lookup, so `Zed-aarch64.dmg` reduces to `zed`.

### GitHub releases

Lots of OSS apps download from URLs like `https://github.com/<owner>/<repo>/releases/download/v1.2.7/Foo.dmg`. The hostname `github.com` is too shared to be a useful signal on its own, so it's excluded from the host index. Instead, every cask that points at a GitHub URL has its `owner/repo` extracted into a separate `byGithubRepo` index. Matching incoming GitHub release URLs against that index gives the same precision as a vendor hostname match.

### Version drift

When the download URL contains a version-looking string (e.g. `…/releases/stable/1.2.7/Zed-aarch64.dmg`), the modal compares it to the cask's version and shows a pill:

- **brew is newer: v1.2.7 vs v1.2.3** — the page is offering an older build.
- **brew is older: v1.2.5 vs v1.2.7** — brew hasn't caught up yet.

Can be toggled off in the settings page.

## Settings

Open the toolbar popup and click **Open settings**, or visit `about:addons` → Brew It Instead → Options.

| Setting | Default | What it does |
|---|---|---|
| Show download-notification fallback | on | System notification when a download starts that we couldn't intercept (programmatic redirects, form posts). |
| Show version drift | on | "Page: 1.2.3 · Brew: 1.2.5" pill in the modal. |
| "Download anyway" remembers for | session | `session`: per-tab. `24h`: across all tabs. |
| Disabled hostnames | empty | One per line. Subdomains match — `example.com` covers `downloads.example.com`. |
| Extra download extensions | empty | E.g. `.tar.bz2`, `.7z`. Added to the built-in list of `.dmg/.pkg/.zip/.tar.gz/.tar.xz/.tgz/.tbz`. |

## Install (Firefox, development)

1. Clone this repo.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…** and pick `manifest.json` from the repo root.
4. Visit something like https://zed.dev/download and click the macOS download link.

For a permanent (signed) install, run `web-ext build` and submit the `.zip` to [addons.mozilla.org](https://addons.mozilla.org/).

## Install (Chrome / Chromium, development)

1. Visit `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and pick the repo root.

The same Manifest V3 file is used; the only Firefox-specific bit is the `browser_specific_settings.gecko` block, which Chrome ignores.

## Layout

```
brewItInstead/
├── manifest.json          MV3 manifest, dual-target Firefox + Chrome
├── src/
│   ├── background.js      Service worker: index refresh, message router,
│   │                      downloads.onCreated fallback
│   ├── content.js         Click interceptor + shadow-DOM modal
│   ├── modal.css          Styles injected into the shadow root
│   ├── popup.html         Toolbar popup
│   ├── popup.js           Popup logic (status, manual refresh)
│   ├── options.html       Settings page
│   ├── options.js         Settings page logic
│   └── lib/
│       ├── caskIndex.js   Fetch + prune + persist cask.json (incl. GitHub repos)
│       ├── matcher.js     URL/filename/github → cask matcher
│       └── settings.js    Shared settings model
├── icons/                 48px and 128px PNGs
├── scripts/
│   └── make_icons.py      Regenerate icons (requires Pillow)
├── tests/
│   └── matcher.test.mjs   Pure-JS unit tests for the matcher
├── LICENSE                MIT
└── README.md
```

## Tests

```bash
node tests/matcher.test.mjs
```

The matcher is a pure function with no `chrome.*` dependencies, so the tests run under plain Node — no jsdom or extension harness needed.

## Why a copy command and not "click to install"?

Browsers can't shell out. Three options exist:

1. **Copy command to clipboard** (what this does) — zero install friction, user pastes into a Terminal they already have open.
2. **Register a `brew://` URL handler** — a tiny helper app handles `brew://install/<token>` and runs the command in Terminal. One-time install, smoother flow.
3. **Native messaging host** — extension talks to a local binary via stdin/stdout. Cleanest in-browser UX, most install ceremony.

Option 1 is the right starting point. Option 2 is the natural next step — it could ship as a `cthb url-handler install` subcommand.

## Roadmap

- [x] Settings page: enable/disable per host, custom archive extensions, snooze duration, drift toggle
- [x] Show version drift (page offers 1.2.3, cask has 1.2.5)
- [x] GitHub release URL matching via `owner/repo` extraction
- [ ] Detect "already installed via brew" and replace the modal copy
- [ ] Chrome Web Store + AMO submissions
- [ ] Per-cask preview screenshot pulled from `homepage`

## License

MIT
