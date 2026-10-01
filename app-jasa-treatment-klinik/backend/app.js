const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

// Isi kredensial Supabase sebelum menjalankan aplikasi.
const SUPABASE_URL = "https://lszqzprmovabzrwlekzq.supabase.co";
const SUPABASE_KEY = "sb_secret_97c89I1i9gD6zFo6YNCyEQ_YFkhZRJR";
const PORT = 3000;
const ROOT = path.resolve(__dirname, "..");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8"
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(response, status, data) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1_000_000) throw new HttpError(413, "Ukuran permintaan terlalu besar.");
  }
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    throw new HttpError(400, "Format JSON tidak valid.");
  }
}

async function supabaseRequest(resource, options = {}) {
  if (SUPABASE_URL.includes("YOUR-PROJECT") || SUPABASE_KEY.includes("YOUR-SUPABASE-KEY")) {
    throw new HttpError(503, "Isi SUPABASE_URL dan SUPABASE_KEY di backend/app.js terlebih dahulu.");
  }

  const url = `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${resource}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let result = null;
  if (text) {
    try {
      result = JSON.parse(text);
    } catch {
      result = text;
    }
  }
  if (!response.ok) {
    throw new HttpError(response.status, result?.message || result?.hint || "Permintaan ke Supabase gagal.");
  }
  return result;
}

function queryString(values) {
  return new URLSearchParams(values).toString();
}

async function handleApi(request, response, url) {
  const { pathname, searchParams } = url;
  const method = request.method;

  if (pathname === "/api/customers") {
    if (method === "GET") {
      return sendJson(response, 200, await supabaseRequest("pelanggan?select=*&order=nama.asc"));
    }
    if (method === "POST") {
      const body = await readJson(request);
      return sendJson(response, 201, await supabaseRequest("pelanggan?select=*", {
        method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(body)
      }));
    }
  }

  const customerMatch = pathname.match(/^\/api\/customers\/(\d+)$/);
  if (customerMatch) {
    const id = customerMatch[1];
    if (method === "PUT") {
      const body = await readJson(request);
      return sendJson(response, 200, await supabaseRequest(`pelanggan?id_pelanggan=eq.${id}&select=*`, {
        method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(body)
      }));
    }
    if (method === "DELETE") {
      await supabaseRequest(`pelanggan?id_pelanggan=eq.${id}`, { method: "DELETE" });
      return sendJson(response, 200, { message: "Pelanggan berhasil dihapus." });
    }
  }

  if (pathname === "/api/items") {
    if (method === "GET") {
      return sendJson(response, 200, await supabaseRequest("item?select=*&order=nama_item.asc"));
    }
    if (method === "POST") {
      const body = await readJson(request);
      return sendJson(response, 201, await supabaseRequest("item?select=*", {
        method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(body)
      }));
    }
  }

  const itemMatch = pathname.match(/^\/api\/items\/(\d+)$/);
  if (itemMatch) {
    const id = itemMatch[1];
    if (method === "PUT") {
      const body = await readJson(request);
      return sendJson(response, 200, await supabaseRequest(`item?id_item=eq.${id}&select=*`, {
        method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(body)
      }));
    }
    if (method === "DELETE") {
      await supabaseRequest(`item?id_item=eq.${id}`, { method: "DELETE" });
      return sendJson(response, 200, { message: "Item berhasil dihapus." });
    }
  }

  if (pathname === "/api/sales" && method === "GET") {
    const query = queryString({ select: "*,pelanggan(nama)", order: "tanggal.desc,id_penjualan.desc" });
    return sendJson(response, 200, await supabaseRequest(`penjualan?${query}`));
  }
  const saleDetailMatch = pathname.match(/^\/api\/sales\/(\d+)$/);
  if (saleDetailMatch && method === "GET") {
    const id = saleDetailMatch[1];
    const [sales, items] = await Promise.all([
      supabaseRequest(`penjualan?id_penjualan=eq.${id}&select=*,pelanggan(id_pelanggan,nama,no_hp,alamat)&limit=1`),
      supabaseRequest(`detail_penjualan?id_penjualan=eq.${id}&select=*,item(nama_item,jenis)&order=id_detail.asc`)
    ]);
    if (!sales.length) throw new HttpError(404, "Transaksi tidak ditemukan.");
    return sendJson(response, 200, { ...sales[0], items });
  }
  if (pathname === "/api/sales" && method === "POST") {
    const body = await readJson(request);
    const result = await supabaseRequest("rpc/buat_penjualan", {
      method: "POST", body: JSON.stringify({ data_penjualan: body })
    });
    return sendJson(response, 201, result);
  }

  if (pathname === "/api/reports" && method === "GET") {
    const filters = [];
    const start = searchParams.get("start");
    const end = searchParams.get("end");
    if (start) filters.push(`tanggal=gte.${start}`);
    if (end) filters.push(`tanggal=lte.${end}`);
    const query = ["select=*", "order=tanggal.desc", ...filters].join("&");
    return sendJson(response, 200, await supabaseRequest(`view_laporan_penjualan?${query}`));
  }

  if (pathname === "/api/journal" && method === "GET") {
    return sendJson(response, 200, await supabaseRequest("view_jurnal_umum?select=*&order=tanggal.desc,id_penjualan.desc"));
  }

  if (pathname === "/api/dashboard" && method === "GET") {
    const sales = await supabaseRequest("penjualan?select=total,status_pembayaran");
    const totals = sales.reduce((summary, sale) => {
      summary.pendapatan += Number(sale.total) || 0;
      summary.transaksi += 1;
      if (sale.status_pembayaran === "Belum Lunas") summary.piutang += Number(sale.total) || 0;
      return summary;
    }, { pendapatan: 0, transaksi: 0, piutang: 0 });
    return sendJson(response, 200, totals);
  }

  sendJson(response, 404, { message: "Endpoint tidak ditemukan." });
}

async function serveFrontend(response, pathname) {
  const requestedPath = pathname === "/" ? "/frontend/index.html" : `/frontend${pathname}`;
  const filePath = path.resolve(ROOT, `.${requestedPath}`);
  const frontendRoot = path.resolve(ROOT, "frontend");
  if (!filePath.startsWith(`${frontendRoot}${path.sep}`)) {
    response.writeHead(403);
    return response.end("Akses ditolak.");
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

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
    } else if (request.method === "GET") {
      await serveFrontend(response, decodeURIComponent(url.pathname));
    } else {
      sendJson(response, 405, { message: "Metode tidak diizinkan." });
    }
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    sendJson(response, status, { message: error.message || "Terjadi kesalahan pada server." });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Lsty Klinik berjalan di http://localhost:${PORT}`);
});
