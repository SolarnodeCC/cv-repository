import { ensureCvShape, parseDocument, stringifyDocument } from "./document.js";
import { renderCvPanel } from "./panels/cv.js";
import { renderDesignPanel } from "./panels/design.js";
import { renderLocalePanel, renderSettingsPanel } from "./panels/locale_settings.js";
import { renderAiPanel, renderImportPanel } from "./panels/ai_import.js";

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
const formRoot = document.getElementById("form-root");
const yamlPane = document.getElementById("yaml-pane");
const formPane = document.getElementById("form-pane");
const modeBadge = document.getElementById("edit-mode-label");

let savedContent = "";
let busy = false;
let activePreview = "png";
let activePanel = "cv";
let editMode = "form"; // form | yaml
let doc = { cv: {}, design: {}, locale: {}, settings: {} };
let meta = {};
let aiConfigured = false;
let suppressEditorChange = false;
let yamlParseError = null;

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
  [
    "btn-hydrate",
    "btn-reload",
    "btn-validate",
    "btn-check",
    "btn-save",
    "btn-render",
    "btn-sync-git",
    "btn-publish",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = next;
  });
}

function markDirty() {
  dirtyBadge.hidden = getYaml() === savedContent;
}

function getYaml() {
  if (editMode === "form" && !yamlParseError) {
    try {
      return stringifyDocument(doc);
    } catch {
      return editor.getValue();
    }
  }
  return editor.getValue();
}

function syncEditorFromDoc() {
  suppressEditorChange = true;
  try {
    const text = stringifyDocument(doc);
    if (editor.getValue() !== text) editor.setValue(text);
    yamlParseError = null;
  } finally {
    suppressEditorChange = false;
  }
  markDirty();
}

function loadDocFromYaml(text, { quiet } = {}) {
  try {
    doc = ensureCvShape(parseDocument(text));
    yamlParseError = null;
    if (!quiet) setStatus("Document geladen");
    return true;
  } catch (err) {
    yamlParseError = err.message || String(err);
    if (!quiet) setStatus(yamlParseError, { ok: false });
    return false;
  }
}

function setYaml(text, { source } = {}) {
  suppressEditorChange = true;
  try {
    editor.setValue(text);
  } finally {
    suppressEditorChange = false;
  }
  loadDocFromYaml(text, { quiet: true });
  markDirty();
  if (editMode === "form") renderActivePanel();
  if (source) setStatus(`Bijgewerkt via ${source}`);
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
        else if (Array.isArray(body.detail)) {
          detail = body.detail.map((d) => d.msg || JSON.stringify(d)).join("; ");
        } else detail = JSON.stringify(body);
      } else if (typeof body === "string" && body) {
        detail = body;
      }
      throw new Error(detail);
    }
    return body;
  } finally {
    clearTimeout(wakeTimer);
    if (Date.now() - started > 2500) setTimeout(() => setWake(false), 800);
    else setWake(false);
  }
}

function onDocChange() {
  syncEditorFromDoc();
}

function renderActivePanel() {
  if (!formRoot) return;
  if (yamlParseError) {
    formRoot.innerHTML = "";
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = `YAML is ongeldig voor form-modus: ${yamlParseError}. Corrigeer in YAML-tab.`;
    formRoot.appendChild(p);
    return;
  }
  const ctx = {
    getYaml,
    setYaml,
    api,
    setStatus,
    setBusy,
    aiConfigured,
  };
  if (activePanel === "cv") renderCvPanel(formRoot, doc, onDocChange, meta);
  else if (activePanel === "design") renderDesignPanel(formRoot, doc, onDocChange, meta);
  else if (activePanel === "locale") renderLocalePanel(formRoot, doc, onDocChange, meta);
  else if (activePanel === "settings") renderSettingsPanel(formRoot, doc, onDocChange);
  else if (activePanel === "import") renderImportPanel(formRoot, ctx);
  else if (activePanel === "ai") renderAiPanel(formRoot, ctx);
}

function setEditMode(mode) {
  editMode = mode;
  if (modeBadge) modeBadge.textContent = mode === "form" ? "Form" : "YAML";
  document.querySelectorAll("[data-edit-mode]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.editMode === mode);
  });
  if (mode === "yaml") {
    if (!yamlParseError) syncEditorFromDoc();
    formPane.hidden = true;
    yamlPane.hidden = false;
    requestAnimationFrame(relayoutEditor);
  } else {
    const ok = loadDocFromYaml(editor.getValue(), { quiet: true });
    if (!ok) {
      setStatus(yamlParseError || "YAML ongeldig", { ok: false });
    }
    yamlPane.hidden = true;
    formPane.hidden = false;
    renderActivePanel();
  }
}

