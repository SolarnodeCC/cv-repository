function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "className") node.className = value;
    else if (key === "text") node.textContent = value;
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

function field(label, input) {
  return el("label", { className: "field" }, [el("span", { text: label }), input]);
}

function textInput(value, onChange) {
  const input = el("input", { type: "text", value: value ?? "" });
  input.addEventListener("input", () => onChange(input.value));
  return input;
}

function textArea(value, onChange, rows = "3") {
  const input = el("textarea", { rows });
  input.value = value ?? "";
  input.addEventListener("input", () => onChange(input.value));
  return input;
}

function selectInput(value, options, onChange) {
  const select = el("select");
  for (const opt of options) {
    const o = el("option", { value: opt, text: opt });
    if (String(opt) === String(value)) o.selected = true;
    select.appendChild(o);
  }
  select.addEventListener("change", () => onChange(select.value));
  return select;
}

export function renderLocalePanel(root, doc, onChange, meta) {
  root.innerHTML = "";
  if (!doc.locale || typeof doc.locale !== "object") doc.locale = { language: "dutch" };
  const locale = doc.locale;
  const bump = () => onChange(doc);

  const sec = el("div", { className: "form-section" }, [
    el("h3", { text: "Locale" }),
    el("p", {
      className: "muted small",
      text: "Taalpreset vult standaardzinnen; pas daarna individuele velden aan.",
    }),
  ]);

  sec.appendChild(
    field(
      "Language",
      selectInput(locale.language || "dutch", meta.languages || ["dutch", "english"], (v) => {
        locale.language = v;
        const preset = meta.locale_presets?.[v];
        if (preset) Object.assign(locale, structuredClone(preset));
        bump();
        renderLocalePanel(root, doc, onChange, meta);
      })
    )
  );

  if (meta.phone_formats) {
    sec.appendChild(
      field(
        "Phone format",
        selectInput(locale.phone_number_format || "international", meta.phone_formats, (v) => {
          locale.phone_number_format = v;
          bump();
        })
      )
    );
  }

  for (const key of ["present", "to", "month", "months", "year", "years"]) {
    sec.appendChild(
      field(
        key,
        textInput(locale[key] || "", (v) => {
          locale[key] = v;
          bump();
        })
      )
    );
  }

  for (const key of ["date_template", "last_updated_date_template", "page_numbering_template"]) {
    sec.appendChild(
      field(
        key,
        textInput(locale[key] || "", (v) => {
          locale[key] = v;
          bump();
        })
      )
    );
  }

  sec.appendChild(
    field(
      "Month abbreviations (comma-separated)",
      textArea((locale.abbreviations_for_months || []).join(", "), (v) => {
        locale.abbreviations_for_months = v
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        bump();
      })
    )
  );
  sec.appendChild(
    field(
      "Full month names (comma-separated)",
      textArea((locale.full_names_of_months || []).join(", "), (v) => {
        locale.full_names_of_months = v
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        bump();
      }, "4")
    )
  );

  root.appendChild(sec);
}

export function renderSettingsPanel(root, doc, onChange) {
  root.innerHTML = "";
  if (!doc.settings || typeof doc.settings !== "object") {
    doc.settings = { current_date: "today", pdf_title: "CV", bold_keywords: [] };
  }
  const settings = doc.settings;
  if (!settings.render_command || typeof settings.render_command !== "object") {
    settings.render_command = {};
  }
  const rc = settings.render_command;
  const bump = () => onChange(doc);

  const sec = el("div", { className: "form-section" }, [el("h3", { text: "Settings" })]);
  sec.appendChild(
    field(
      "current_date",
      textInput(settings.current_date || "today", (v) => {
        settings.current_date = v;
        bump();
      })
    )
  );
  sec.appendChild(
    field(
      "pdf_title",
      textInput(settings.pdf_title || "CV", (v) => {
        settings.pdf_title = v;
        bump();
      })
    )
  );
  sec.appendChild(
    field(
      "bold_keywords (comma-separated)",
      textInput((settings.bold_keywords || []).join(", "), (v) => {
        settings.bold_keywords = v
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        bump();
      })
    )
  );

  const rcSec = el("div", { className: "form-section" }, [el("h3", { text: "render_command" })]);
  const pathKeys = [
    "output_folder",
    "typst_path",
    "pdf_path",
    "markdown_path",
    "html_path",
    "png_path",
  ];
  for (const key of pathKeys) {
    rcSec.appendChild(
      field(
        key,
        textInput(rc[key] || "", (v) => {
          rc[key] = v;
          bump();
        })
      )
    );
  }
  for (const key of [
    "dont_generate_markdown",
    "dont_generate_html",
    "dont_generate_typst",
    "dont_generate_pdf",
    "dont_generate_png",
  ]) {
    const input = el("input", { type: "checkbox" });
    input.checked = Boolean(rc[key]);
    input.addEventListener("change", () => {
      rc[key] = input.checked;
      bump();
    });
    rcSec.appendChild(el("label", { className: "field checkbox" }, [input, el("span", { text: key })]));
  }

  root.appendChild(sec);
  root.appendChild(rcSec);
}
