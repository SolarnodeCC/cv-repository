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
- **Check** — sollicitatie-score t.o.v. ATS/standaarden (telefoon, LinkedIn, metrics, placeholders, …)
- **Download PDF** — één klik om in te dienen
- Preview van PNG (standaard), PDF of HTML

Sneltoetsen: `Ctrl+S` opslaan · `Ctrl+Enter` render · `Ctrl+Shift+C` check.

Dit is geen hosted SaaS zoals [rendercv.com](https://rendercv.com); de bron blijft deze repo + CI.

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

Na merge naar `main` deployt [`.github/workflows/deploy-site.yml`](.github/workflows/deploy-site.yml) automatisch wanneer `output/` of `site/` wijzigt.

## Cloudflare (Fase 2 — editor + Access)

De Worker **`solarnode-cv-editor`** draait de YAML-editor in een **Container** (RenderCV + Typst). Dit is **privé** bedoeld:

1. Deploy via `make editor-deploy` of Actions → **Deploy CV editor**
2. Dashboard → Worker `solarnode-cv-editor` → **Access** → protect (alleen jouw e-mail / `@solarnode.cc`)
3. Laat `solarnode-cv` publiek (geen Access op de publieke CV-site)

Zie [`editor/README.md`](editor/README.md).

## Cloudflare (Fase 3 — R2 persistentie)

Bucket **`solarnode-cv-data`**:

- Editor hydrate’t `cv.yaml` + artifacts bij start (en via **R2 sync** in de UI); Save/Render publiceert naar R2
- Publieke site serveert `/CV.pdf` (enz.) bij voorkeur uit R2 (anders bundled `site/public`)
- Na een geslaagde **Render CV**-run seed’t CI R2 vanuit `output/`
- Site-deploy seed’t R2 ook (`npm run seed-r2`)

GitHub blijft de version-control bron; R2 is de live runtime/publicatie-laag.

## Structuur

```text
cv.yaml                 ← inhoud + design + locale + settings
solarnode/              ← custom theme (Typst/Jinja-templates + design defaults)
web/                    ← lokale FastAPI editor + preview UI
site/                   ← Cloudflare Worker (public CV site)
editor/                 ← Cloudflare Container editor (privé / Access)
requirements.txt        ← gepinde RenderCV-versie (+ web deps)
Makefile                ← install / render / validate / watch / web / site-* / editor-*
output/                 ← gegenereerde artifacts (commit na render)
.github/workflows/      ← validate, render, deploy-site, deploy-editor
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
make editor-deploy # privé editor Container naar Cloudflare
make clean      # wis output/
```

## CI

- **Validate CV** — dry-run render op elke push/PR.
- **Render CV** — volledige build op `main` (of handmatig via *Actions → Render CV*) en upload van artifact `cv-output`.
- **Deploy CV site** — sync `output/` → `site/public` en deploy Worker `solarnode-cv` (vereist Cloudflare secrets).
- **Deploy CV editor** — build Container-image + deploy `solarnode-cv-editor` (Docker + Containers-rechten op het token).

RenderCV is gepind in `requirements.txt`. Bij een upgrade: versie + schema-URL in `cv.yaml` en `.vscode/settings.json` synchroon houden.

## Docs

- [Get started](https://docs.rendercv.com/user_guide/)
- [YAML-structuur / schema](https://docs.rendercv.com)
- [Templates overschrijven](https://docs.rendercv.com/user_guide/how_to/override_default_templates/)
