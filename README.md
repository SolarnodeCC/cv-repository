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

## Cloudflare (Fase 1 — publieke CV-site)

De Worker **`solarnode-cv`** serveert `site/public/` (landingspagina + PDF/HTML/PNG) via Workers Static Assets.

```bash
cd site
npm install
npm run deploy   # of vanuit repo-root: make site-deploy
```

Vereiste credentials (lokaal of GitHub Actions secrets):

| Secret | Waar |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Token met o.a. *Workers Scripts:Edit* + *Account:Read* |
| `CLOUDFLARE_ACCOUNT_ID` | Account-ID uit het Cloudflare-dashboard |

Na merge naar `main` deployt [`.github/workflows/deploy-site.yml`](.github/workflows/deploy-site.yml) automatisch wanneer `output/` of `site/` wijzigt.

Optioneel: koppel daarna een custom domain (bijv. `cv.solarnode.cc`) in **Workers & Pages → solarnode-cv → Custom Domains**.

## Structuur

```text
cv.yaml                 ← inhoud + design + locale + settings
solarnode/              ← custom theme (Typst/Jinja-templates + design defaults)
web/                    ← lokale FastAPI editor + preview UI
site/                   ← Cloudflare Worker (static CV site)
requirements.txt        ← gepinde RenderCV-versie (+ web deps)
Makefile                ← install / render / validate / watch / web / site-*
output/                 ← gegenereerde artifacts (commit na render)
.github/workflows/      ← validate, render, deploy-site
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
make site-deploy # publieke CV-site naar Cloudflare
make clean      # wis output/
```

## CI

- **Validate CV** — dry-run render op elke push/PR.
- **Render CV** — volledige build op `main` (of handmatig via *Actions → Render CV*) en upload van artifact `cv-output`.
- **Deploy CV site** — sync `output/` → `site/public` en deploy Worker `solarnode-cv` (vereist Cloudflare secrets).

RenderCV is gepind in `requirements.txt`. Bij een upgrade: versie + schema-URL in `cv.yaml` en `.vscode/settings.json` synchroon houden.

## Docs

- [Get started](https://docs.rendercv.com/user_guide/)
- [YAML-structuur / schema](https://docs.rendercv.com)
- [Templates overschrijven](https://docs.rendercv.com/user_guide/how_to/override_default_templates/)
