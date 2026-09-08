# cv-repository

YAML-CV met [RenderCV](https://docs.rendercv.com) (v2.8): custom Typst-theme, lokale build en CI.

## Snelstart

```bash
python3 -m pip install -r requirements.txt
make render
```

Output staat in [`output/`](output/):

| Bestand | Inhoud |
| --- | --- |
| `output/CV.pdf` | CV als PDF |
| `output/CV.png` / `CV_*.png` | Pagina-previews |
| `output/CV.html` | HTML-preview |
| `output/CV.typ` | Typst-bron |

## Web editor (lokaal)

Gelijkwaardige YAML + preview-UI bovenop dezelfde CLI/GitHub-pipeline (custom `solarnode`-theme blijft werken):

```bash
make install
make web
```

Open [http://127.0.0.1:8765](http://127.0.0.1:8765):

- YAML-editor voor [`cv.yaml`](cv.yaml)
- **Valideren** / **Opslaan** / **Render** (schrijft naar `output/`)
- Preview van PDF, PNG of HTML

Dit is geen hosted SaaS zoals [rendercv.com](https://rendercv.com); de bron blijft deze repo + CI.

## Structuur

```text
cv.yaml                 ← inhoud + design + locale + settings
solarnode/              ← custom theme (Typst/Jinja-templates + design defaults)
web/                    ← lokale FastAPI editor + preview UI
requirements.txt        ← gepinde RenderCV-versie (+ web deps)
Makefile                ← install / render / validate / watch / web
output/                 ← gegenereerde artifacts (commit na render)
.github/workflows/      ← validate op elke push/PR; render-artifacts op main
```

## Aanpassen

1. Bewerk [`cv.yaml`](cv.yaml) in de web editor of in Cursor (JSON Schema-URL bovenaan → autocomplete).
2. Theme/layout: bestanden in [`solarnode/`](solarnode/) (zie [`solarnode/README.md`](solarnode/README.md)).
3. `make render` (of **Render** in de UI) en commit `output/` als je de PDF in de repo wilt bijwerken.

Handige commands:

```bash
make validate   # faalt bij ongeldige YAML/theme
make watch      # herbouw bij elke save
make web        # lokale editor op :8765
make clean      # wis output/
```

## CI

- **Validate CV** — dry-run render op elke push/PR.
- **Render CV** — volledige build op `main` (of handmatig via *Actions → Render CV*) en upload van artifact `cv-output`.

RenderCV is gepind in `requirements.txt`. Bij een upgrade: versie + schema-URL in `cv.yaml` en `.vscode/settings.json` synchroon houden.

## Docs

- [Get started](https://docs.rendercv.com/user_guide/)
- [YAML-structuur / schema](https://docs.rendercv.com)
- [Templates overschrijven](https://docs.rendercv.com/user_guide/how_to/override_default_templates/)
