/** @typedef {{ cv?: object, design?: object, locale?: object, settings?: object }} CvDocument */

const SCHEMA_COMMENT =
  "# yaml-language-server: $schema=https://raw.githubusercontent.com/rendercv/rendercv/refs/tags/v2.8/schema.json";

function yamlLib() {
  const lib = window.jsyaml;
  if (!lib) throw new Error("js-yaml niet geladen");
  return lib;
}

/**
 * @param {string} text
 * @returns {CvDocument}
 */
export function parseDocument(text) {
  const data = yamlLib().load(text);
  if (!data || typeof data !== "object" || !data.cv) {
    throw new Error("YAML moet een top-level 'cv' veld bevatten");
  }
  if (data.rendercv_settings && !data.settings) {
    data.settings = data.rendercv_settings;
    delete data.rendercv_settings;
  }
  return data;
}

/**
 * @param {CvDocument} doc
 * @returns {string}
 */
export function stringifyDocument(doc) {
  const ordered = {};
  for (const key of ["cv", "design", "locale", "settings"]) {
    if (doc[key] !== undefined) ordered[key] = doc[key];
  }
  for (const [key, value] of Object.entries(doc)) {
    if (!(key in ordered)) ordered[key] = value;
  }
  const body = yamlLib().dump(ordered, {
    lineWidth: 100,
    noRefs: true,
    quotingType: '"',
    forceQuotes: false,
  });
  return `${SCHEMA_COMMENT}\n\n${body}`;
}

export function deepClone(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

export function rgbToHex(value) {
  if (!value || typeof value !== "string") return "#000000";
  if (value.startsWith("#") && (value.length === 7 || value.length === 4)) return value;
  const m = value.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
  if (!m) return "#000000";
  const toHex = (n) => Number(n).toString(16).padStart(2, "0");
  return `#${toHex(m[1])}${toHex(m[2])}${toHex(m[3])}`;
}

export function hexToRgb(hex) {
  if (!hex || !hex.startsWith("#")) return hex;
  let h = hex.slice(1);
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return hex;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgb(${r}, ${g}, ${b})`;
}

export function detectEntryType(entry) {
  if (typeof entry === "string") return "TextEntry";
  if (!entry || typeof entry !== "object") return "TextEntry";
  if ("company" in entry) return "ExperienceEntry";
  if ("institution" in entry) return "EducationEntry";
  if ("title" in entry && "authors" in entry) return "PublicationEntry";
  if ("label" in entry && "details" in entry) return "OneLineEntry";
  if ("bullet" in entry) return "BulletEntry";
  if ("number" in entry) return "NumberedEntry";
  if ("name" in entry) return "NormalEntry";
  return "NormalEntry";
}

export function blankEntry(type) {
  switch (type) {
    case "ExperienceEntry":
      return {
        company: "",
        position: "",
        location: "",
        start_date: "",
        end_date: "",
        summary: "",
        highlights: [""],
      };
    case "EducationEntry":
      return {
        institution: "",
        area: "",
        degree: "",
        location: "",
        start_date: "",
        end_date: "",
        highlights: [""],
      };
    case "NormalEntry":
      return { name: "", location: "", date: "", summary: "", highlights: [""] };
    case "PublicationEntry":
      return { title: "", authors: [""], journal: "", date: "", doi: "", url: "" };
    case "OneLineEntry":
      return { label: "", details: "" };
    case "BulletEntry":
      return { bullet: "" };
    case "NumberedEntry":
      return { number: "" };
    case "TextEntry":
    default:
      return "";
  }
}

export function ensureCvShape(doc) {
  if (!doc.cv || typeof doc.cv !== "object") doc.cv = {};
  if (!Array.isArray(doc.cv.social_networks)) doc.cv.social_networks = [];
  if (!doc.cv.sections || typeof doc.cv.sections !== "object") doc.cv.sections = {};
  if (!doc.design || typeof doc.design !== "object") doc.design = { theme: "solarnode" };
  if (!doc.locale || typeof doc.locale !== "object") doc.locale = { language: "dutch" };
  if (!doc.settings || typeof doc.settings !== "object") {
    doc.settings = { current_date: "today", pdf_title: "CV", bold_keywords: [] };
  }
  return doc;
}
