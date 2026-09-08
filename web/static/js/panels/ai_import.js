function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "className") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "html") node.innerHTML = value;
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value !== undefined && value !== null) node.setAttribute(key, value);
  }
  for (const child of children) {
    if (child == null) continue;
    node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

/**
 * @param {HTMLElement} root
 * @param {{
 *   getYaml: () => string,
 *   setYaml: (text: string, opts?: {source?: string}) => void,
 *   api: (path: string, opts?: object) => Promise<any>,
 *   setStatus: (msg: string, opts?: object) => void,
 *   aiConfigured: boolean,
 * }} ctx
 */
export function renderImportPanel(root, ctx) {
  root.innerHTML = "";
  const sec = el("div", { className: "form-section" }, [
    el("h3", { text: "Import" }),
    el("p", {
      className: "muted small",
      text: "Upload of plak RenderCV YAML of JSON Resume. PDF/DOCX/LinkedIn worden niet ondersteund.",
    }),
  ]);

  const formatSelect = el("select");
  for (const [value, label] of [
    ["auto", "Auto-detect"],
    ["yaml", "RenderCV YAML"],
    ["json-resume", "JSON Resume"],
  ]) {
    formatSelect.appendChild(el("option", { value, text: label }));
  }
  sec.appendChild(el("label", { className: "field" }, [el("span", { text: "Formaat" }), formatSelect]));

  const modeSelect = el("select");
  modeSelect.appendChild(el("option", { value: "replace", text: "Vervang document" }));
  modeSelect.appendChild(
    el("option", { value: "keep_design", text: "Vervang alleen CV (behoud design)" })
  );
  sec.appendChild(el("label", { className: "field" }, [el("span", { text: "Modus" }), modeSelect]));

  const fileInput = el("input", { type: "file", accept: ".yaml,.yml,.json,text/yaml,application/json" });
  sec.appendChild(el("label", { className: "field" }, [el("span", { text: "Bestand" }), fileInput]));

  const area = el("textarea", { rows: "12", placeholder: "Plak YAML of JSON Resume hier…" });
  sec.appendChild(el("label", { className: "field" }, [el("span", { text: "Plakken" }), area]));

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    area.value = await file.text();
  });

  const runImport = async () => {
    const content = area.value.trim();
    if (!content) {
      ctx.setStatus("Plak of upload eerst inhoud", { ok: false });
      return;
    }
    ctx.setStatus("Importeren…");
    try {
      const result = await ctx.api("/api/import", {
        method: "POST",
        body: JSON.stringify({
          content,
          format: formatSelect.value,
          mode: modeSelect.value,
          existing: modeSelect.value === "keep_design" ? ctx.getYaml() : null,
        }),
      });
      ctx.setYaml(result.content, { source: "import" });
      ctx.setStatus(result.message || "Import geslaagd", { ok: true });
    } catch (err) {
      ctx.setStatus(err.message || "Import mislukt", { ok: false });
    }
  };

  sec.appendChild(
    el("button", {
      type: "button",
      className: "btn primary",
      text: "Importeren in editor",
      onClick: runImport,
    })
  );
  root.appendChild(sec);
}

/**
 * @param {HTMLElement} root
 * @param {{
 *   getYaml: () => string,
 *   setYaml: (text: string, opts?: {source?: string}) => void,
 *   api: (path: string, opts?: object) => Promise<any>,
 *   setStatus: (msg: string, opts?: object) => void,
 *   setBusy: (b: boolean) => void,
 *   aiConfigured: boolean,
 * }} ctx
 */
