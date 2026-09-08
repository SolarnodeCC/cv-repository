# RenderCV helpers — run from repo root.
RENDERCV ?= rendercv
CV ?= cv.yaml
OUTPUT ?= output
PYTHON ?= python3

.PHONY: help install render watch clean validate doctor

help:
	@echo "Targets:"
	@echo "  make install   Install pinned RenderCV (requirements.txt)"
	@echo "  make render    Build PDF/PNG/HTML/Typst into $(OUTPUT)/"
	@echo "  make watch     Re-render on cv.yaml changes"
	@echo "  make validate  Dry-run render (exit non-zero on invalid YAML)"
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

clean:
	rm -rf "$(OUTPUT)"

doctor:
	@$(PYTHON) --version
	@$(RENDERCV) --version
