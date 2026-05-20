// Shared settings module. Used by background, content scripts and the
// options page. All settings live in chrome.storage.local under a single
// key so a one-shot get/set transaction is enough.

const STORAGE_KEY = "settings_v1";

export const DEFAULTS = Object.freeze({
  disabledHosts: [],          // Hostnames where the modal should not appear.
  extraExtensions: [],        // Additional download file extensions to watch.
  showDownloadNotifications: true,
  showVersionDrift: true,
  snoozeDuration: "session",  // "session" or "24h"
});

export async function loadSettings() {
  const got = await chrome.storage.local.get(STORAGE_KEY);
  return { ...DEFAULTS, ...(got[STORAGE_KEY] || {}) };
}

export async function saveSettings(partial) {
  const current = await loadSettings();
  const next = { ...current, ...partial };
  await chrome.storage.local.set({ [STORAGE_KEY]: next });
  return next;
}

// Subscribe to settings changes. Callback receives the merged-with-defaults
// settings object. Returns an unsubscribe function.
export function onSettingsChange(cb) {
  const listener = (changes, area) => {
    if (area !== "local" || !changes[STORAGE_KEY]) return;
    cb({ ...DEFAULTS, ...(changes[STORAGE_KEY].newValue || {}) });
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

export function normalizeHost(host) {
  return (host || "").trim().toLowerCase().replace(/^www\./, "");
}

// Does `host` match any of the patterns in the disabled list?  A pattern
// matches the exact host OR any subdomain.
export function isHostDisabled(host, disabledHosts) {
  const h = normalizeHost(host);
  if (!h) return false;
  for (const raw of disabledHosts || []) {
    const pat = normalizeHost(raw);
    if (!pat) continue;
    if (h === pat || h.endsWith("." + pat)) return true;
  }
  return false;
}
