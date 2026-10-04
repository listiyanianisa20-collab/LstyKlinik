"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const FRONTEND_ROOT = path.resolve(__dirname, "..", "frontend");
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8"
};

async function serveFrontend(request, response) {
  if (request.method !== "GET") {
    response.writeHead(405, { Allow: "GET" });
    response.end("Metode tidak diizinkan.");
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  } catch {
    response.writeHead(400);
    response.end("Path tidak valid.");
    return;
  }

  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = path.resolve(FRONTEND_ROOT, relativePath);
  if (filePath !== FRONTEND_ROOT && !filePath.startsWith(`${FRONTEND_ROOT}${path.sep}`)) {
    response.writeHead(403);
    response.end("Akses ditolak.");
    return;
  }

  try {
    const content = await fs.promises.readFile(filePath);
    response.writeHead(200, { "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream" });
    response.end(content);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Halaman tidak ditemukan.");
  }
}

const server = http.createServer((request, response) => {
  serveFrontend(request, response).catch(() => {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Terjadi kesalahan pada server.");
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Lsty Klinik berjalan di http://localhost:${PORT}`);
});