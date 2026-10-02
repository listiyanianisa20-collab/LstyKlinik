const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const SUPABASE_URL = "https://lszqzprmovabzrwlekzq.supabase.co";
const SUPABASE_KEY = "sb_secret_97c89I1i9gD6zFo6YNCyEQ_YFkhZRJR";
const PORT = 3000;
const ROOT = path.resolve(__dirname, "..");
const DATA_FILE = path.join(__dirname, "data.json");

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

const seedData = {
  customers: [
    { id_pelanggan: 1, nama: "Alya Putri", no_hp: "081234567801", alamat: "Bandung", tanggal_daftar: "2026-09-15" },
    { id_pelanggan: 2, nama: "Nadia Rahma", no_hp: "081234567802", alamat: "Cimahi", tanggal_daftar: "2026-09-20" },
    { id_pelanggan: 3, nama: "Siska Maharani", no_hp: "081234567803", alamat: "Bandung", tanggal_daftar: "2026-09-25" }
  ],
  items: [
    { id_item: 1, nama_item: "Serum Brightening", jenis: "Produk", harga_jual: 185000, harga_pokok: 95000, stok: 35 },
    { id_item: 2, nama_item: "Sunscreen SPF 50", jenis: "Produk", harga_jual: 125000, harga_pokok: 65000, stok: 50 },
    { id_item: 3, nama_item: "Facial Glow", jenis: "Jasa Treatment", harga_jual: 250000, harga_pokok: 0, stok: null },
    { id_item: 4, nama_item: "Laser Rejuvenation", jenis: "Jasa Treatment", harga_jual: 650000, harga_pokok: 0, stok: null },
    { id_item: 5, nama_item: "Peeling Treatment", jenis: "Jasa Treatment", harga_jual: 350000, harga_pokok: 0, stok: null }
  ],
  sales: []
};

function readLocalData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify(seedData, null, 2), "utf8");
    }
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      throw new Error("Format data lokal tidak valid.");
    }
    return {
      customers: Array.isArray(parsed.customers) ? parsed.customers : [],
      items: Array.isArray(parsed.items) ? parsed.items : [],
      sales: Array.isArray(parsed.sales) ? parsed.sales : []
    };
  } catch {
    fs.writeFileSync(DATA_FILE, JSON.stringify(seedData, null, 2), "utf8");
    return JSON.parse(JSON.stringify(seedData));
  }
}

function writeLocalData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function sortSales(sales) {
  return [...sales].sort((left, right) => {
    const dateCompare = String(right.tanggal || "").localeCompare(String(left.tanggal || ""));
    if (dateCompare !== 0) return dateCompare;
    return Number(right.id_penjualan || 0) - Number(left.id_penjualan || 0);
  });
}

