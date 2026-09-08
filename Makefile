# RenderCV helpers — run from repo root.
RENDERCV ?= rendercv
CV ?= cv.yaml
OUTPUT ?= output
PYTHON ?= python3
WEB_HOST ?= 127.0.0.1
WEB_PORT ?= 8765

.PHONY: help install render watch clean validate doctor web

help:
	@echo "Targets:"
	@echo "  make install   Install pinned RenderCV (requirements.txt)"
	@echo "  make render    Build PDF/PNG/HTML/Typst into $(OUTPUT)/"
	@echo "  make watch     Re-render on cv.yaml changes"
	@echo "  make validate  Dry-run render (exit non-zero on invalid YAML)"
	@echo "  make web       Start local CV editor UI (http://$(WEB_HOST):$(WEB_PORT))"
	@echo "  make clean     Remove $(OUTPUT)/"
	@echo "  make doctor    Print RenderCV / Python versions"

install:
	$(PYTHON) -m pip install -r requirements.txt

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

web:
	@echo "Solarnode CV Editor → http://$(WEB_HOST):$(WEB_PORT)"
	$(PYTHON) -m uvicorn web.app:app --host $(WEB_HOST) --port $(WEB_PORT) --reload

clean:
	rm -rf "$(OUTPUT)"

doctor:
	@$(PYTHON) --version
	@$(RENDERCV) --version
