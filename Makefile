# RenderCV helpers — run from repo root.
RENDERCV ?= rendercv
CV ?= cv.yaml
OUTPUT ?= output
PYTHON ?= python3
WEB_HOST ?= 127.0.0.1
WEB_PORT ?= 8765

.PHONY: help install render watch clean validate test doctor web site-sync site-deploy site-dev editor-deploy

help:
	@echo "Targets:"
	@echo "  make install        Install pinned RenderCV (requirements.txt)"
	@echo "  make render         Build PDF/PNG/HTML/Typst into $(OUTPUT)/"
	@echo "  make watch          Re-render on cv.yaml changes"
	@echo "  make validate       Dry-run render (exit non-zero on invalid YAML)"
	@echo "  make test           Run full pytest suite (web/)"
	@echo "  make web            Start local CV editor UI (http://$(WEB_HOST):$(WEB_PORT))"
	@echo "  make site-sync      Copy $(OUTPUT)/ into site/public for Cloudflare"
	@echo "  make site-dev       Local Workers preview of the CV site"
	@echo "  make site-deploy    Deploy solarnode-cv Worker (needs CF credentials)"
	@echo "  make editor-deploy  Deploy solarnode-cv-editor Container (Docker + CF)"
	@echo "  make clean          Remove $(OUTPUT)/"
	@echo "  make doctor         Print RenderCV / Python versions"

install:
	$(PYTHON) -m pip install -r requirements.txt
	$(PYTHON) -m pip install -r requirements-dev.txt

render: doctor
	$(RENDERCV) render "$(CV)"
	@echo "Artifacts in $(OUTPUT)/"

watch:
	$(RENDERCV) render --watch "$(CV)"

validate:
	$(RENDERCV) render "$(CV)" \
		--dont-generate-html \
		--dont-generate-markdown \
		--dont-generate-png \
		--output-folder /tmp/rendercv-validate-$$$$
	@rm -rf /tmp/rendercv-validate-$$$$
	@echo "cv.yaml is valid."

test:
	$(PYTHON) -m pytest web/ -q

web:
	@echo "Solarnode CV Editor → http://$(WEB_HOST):$(WEB_PORT)"
	$(PYTHON) -m uvicorn web.app:app --host $(WEB_HOST) --port $(WEB_PORT) --reload

site-sync:
	cd site && npm run sync

site-dev:
	cd site && npm run dev

site-deploy:
	cd site && npm run deploy

editor-deploy:
	cd editor && npm install && npm run deploy

clean:
	rm -rf "$(OUTPUT)"

doctor:
	@$(PYTHON) --version
	@$(RENDERCV) --version
