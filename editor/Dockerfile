# Build context is the repository root (see image_build_context in wrangler.jsonc).
FROM python:3.12-slim-bookworm

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    fontconfig \
    fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/* \
  && useradd --create-home --uid 10001 --shell /usr/sbin/nologin appuser

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY cv.yaml /app/cv.yaml
COPY solarnode /app/solarnode
COPY web /app/web
# Minimal output dir; live artifacts come from R2 hydrate.
RUN mkdir -p /app/output \
  && chown -R appuser:appuser /app

ENV PATH="/usr/local/bin:${PATH}"
ENV PYTHONUNBUFFERED=1
ENV R2_SYNC=1
ENV R2_HTTP_BASE=http://cv.r2

USER appuser
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8080/api/health || exit 1

CMD ["uvicorn", "web.app:app", "--host", "0.0.0.0", "--port", "8080"]
