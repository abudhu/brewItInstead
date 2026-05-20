const countEl = document.getElementById("count");
const whenEl = document.getElementById("when");
const btn = document.getElementById("refresh");

function fmtWhen(ts) {
  if (!ts) return "never";
  const d = new Date(ts);
  const now = Date.now();
  const diffMin = Math.round((now - ts) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffMin < 60 * 24) return `${Math.round(diffMin / 60)} h ago`;
  return d.toLocaleDateString();
}

async function refreshStatus() {
  const resp = await chrome.runtime.sendMessage({ type: "status" });
  if (resp && resp.ok && resp.meta) {
    countEl.textContent = resp.meta.count.toLocaleString();
    whenEl.textContent = fmtWhen(resp.meta.fetchedAt);
  } else {
    countEl.textContent = "—";
    whenEl.textContent = "—";
  }
}

btn.addEventListener("click", async () => {
  btn.disabled = true;
  btn.textContent = "Refreshing…";
  try {
    await chrome.runtime.sendMessage({ type: "refreshNow" });
    await refreshStatus();
    btn.textContent = "Refreshed!";
    setTimeout(() => { btn.textContent = "Refresh now"; btn.disabled = false; }, 1200);
  } catch {
    btn.textContent = "Failed";
    btn.disabled = false;
  }
});

document.getElementById("settings").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

refreshStatus();