function setPanel(panel) {
  activePanel = panel;
  document.querySelectorAll("[data-panel]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.panel === panel);
  });
  if (editMode !== "form") setEditMode("form");
  else renderActivePanel();
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
      body: JSON.stringify({ content: getYaml() }),
    });
    renderChecklist(result);
    if (!silent) setStatus(result.summary, { ok: result.ready });
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
    setYaml(data.content);
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
    setYaml(data.content);
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
    const content = getYaml();
    if (editMode === "form") {
      suppressEditorChange = true;
      editor.setValue(content);
      suppressEditorChange = false;
    }
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
      body: JSON.stringify({ content: getYaml() }),
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
    const content = getYaml();
    const result = await api("/api/sync-git", {
      method: "POST",
      body: JSON.stringify({ content, draft: true }),
    });
    savedContent = content;
    markDirty();
    const msg = result.pr_url ? `Draft PR: ${result.pr_url}` : result.message || "Git sync klaar";
    setStatus(msg, { ok: true, detail: result.branch ? `branch: ${result.branch}` : null });
  } catch (err) {
    setStatus(err.message || "Git sync mislukt", { ok: false });
  } finally {
    setBusy(false);
  }
}

async function publishCv() {
  setBusy(true);
  setStatus("Publiceren naar R2…");
  try {
    const result = await api("/api/publish", { method: "POST", body: "{}" });
    setStatus(result.message, { ok: result.ok, detail: result.detail });
  } catch (err) {
    setStatus(err.message || "Publish mislukt", { ok: false });
  } finally {
    setBusy(false);
  }
}

async function renderCv() {
  setBusy(true);
  setStatus("Renderen… (RenderCV + Typst)");
  try {
    const content = getYaml();
    if (editMode === "form") {
      suppressEditorChange = true;
      editor.setValue(content);
      suppressEditorChange = false;
    }
    const result = await api("/api/render", {
      method: "POST",
      body: JSON.stringify({ content }),
    });
    if (result.ok) {
      savedContent = content;
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

function relayoutEditor() {
  const wrap = editor.getWrapperElement().parentElement;
  if (wrap) {
    const head = wrap.querySelector(".pane-head");
    const available = Math.max(200, wrap.clientHeight - (head ? head.offsetHeight : 0));
    editor.setSize("100%", available);
  }
  editor.refresh();
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

editor.on("change", () => {
  if (suppressEditorChange) return;
  markDirty();
  if (editMode === "yaml") {
    loadDocFromYaml(editor.getValue(), { quiet: true });
  }
});

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
const publishBtn = document.getElementById("btn-publish");
if (publishBtn) publishBtn.addEventListener("click", publishCv);

document.querySelectorAll("[data-panel]").forEach((btn) => {
  btn.addEventListener("click", () => setPanel(btn.dataset.panel));
});
document.querySelectorAll("[data-edit-mode]").forEach((btn) => {
  btn.addEventListener("click", () => setEditMode(btn.dataset.editMode));
});

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

(async () => {
  setWake(true);
  try {
    meta = await api("/api/schema-meta");
  } catch {
    meta = {};
  }
  try {
    const started = Date.now();
    let res = await fetch("/api/wake");
    if (!res.ok) res = await fetch("/api/health");
    const body = await res.json().catch(() => ({}));
    const health = body.health || body;
    aiConfigured = Boolean(health.ai_configured);
    const syncBtn = document.getElementById("btn-sync-git");
    if (syncBtn && health.git_sync === false) {
      syncBtn.title = "Git sync niet geconfigureerd (GITHUB_TOKEN / Worker secret)";
      syncBtn.classList.add("disabled");
    }
    if (publishBtn && health.r2_sync === false) {
      publishBtn.title = "R2 sync uit";
      publishBtn.classList.add("disabled");
    }
    if (Date.now() - started < 2000) setWake(false);
    else setTimeout(() => setWake(false), 600);
  } catch {
    setWake(false);
  }
  setEditMode("form");
  setPanel("cv");
  await loadCv();
})();
