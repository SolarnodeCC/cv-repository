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

Multi-panel editor (CV / Design / Locale / Settings / AI / Import) bovenop dezelfde CLI/GitHub-pipeline (custom `solarnode`-theme blijft werken). Form-modus en YAML-modus delen één `cv.yaml`.

```bash
make install
make web
```

Open [http://127.0.0.1:8765](http://127.0.0.1:8765):

- **CV / Design / Locale / Settings** — form panels (+ YAML-toggle)
- **Import** — RenderCV YAML of JSON Resume (bestand of plakken)
- **AI** — voorstellen met accept/reject (vereist `AI_API_KEY` of `OPENAI_API_KEY`; optioneel `AI_BASE_URL`, `AI_MODEL`)
- **Valideren** / **Opslaan** (YAML) / **Render** (`output/` + R2 artifacts) / **Publish** / **Sync Git** (draft PR)
- **Check** — sollicitatie-checklist op YAML-inhoud
- **Download PDF** — één klik om in te dienen
- Preview van PNG (standaard), PDF of HTML

Sneltoetsen: `Ctrl+S` opslaan · `Ctrl+Enter` render · `Ctrl+Shift+C` check · `Ctrl+Shift+G` sync git.

Happy path: bewerken → **Render** (R2 live) → **Sync Git** → merge → optioneel promote R2 (`R2_SEED_FORCE=1`).

Dit is geen hosted SaaS zoals [rendercv.com](https://rendercv.com); de bron blijft deze repo + CI. AI/import zijn editor-hulpfuncties, geen multi-user accountproduct.

## Cloudflare (Fase 1 — publieke CV-site)

De Worker **`solarnode-cv`** serveert `site/public/` (landingspagina + PDF/HTML/PNG) via Workers Static Assets.

- Live: https://solarnode-cv.oostelaar.workers.dev  
- Custom domain (na deploy): `https://cv.solarnode.cc`

```bash
cd site
npm install
npm run deploy   # of vanuit repo-root: make site-deploy
```

Vereiste credentials (lokaal of GitHub Actions secrets):

| Secret | Waar |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Token met o.a. *Workers Scripts:Edit* + *Account:Read* (+ *Containers* voor de editor) |
| `CLOUDFLARE_ACCOUNT_ID` | Account-ID uit het Cloudflare-dashboard |

Na merge naar `main` deployt [`.github/workflows/deploy-site.yml`](.github/workflows/deploy-site.yml) automatisch wanneer `cv.yaml`, theme of `site/` wijzigt (CI rendert artifacts; binaries worden niet gecommit).

## Cloudflare (Fase 2 — editor + Access)

De Worker **`solarnode-cv-editor`** draait de YAML-editor in een **Container** (RenderCV + Typst). Dit is **privé** — **Cloudflare Access is verplicht**.

1. Deploy via `make editor-deploy` of Actions → **Deploy CV editor**
2. Zero Trust → Access: protect `solarnode-cv-editor` **inclusief** `workers.dev` + preview-URL’s (alleen jouw e-mail / `@solarnode.cc`)
3. Laat `solarnode-cv` publiek (geen Access op de publieke CV-site)
4. Controleer: private window → Access-login verplicht

Zie de volledige checklist in [`editor/README.md`](editor/README.md).

## Cloudflare (Fase 3 — R2 persistentie)

Bucket **`solarnode-cv-data`**:

- Editor is **live writer**: hydrate bij start / **R2 sync**; **Opslaan** = YAML; **Render** = artifacts → R2; **Sync Git** = draft PR met `cv.yaml`
- Publieke site serveert `/CV.pdf` (enz.) bij voorkeur uit R2 (anders bundled `site/public` na CI-render)
- CI `seed-r2` is **non-destructief** (vult alleen ontbrekende keys). Overschrijven: `R2_SEED_FORCE=1 npm run seed-r2` of `npm run seed-r2:force` (bootstrap / promote from Git)

GitHub blijft de version-control bron; R2 is de live runtime/publicatie-laag. Allowlist: [`shared/r2-allowlist.json`](shared/r2-allowlist.json).

Hosted editor Git sync + Access: zie [`editor/README.md`](editor/README.md) (secrets `CV_EDITOR_GITHUB_TOKEN`, `ACCESS_ALLOWED_EMAILS`). Deploy draait `post-deploy-ops` automatisch.

Roadmap (vervolgfasen): [`docs/architectuur-en-roadmap.md`](docs/architectuur-en-roadmap.md).

## Structuur

```text
cv.yaml                 ← inhoud + design + locale + settings
solarnode/              ← custom theme (Typst/Jinja-templates + design defaults)
shared/                 ← gedeelde config (R2-allowlist)
web/                    ← lokale FastAPI editor + preview UI
site/                   ← Cloudflare Worker (public CV site)
editor/                 ← Cloudflare Container editor (privé / Access)
docs/                   ← architectuur & roadmap
requirements.txt        ← gepinde RenderCV-versie (+ web deps)
Makefile                ← install / render / validate / watch / web / site-* / editor-*
output/                 ← gegenereerde artifacts (niet committen; zie output/README)
.github/workflows/      ← validate, render, deploy-site, deploy-editor
```

## Aanpassen

1. Bewerk [`cv.yaml`](cv.yaml) in de web editor of in Cursor (JSON Schema-URL bovenaan → autocomplete).
2. Theme/layout: bestanden in [`solarnode/`](solarnode/) (zie [`solarnode/README.md`](solarnode/README.md)).
3. `make render` (of **Render** in de UI). Commit `cv.yaml` / theme; binaries blijven buiten git (CI + R2 publiceren).

Handige commands:

```bash
make validate   # faalt bij ongeldige YAML/theme
make watch      # herbouw bij elke save
make web        # lokale editor op :8765
make site-deploy # publieke CV-site naar Cloudflare
make editor-deploy # privé editor Container naar Cloudflare
make clean      # wis output/
```

## CI

- **Validate CV** — dry-run render + `pytest` op elke push/PR.
- **Render CV** — volledige build op `main` (of handmatig via *Actions → Render CV*) en upload van artifact `cv-output`; R2 bootstrap-seed (non-destructief).
- **Deploy CV site** — sync `output/` → `site/public` en deploy Worker `solarnode-cv` (vereist Cloudflare secrets); R2 bootstrap-seed.
- **Deploy CV editor** — build Container-image + deploy `solarnode-cv-editor` (Docker + Containers-rechten op het token).

RenderCV is gepind in `requirements.txt`. Bij een upgrade: versie + schema-URL in `cv.yaml` en `.vscode/settings.json` synchroon houden.

## Docs

- [Architectuur & roadmap](docs/architectuur-en-roadmap.md) — analyse + vervolgfasen 0–4
- [Get started](https://docs.rendercv.com/user_guide/)
- [YAML-structuur / schema](https://docs.rendercv.com)
- [Templates overschrijven](https://docs.rendercv.com/user_guide/how_to/override_default_templates/)
