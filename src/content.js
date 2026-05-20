// Content script: watches for clicks on download links, asks the background
// service worker to match the URL against the cask index, and if there's a
// hit pops a modal with a copy-to-clipboard brew command.
//
// The modal is rendered inside a shadow root attached to a host element on
// <body> so the page's CSS cannot reach it.

(() => {
  const ARCHIVE_SUFFIXES = [
    ".dmg", ".pkg", ".zip", ".tar.gz", ".tar.xz", ".tgz", ".tbz",
  ];
  const SESSION_KEY = "brewItInstead.snoozed";

  function looksLikeDownload(url) {
    if (!url) return false;
    let u;
    try { u = new URL(url, location.href); } catch { return false; }
    const path = u.pathname.toLowerCase();
    return ARCHIVE_SUFFIXES.some((s) => path.endsWith(s));
  }

  function basenameFromUrl(url) {
    try {
      const u = new URL(url, location.href);
      const segs = u.pathname.split("/").filter(Boolean);
      return segs.length ? decodeURIComponent(segs[segs.length - 1]) : "";
    } catch {
      return "";
    }
  }

  function getSnoozed() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  }

  function addSnoozed(token) {
    const set = getSnoozed();
    set.add(token);
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify([...set])); } catch {}
  }

  let modalHost = null;

  function ensureHost() {
    if (modalHost && document.documentElement.contains(modalHost)) return modalHost;
    modalHost = document.createElement("div");
    modalHost.id = "brew-it-instead-host";
    modalHost.style.all = "initial";
    const shadow = modalHost.attachShadow({ mode: "open" });

    const linkEl = document.createElement("link");
    linkEl.rel = "stylesheet";
    linkEl.href = chrome.runtime.getURL("src/modal.css");
    shadow.appendChild(linkEl);

    const container = document.createElement("div");
    container.className = "bii-container";
    shadow.appendChild(container);

    document.documentElement.appendChild(modalHost);
    modalHost._shadow = shadow;
    modalHost._container = container;
    return modalHost;
  }

  function closeModal() {
    if (modalHost && modalHost.parentNode) {
      modalHost.parentNode.removeChild(modalHost);
    }
    modalHost = null;
  }

  function showModal({ hits, onProceed }) {
    const host = ensureHost();
    const root = host._container;
    root.innerHTML = "";

    const top = hits[0];
    const command = `brew install --cask ${top.cask.token}`;

    const backdrop = document.createElement("div");
    backdrop.className = "bii-backdrop";
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeModal();
    });

    const card = document.createElement("div");
    card.className = "bii-card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");

    const closeBtn = document.createElement("button");
    closeBtn.className = "bii-close";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", closeModal);

    const eyebrow = document.createElement("div");
    eyebrow.className = "bii-eyebrow";
    eyebrow.textContent = "Brew It Instead";

    const title = document.createElement("h2");
    title.className = "bii-title";
    title.textContent = `${top.cask.name} is on Homebrew`;

    const desc = document.createElement("p");
    desc.className = "bii-desc";
    desc.textContent = top.cask.desc || "Available as a Homebrew cask.";

    const meta = document.createElement("div");
    meta.className = "bii-meta";
    const version = document.createElement("span");
    version.className = "bii-pill";
    version.textContent = `v${top.cask.version}`;
    const confidence = document.createElement("span");
    confidence.className = `bii-pill bii-conf-${top.confidence}`;
    confidence.textContent = top.confidence === "verified" ? "verified match"
      : top.confidence === "likely" ? "likely match"
      : top.confidence === "host" ? "host match"
      : "filename match";
    meta.appendChild(version);
    meta.appendChild(confidence);
    if (top.cask.homepage) {
      const link = document.createElement("a");
      link.className = "bii-link";
      link.href = top.cask.homepage;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "homepage";
      meta.appendChild(link);
    }

    const cmdWrap = document.createElement("div");
    cmdWrap.className = "bii-cmd-wrap";
    const cmdEl = document.createElement("code");
    cmdEl.className = "bii-cmd";
    cmdEl.textContent = command;
    const copyBtn = document.createElement("button");
    copyBtn.className = "bii-copy";
    copyBtn.textContent = "Copy";
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(command);
        copyBtn.textContent = "Copied!";
        copyBtn.classList.add("bii-copied");
        setTimeout(() => {
          copyBtn.textContent = "Copy";
          copyBtn.classList.remove("bii-copied");
        }, 1500);
      } catch {
        copyBtn.textContent = "Copy failed";
      }
    });
    cmdWrap.appendChild(cmdEl);
    cmdWrap.appendChild(copyBtn);

    let altWrap = null;
    if (hits.length > 1) {
      altWrap = document.createElement("details");
      altWrap.className = "bii-alts";
      const summary = document.createElement("summary");
      summary.textContent = `${hits.length - 1} other match${hits.length - 1 === 1 ? "" : "es"}`;
      altWrap.appendChild(summary);
      for (const h of hits.slice(1)) {
        const row = document.createElement("div");
        row.className = "bii-alt";
        const tokenEl = document.createElement("code");
        tokenEl.textContent = h.cask.token;
        const nameEl = document.createElement("span");
        nameEl.textContent = h.cask.name;
        const btn = document.createElement("button");
        btn.textContent = "Copy";
        btn.addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(`brew install --cask ${h.cask.token}`);
            btn.textContent = "Copied!";
            setTimeout(() => { btn.textContent = "Copy"; }, 1500);
          } catch {
            btn.textContent = "Failed";
          }
        });
        row.appendChild(tokenEl);
        row.appendChild(nameEl);
        row.appendChild(btn);
        altWrap.appendChild(row);
      }
    }

    const actions = document.createElement("div");
    actions.className = "bii-actions";
    const proceedBtn = document.createElement("button");
    proceedBtn.className = "bii-proceed";
    proceedBtn.textContent = "Download anyway";
    proceedBtn.addEventListener("click", () => {
      addSnoozed(top.cask.token);
      closeModal();
      if (typeof onProceed === "function") onProceed();
    });
    const dismissBtn = document.createElement("button");
    dismissBtn.className = "bii-dismiss";
    dismissBtn.textContent = "Cancel";
    dismissBtn.addEventListener("click", closeModal);
    actions.appendChild(dismissBtn);
    actions.appendChild(proceedBtn);

    card.appendChild(closeBtn);
    card.appendChild(eyebrow);
    card.appendChild(title);
    card.appendChild(desc);
    card.appendChild(meta);
    card.appendChild(cmdWrap);
    if (altWrap) card.appendChild(altWrap);
    card.appendChild(actions);

    backdrop.appendChild(card);
    root.appendChild(backdrop);

    const escListener = (e) => {
      if (e.key === "Escape") {
        closeModal();
        document.removeEventListener("keydown", escListener, true);
      }
    };
    document.addEventListener("keydown", escListener, true);
  }

  async function handleDownloadIntent(url, target) {
    const snoozed = getSnoozed();
    let resp;
    try {
      resp = await chrome.runtime.sendMessage({
        type: "match",
        url,
        filename: basenameFromUrl(url),
      });
    } catch (err) {
      console.warn("[brewItInstead] match request failed:", err);
    }

    const hits = resp && resp.ok && Array.isArray(resp.hits) ? resp.hits : [];
    const top = hits[0];

    // No match, or the user has already snoozed this cask this session.
    // Re-trigger the download we suppressed.
    if (!top || snoozed.has(top.cask.token)) {
      triggerDownload(url, target);
      return;
    }

    showModal({
      hits,
      onProceed: () => {
        triggerDownload(url, target);
      },
    });
  }

  function triggerDownload(url, target) {
    if (target === "_blank") {
      window.open(url, "_blank", "noopener");
    } else {
      window.location.href = url;
    }
  }

  document.addEventListener("click", (e) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (e.defaultPrevented) return;

    const a = e.target && e.target.closest && e.target.closest("a[href]");
    if (!a) return;
    const href = a.href;
    if (!looksLikeDownload(href)) return;

    // Suppress the browser's download/navigation synchronously so it doesn't
    // race the async match request. We re-trigger it ourselves in
    // handleDownloadIntent if there's no cask match or the user proceeds.
    e.preventDefault();
    e.stopPropagation();

    handleDownloadIntent(href, a.target);
  }, true);
})();
