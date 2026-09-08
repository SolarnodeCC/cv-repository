(() => {
  const statusBar = document.querySelector(".statusbar");
  const statusText = document.getElementById("status-text");
  const logPanel = document.getElementById("log-panel");
  const toggleLog = document.getElementById("btn-toggle-log");
  const dirtyBadge = document.getElementById("dirty-badge");
  const previewEmpty = document.getElementById("preview-empty");
  const previewPdf = document.getElementById("preview-pdf");
  const previewPng = document.getElementById("preview-png");
  const previewHtml = document.getElementById("preview-html");
  const checklistPanel = document.getElementById("checklist-panel");
  const checklistItems = document.getElementById("checklist-items");
  const checklistSummary = document.getElementById("checklist-summary");
  const scoreValue = document.getElementById("score-value");
  const scoreRing = document.getElementById("score-ring");
  const scoreLabel = document.getElementById("score-label");
  const downloadBtn = document.getElementById("btn-download");
  const wakeBanner = document.getElementById("wake-banner");

  let savedContent = "";
  let busy = false;
  // PNG is the reliable visual preview (PDF iframes often blank in headless/some browsers).
  let activePreview = "png";

  const editor = CodeMirror.fromTextArea(document.getElementById("yaml-source"), {
    mode: "yaml",
    theme: "material-darker",
    lineNumbers: true,
    lineWrapping: true,
    indentUnit: 2,
    tabSize: 2,
    viewportMargin: 80,
  });

  function setWake(visible) {
    if (wakeBanner) wakeBanner.hidden = !visible;
  }

  function setStatus(message, { ok, detail } = {}) {
    statusText.textContent = message;
    statusBar.classList.toggle("ok", ok === true);
    statusBar.classList.toggle("err", ok === false);
    if (detail) {
      logPanel.textContent = detail;
      toggleLog.hidden = false;
    } else {
      logPanel.textContent = "";
      logPanel.hidden = true;
      toggleLog.hidden = true;
      toggleLog.textContent = "Toon log";
    }
  }

  function setBusy(next) {
    busy = next;
    ["btn-hydrate", "btn-reload", "btn-validate", "btn-check", "btn-save", "btn-render", "btn-sync-git"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.disabled = next;
    });
  }

  function markDirty() {
    const dirty = editor.getValue() !== savedContent;
    dirtyBadge.hidden = !dirty;
  }

  async function api(path, options = {}) {
    const started = Date.now();
    const wakeTimer = setTimeout(() => setWake(true), 2000);
    try {
      const res = await fetch(path, {
        headers: { "Content-Type": "application/json", ...(options.headers || {}) },
        ...options,
      });
      const contentType = res.headers.get("content-type") || "";
      const body = contentType.includes("application/json") ? await res.json() : await res.text();
      if (!res.ok) {
        let detail = res.statusText;
        if (typeof body === "object" && body) {
          if (typeof body.detail === "string") detail = body.detail;
          else if (Array.isArray(body.detail)) detail = body.detail.map((d) => d.msg || JSON.stringify(d)).join("; ");
          else detail = JSON.stringify(body);
        } else if (typeof body === "string" && body) {
          detail = body;
        }
        throw new Error(detail);
      }
      return body;
    } finally {
      clearTimeout(wakeTimer);
      if (Date.now() - started > 2500) {
        // Keep banner briefly so the user saw the wake hint.
        setTimeout(() => setWake(false), 800);
      } else {
        setWake(false);
      }
    }
  }

  function renderChecklist(result) {
    checklistPanel.hidden = false;
    checklistSummary.textContent = result.summary;
    scoreValue.textContent = String(result.score);
    scoreRing.dataset.score = String(result.score);
    scoreRing.style.setProperty("--score", String(result.score));
    scoreLabel.textContent = result.ready
      ? "Indientklaar"
      : result.errors
        ? "Blokkers oplossen"
        : "Bijna klaar";
    scoreRing.classList.toggle("ready", Boolean(result.ready));
    scoreRing.classList.toggle("blocked", Boolean(result.errors));

    checklistItems.innerHTML = "";
    for (const check of result.checks || []) {
      const li = document.createElement("li");
      li.className = `check-item ${check.ok ? "ok" : check.severity}`;
      li.innerHTML = `<span class="check-mark" aria-hidden="true"></span><div><strong>${check.label}</strong><p>${check.detail}</p></div>`;
      checklistItems.appendChild(li);
    }
  }

  async function runChecklist({ silent } = {}) {
    if (!silent) setBusy(true);
    if (!silent) setStatus("Sollicitatie-check…");
    try {
      const result = await api("/api/checklist", {
        method: "POST",
        body: JSON.stringify({ content: editor.getValue() }),
      });
      renderChecklist(result);
      if (!silent) {
        setStatus(result.summary, { ok: result.ready });
      }
      return result;
    } catch (err) {
      if (!silent) setStatus(err.message || "Check mislukt", { ok: false });
      return null;
    } finally {
      if (!silent) setBusy(false);
    }
  }

  async function hydrateCv() {
    setBusy(true);
    setStatus("R2 sync…");
    try {
      const result = await api("/api/hydrate", { method: "POST", body: "{}" });
      const data = await api("/api/cv");
      savedContent = data.content;
      editor.setValue(data.content);
      markDirty();
      setStatus(result.message, { ok: true });
      await tryShowPreview(true);
      await runChecklist({ silent: true });
    } catch (err) {
      setStatus(err.message || "R2 sync mislukt", { ok: false });
    } finally {
      setBusy(false);
    }
  }

  async function loadCv() {
    setBusy(true);
    try {
      const data = await api("/api/cv");
      savedContent = data.content;
      editor.setValue(data.content);
      markDirty();
      setStatus("cv.yaml geladen");
      await tryShowPreview(false);
      await runChecklist({ silent: true });
    } catch (err) {
      setStatus(err.message || "Laden mislukt", { ok: false });
    } finally {
      setBusy(false);
    }
  }

  async function saveCv() {
    setBusy(true);
    setStatus("Opslaan…");
    try {
      const content = editor.getValue();
      const result = await api("/api/cv", {
        method: "PUT",
        body: JSON.stringify({ content }),
      });
      savedContent = content;
      markDirty();
      setStatus(result.message, { ok: true });
      await runChecklist({ silent: true });
    } catch (err) {
      setStatus(err.message || "Opslaan mislukt", { ok: false });
    } finally {
      setBusy(false);
    }
  }

  async function validateCv() {
    setBusy(true);
    setStatus("Valideren…");
    try {
      const result = await api("/api/validate", {
        method: "POST",
        body: JSON.stringify({ content: editor.getValue() }),
      });
      setStatus(result.message, { ok: result.ok, detail: result.detail });
    } catch (err) {
      setStatus(err.message || "Validatie mislukt", { ok: false });
    } finally {
      setBusy(false);
    }
  }

  async function syncGit() {
    setBusy(true);
    setStatus("Sync naar Git… (draft PR)");
    try {
      const result = await api("/api/sync-git", {
        method: "POST",
        body: JSON.stringify({ content: editor.getValue(), draft: true }),
      });
      savedContent = editor.getValue();
      markDirty();
      const msg = result.pr_url
        ? `Draft PR: ${result.pr_url}`
        : result.message || "Git sync klaar";
      setStatus(msg, { ok: true, detail: result.branch ? `branch: ${result.branch}` : null });
    } catch (err) {
      setStatus(err.message || "Git sync mislukt", { ok: false });
    } finally {
      setBusy(false);
    }
  }

  async function renderCv() {
    setBusy(true);
    setStatus("Renderen… (RenderCV + Typst)");
    try {
      const result = await api("/api/render", {
        method: "POST",
        body: JSON.stringify({ content: editor.getValue() }),
      });
      if (result.ok) {
        savedContent = editor.getValue();
        markDirty();
        downloadBtn.href = `/api/download/pdf?t=${Date.now()}`;
        try {
          await showPreview(activePreview, true);
        } catch {
          hideAllPreviews();
          previewEmpty.hidden = false;
        }
        await runChecklist({ silent: true });
      }
      setStatus(result.message, { ok: result.ok, detail: result.detail });
    } catch (err) {
      setStatus(err.message || "Render mislukt", { ok: false });
    } finally {
      setBusy(false);
    }
  }

  function hideAllPreviews() {
    previewPdf.hidden = true;
    previewPng.hidden = true;
    previewHtml.hidden = true;
    previewEmpty.hidden = true;
  }

  async function tryShowPreview(bust) {
    try {
      await showPreview(activePreview, bust);
    } catch {
      // Prefer PNG fallback when PDF iframe is unavailable.
      if (activePreview !== "png") {
        try {
          await showPreview("png", bust);
          return;
        } catch {
          /* fall through */
        }
      }
      hideAllPreviews();
      previewEmpty.hidden = false;
    }
  }

  async function showPreview(kind, bust = true) {
    const stamp = bust ? `?t=${Date.now()}` : "";
    hideAllPreviews();
    const status = await api("/api/preview/status");

    if (kind === "pdf") {
      if (!status.pdf) throw new Error("geen pdf");
      previewPdf.src = `/api/preview/pdf${stamp}`;
      previewPdf.hidden = false;
      downloadBtn.classList.toggle("disabled", false);
      return;
    }
    if (kind === "png") {
      if (!status.png) throw new Error("geen png");
      previewPng.src = `/api/preview/png${stamp}`;
      await new Promise((resolve, reject) => {
        previewPng.onload = resolve;
        previewPng.onerror = () => reject(new Error("geen png"));
      });
      previewPng.hidden = false;
      return;
    }
    if (kind === "html") {
      if (!status.html) throw new Error("geen html");
      previewHtml.src = `/api/preview/html${stamp}`;
      previewHtml.hidden = false;
    }
  }

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", async () => {
      document.querySelectorAll(".tab").forEach((t) => {
        t.classList.toggle("active", t === tab);
        t.setAttribute("aria-selected", t === tab ? "true" : "false");
      });
      activePreview = tab.dataset.preview;
      try {
        await showPreview(activePreview, true);
      } catch {
        hideAllPreviews();
        previewEmpty.hidden = false;
      }
    });
  });

  toggleLog.addEventListener("click", () => {
    const open = logPanel.hidden;
    logPanel.hidden = !open;
    toggleLog.textContent = open ? "Verberg log" : "Toon log";
  });

  editor.on("change", markDirty);
  document.getElementById("btn-hydrate").addEventListener("click", hydrateCv);
  document.getElementById("btn-reload").addEventListener("click", loadCv);
  document.getElementById("btn-save").addEventListener("click", saveCv);
  document.getElementById("btn-validate").addEventListener("click", validateCv);
  document.getElementById("btn-render").addEventListener("click", renderCv);
  document.getElementById("btn-sync-git").addEventListener("click", syncGit);
  document.getElementById("btn-check").addEventListener("click", () => runChecklist());
  document.getElementById("btn-close-check").addEventListener("click", () => {
    checklistPanel.hidden = true;
  });

  function relayoutEditor() {
    const wrap = editor.getWrapperElement().parentElement;
    if (wrap) {
      const head = wrap.querySelector(".pane-head");
      const available = Math.max(200, wrap.clientHeight - (head ? head.offsetHeight : 0));
      editor.setSize("100%", available);
    }
    editor.refresh();
  }
  window.addEventListener("resize", relayoutEditor);
  requestAnimationFrame(relayoutEditor);

  window.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      if (!busy) saveCv();
    }
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      if (!busy) renderCv();
    }
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "c") {
      event.preventDefault();
      if (!busy) runChecklist();
    }
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "g") {
      event.preventDefault();
      if (!busy) syncGit();
    }
  });

  // Prefer /api/wake on hosted editor (Worker); fall back to /api/health locally.
  (async () => {
    setWake(true);
    try {
      const started = Date.now();
      let res = await fetch("/api/wake");
      if (!res.ok) res = await fetch("/api/health");
      await res.json().catch(() => ({}));
      if (Date.now() - started < 2000) setWake(false);
      else setTimeout(() => setWake(false), 600);
    } catch {
      setWake(false);
    }
  })();

  loadCv();
})();