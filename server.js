// LEGACY / LOCAL ONLY
// Production should deploy the static frontend to Vercel, GitHub Pages, or any
// static host. BEOFlow now runs in supabase/functions/beoflow/index.ts.

const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const rootDir = __dirname;
const port = Number(process.env.PORT || 5500);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

async function serveStatic(request, response) {
  const url = new URL(request.url, `http://localhost:${port}`);
  const pathname = url.pathname.endsWith("/")
    ? `${url.pathname}index.html`
    : url.pathname;
  const requestedPath = decodeURIComponent(pathname === "/" ? "/index.html" : pathname);
  const filePath = path.normalize(path.join(rootDir, requestedPath));

  if (!filePath.startsWith(rootDir)) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  try {
    const file = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(file);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

const server = http.createServer(async (request, response) => {
  if (request.url === "/api/beoflow") {
    response.writeHead(410, { "Content-Type": "application/json; charset=utf-8" });
    response.end(
      JSON.stringify({
        error: "Legacy endpoint removed",
        details: "Use the Supabase Edge Function named beoflow.",
      })
    );
    return;
  }

  await serveStatic(request, response);
});

server.listen(port, () => {
  console.log(`Cater Vegas static preview running at http://127.0.0.1:${port}`);
  console.log("Production backend: Supabase Auth, Database, Realtime, and Edge Functions.");
});
