// Service worker: keeps the cask index fresh, answers match requests from
// content scripts, and watches chrome.downloads as a fallback path for
// downloads that bypassed the click interceptor.

import { refreshIndex, loadIndex, buildLookups, REFRESH_INTERVAL_MIN } from "./lib/caskIndex.js";
import { matchDownload, looksLikeMacDownload } from "./lib/matcher.js";

const ALARM_NAME = "brewItInstead.refresh";

let lookups = null;
let lookupsReady = null;

async function ensureLookups({ forceFresh = false } = {}) {
  if (lookups && !forceFresh) return lookups;
  if (lookupsReady && !forceFresh) return lookupsReady;
  lookupsReady = (async () => {
    let { casks } = await loadIndex();
    if (!casks || forceFresh) {
      await refreshIndex();
      ({ casks } = await loadIndex());
    }
    lookups = buildLookups(casks || []);
    return lookups;
  })();
  return lookupsReady;
}

async function scheduleRefresh() {
  const existing = await chrome.alarms.get(ALARM_NAME);
  if (existing) return;
  chrome.alarms.create(ALARM_NAME, {
    delayInMinutes: 1,
    periodInMinutes: REFRESH_INTERVAL_MIN,
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  await scheduleRefresh();
  try {
    await refreshIndex();
  } catch (err) {
    console.warn("[brewItInstead] initial refresh failed:", err);
  }
  lookups = null;
});

chrome.runtime.onStartup.addListener(async () => {
  await scheduleRefresh();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  try {
    await refreshIndex();
    lookups = null;
  } catch (err) {
    console.warn("[brewItInstead] scheduled refresh failed:", err);
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg !== "object") return false;

  if (msg.type === "match") {
    (async () => {
      try {
        const lk = await ensureLookups();
        const hits = matchDownload({ url: msg.url, filename: msg.filename }, lk);
        sendResponse({ ok: true, hits });
      } catch (err) {
        sendResponse({ ok: false, error: String(err) });
      }
    })();
    return true;
  }

  if (msg.type === "refreshNow") {
    (async () => {
      try {
        await refreshIndex();
        lookups = null;
        const lk = await ensureLookups({ forceFresh: false });
        sendResponse({ ok: true, count: lk.byHost.size });
      } catch (err) {
        sendResponse({ ok: false, error: String(err) });
      }
    })();
    return true;
  }

  if (msg.type === "status") {
    (async () => {
      const { meta } = await loadIndex();
      sendResponse({ ok: true, meta });
    })();
    return true;
  }

  return false;
});

// Fallback path: downloads that bypassed the click interceptor (programmatic
// navigation, form posts, etc.) still trigger a system notification with the
// brew command, but we don't auto-cancel.
chrome.downloads.onCreated.addListener(async (item) => {
  try {
    if (!looksLikeMacDownload(item.url, item.filename)) return;
    const lk = await ensureLookups();
    const hits = matchDownload({ url: item.url, filename: item.filename }, lk);
    if (!hits.length) return;
    const top = hits[0];
    chrome.notifications.create({
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/icon-128.png"),
      title: `${top.cask.name} is on Homebrew`,
      message: `Next time, run:\nbrew install --cask ${top.cask.token}`,
      priority: 1,
    });
  } catch (err) {
    console.warn("[brewItInstead] downloads.onCreated handler failed:", err);
  }
});
