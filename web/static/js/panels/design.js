import { hexToRgb, rgbToHex } from "../document.js";

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

function checkbox(value, onChange, label) {
  const input = el("input", { type: "checkbox" });
  input.checked = Boolean(value);
  input.addEventListener("change", () => onChange(input.checked));
  return el("label", { className: "field checkbox" }, [input, el("span", { text: label })]);
}

function colorField(label, value, onChange) {
  const hex = rgbToHex(value);
  const color = el("input", { type: "color", value: hex });
  const text = el("input", { type: "text", value: value || hex, className: "color-text" });
  color.addEventListener("input", () => {
    const rgb = hexToRgb(color.value);
    text.value = rgb;
    onChange(rgb);
  });
  text.addEventListener("change", () => onChange(text.value));
  return el("label", { className: "field" }, [
    el("span", { text: label }),
    el("div", { className: "color-row" }, [color, text]),
  ]);
}

function ensurePath(obj, path, fallback) {
  let cur = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (!cur[key] || typeof cur[key] !== "object") cur[key] = {};
    cur = cur[key];
  }
  const last = path[path.length - 1];
  if (cur[last] === undefined || cur[last] === null) cur[last] = fallback;
  return cur;
}

/**
 * @param {HTMLElement} root
 * @param {object} doc
 * @param {(doc: object) => void} onChange
 * @param {object} meta
 */
export function renderDesignPanel(root, doc, onChange, meta) {
  root.innerHTML = "";
  if (!doc.design || typeof doc.design !== "object") doc.design = { theme: "solarnode" };
  const design = doc.design;
  const bump = () => onChange(doc);

  const themeSec = el("div", { className: "form-section" }, [el("h3", { text: "Theme" })]);
  themeSec.appendChild(
    field(
      "Theme",
      selectInput(design.theme || "solarnode", meta.themes || ["solarnode"], (v) => {
        design.theme = v;
        if (v === "solarnode" && meta.design_defaults?.solarnode) {
          const defaults = structuredClone(meta.design_defaults.solarnode);
          Object.assign(design, defaults);
        }
        bump();
        renderDesignPanel(root, doc, onChange, meta);
      })
    )
  );
  root.appendChild(themeSec);

  // Page
  ensurePath(design, ["page"], {});
  const page = design.page;
  const pageSec = el("details", { className: "form-section collapsible", open: "open" }, [
    el("summary", { text: "Page" }),
  ]);
  const pageGrid = el("div", { className: "form-grid" });
  pageGrid.appendChild(
    field(
      "Size",
      selectInput(page.size || "a4", meta.page_sizes || ["a4"], (v) => {
        page.size = v;
        bump();
      })
    )
  );
  for (const key of ["top_margin", "bottom_margin", "left_margin", "right_margin"]) {
    pageGrid.appendChild(
      field(
        key,
        textInput(page[key] || "", (v) => {
          page[key] = v;
          bump();
        })
      )
    );
  }
  pageSec.appendChild(pageGrid);
  pageSec.appendChild(
    checkbox(page.show_footer, (v) => {
      page.show_footer = v;
      bump();
    }, "Show footer")
  );
  pageSec.appendChild(
    checkbox(page.show_top_note, (v) => {
      page.show_top_note = v;
      bump();
    }, "Show top note")
  );
  root.appendChild(pageSec);

  // Colors
  ensurePath(design, ["colors"], {});
  const colors = design.colors;
  const colorSec = el("details", { className: "form-section collapsible", open: "open" }, [
    el("summary", { text: "Colors" }),
  ]);
  const colorGrid = el("div", { className: "form-grid" });
  for (const key of Object.keys(colors).length
    ? Object.keys(colors)
    : ["body", "name", "headline", "connections", "section_titles", "links", "footer", "top_note"]) {
    colorGrid.appendChild(
      colorField(key, colors[key], (v) => {
        colors[key] = v;
        bump();
      })
    );
  }
  colorSec.appendChild(colorGrid);
  root.appendChild(colorSec);

  // Typography
  ensurePath(design, ["typography", "font_family"], {});
  ensurePath(design, ["typography", "font_size"], {});
  const typo = design.typography;
  const typoSec = el("details", { className: "form-section collapsible" }, [el("summary", { text: "Typography" })]);
  typoSec.appendChild(
    field(
      "Alignment",
      selectInput(typo.alignment || "justified", meta.alignments || ["justified"], (v) => {
        typo.alignment = v;
        bump();
      })
    )
  );
  typoSec.appendChild(
    field(
      "Line spacing",
      textInput(typo.line_spacing || "", (v) => {
        typo.line_spacing = v;
        bump();
      })
    )
  );
  const fontGrid = el("div", { className: "form-grid" });
  for (const key of ["body", "name", "headline", "connections", "section_titles"]) {
    fontGrid.appendChild(
      field(
        `Font ${key}`,
        selectInput(
          typo.font_family?.[key] || "Source Sans 3",
          meta.font_families || ["Source Sans 3"],
          (v) => {
            if (!typo.font_family) typo.font_family = {};
            typo.font_family[key] = v;
            bump();
          }
        )
      )
    );
    fontGrid.appendChild(
      field(
        `Size ${key}`,
        textInput(typo.font_size?.[key] || "", (v) => {
          if (!typo.font_size) typo.font_size = {};
          typo.font_size[key] = v;
          bump();
        })
      )
    );
  }
  typoSec.appendChild(fontGrid);
  root.appendChild(typoSec);

  // Links / section titles / entries
  ensurePath(design, ["links"], {});
  ensurePath(design, ["section_titles"], {});
  ensurePath(design, ["entries", "highlights"], {});
  const misc = el("details", { className: "form-section collapsible" }, [el("summary", { text: "Links & entries" })]);
  misc.appendChild(
    checkbox(design.links.underline, (v) => {
      design.links.underline = v;
      bump();
    }, "Underline links")
  );
  misc.appendChild(
    checkbox(design.links.show_external_link_icon, (v) => {
      design.links.show_external_link_icon = v;
      bump();
    }, "External link icon")
  );
  misc.appendChild(
    field(
      "Section title type",
      selectInput(
        design.section_titles.type || "with_partial_line",
        meta.section_title_types || ["with_partial_line"],
        (v) => {
          design.section_titles.type = v;
          bump();
        }
      )
    )
  );
  for (const key of ["space_above", "space_below"]) {
    misc.appendChild(
      field(
        `Section ${key}`,
        textInput(design.section_titles[key] || "", (v) => {
          design.section_titles[key] = v;
          bump();
        })
      )
    );
  }
  for (const key of [
    "date_and_location_width",
    "side_space",
    "space_between_columns",
    "degree_width",
  ]) {
    misc.appendChild(
      field(
        key,
        textInput(design.entries[key] || "", (v) => {
          design.entries[key] = v;
          bump();
        })
      )
    );
  }
  misc.appendChild(
    checkbox(design.entries.allow_page_break, (v) => {
      design.entries.allow_page_break = v;
      bump();
    }, "Allow page break")
  );
  misc.appendChild(
    field(
      "Bullet",
      selectInput(design.entries.highlights?.bullet || "•", meta.bullets || ["•"], (v) => {
        if (!design.entries.highlights) design.entries.highlights = {};
        design.entries.highlights.bullet = v;
        bump();
      })
    )
  );
  root.appendChild(misc);
}