function getNextId(rows, key) {
  return rows.reduce((max, row) => Math.max(max, Number(row[key] || 0)), 0) + 1;
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

function serializeSales(data) {
  const customers = new Map(data.customers.map((customer) => [String(customer.id_pelanggan), customer]));
  return sortSales(data.sales).map((sale) => ({
    ...sale,
    pelanggan: customers.get(String(sale.id_pelanggan)) || null
  }));
}

function serializeSaleDetail(data, id) {
  const sale = data.sales.find((entry) => String(entry.id_penjualan) === String(id));
  if (!sale) throw new HttpError(404, "Transaksi tidak ditemukan.");
  const itemMap = new Map(data.items.map((item) => [String(item.id_item), item]));
  const customer = data.customers.find((row) => String(row.id_pelanggan) === String(sale.id_pelanggan)) || null;
  return {
    ...sale,
    pelanggan: customer,
    items: sale.items.map((detail) => ({
      ...detail,
      item: itemMap.get(String(detail.id_item)) || null
    }))
  };
}

function buildJournalRows(data) {
  const rows = [];
  for (const sale of sortSales(data.sales)) {
    const debitAccount = sale.metode_pembayaran === "Kredit"
      ? "Piutang Usaha"
      : sale.metode_pembayaran === "Transfer"
        ? "Bank"
        : "Kas";
    rows.push({
      tanggal: sale.tanggal,
      id_penjualan: sale.id_penjualan,
      keterangan: "Penerimaan penjualan",
      akun: debitAccount,
      debit: sale.total,
      kredit: 0
    });

    const groupedIncome = new Map();
    for (const detail of sale.items) {
      const item = data.items.find((row) => String(row.id_item) === String(detail.id_item));
      if (!item) continue;
      const key = item.jenis === "Produk" ? "Pendapatan Penjualan Produk" : "Pendapatan Jasa Treatment";
      groupedIncome.set(key, (groupedIncome.get(key) || 0) + Number(detail.subtotal || 0));
      if (item.jenis === "Produk") {
        rows.push({
          tanggal: sale.tanggal,
          id_penjualan: sale.id_penjualan,
          keterangan: "Pengakuan HPP produk",
          akun: "Beban Pokok Penjualan",
          debit: Number((Number(item.harga_pokok || 0) * Number(detail.jumlah || 0)).toFixed(2)),
          kredit: 0
        });
        rows.push({
          tanggal: sale.tanggal,
          id_penjualan: sale.id_penjualan,
          keterangan: "Pengurangan persediaan produk",
          akun: "Persediaan Produk",
          debit: 0,
          kredit: Number((Number(item.harga_pokok || 0) * Number(detail.jumlah || 0)).toFixed(2))
        });
      }
    }
    for (const [akun, nilai] of groupedIncome.entries()) {
      rows.push({
        tanggal: sale.tanggal,
        id_penjualan: sale.id_penjualan,
        keterangan: "Pengakuan pendapatan",
        akun,
        debit: 0,
        kredit: Number(nilai.toFixed(2))
      });
    }
  }
  return rows;
}

async function handleApi(request, response, url) {
  const { pathname, searchParams } = url;
  const method = request.method;
  const database = readLocalData();

  if (pathname === "/api/customers") {
    if (method === "GET") {
      return sendJson(response, 200, sortSales([]).length === 0 ? database.customers : [...database.customers].sort((a, b) => a.nama.localeCompare(b.nama)));
    }
    if (method === "POST") {
      const body = await readJson(request);
      if (!body.nama || !body.no_hp) throw new HttpError(400, "Nama dan nomor HP wajib diisi.");
      const customer = {
        id_pelanggan: getNextId(database.customers, "id_pelanggan"),
        nama: body.nama,
        no_hp: body.no_hp,
        alamat: body.alamat || "",
        tanggal_daftar: body.tanggal_daftar || todayIso()
      };
      database.customers.push(customer);
      writeLocalData(database);
      return sendJson(response, 201, customer);
    }
  }

  const customerMatch = pathname.match(/^\/api\/customers\/(\d+)$/);
  if (customerMatch) {
    const id = customerMatch[1];
    if (method === "PUT") {
      const body = await readJson(request);
      const index = database.customers.findIndex((customer) => String(customer.id_pelanggan) === String(id));
      if (index === -1) throw new HttpError(404, "Pelanggan tidak ditemukan.");
      database.customers[index] = { ...database.customers[index], ...body, id_pelanggan: Number(id) };
      writeLocalData(database);
      return sendJson(response, 200, database.customers[index]);
    }
    if (method === "DELETE") {
      const index = database.customers.findIndex((customer) => String(customer.id_pelanggan) === String(id));
      if (index === -1) throw new HttpError(404, "Pelanggan tidak ditemukan.");
      database.customers.splice(index, 1);
      database.sales = database.sales.filter((sale) => String(sale.id_pelanggan) !== String(id));
      writeLocalData(database);
      return sendJson(response, 200, { message: "Pelanggan berhasil dihapus." });
    }
  }

  if (pathname === "/api/items") {
    if (method === "GET") {
      return sendJson(response, 200, [...database.items].sort((a, b) => a.nama_item.localeCompare(b.nama_item)));
    }
    if (method === "POST") {
      const body = await readJson(request);
      if (!body.nama_item || !body.jenis || !body.harga_jual) throw new HttpError(400, "Data item tidak lengkap.");
      const item = {
        id_item: getNextId(database.items, "id_item"),
        nama_item: body.nama_item,
        jenis: body.jenis,
        harga_jual: Number(body.harga_jual),
        harga_pokok: Number(body.harga_pokok || 0),
        stok: body.jenis === "Jasa Treatment" ? null : Number(body.stok || 0)
      };
      database.items.push(item);
      writeLocalData(database);
      return sendJson(response, 201, item);
    }
  }

  const itemMatch = pathname.match(/^\/api\/items\/(\d+)$/);
  if (itemMatch) {
    const id = itemMatch[1];
    if (method === "PUT") {
      const body = await readJson(request);
      const index = database.items.findIndex((item) => String(item.id_item) === String(id));
      if (index === -1) throw new HttpError(404, "Item tidak ditemukan.");
      const updatedItem = { ...database.items[index], ...body, id_item: Number(id) };
      if (updatedItem.jenis === "Jasa Treatment") updatedItem.stok = null;
      database.items[index] = updatedItem;
      writeLocalData(database);
      return sendJson(response, 200, database.items[index]);
    }
    if (method === "DELETE") {
      const index = database.items.findIndex((item) => String(item.id_item) === String(id));
      if (index === -1) throw new HttpError(404, "Item tidak ditemukan.");
      database.items.splice(index, 1);
      database.sales = database.sales.map((sale) => ({
        ...sale,
        items: (sale.items || []).filter((detail) => String(detail.id_item) !== String(id))
      })).filter((sale) => (sale.items || []).length > 0);
      writeLocalData(database);
      return sendJson(response, 200, { message: "Item berhasil dihapus." });
    }
  }

  if (pathname === "/api/sales") {
    if (method === "GET") {
      return sendJson(response, 200, serializeSales(database));
    }
    if (method === "POST") {
      const body = await readJson(request);
      if (!Array.isArray(body.items) || body.items.length === 0) throw new HttpError(400, "Tambahkan minimal satu item pada transaksi.");
      const customers = new Map(database.customers.map((customer) => [String(customer.id_pelanggan), customer]));
      if (!customers.has(String(body.id_pelanggan))) throw new HttpError(400, "Pelanggan tidak valid.");

      const itemMap = new Map(database.items.map((item) => [String(item.id_item), item]));
      const selectedItems = [];
      for (const entry of body.items) {
        const item = itemMap.get(String(entry.id_item));
        if (!item) throw new HttpError(400, `Item dengan ID ${entry.id_item} tidak ditemukan.`);
        const jumlah = Number(entry.jumlah || 0);
        if (!Number.isInteger(jumlah) || jumlah <= 0) throw new HttpError(400, `Jumlah item ${item.nama_item} tidak valid.`);
        if (item.jenis === "Produk") {
          const stokSaatIni = Number(item.stok || 0);
          if (stokSaatIni < jumlah) throw new HttpError(400, `Stok ${item.nama_item} tidak mencukupi.`);
          item.stok = stokSaatIni - jumlah;
        }
        const hargaSatuan = Number(item.harga_jual || 0);
        selectedItems.push({
          id_item: Number(item.id_item),
          jumlah,
          harga_satuan: hargaSatuan,
          subtotal: Number((hargaSatuan * jumlah).toFixed(2)),
          nama_item: item.nama_item,
          jenis: item.jenis
        });
      }

      const sale = {
        id_penjualan: getNextId(database.sales, "id_penjualan"),
        id_pelanggan: Number(body.id_pelanggan),
        tanggal: body.tanggal || todayIso(),
        metode_pembayaran: body.metode_pembayaran || "Tunai",
        status_pembayaran: body.status_pembayaran || "Lunas",
        total: Number(selectedItems.reduce((sum, detail) => sum + detail.subtotal, 0).toFixed(2)),
        items: selectedItems
      };
      database.sales.push(sale);
      writeLocalData(database);
      return sendJson(response, 201, { id_penjualan: sale.id_penjualan, total: sale.total, items: sale.items });
    }
  }

  const saleDetailMatch = pathname.match(/^\/api\/sales\/(\d+)$/);
  if (saleDetailMatch && method === "GET") {
    const id = saleDetailMatch[1];
    return sendJson(response, 200, serializeSaleDetail(database, id));
  }

  if (pathname === "/api/reports" && method === "GET") {
    const start = searchParams.get("start");
    const end = searchParams.get("end");
    const rows = [];
    const targetSales = sortSales(database.sales).filter((sale) => {
      if (start && sale.tanggal < start) return false;
      if (end && sale.tanggal > end) return false;
      return true;
    });
    for (const sale of targetSales) {
      const customer = database.customers.find((row) => String(row.id_pelanggan) === String(sale.id_pelanggan));
      for (const detail of sale.items) {
        const item = database.items.find((row) => String(row.id_item) === String(detail.id_item));
        if (!item) continue;
        rows.push({
          tanggal: sale.tanggal,
          id_penjualan: sale.id_penjualan,
          nama_pelanggan: customer ? customer.nama : "Pelanggan",
          id_item: detail.id_item,
          nama_item: item.nama_item,
          jenis: item.jenis,
          jumlah: detail.jumlah,
          harga_satuan: detail.harga_satuan,
          subtotal: detail.subtotal
        });
      }
    }
    return sendJson(response, 200, rows.sort((a, b) => String(b.tanggal).localeCompare(String(a.tanggal)) || Number(b.id_penjualan) - Number(a.id_penjualan)));
  }

  if (pathname === "/api/journal" && method === "GET") {
    return sendJson(response, 200, buildJournalRows(database));
  }

  if (pathname === "/api/dashboard" && method === "GET") {
    const totals = serializeSales(database).reduce((summary, sale) => {
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
