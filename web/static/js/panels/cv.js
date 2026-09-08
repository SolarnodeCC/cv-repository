import { blankEntry, detectEntryType } from "../document.js";

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "className") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value !== undefined && value !== null) node.setAttribute(key, value);
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

function textInput(value, onChange, attrs = {}) {
  const input = el("input", { type: "text", value: value ?? "", ...attrs });
  input.addEventListener("input", () => onChange(input.value));
  return input;
}

function textArea(value, onChange, attrs = {}) {
  const input = el("textarea", { rows: attrs.rows || "3", ...attrs });
  input.value = value ?? "";
  input.addEventListener("input", () => onChange(input.value));
  return input;
}

function selectInput(value, options, onChange) {
  const select = el("select");
  for (const opt of options) {
    const o = el("option", { value: opt, text: opt });
    if (opt === value) o.selected = true;
    select.appendChild(o);
  }
  select.addEventListener("change", () => onChange(select.value));
  return select;
}

/**
 * @param {HTMLElement} root
 * @param {object} doc
 * @param {(doc: object) => void} onChange
 * @param {object} meta
 */
export function renderCvPanel(root, doc, onChange, meta) {
  root.innerHTML = "";
  const cv = doc.cv || {};
  const bump = () => onChange(doc);

  const header = el("div", { className: "form-section" }, [
    el("h3", { text: "Header" }),
  ]);
  const grid = el("div", { className: "form-grid" });
  const headerFields = [
    ["name", "Naam"],
    ["headline", "Headline"],
    ["location", "Locatie"],
    ["email", "E-mail"],
    ["phone", "Telefoon"],
    ["website", "Website"],
    ["photo", "Foto URL"],
  ];
  for (const [key, label] of headerFields) {
    grid.appendChild(
      field(
        label,
        textInput(cv[key] ?? "", (v) => {
          cv[key] = v;
          bump();
        })
      )
    );
  }
  header.appendChild(grid);
  root.appendChild(header);

  // Social networks
  if (!Array.isArray(cv.social_networks)) cv.social_networks = [];
  const socialSec = el("div", { className: "form-section" }, [el("h3", { text: "Social networks" })]);
  const socialList = el("div", { className: "stack" });
  const redrawSocial = () => {
    socialList.innerHTML = "";
    cv.social_networks.forEach((sn, idx) => {
      const row = el("div", { className: "row-card" });
      row.appendChild(
        field(
          "Network",
          selectInput(sn.network || "GitHub", meta.social_networks || ["GitHub", "LinkedIn"], (v) => {
            sn.network = v;
            bump();
          })
        )
      );
      row.appendChild(
        field(
          "Username",
          textInput(sn.username || "", (v) => {
            sn.username = v;
            bump();
          })
        )
      );
      row.appendChild(
        el("button", {
          type: "button",
          className: "btn ghost small",
          text: "Verwijder",
          onClick: () => {
            cv.social_networks.splice(idx, 1);
            bump();
            renderCvPanel(root, doc, onChange, meta);
          },
        })
      );
      socialList.appendChild(row);
    });
  };
  redrawSocial();
  socialSec.appendChild(socialList);
  socialSec.appendChild(
    el("button", {
      type: "button",
      className: "btn secondary small",
      text: "Netwerk toevoegen",
      onClick: () => {
        cv.social_networks.push({ network: "LinkedIn", username: "" });
        bump();
        renderCvPanel(root, doc, onChange, meta);
      },
    })
  );
  root.appendChild(socialSec);

  // Sections
  if (!cv.sections || typeof cv.sections !== "object") cv.sections = {};
  const sectionsSec = el("div", { className: "form-section" }, [el("h3", { text: "Secties" })]);
  const sectionNames = Object.keys(cv.sections);

  sectionNames.forEach((name, sIdx) => {
    const entries = Array.isArray(cv.sections[name]) ? cv.sections[name] : [];
    cv.sections[name] = entries;
    const card = el("details", { className: "section-card", open: sIdx === 0 ? "open" : null });
    const summary = el("summary");
    const titleInput = textInput(name, (v) => {
      const trimmed = v.trim() || "Sectie";
      if (trimmed === name) return;
      const values = cv.sections[name];
      delete cv.sections[name];
      cv.sections[trimmed] = values;
      bump();
      renderCvPanel(root, doc, onChange, meta);
    }, { className: "inline-title" });
    summary.appendChild(titleInput);
    summary.appendChild(
      el("button", {
        type: "button",
        className: "btn ghost small",
        text: "Verwijder sectie",
        onClick: (e) => {
          e.preventDefault();
          e.stopPropagation();
          delete cv.sections[name];
          bump();
          renderCvPanel(root, doc, onChange, meta);
        },
      })
    );
    card.appendChild(summary);

    entries.forEach((entry, eIdx) => {
      const type = detectEntryType(entry);
      const entryCard = el("div", { className: "row-card" });
      entryCard.appendChild(el("div", { className: "muted small", text: type }));

      if (type === "TextEntry") {
        entryCard.appendChild(
          textArea(typeof entry === "string" ? entry : "", (v) => {
            entries[eIdx] = v;
            bump();
          }, { rows: "4" })
        );
      } else if (type === "OneLineEntry") {
        entryCard.appendChild(
          field(
            "Label",
            textInput(entry.label || "", (v) => {
              entry.label = v;
              bump();
            })
          )
        );
        entryCard.appendChild(
          field(
            "Details",
            textInput(entry.details || "", (v) => {
              entry.details = v;
              bump();
            })
          )
        );
      } else if (type === "BulletEntry") {
        entryCard.appendChild(
          field(
            "Bullet",
            textInput(entry.bullet || "", (v) => {
              entry.bullet = v;
              bump();
            })
          )
        );
      } else if (type === "NumberedEntry") {
        entryCard.appendChild(
          field(
            "Number",
            textInput(entry.number || "", (v) => {
              entry.number = v;
              bump();
            })
          )
        );
      } else if (type === "PublicationEntry") {
        for (const [key, label] of [
          ["title", "Title"],
          ["journal", "Journal"],
          ["date", "Date"],
          ["doi", "DOI"],
          ["url", "URL"],
        ]) {
          entryCard.appendChild(
            field(
              label,
              textInput(entry[key] || "", (v) => {
                entry[key] = v;
                bump();
              })
            )
          );
        }
        entryCard.appendChild(
          field(
            "Authors (comma-separated)",
            textInput((entry.authors || []).join(", "), (v) => {
              entry.authors = v.split(",").map((s) => s.trim()).filter(Boolean);
              bump();
            })
          )
        );
      } else {
        const keys =
          type === "ExperienceEntry"
            ? [
                ["company", "Company"],
                ["position", "Position"],
                ["location", "Location"],
                ["start_date", "Start"],
                ["end_date", "End"],
                ["summary", "Summary"],
              ]
            : type === "EducationEntry"
              ? [
                  ["institution", "Institution"],
                  ["area", "Area"],
                  ["degree", "Degree"],
                  ["location", "Location"],
                  ["start_date", "Start"],
                  ["end_date", "End"],
                ]
              : [
                  ["name", "Name"],
                  ["location", "Location"],
                  ["date", "Date"],
                  ["start_date", "Start"],
                  ["end_date", "End"],
                  ["summary", "Summary"],
                ];
        for (const [key, label] of keys) {
          const control =
            key === "summary"
              ? textArea(entry[key] || "", (v) => {
                  entry[key] = v;
                  bump();
                }, { rows: "2" })
              : textInput(entry[key] || "", (v) => {
                  entry[key] = v;
                  bump();
                });
          entryCard.appendChild(field(label, control));
        }
        if (!Array.isArray(entry.highlights)) entry.highlights = [];
        const hlWrap = el("div", { className: "stack tight" }, [el("strong", { text: "Highlights" })]);
        entry.highlights.forEach((hl, hIdx) => {
          const row = el("div", { className: "inline-row" });
          row.appendChild(
            textArea(hl || "", (v) => {
              entry.highlights[hIdx] = v;
              bump();
            }, { rows: "2" })
          );
          row.appendChild(
            el("button", {
              type: "button",
              className: "btn ghost small",
              text: "×",
              onClick: () => {
                entry.highlights.splice(hIdx, 1);
                bump();
                renderCvPanel(root, doc, onChange, meta);
              },
            })
          );
          hlWrap.appendChild(row);
        });
        hlWrap.appendChild(
          el("button", {
            type: "button",
            className: "btn ghost small",
            text: "Highlight +",
            onClick: () => {
              entry.highlights.push("");
              bump();
              renderCvPanel(root, doc, onChange, meta);
            },
          })
        );
        entryCard.appendChild(hlWrap);
      }

      entryCard.appendChild(
        el("button", {
          type: "button",
          className: "btn ghost small",
          text: "Verwijder entry",
          onClick: () => {
            entries.splice(eIdx, 1);
            bump();
            renderCvPanel(root, doc, onChange, meta);
          },
        })
      );
      card.appendChild(entryCard);
    });

    const addRow = el("div", { className: "inline-row" });
    const typeSelect = selectInput(
      "ExperienceEntry",
      meta.entry_types || [
        "ExperienceEntry",
        "EducationEntry",
        "NormalEntry",
        "OneLineEntry",
        "TextEntry",
        "BulletEntry",
        "PublicationEntry",
      ],
      () => {}
    );
    addRow.appendChild(typeSelect);
    addRow.appendChild(
      el("button", {
        type: "button",
        className: "btn secondary small",
        text: "Entry toevoegen",
        onClick: () => {
          entries.push(blankEntry(typeSelect.value));
          bump();
          renderCvPanel(root, doc, onChange, meta);
        },
      })
    );
    card.appendChild(addRow);
    sectionsSec.appendChild(card);
  });

  sectionsSec.appendChild(
    el("button", {
      type: "button",
      className: "btn secondary small",
      text: "Sectie toevoegen",
      onClick: () => {
        let base = "Nieuwe sectie";
        let name = base;
        let i = 2;
        while (name in cv.sections) {
          name = `${base} ${i++}`;
        }
        cv.sections[name] = [""];
        bump();
        renderCvPanel(root, doc, onChange, meta);
      },
    })
  );
  root.appendChild(sectionsSec);
}
