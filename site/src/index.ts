const R2_PATHS: Record<string, { key: string; contentType: string }> = {
  "/CV.pdf": { key: "output/CV.pdf", contentType: "application/pdf" },
  "/CV.html": { key: "output/CV.html", contentType: "text/html; charset=utf-8" },
  "/CV.md": { key: "output/CV.md", contentType: "text/markdown; charset=utf-8" },
  "/CV.png": { key: "output/CV.png", contentType: "image/png" },
};

const SECURITY_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "SAMEORIGIN",
};

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const mapping = R2_PATHS[url.pathname];

    if (mapping) {
      const object = await env.CV_DATA.get(mapping.key);
      if (object) {
        const headers = new Headers();
        object.writeHttpMetadata(headers);
        if (!headers.has("content-type")) {
          headers.set("content-type", mapping.contentType);
        }
        headers.set("etag", object.httpEtag);
        headers.set("cache-control", "public, max-age=60");
        return withSecurityHeaders(new Response(object.body, { headers }));
      }
    }

    return withSecurityHeaders(await env.ASSETS.fetch(request));
  },
};
