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
site/                   ← Cloudflare Worker (static CV site)
requirements.txt        ← gepinde RenderCV-versie
Makefile                ← install / render / validate / watch / site-*
output/                 ← gegenereerde artifacts (commit na render)
.github/workflows/      ← validate, render, deploy-site
```

## Aanpassen

1. Bewerk [`cv.yaml`](cv.yaml) (JSON Schema-URL bovenaan → autocomplete in VS Code/Cursor).
2. Theme/layout: bestanden in [`solarnode/`](solarnode/) (zie [`solarnode/README.md`](solarnode/README.md)).
3. `make render` en commit `output/` als je de PDF in de repo wilt bijwerken.

Handige commands:

```bash
make validate   # faalt bij ongeldige YAML/theme
make watch      # herbouw bij elke save
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