export function renderAiPanel(root, ctx) {
  root.innerHTML = "";
  const sec = el("div", { className: "form-section" }, [el("h3", { text: "AI assistant" })]);

  if (!ctx.aiConfigured) {
    sec.appendChild(
      el("p", {
        className: "muted",
        text:
          "AI is niet geconfigureerd. Op Cloudflare gebruikt de hosted editor Workers AI (binding). Lokaal: zet AI_BASE_URL=https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/ai/v1 en AI_API_KEY=<Cloudflare API token>, of een andere OpenAI-compatible provider.",
      })
    );
    root.appendChild(sec);
    return;
  }

  sec.appendChild(
    el("p", {
      className: "muted small",
      text: "Provider: Cloudflare Workers AI (of geconfigureerde OpenAI-compatible endpoint). Voorstellen kun je accepteren of negeren.",
    })
  );

  const prompt = el("textarea", {
    rows: "4",
    placeholder: "Bijv. verbeter highlights met meetbare impact, of tailoren op de vacature hieronder…",
  });
  const job = el("textarea", {
    rows: "6",
    placeholder: "Optioneel: plak vacaturetekst om op te tailoren",
  });
  const thread = el("div", { className: "ai-thread" });
  const proposalsBox = el("div", { className: "ai-proposals" });

  sec.appendChild(el("label", { className: "field" }, [el("span", { text: "Vraag" }), prompt]));
  sec.appendChild(el("label", { className: "field" }, [el("span", { text: "Vacature (optioneel)" }), job]));
  sec.appendChild(
    el("button", {
      type: "button",
      className: "btn primary",
      text: "Vraag AI",
      onClick: async () => {
        const message = prompt.value.trim();
        if (!message) {
          ctx.setStatus("Typ eerst een vraag", { ok: false });
          return;
        }
        ctx.setBusy(true);
        ctx.setStatus("AI denkt na…");
        try {
          const result = await ctx.api("/api/ai/chat", {
            method: "POST",
            body: JSON.stringify({
              message,
              content: ctx.getYaml(),
              job_description: job.value.trim() || null,
            }),
          });
          thread.appendChild(
            el("div", { className: "ai-msg" }, [
              el("strong", { text: "AI" }),
              el("p", { text: result.message || "" }),
            ])
          );
          proposalsBox.innerHTML = "";
          for (const proposal of result.proposals || []) {
            const card = el("div", { className: "row-card" });
            card.appendChild(el("strong", { text: proposal.title || proposal.id || "Voorstel" }));
            if (proposal.rationale) card.appendChild(el("p", { className: "muted small", text: proposal.rationale }));
            if (proposal.path) {
              card.appendChild(el("p", { className: "muted small", text: `path: ${proposal.path}` }));
            }
            const preview = el("pre", { className: "ai-preview" });
            preview.textContent = proposal.full_yaml
              ? String(proposal.full_yaml).slice(0, 1200)
              : JSON.stringify(proposal.replacement, null, 2).slice(0, 1200);
            card.appendChild(preview);
            card.appendChild(
              el("button", {
                type: "button",
                className: "btn secondary small",
                text: "Accepteer",
                onClick: async () => {
                  ctx.setBusy(true);
                  try {
                    const applied = await ctx.api("/api/ai/apply", {
                      method: "POST",
                      body: JSON.stringify({ content: ctx.getYaml(), proposal }),
                    });
                    ctx.setYaml(applied.content, { source: "ai" });
                    ctx.setStatus(applied.message || "Voorstel toegepast", { ok: true });
                  } catch (err) {
                    ctx.setStatus(err.message || "Apply mislukt", { ok: false });
                  } finally {
                    ctx.setBusy(false);
                  }
                },
              })
            );
            proposalsBox.appendChild(card);
          }
          ctx.setStatus(result.ok ? "AI-voorstellen klaar" : result.message, {
            ok: result.ok,
            detail: result.ok ? null : result.message,
          });
        } catch (err) {
          ctx.setStatus(err.message || "AI mislukt", { ok: false });
        } finally {
          ctx.setBusy(false);
        }
      },
    })
  );
  sec.appendChild(thread);
  sec.appendChild(proposalsBox);
  root.appendChild(sec);
}
