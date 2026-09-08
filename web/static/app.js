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

  let savedContent = "";
  let busy = false;
  let activePreview = "pdf";

  const editor = CodeMirror.fromTextArea(document.getElementById("yaml-source"), {
    mode: "yaml",
    theme: "material-darker",
    lineNumbers: true,
    lineWrapping: true,
    indentUnit: 2,
    tabSize: 2,
    viewportMargin: 80,
  });

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
    ["btn-reload", "btn-validate", "btn-save", "btn-render"].forEach((id) => {
      document.getElementById(id).disabled = next;
    });
  }

  function markDirty() {
    const dirty = editor.getValue() !== savedContent;
    dirtyBadge.hidden = !dirty;
  }

  async function api(path, options = {}) {
    const res = await fetch(path, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });
    const contentType = res.headers.get("content-type") || "";
    const body = contentType.includes("application/json") ? await res.json() : await res.text();
    if (!res.ok) {
      const detail = typeof body === "object" ? body.detail || JSON.stringify(body) : body;
      throw new Error(detail || res.statusText);
    }
    return body;
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
        try {
          await showPreview(activePreview, true);
        } catch {
          hideAllPreviews();
          previewEmpty.hidden = false;
        }
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
  document.getElementById("btn-reload").addEventListener("click", loadCv);
  document.getElementById("btn-save").addEventListener("click", saveCv);
  document.getElementById("btn-validate").addEventListener("click", validateCv);
  document.getElementById("btn-render").addEventListener("click", renderCv);

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
  });

  loadCv();
})();
