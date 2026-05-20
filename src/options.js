import { DEFAULTS, loadSettings, saveSettings } from "./lib/settings.js";

const els = {
  showDownloadNotifications: document.getElementById("showDownloadNotifications"),
  showVersionDrift: document.getElementById("showVersionDrift"),
  snoozeDuration: document.getElementById("snoozeDuration"),
  disabledHosts: document.getElementById("disabledHosts"),
  extraExtensions: document.getElementById("extraExtensions"),
  save: document.getElementById("save"),
  reset: document.getElementById("reset"),
  status: document.getElementById("status"),
};

function linesToArray(text) {
  return (text || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function arrayToLines(arr) {
  return (arr || []).join("\n");
}

function normalizeExt(ext) {
  let e = ext.trim().toLowerCase();
  if (!e) return "";
  if (!e.startsWith(".")) e = "." + e;
  return e;
}

function fillForm(s) {
  els.showDownloadNotifications.checked = !!s.showDownloadNotifications;
  els.showVersionDrift.checked = !!s.showVersionDrift;
  els.snoozeDuration.value = s.snoozeDuration || "session";
  els.disabledHosts.value = arrayToLines(s.disabledHosts);
  els.extraExtensions.value = arrayToLines(s.extraExtensions);
}

function readForm() {
  return {
    showDownloadNotifications: els.showDownloadNotifications.checked,
    showVersionDrift: els.showVersionDrift.checked,
    snoozeDuration: els.snoozeDuration.value,
    disabledHosts: linesToArray(els.disabledHosts.value).map((h) => h.toLowerCase().replace(/^www\./, "")),
    extraExtensions: linesToArray(els.extraExtensions.value).map(normalizeExt).filter(Boolean),
  };
}

function flashStatus(text, kind) {
  els.status.textContent = text;
  els.status.classList.add("show", kind);
  setTimeout(() => {
    els.status.classList.remove("show", "ok", "err");
  }, 1800);
}

els.save.addEventListener("click", async () => {
  try {
    await saveSettings(readForm());
    flashStatus("Saved", "ok");
  } catch (err) {
    flashStatus("Save failed: " + err.message, "err");
  }
});

els.reset.addEventListener("click", async () => {
  try {
    await saveSettings({ ...DEFAULTS });
    fillForm({ ...DEFAULTS });
    flashStatus("Reset to defaults", "ok");
  } catch (err) {
    flashStatus("Reset failed: " + err.message, "err");
  }
});

loadSettings().then(fillForm);
