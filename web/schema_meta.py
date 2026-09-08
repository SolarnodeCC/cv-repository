"""Static RenderCV / solarnode schema metadata for the form editor (pinned to v2.8)."""

from __future__ import annotations

THEMES = [
    "solarnode",
    "classic",
    "sb2nov",
    "engineeringresumes",
    "engineeringclassic",
    "moderncv",
]

PAGE_SIZES = [
    "a4",
    "a5",
    "us-letter",
    "us-legal",
    "us-executive",
]

FONT_FAMILIES = [
    "Source Sans 3",
    "Source Serif 4",
    "XCharter",
    "Open Sans",
    "Roboto",
    "Lato",
    "Raleway",
    "EB Garamond",
    "Mukta",
]

ALIGNMENTS = ["left", "justified", "justified-with-no-hyphenation"]

SECTION_TITLE_TYPES = [
    "with_partial_line",
    "with_full_line",
    "without_line",
    "moderncv",
]

SOCIAL_NETWORKS = [
    "LinkedIn",
    "GitHub",
    "GitLab",
    "ORCID",
    "Mastodon",
    "StackOverflow",
    "ResearchGate",
    "YouTube",
    "Google Scholar",
    "Telegram",
    "X",
    "Instagram",
]

ENTRY_TYPES = [
    "TextEntry",
    "ExperienceEntry",
    "EducationEntry",
    "NormalEntry",
    "PublicationEntry",
    "OneLineEntry",
    "BulletEntry",
    "NumberedEntry",
]

LANGUAGES = [
    "english",
    "dutch",
    "german",
    "french",
    "spanish",
    "italian",
    "portuguese",
    "turkish",
    "norwegian_bokmal",
    "norwegian_nynorsk",
    "arabic",
    "hebrew",
    "persian",
    "mandarin_chinese",
]

PHONE_FORMATS = ["national", "international", "E164"]

BULLETS = ["•", "◦", "-", "◆", "★", "■", "—", "○"]

DUTCH_LOCALE = {
    "language": "dutch",
    "phone_number_format": "international",
    "present": "heden",
    "to": "–",
    "month": "maand",
    "months": "maanden",
    "year": "jaar",
    "years": "jaar",
    "abbreviations_for_months": [
        "jan",
        "feb",
        "mrt",
        "apr",
        "mei",
        "jun",
        "jul",
        "aug",
        "sep",
        "okt",
        "nov",
        "dec",
    ],
    "full_names_of_months": [
        "januari",
        "februari",
        "maart",
        "april",
        "mei",
        "juni",
        "juli",
        "augustus",
        "september",
        "oktober",
        "november",
        "december",
    ],
}

ENGLISH_LOCALE = {
    "language": "english",
    "phone_number_format": "national",
    "present": "present",
    "to": "–",
    "month": "month",
    "months": "months",
    "year": "year",
    "years": "years",
    "abbreviations_for_months": [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "June",
        "July",
        "Aug",
        "Sept",
        "Oct",
        "Nov",
        "Dec",
    ],
    "full_names_of_months": [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
    ],
}

LOCALE_PRESETS = {
    "dutch": DUTCH_LOCALE,
    "english": ENGLISH_LOCALE,
}

SOLARNODE_DESIGN_DEFAULTS = {
    "theme": "solarnode",
    "page": {
        "size": "a4",
        "top_margin": "1.4cm",
        "bottom_margin": "1.4cm",
        "left_margin": "1.4cm",
        "right_margin": "1.4cm",
        "show_footer": True,
        "show_top_note": True,
    },
    "colors": {
        "body": "rgb(20, 20, 20)",
        "name": "rgb(15, 48, 80)",
        "headline": "rgb(15, 48, 80)",
        "connections": "rgb(15, 48, 80)",
        "section_titles": "rgb(15, 48, 80)",
        "links": "rgb(180, 110, 25)",
        "footer": "rgb(120, 120, 120)",
        "top_note": "rgb(120, 120, 120)",
    },
    "typography": {
        "line_spacing": "0.55em",
        "alignment": "justified-with-no-hyphenation",
        "font_family": {
            "body": "Source Sans 3",
            "name": "Source Sans 3",
            "headline": "Source Sans 3",
            "connections": "Source Sans 3",
            "section_titles": "Source Sans 3",
        },
        "font_size": {
            "body": "10pt",
            "name": "24pt",
            "headline": "11pt",
            "connections": "9.5pt",
            "section_titles": "1.2em",
        },
    },
    "links": {"underline": False, "show_external_link_icon": False},
    "section_titles": {
        "type": "with_partial_line",
        "space_above": "0.45cm",
        "space_below": "0.25cm",
    },
    "entries": {
        "date_and_location_width": "3.8cm",
        "side_space": "0.15cm",
        "space_between_columns": "0.15cm",
        "allow_page_break": False,
        "short_second_row": False,
        "degree_width": "1cm",
        "summary": {"space_above": "0.05cm", "space_left": "0cm"},
        "highlights": {
            "bullet": "•",
            "nested_bullet": "◦",
            "space_left": "0cm",
            "space_above": "0.05cm",
        },
    },
}


def schema_meta() -> dict:
    return {
        "themes": THEMES,
        "page_sizes": PAGE_SIZES,
        "font_families": FONT_FAMILIES,
        "alignments": ALIGNMENTS,
        "section_title_types": SECTION_TITLE_TYPES,
        "social_networks": SOCIAL_NETWORKS,
        "entry_types": ENTRY_TYPES,
        "languages": LANGUAGES,
        "phone_formats": PHONE_FORMATS,
        "bullets": BULLETS,
        "locale_presets": LOCALE_PRESETS,
        "design_defaults": {"solarnode": SOLARNODE_DESIGN_DEFAULTS},
    }
