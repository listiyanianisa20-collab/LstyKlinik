const DEMO_LOGIN_KEY = "lsty-demo-logged-in";
const SUPABASE_URL = "https://lszqzprmovabzrwlekzq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_xje_ZSuWI5tb3BHAjTvJPw_VH0FBa9D";

const state = {
  customers: [],
  items: [],
  sales: [],
  cart: [],
  report: [],
  reportFinance: { profitLoss: { rows: [] }, ledger: [] },
  activeSale: null,
  activeReceivable: null,
  activeInstallmentNumber: null,
  activeInstallmentAmount: 0,
  receivables: [],
  customerQuery: "",
  salesQuery: "",
  salesStatusFilter: "",
  receivablePaymentReport: { total_kas_masuk: 0, payments: [] }
};

const money = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const dateFormatter = new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" });
const viewNames = {
  dashboard: "Utama",
  transactions: "Transaksi",
  customers: "Pelanggan",
  items: "Produk & Jasa",
  reports: "Laporan Penjualan",
  receivables: "Piutang",
  journal: "Jurnal Umum"
};
const viewHashes = {
  dashboard: "dashboard",
  transactions: "transaksi",
  customers: "pelanggan",
  items: "produk-jasa",
  reports: "laporan",
  receivables: "piutang",
  journal: "jurnal"
};
const hashViews = Object.fromEntries(Object.entries(viewHashes).map(([view, hash]) => [hash, view]));

const byId = (id) => document.getElementById(id);
const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
const addMonths = (isoDate, months) => {
  if (!isoDate) return "";
  const [year, month, day] = isoDate.split("-").map(Number);
  const targetMonth = month - 1 + months;
  const targetYear = year + Math.floor(targetMonth / 12);
  const normalizedMonth = targetMonth % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  return `${targetYear}-${String(normalizedMonth + 1).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
};
const escapeHtml = (value) => String(value ?? "").replace(/[&<>\"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[character]));
const formatMoney = (value) => money.format(Number(value) || 0);
const formatDate = (value) => value ? dateFormatter.format(new Date(`${String(value).slice(0, 10)}T00:00:00`)) : "—";

const toggleAuthScreen = (locked) => {
  const appShell = byId("app-shell");
  const authScreen = byId("auth-screen");
  if (appShell) appShell.hidden = locked;
  if (authScreen) authScreen.hidden = !locked;
};

function assertSupabaseConfig() {
  if (!/^https:\/\//.test(SUPABASE_URL) || SUPABASE_URL.includes("YOUR_SUPABASE") || !SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.includes("YOUR_SUPABASE")) {
    throw new Error("Isi SUPABASE_URL dan SUPABASE_ANON_KEY di bagian atas frontend/script.js.");
  }
}

async function supabaseRequest(resource, options = {}) {
  assertSupabaseConfig();
  const method = options.method || "GET";
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    ...(options.body === undefined ? {} : { "Content-Type": "application/json", Prefer: "return=representation" }),
    ...(options.headers || {})
  };
  const response = await fetch(`${SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/${resource}`, {
    method,
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) })
  });
  const text = await response.text();
  let payload = null;
  if (text) {
    try { payload = JSON.parse(text); } catch { payload = text; }
  }
  if (!response.ok) throw new Error(payload?.message || payload?.details || payload?.hint || "Permintaan Supabase gagal.");
  return payload;
}

const firstRow = (payload) => Array.isArray(payload) ? payload[0] || null : payload;
const dateFilters = (searchParams) => {
  const query = new URLSearchParams({ select: "*" });
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  if (start) query.set("tanggal", `gte.${start}`);
  if (end) query.set("tanggal", `lte.${end}`);
  return query;
};

function serializeSupabaseSale(sale) {
  const installments = [...(sale.cicilan || [])].sort((left, right) => Number(left.cicilan_ke) - Number(right.cicilan_ke));
  const payments = installments.filter((installment) => installment.status === "Lunas").map((installment) => ({
    id_payment: installment.id_cicilan,
    tanggal: installment.tanggal_bayar,
    jumlah: Number(installment.nominal || 0),
    metode_pembayaran: installment.metode_bayar || "Tunai",
    metode_bayar: installment.metode_bayar || "Tunai",
    cicilan_ke: Number(installment.cicilan_ke),
    catatan: installment.catatan || "",
    keterangan: installment.catatan || `Pembayaran cicilan ${installment.cicilan_ke} #${sale.id_penjualan}`,
    jenis: "cicilan"
  }));
  let schedule = installments.map((installment) => ({
    id_cicilan: installment.id_cicilan,
    cicilan_ke: Number(installment.cicilan_ke),
    tenggat: installment.jatuh_tempo,
    jumlah: Number(installment.nominal || 0),
    dibayar: installment.status === "Lunas" ? Number(installment.nominal || 0) : 0,
    tanggal_bayar: installment.tanggal_bayar || null,
    metode_bayar: installment.metode_bayar || null,
    status: installment.status === "Lunas" ? "Lunas" : "Belum"
  }));
  if (!schedule.length && sale.metode_pembayaran === "Kredit" && sale.status_pembayaran === "Belum Lunas") {
    schedule = [{ cicilan_ke: 1, tenggat: sale.tanggal, jumlah: Number(sale.total || 0), dibayar: 0, status: "Belum" }];
  }
  const total = Number(sale.total || 0);
  const totalPaid = sale.metode_pembayaran === "Kredit"
    ? payments.reduce((sum, payment) => sum + payment.jumlah, 0)
    : total;
  const remaining = sale.metode_pembayaran === "Kredit"
    ? schedule.reduce((sum, installment) => sum + (installment.status === "Lunas" ? 0 : installment.jumlah), 0)
    : 0;
  const unpaid = schedule.filter((installment) => installment.status !== "Lunas");
  return {
    ...sale,
    pelanggan: sale.pelanggan || null,
    items: (sale.detail_penjualan || []).map((detail) => ({ ...detail, item: detail.item || null })),
    payments,
    jadwal_cicilan: schedule,
    total_dibayar: totalPaid,
    sisa_pembayaran: remaining,
    lunas: remaining <= 0,
    jumlah_cicilan: schedule.length,
    sisa_tenor: unpaid.length,
    jatuh_tempo_berikutnya: unpaid[0]?.tenggat || null
  };
}

async function fetchSupabaseSales(id) {
  const query = new URLSearchParams();
  query.set("select", "*,pelanggan(id_pelanggan,nama,no_hp,alamat),detail_penjualan(id_item,jumlah,harga_satuan,subtotal,item(id_item,nama_item,jenis)),cicilan(id_cicilan,cicilan_ke,jatuh_tempo,nominal,tanggal_bayar,metode_bayar,catatan,status)");
  query.set("order", "tanggal.desc,id_penjualan.desc");
  if (id) query.set("id_penjualan", `eq.${id}`);
  const rows = await supabaseRequest(`penjualan?${query}`);
  return (rows || []).map(serializeSupabaseSale);
}

async function confirmSupabaseInstallment(saleId, installmentNumber, payload) {
  const query = new URLSearchParams({
    select: "*",
    id_penjualan: `eq.${saleId}`,
    status: "eq.Belum",
    order: "cicilan_ke.asc"
  });
  const openInstallments = await supabaseRequest(`cicilan?${query}`);
  const nextInstallment = openInstallments[0];
  if (!nextInstallment || Number(nextInstallment.cicilan_ke) !== Number(installmentNumber)) {
    throw new Error("Pembayaran hanya dapat dicatat untuk cicilan berikutnya yang belum lunas.");
  }
  const payment = await supabaseRequest("rpc/konfirmasi_pembayaran_cicilan", {
    method: "POST",
    body: {
      cicilan_id: Number(nextInstallment.id_cicilan),
      tanggal_bayar_input: payload.tanggal_bayar || todayIso(),
      metode_bayar_input: payload.metode_bayar || "Tunai",
      catatan_input: payload.catatan || ""
    }
  });
  return payment;
}

async function api(path, options = {}) {
  const url = new URL(path, window.location.origin);
  const pathname = url.pathname;
  const method = options.method || "GET";
  const body = options.body ? JSON.parse(options.body) : {};
  const saleMatch = pathname.match(/^\/api\/sales\/(\d+)$/);
  const paymentMatch = pathname.match(/^\/api\/sales\/(\d+)\/payments$/);
  const installmentPaymentMatch = pathname.match(/^\/api\/sales\/(\d+)\/installments\/(\d+)\/payments$/);

  if (pathname === "/api/customers") {
    if (method === "GET") return supabaseRequest("pelanggan?select=*&order=nama.asc");
    if (method === "POST") return firstRow(await supabaseRequest("pelanggan", { method, body }));
  }
  const customerMatch = pathname.match(/^\/api\/customers\/(\d+)$/);
  if (customerMatch) {
    const resource = `pelanggan?id_pelanggan=eq.${customerMatch[1]}`;
    if (method === "PUT") return firstRow(await supabaseRequest(resource, { method: "PATCH", body }));
    if (method === "DELETE") return supabaseRequest(resource, { method });
  }

  if (pathname === "/api/items") {
    if (method === "GET") return supabaseRequest("item?select=*&order=nama_item.asc");
    if (method === "POST") return firstRow(await supabaseRequest("item", { method, body }));
  }
  const itemMatch = pathname.match(/^\/api\/items\/(\d+)$/);
  if (itemMatch) {
    const resource = `item?id_item=eq.${itemMatch[1]}`;
    if (method === "PUT") return firstRow(await supabaseRequest(resource, { method: "PATCH", body }));
    if (method === "DELETE") return supabaseRequest(resource, { method });
  }

  if (pathname === "/api/sales") {
    if (method === "GET") return fetchSupabaseSales();
    if (method === "POST") return supabaseRequest("rpc/buat_penjualan", { method: "POST", body: { data_penjualan: body } });
  }
  if (saleMatch) {
    if (method === "GET") return firstRow(await fetchSupabaseSales(saleMatch[1]));
    if (method === "PUT") {
      await supabaseRequest(`penjualan?id_penjualan=eq.${saleMatch[1]}`, { method: "PATCH", body });
      return firstRow(await fetchSupabaseSales(saleMatch[1]));
    }
  }
  if (installmentPaymentMatch && method === "POST") {
    await confirmSupabaseInstallment(installmentPaymentMatch[1], installmentPaymentMatch[2], body);
    return { sale: firstRow(await fetchSupabaseSales(installmentPaymentMatch[1])) };
  }
  if (paymentMatch && method === "POST") {
    const sale = firstRow(await fetchSupabaseSales(paymentMatch[1]));
    const remaining = sale?.jadwal_cicilan.filter((installment) => installment.status !== "Lunas") || [];
    if (!remaining.length) throw new Error("Transaksi ini sudah lunas.");
    for (const installment of remaining) {
      await confirmSupabaseInstallment(paymentMatch[1], installment.cicilan_ke, {
        tanggal_bayar: body.tanggal || todayIso(),
        metode_bayar: body.metode_pembayaran === "Transfer" ? "Transfer" : "Tunai",
        catatan: body.catatan || body.keterangan || "Pelunasan piutang"
      });
    }
    return { sale: firstRow(await fetchSupabaseSales(paymentMatch[1])) };
  }

  if (pathname === "/api/receivables" && method === "GET") {
    const sales = (await fetchSupabaseSales()).filter((sale) => sale.status_pembayaran === "Belum Lunas");
    const overdueCount = sales.reduce((count, sale) => count + sale.jadwal_cicilan.filter((installment) =>
      installment.status !== "Lunas" && installment.tenggat <= todayIso()
    ).length, 0);
    return {
      summary: {
        total_piutang: sales.reduce((sum, sale) => sum + sale.sisa_pembayaran, 0),
        pelanggan_belum_lunas: new Set(sales.map((sale) => sale.id_pelanggan)).size,
        cicilan_jatuh_tempo: overdueCount
      },
      receivables: sales
    };
  }

  if (pathname === "/api/reports/receivable-payments" && method === "GET") {
    const query = new URLSearchParams();
    query.set("status", "eq.Lunas");
    query.set("select", "id_cicilan,id_penjualan,cicilan_ke,tanggal_bayar,metode_bayar,catatan,nominal,penjualan(id_pelanggan,pelanggan(nama))");
    const start = url.searchParams.get("start");
    const end = url.searchParams.get("end");
    if (start) query.set("tanggal_bayar", `gte.${start}`);
    if (end) query.set("tanggal_bayar", `lte.${end}`);
    const installments = await supabaseRequest(`cicilan?${query}`);
    const payments = (installments || []).map((installment) => ({
      tanggal: installment.tanggal_bayar,
      id_penjualan: installment.id_penjualan,
      nama_pelanggan: installment.penjualan?.pelanggan?.nama || "Pelanggan",
      cicilan_ke: installment.cicilan_ke,
      metode_pembayaran: installment.metode_bayar,
      keterangan: installment.catatan || "Pembayaran cicilan",
      nominal: Number(installment.nominal || 0)
    }));
    return { total_kas_masuk: payments.reduce((sum, payment) => sum + payment.nominal, 0), payments };
  }

  if (pathname === "/api/reports" && method === "GET") {
    const query = dateFilters(url.searchParams);
    query.set("order", "tanggal.desc,id_penjualan.desc");
    return supabaseRequest(`view_laporan_penjualan?${query}`);
  }

  if (pathname === "/api/finance/profit-loss" && method === "GET") {
    const query = dateFilters(url.searchParams);
    query.set("select", "id_item,jenis,jumlah,subtotal");
    const [sales, items] = await Promise.all([
      supabaseRequest(`view_laporan_penjualan?${query}`),
      supabaseRequest("item?select=id_item,harga_pokok,jenis")
    ]);
    const itemMap = new Map(items.map((item) => [String(item.id_item), item]));
    const revenue = sales.reduce((sum, row) => sum + Number(row.subtotal || 0), 0);
    const cost = sales.reduce((sum, row) => {
      const item = itemMap.get(String(row.id_item));
      return sum + (item?.jenis === "Produk" ? Number(item.harga_pokok || 0) * Number(row.jumlah || 0) : 0);
    }, 0);
    return { rows: [
      { akun: "Pendapatan", nilai: revenue },
      { akun: "Harga Pokok Penjualan", nilai: -cost },
      { akun: "Beban Operasional", nilai: 0 },
      { akun: "Laba Bersih", nilai: revenue - cost }
    ] };
  }

  if (pathname === "/api/finance/ledger" || pathname === "/api/journal") {
    const query = dateFilters(url.searchParams);
    query.set("order", "tanggal.asc,id_penjualan.asc");
    const [salesEntries, paymentEntries] = await Promise.all([
      supabaseRequest(`view_jurnal_umum?${query}`),
      supabaseRequest(`view_jurnal_pelunasan?${query}`)
    ]);
    return [...(salesEntries || []), ...(paymentEntries || [])].sort((left, right) =>
      String(left.tanggal).localeCompare(String(right.tanggal)) || Number(left.id_penjualan) - Number(right.id_penjualan)
    );
  }

  if (pathname === "/api/dashboard" && method === "GET") {
    const sales = await fetchSupabaseSales();
    const payments = sales.flatMap((sale) => sale.payments.map((payment) => ({
      tanggal: payment.tanggal,
      id_penjualan: sale.id_penjualan,
      nama_pelanggan: sale.pelanggan?.nama || "Pelanggan",
      cicilan_ke: payment.cicilan_ke,
      jumlah: payment.jumlah,
      metode_pembayaran: payment.metode_pembayaran,
      keterangan: payment.keterangan
    }))).sort((left, right) => String(right.tanggal).localeCompare(String(left.tanggal))).slice(0, 5);
    return {
      pendapatan: sales.reduce((sum, sale) => sum + Number(sale.total || 0), 0),
      transaksi: sales.length,
      piutang: sales.reduce((sum, sale) => sum + Number(sale.sisa_pembayaran || 0), 0),
      recent_installment_payments: payments
    };
  }

  throw new Error("Endpoint Supabase tidak didukung.");
}

function showNotice(message, type = "success") {
  const notice = byId("notice");
  if (!notice) return;
  notice.textContent = message;
  notice.className = `notice ${type}`;
  notice.hidden = false;
  window.clearTimeout(showNotice.timeout);
  showNotice.timeout = window.setTimeout(() => { notice.hidden = true; }, 5000);
}

function handleError(error) {
  showNotice(error?.message || "Terjadi kesalahan.", "error");
}

function emptyRow(columnCount, message) {
  return `<tr><td colspan="${columnCount}" class="empty-state">${escapeHtml(message)}</td></tr>`;
}

function setView(view, updateHash = true) {
  if (!viewNames[view]) return;
  if (updateHash && location.hash !== `#${viewHashes[view]}`) history.pushState(null, "", `#${viewHashes[view]}`);
  document.querySelectorAll(".view-panel").forEach((panel) => panel.classList.toggle("active", panel.id === `view-${view}`));
  document.querySelectorAll(".nav-link").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  byId("current-page").textContent = viewNames[view];
  byId("page-title").textContent = view === "dashboard" ? "Selamat datang kembali" : viewNames[view];
  if (view === "reports") loadReport().catch(handleError);
  if (view === "receivables") loadReceivables().catch(handleError);
  if (view === "journal") loadJournal().catch(handleError);
  if (view === "transactions") loadSales().catch(handleError);
}

function restoreViewFromHash() {
  const view = hashViews[location.hash.slice(1)];
  if (view) setView(view, false);
}

window.addEventListener("hashchange", restoreViewFromHash);
window.addEventListener("popstate", restoreViewFromHash);

function setSelectOptions(select, rows, placeholder, idKey, nameKey, nameSuffix = "") {
  const selected = select.value;
  select.innerHTML = `<option value="">${placeholder}</option>${rows.map((row) =>
    `<option value="${escapeHtml(row[idKey])}">${escapeHtml(row[nameKey])}${nameSuffix ? ` · ${escapeHtml(row[nameSuffix])}` : ""}</option>`
  ).join("")}`;
  if (rows.some((row) => String(row[idKey]) === selected)) select.value = selected;
}

function getFilteredCustomers() {
  const q = state.customerQuery.toLowerCase();
  return state.customers.filter((customer) => {
    if (!q) return true;
    const haystack = [customer.nama, customer.no_hp, customer.alamat].join(" ").toLowerCase();
    return haystack.includes(q);
  });
}

function getFilteredSales() {
  const q = state.salesQuery.toLowerCase();
  return state.sales.filter((sale) => {
    const customerName = sale.pelanggan?.nama || "";
    const matchesQuery = !q || [sale.id_penjualan, customerName, sale.metode_pembayaran, sale.status_pembayaran, sale.tanggal].join(" ").toLowerCase().includes(q);
    const matchesStatus = !state.salesStatusFilter || sale.status_pembayaran === state.salesStatusFilter;
    return matchesQuery && matchesStatus;
  });
}

function renderCustomerOptions() {
  setSelectOptions(byId("sale-customer"), state.customers, "Pilih pelanggan", "id_pelanggan", "nama");
  setSelectOptions(byId("edit-sale-customer"), state.customers, "Pilih pelanggan", "id_pelanggan", "nama");
}

function renderItemOptions() {
  const selectable = state.items.filter((item) => item.jenis !== "Produk" || Number(item.stok) > 0);
  const select = byId("sale-item");
  const selected = select.value;
  select.innerHTML = `<option value="">Pilih produk atau jasa</option>${selectable.map((item) =>
    `<option value="${escapeHtml(item.id_item)}">${escapeHtml(item.nama_item)} · ${formatMoney(item.harga_jual)}${item.jenis === "Produk" ? ` · stok ${escapeHtml(item.stok)}` : ""}</option>`
  ).join("")}`;
  if (selectable.some((item) => String(item.id_item) === selected)) select.value = selected;
}

function renderCustomers() {
  const filtered = getFilteredCustomers();
  const body = byId("customers-body");
  byId("customer-list-count").textContent = `${filtered.length} pelanggan`;
  byId("customer-count").textContent = filtered.length;
  if (!filtered.length) body.innerHTML = emptyRow(5, "Tidak ada pelanggan yang cocok.");
  else body.innerHTML = filtered.map((customer) => `<tr>
    <td><strong>${escapeHtml(customer.nama)}</strong></td><td>${escapeHtml(customer.no_hp)}</td>
    <td>${escapeHtml(customer.alamat || "—")}</td><td>${formatDate(customer.tanggal_daftar)}</td>
    <td class="action-cell"><button class="row-action" data-action="edit-customer" data-id="${escapeHtml(customer.id_pelanggan)}">Edit</button><button class="row-action" data-action="delete-customer" data-id="${escapeHtml(customer.id_pelanggan)}">Hapus</button></td>
  </tr>`).join("");
  renderCustomerOptions();
}

function renderItems() {
  const body = byId("items-body");
  byId("item-list-count").textContent = `${state.items.length} item`;
  byId("available-item-count").textContent = state.items.length;
  if (!state.items.length) body.innerHTML = emptyRow(6, "Belum ada produk atau jasa.");
  else body.innerHTML = state.items.map((item) => `<tr>
    <td><strong>${escapeHtml(item.nama_item)}</strong></td>
    <td><span class="badge ${item.jenis === "Produk" ? "badge-product" : "badge-treatment"}">${escapeHtml(item.jenis)}</span></td>
    <td class="money-cell">${formatMoney(item.harga_jual)}</td><td>${item.jenis === "Produk" ? formatMoney(item.harga_pokok) : "—"}</td>
    <td>${item.jenis === "Produk" ? escapeHtml(item.stok) : "—"}</td>
    <td class="action-cell"><button class="row-action" data-action="edit-item" data-id="${escapeHtml(item.id_item)}">Edit</button><button class="row-action" data-action="delete-item" data-id="${escapeHtml(item.id_item)}">Hapus</button></td>
  </tr>`).join("");
  renderItemOptions();
}

function paymentBadge(status) {
  const paid = status === "Lunas";
  return `<span class="badge ${paid ? "badge-paid" : "badge-unpaid"}">${escapeHtml(status)}</span>`;
}

function renderSales() {
  const filtered = getFilteredSales();
  const salesBody = byId("sales-body");
  const recentBody = byId("recent-sales-body");
  if (!filtered.length) {
    salesBody.innerHTML = emptyRow(7, "Tidak ada transaksi yang cocok.");
    recentBody.innerHTML = emptyRow(5, "Belum ada transaksi penjualan.");
    return;
  }
  salesBody.innerHTML = filtered.map((sale) => `<tr>
    <td class="id-cell">#${escapeHtml(sale.id_penjualan)}</td><td>${escapeHtml(sale.pelanggan?.nama || "Pelanggan")}</td>
    <td>${formatDate(sale.tanggal)}</td><td>${escapeHtml(sale.metode_pembayaran)}</td><td>${paymentBadge(sale.status_pembayaran)}</td>
    <td class="money-cell align-right">${formatMoney(sale.total)}</td>
    <td class="action-cell"><button class="row-action" data-sale-action="detail" data-id="${escapeHtml(sale.id_penjualan)}">Detail</button><button class="row-action" data-sale-action="edit-sale" data-id="${escapeHtml(sale.id_penjualan)}">Edit</button><button class="row-action" data-sale-action="receipt" data-id="${escapeHtml(sale.id_penjualan)}">Nota</button></td>
  </tr>`).join("");

  recentBody.innerHTML = state.sales.slice(0, 6).map((sale) => `<tr>
    <td class="id-cell">#${escapeHtml(sale.id_penjualan)}</td><td>${escapeHtml(sale.pelanggan?.nama || "Pelanggan")}</td>
    <td>${formatDate(sale.tanggal)}</td><td>${paymentBadge(sale.status_pembayaran)}</td>
    <td class="money-cell align-right">${formatMoney(sale.total)}</td>
  </tr>`).join("");
}

function renderDashboard(summary) {
  byId("stat-revenue").textContent = formatMoney(summary.pendapatan);
  byId("stat-count").textContent = Number(summary.transaksi || 0).toLocaleString("id-ID");
  byId("stat-receivable").textContent = formatMoney(summary.piutang);
  const payments = summary.recent_installment_payments || [];
  byId("recent-installment-payments-body").innerHTML = payments.length
    ? payments.map((payment) => `<tr>
      <td>${formatDate(payment.tanggal)}</td><td class="id-cell">#${escapeHtml(payment.id_penjualan)}</td>
      <td>${escapeHtml(payment.nama_pelanggan)}</td><td>${payment.cicilan_ke ? `Ke-${escapeHtml(payment.cicilan_ke)}` : "—"}</td>
      <td>${escapeHtml(payment.metode_pembayaran)}</td><td class="money-cell align-right">${formatMoney(payment.jumlah)}</td>
    </tr>`).join("")
    : emptyRow(6, "Belum ada pembayaran cicilan.");
}

function renderReceivables(payload) {
  const summary = payload.summary || {};
  state.receivables = payload.receivables || [];
  byId("receivable-total").textContent = formatMoney(summary.total_piutang);
  byId("receivable-customer-count").textContent = Number(summary.pelanggan_belum_lunas || 0).toLocaleString("id-ID");
  byId("receivable-overdue-count").textContent = Number(summary.cicilan_jatuh_tempo || 0).toLocaleString("id-ID");
  byId("receivable-row-count").textContent = `${state.receivables.length} transaksi`;

  const body = byId("receivables-body");
  if (!state.receivables.length) {
    body.innerHTML = emptyRow(8, "Tidak ada piutang yang belum lunas.");
    return;
  }
  body.innerHTML = state.receivables.map((sale) => {
    const overdue = sale.jatuh_tempo_berikutnya && sale.jatuh_tempo_berikutnya <= todayIso();
    return `<tr class="${overdue ? "overdue-row" : ""}">
      <td class="id-cell">#${escapeHtml(sale.id_penjualan)}</td>
      <td><strong>${escapeHtml(sale.pelanggan?.nama || "Pelanggan")}</strong></td>
      <td class="money-cell">${formatMoney(sale.total)}</td>
      <td>${formatMoney(sale.total_dibayar)}</td>
      <td class="money-cell ${overdue ? "overdue-text" : ""}">${formatMoney(sale.sisa_pembayaran)}</td>
      <td>${escapeHtml(sale.sisa_tenor)} dari ${escapeHtml(sale.jumlah_cicilan)} bulan</td>
      <td class="${overdue ? "overdue-text" : ""}">${formatDate(sale.jatuh_tempo_berikutnya)}${overdue ? ' <span class="overdue-label">Jatuh tempo</span>' : ""}</td>
      <td class="action-cell"><button class="row-action" type="button" data-receivable-detail="${escapeHtml(sale.id_penjualan)}">Detail</button><button class="row-action" type="button" data-pay-receivable="${escapeHtml(sale.id_penjualan)}">Bayar</button></td>
    </tr>`;
  }).join("");
}

function renderReceivableDetail(sale) {
  state.activeReceivable = sale;
  byId("receivable-detail-title").textContent = `Piutang transaksi #${sale.id_penjualan}`;
  byId("receivable-detail-customer").textContent = `${sale.pelanggan?.nama || "Pelanggan"} · Sisa tagihan ${formatMoney(sale.sisa_pembayaran)}`;
  const schedule = sale.jadwal_cicilan || [];
  const nextInstallment = schedule.find((installment) => installment.status !== "Lunas");
  byId("receivable-installments-body").innerHTML = schedule.map((installment) => {
    const isOverdue = installment.status !== "Lunas" && installment.tenggat <= todayIso();
    const canPay = nextInstallment && installment.cicilan_ke === nextInstallment.cicilan_ke;
    return `<tr class="${isOverdue ? "overdue-row" : ""}">
      <td>${escapeHtml(installment.cicilan_ke)}</td>
      <td class="${isOverdue ? "overdue-text" : ""}">${formatDate(installment.tenggat)}${isOverdue ? ' <span class="overdue-label">Terlambat</span>' : ""}</td>
      <td class="money-cell">${formatMoney(installment.jumlah)}</td>
      <td><span class="badge ${installment.status === "Lunas" ? "badge-paid" : "badge-unpaid"}">${escapeHtml(installment.status)}</span></td>
      <td>${canPay ? `<button class="row-action" type="button" data-pay-installment="${escapeHtml(installment.cicilan_ke)}">Bayar</button>` : "—"}</td>
    </tr>`;
  }).join("") || emptyRow(5, "Jadwal cicilan tidak tersedia.");
  renderPaymentHistory("receivable-payment-history-section", "receivable-payment-history-body", sale.payments || []);
  byId("installment-payment-form").hidden = true;
}

async function loadReceivables() {
  renderReceivables(await api("/api/receivables"));
}

function openReceivableDetail(id) {
  const sale = state.receivables.find((row) => String(row.id_penjualan) === String(id));
  if (!sale) return;
  renderReceivableDetail(sale);
  openModal(byId("receivable-detail-modal"));
}

function openInstallmentConfirmation(installment) {
  if (!installment || !state.activeReceivable) return;
  state.activeInstallmentNumber = Number(installment.cicilan_ke);
  state.activeInstallmentAmount = Number(installment.jumlah || 0) - Number(installment.dibayar || 0);
  byId("installment-payment-title").textContent = "Konfirmasi Pembayaran";
  byId("installment-payment-number").value = `Cicilan ke-${state.activeInstallmentNumber}`;
  byId("installment-payment-amount").value = formatMoney(state.activeInstallmentAmount);
  byId("installment-payment-date").value = todayIso();
  byId("installment-payment-method").value = "Tunai";
  byId("installment-payment-note").value = "";
  byId("installment-payment-summary").innerHTML = `Konfirmasi <strong>${escapeHtml(formatMoney(state.activeInstallmentAmount))}</strong> untuk cicilan ke-${escapeHtml(state.activeInstallmentNumber)} dengan jatuh tempo ${escapeHtml(formatDate(installment.tenggat))}.`;
  byId("installment-payment-form").hidden = false;
  byId("installment-payment-date").focus();
}

function renderPaymentHistory(sectionId, bodyId, payments) {
  const section = byId(sectionId);
  section.hidden = !payments.length;
  byId(bodyId).innerHTML = payments.map((payment) => `<tr>
    <td>${formatDate(payment.tanggal)}</td>
    <td>${payment.cicilan_ke ? `Ke-${escapeHtml(payment.cicilan_ke)}` : "Pelunasan"}</td>
    <td>${escapeHtml(payment.metode_bayar || payment.metode_pembayaran || "Tunai")}</td>
    <td class="money-cell">${formatMoney(payment.jumlah)}</td>
    <td>${escapeHtml(payment.catatan || payment.keterangan || "—")}</td>
  </tr>`).join("") || emptyRow(5, "Belum ada pembayaran.");
}

function renderCart() {
  const body = byId("cart-body");
  const total = state.cart.reduce((sum, line) => sum + line.harga_jual * line.jumlah, 0);
  byId("sale-total").textContent = formatMoney(total);
  renderInstallmentPreview();
  if (!state.cart.length) {
    body.innerHTML = emptyRow(4, "Belum ada item ditambahkan");
    return;
  }
  body.innerHTML = state.cart.map((line) => `<tr>
    <td><strong>${escapeHtml(line.nama_item)}</strong><br><span class="muted-cell">${escapeHtml(line.jenis)}</span></td>
    <td>${line.jumlah}</td><td class="money-cell align-right">${formatMoney(line.harga_jual * line.jumlah)}</td>
    <td><button class="remove-line" type="button" data-remove-item="${escapeHtml(line.id_item)}" aria-label="Hapus ${escapeHtml(line.nama_item)}">×</button></td>
  </tr>`).join("");
}

async function loadSales() {
  state.sales = await api("/api/sales");
  renderSales();
}

function openModal(modal) {
  document.querySelectorAll(".modal-backdrop").forEach((element) => { element.hidden = true; });
  modal.hidden = false;
  document.body.classList.add("modal-open");
  modal.querySelector("button")?.focus();
}

function closeModal(modal) {
  modal.hidden = true;
  if (![...document.querySelectorAll(".modal-backdrop")].some((element) => !element.hidden)) {
    document.body.classList.remove("modal-open");
  }
}

function renderSaleDetail(sale) {
  const customer = sale.pelanggan || {};
  byId("detail-modal-title").textContent = `Detail transaksi #${sale.id_penjualan}`;
  byId("detail-number").textContent = `#${sale.id_penjualan}`;
  byId("detail-date").textContent = formatDate(sale.tanggal);
  byId("detail-customer").textContent = customer.nama || "—";
  byId("detail-phone").textContent = customer.no_hp || "—";
  byId("detail-method").textContent = sale.metode_pembayaran || "—";
  byId("detail-status").textContent = sale.status_pembayaran || "—";
  byId("detail-total").textContent = formatMoney(sale.total);
  byId("detail-remaining").textContent = formatMoney(sale.sisa_pembayaran || 0);
  const installmentSection = byId("detail-installment-section");
  const installments = sale.jadwal_cicilan || [];
  installmentSection.hidden = !installments.length;
  byId("detail-installments-body").innerHTML = installments.map((installment) => `<tr>
    <td>${escapeHtml(installment.cicilan_ke)}</td><td>${formatDate(installment.tenggat)}</td>
    <td class="money-cell">${formatMoney(installment.jumlah)}</td><td>${escapeHtml(installment.status)}</td>
  </tr>`).join("");
  renderPaymentHistory("detail-payment-history-section", "detail-payment-history-body", sale.payments || []);
  byId("detail-items-body").innerHTML = (sale.items || []).map((line) => {
    const item = line.item || {};
    return `<tr>
      <td><strong>${escapeHtml(item.nama_item || line.nama_item || "Item")}</strong></td>
      <td>${escapeHtml(item.jenis || line.jenis || "—")}</td>
      <td>${formatMoney(line.harga_satuan)}</td>
      <td>${escapeHtml(line.jumlah)}</td>
      <td class="money-cell align-right">${formatMoney(line.subtotal)}</td>
    </tr>`;
  }).join("") || emptyRow(5, "Detail item tidak tersedia.");
}

function renderReceipt(sale) {
  const customer = sale.pelanggan || {};
  byId("receipt-number").textContent = `#${sale.id_penjualan}`;
  byId("receipt-date").textContent = formatDate(sale.tanggal);
  byId("receipt-customer").textContent = customer.nama || "Pelanggan";
  byId("receipt-method").textContent = sale.metode_pembayaran || "Tunai";
  byId("receipt-status").textContent = sale.status_pembayaran || "Lunas";
  byId("receipt-total").textContent = formatMoney(sale.total);
  byId("receipt-items-body").innerHTML = (sale.items || []).map((line) => {
    const item = line.item || {};
    return `<tr>
      <td>${escapeHtml(item.nama_item || line.nama_item || "Item")}</td>
      <td>${escapeHtml(line.jumlah)}</td>
      <td class="align-right">${formatMoney(line.subtotal)}</td>
    </tr>`;
  }).join("") || `<tr><td colspan="3">Detail item tidak tersedia.</td></tr>`;
}

function renderSaleEditForm(sale) {
  renderCustomerOptions();
  byId("edit-sale-customer").value = String(sale.id_pelanggan || "");
  byId("edit-sale-date").value = String(sale.tanggal || todayIso());
  byId("edit-sale-method").value = sale.metode_pembayaran || "Tunai";
  byId("edit-sale-status").value = sale.status_pembayaran || "Lunas";
}

async function openSaleDetail(id) {
  const sale = await api(`/api/sales/${encodeURIComponent(id)}`);
  state.activeSale = sale;
  renderSaleDetail(sale);
  openModal(byId("sale-detail-modal"));
}

async function openSaleReceipt(id = state.activeSale?.id_penjualan) {
  const sale = state.activeSale?.id_penjualan === id ? state.activeSale : await api(`/api/sales/${encodeURIComponent(id)}`);
  state.activeSale = sale;
  renderReceipt(sale);
  openModal(byId("receipt-modal"));
}

async function openSaleEdit(id) {
  const sale = await api(`/api/sales/${encodeURIComponent(id)}`);
  state.activeSale = sale;
  renderSaleEditForm(sale);
  openModal(byId("sale-edit-modal"));
}

async function performPaymentAction(type) {
  const sale = state.activeSale;
  if (!sale) return;
  const remaining = Number(sale.sisa_pembayaran || 0);

  if (type === "paid") {
    if (remaining <= 0) {
      showNotice("Transaksi ini sudah lunas.", "success");
      return;
    }
    const payload = {
      jumlah: remaining,
      keterangan: "Pelunasan transaksi",
      jenis: "pelunasan",
      metode_pembayaran: sale.metode_pembayaran || "Tunai"
    };
    await api(`/api/sales/${sale.id_penjualan}/payments`, { method: "POST", body: JSON.stringify(payload) });
    closeModal(byId("sale-detail-modal"));
    await loadInitialData();
    showNotice(`Transaksi #${sale.id_penjualan} telah dilunasi.`);
    return;
  }

  const nominalText = window.prompt("Nominal cicilan yang dibayar:", String(remaining > 0 ? remaining : 0));
  const nominal = Number(nominalText || 0);
  if (!nominal || nominal <= 0) return;
  const bulan = window.prompt("Bulan cicilan (YYYY-MM):", todayIso().slice(0, 7));
  const payload = {
    jumlah: Math.min(nominal, remaining),
    keterangan: `Cicilan bulan ${bulan || todayIso().slice(0, 7)}`,
    jenis: "cicilan",
    bulan: bulan || todayIso().slice(0, 7),
    cicilan_ke: 1,
    metode_pembayaran: sale.metode_pembayaran || "Tunai"
  };
  await api(`/api/sales/${sale.id_penjualan}/payments`, { method: "POST", body: JSON.stringify(payload) });
  closeModal(byId("sale-detail-modal"));
  await loadInitialData();
  showNotice(`Cicilan untuk transaksi #${sale.id_penjualan} berhasil dicatat.`);
}

async function loadReport() {
  const start = byId("report-start").value;
  const end = byId("report-end").value;
  const params = new URLSearchParams();
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  const [report, profitLoss, ledger, receivablePaymentReport] = await Promise.all([
    api(`/api/reports?${params.toString()}`),
    api(`/api/finance/profit-loss?${params.toString()}`),
    api(`/api/finance/ledger?${params.toString()}`),
    api(`/api/reports/receivable-payments?${params.toString()}`)
  ]);
  state.report = report;
  state.reportFinance = { profitLoss, ledger };
  state.receivablePaymentReport = receivablePaymentReport;
  renderReport();
}

function renderProfitLoss() {
  const body = byId("profit-loss-body");
  const rows = state.reportFinance.profitLoss?.rows || [];
  if (!rows.length) {
    body.innerHTML = emptyRow(2, "Tidak ada data laba rugi.");
    return;
  }
  body.innerHTML = rows.map((row) => `<tr>
    <td>${escapeHtml(row.akun)}</td>
    <td class="money-cell">${formatMoney(row.nilai)}</td>
  </tr>`).join("");
}

function renderLedger() {
  const body = byId("ledger-body");
  const rows = state.reportFinance.ledger || [];
  if (!rows.length) {
    body.innerHTML = emptyRow(5, "Tidak ada transaksi buku besar.");
    return;
  }
  body.innerHTML = rows.map((row) => `<tr>
    <td>${formatDate(row.tanggal)}</td>
    <td>${escapeHtml(row.akun)}</td>
    <td class="money-cell">${Number(row.debit) ? formatMoney(row.debit) : "—"}</td>
    <td class="money-cell">${Number(row.kredit) ? formatMoney(row.kredit) : "—"}</td>
    <td>${escapeHtml(row.keterangan || "—")}</td>
  </tr>`).join("");
}

function renderReport() {
  const productRows = state.report.filter((row) => row.jenis === "Produk");
  const treatmentRows = state.report.filter((row) => row.jenis === "Jasa Treatment");
  const sum = (rows) => rows.reduce((total, row) => total + Number(row.subtotal || 0), 0);
  const quantity = (rows) => rows.reduce((total, row) => total + Number(row.jumlah || 0), 0);
  byId("report-products-total").textContent = formatMoney(sum(productRows));
  byId("report-treatment-total").textContent = formatMoney(sum(treatmentRows));
  byId("report-grand-total").textContent = formatMoney(sum(state.report));
  byId("report-products-count").textContent = `${quantity(productRows)} produk terjual`;
  byId("report-treatment-count").textContent = `${quantity(treatmentRows)} treatment terjual`;
  byId("report-row-count").textContent = `${state.report.length} baris detail`;
  const receivablePayments = state.receivablePaymentReport.payments || [];
  byId("report-receivable-cash-total").textContent = formatMoney(state.receivablePaymentReport.total_kas_masuk);
  byId("receivable-payments-report-body").innerHTML = receivablePayments.length
    ? receivablePayments.map((payment) => `<tr>
      <td>${formatDate(payment.tanggal)}</td><td class="id-cell">#${escapeHtml(payment.id_penjualan)}</td>
      <td>${escapeHtml(payment.nama_pelanggan)}</td><td>${payment.cicilan_ke ? `Ke-${escapeHtml(payment.cicilan_ke)}` : "—"}</td>
      <td>${escapeHtml(payment.metode_pembayaran)}</td><td>${escapeHtml(payment.keterangan || "—")}</td>
      <td class="money-cell align-right">${formatMoney(payment.nominal)}</td>
    </tr>`).join("")
    : emptyRow(7, "Tidak ada pelunasan piutang pada periode ini.");
  const body = byId("reports-body");
  if (!state.report.length) {
    body.innerHTML = emptyRow(7, "Tidak ada penjualan pada periode ini.");
  } else {
    body.innerHTML = state.report.map((row) => `<tr>
      <td>${formatDate(row.tanggal)}</td><td class="id-cell">#${escapeHtml(row.id_penjualan)}</td>
      <td>${escapeHtml(row.nama_pelanggan)}</td><td><strong>${escapeHtml(row.nama_item)}</strong></td>
      <td><span class="badge ${row.jenis === "Produk" ? "badge-product" : "badge-treatment"}">${escapeHtml(row.jenis)}</span></td>
      <td>${escapeHtml(row.jumlah)}</td><td class="money-cell align-right">${formatMoney(row.subtotal)}</td>
    </tr>`).join("");
  }
  renderProfitLoss();
  renderLedger();
}

async function loadJournal() {
  const rows = await api("/api/journal");
  const body = byId("journal-body");
  if (!rows.length) {
    body.innerHTML = emptyRow(6, "Jurnal akan muncul setelah transaksi dicatat.");
    return;
  }
  body.innerHTML = rows.map((row) => `<tr>
    <td>${formatDate(row.tanggal)}</td><td class="id-cell">#${escapeHtml(row.id_penjualan)}</td>
    <td>${escapeHtml(row.keterangan)}</td><td><strong>${escapeHtml(row.akun)}</strong></td>
    <td class="money-cell align-right">${Number(row.debit) ? formatMoney(row.debit) : "—"}</td>
    <td class="money-cell align-right">${Number(row.kredit) ? formatMoney(row.kredit) : "—"}</td>
  </tr>`).join("");
}

async function loadInitialData() {
  byId("today-label").textContent = dateFormatter.format(new Date());
  byId("footer-year").textContent = new Date().getFullYear();
  byId("sale-date").value = todayIso();
  byId("installment-first-due").value = addMonths(todayIso(), 1);
  byId("customer-date").value = todayIso();
  const today = todayIso();
  const firstDay = `${today.slice(0, 8)}01`;
  byId("report-start").value = firstDay;
  byId("report-end").value = today;
  try {
    const [customers, items, sales, summary] = await Promise.all([
      api("/api/customers"),
      api("/api/items"),
      api("/api/sales"),
      api("/api/dashboard")
    ]);
    state.customers = customers;
    state.items = items;
    state.sales = sales;
    renderCustomers();
    renderItems();
    renderSales();
    renderDashboard(summary);
    await loadReport();
    await loadReceivables();
  } catch (error) {
    state.customers = [];
    state.items = [];
    state.sales = [];
    renderCustomers();
    renderItems();
    renderSales();
    renderDashboard({ pendapatan: 0, transaksi: 0, piutang: 0 });
    handleError(error);
  }
}

function enterDemoMode() {
  sessionStorage.setItem(DEMO_LOGIN_KEY, "true");
  toggleAuthScreen(false);
  setView("dashboard");
  loadInitialData();
}

function initializeDemoMode() {
  const isLoggedIn = sessionStorage.getItem(DEMO_LOGIN_KEY) === "true";
  toggleAuthScreen(!isLoggedIn);
  if (isLoggedIn) {
    setView(hashViews[location.hash.slice(1)] || "dashboard");
    loadInitialData();
  }
}

byId("demo-login").addEventListener("click", enterDemoMode);
byId("sign-out").addEventListener("click", () => {
  sessionStorage.removeItem(DEMO_LOGIN_KEY);
  toggleAuthScreen(true);
});

byId("customer-search").addEventListener("input", (event) => {
  state.customerQuery = event.target.value.trim();
  renderCustomers();
});

byId("sales-search").addEventListener("input", (event) => {
  state.salesQuery = event.target.value.trim();
  renderSales();
});

byId("sales-status-filter").addEventListener("change", (event) => {
  state.salesStatusFilter = event.target.value;
  renderSales();
});

document.querySelectorAll(".nav-link").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.view));
});
document.querySelectorAll("[data-go]").forEach((button) => {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    setView(button.dataset.go);
  });
});

byId("customer-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = byId("customer-id").value;
  const data = {
    nama: byId("customer-name").value.trim(),
    no_hp: byId("customer-phone").value.trim(),
    alamat: byId("customer-address").value.trim(),
    tanggal_daftar: byId("customer-date").value
  };
  try {
    await api(id ? `/api/customers/${id}` : "/api/customers", { method: id ? "PUT" : "POST", body: JSON.stringify(data) });
    byId("customer-form").reset();
    byId("customer-id").value = "";
    byId("customer-date").value = todayIso();
    byId("customer-form-title").textContent = "Tambah pelanggan";
    byId("customer-submit").textContent = "Simpan pelanggan";
    byId("customer-cancel").hidden = true;
    state.customers = await api("/api/customers");
    renderCustomers();
    showNotice(id ? "Data pelanggan berhasil diperbarui." : "Pelanggan berhasil ditambahkan.");
  } catch (error) { handleError(error); }
});

byId("customer-cancel").addEventListener("click", () => {
  byId("customer-form").reset();
  byId("customer-id").value = "";
  byId("customer-date").value = todayIso();
  byId("customer-form-title").textContent = "Tambah pelanggan";
  byId("customer-submit").textContent = "Simpan pelanggan";
  byId("customer-cancel").hidden = true;
});

byId("customers-body").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const customer = state.customers.find((row) => String(row.id_pelanggan) === button.dataset.id);
  if (!customer) return;
  if (button.dataset.action === "edit-customer") {
    byId("customer-id").value = customer.id_pelanggan;
    byId("customer-name").value = customer.nama;
    byId("customer-phone").value = customer.no_hp;
    byId("customer-address").value = customer.alamat || "";
    byId("customer-date").value = String(customer.tanggal_daftar).slice(0, 10);
    byId("customer-form-title").textContent = "Edit pelanggan";
    byId("customer-submit").textContent = "Simpan perubahan";
    byId("customer-cancel").hidden = false;
    byId("customer-name").focus();
  } else if (window.confirm(`Hapus data pelanggan ${customer.nama}?`)) {
    try {
      await api(`/api/customers/${customer.id_pelanggan}`, { method: "DELETE" });
      state.customers = await api("/api/customers");
      renderCustomers();
      showNotice("Pelanggan berhasil dihapus.");
    } catch (error) { handleError(error); }
  }
});

function updateItemTypeFields() {
  const isService = byId("item-type").value === "Jasa Treatment";
  document.querySelectorAll(".product-only-field").forEach((field) => { field.hidden = isService; });
  if (isService) {
    byId("item-cost").value = "0";
    byId("item-stock").value = "";
  } else if (!byId("item-stock").value) {
    byId("item-stock").value = "0";
  }
}

byId("item-type").addEventListener("change", updateItemTypeFields);
byId("item-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = byId("item-id").value;
  const service = byId("item-type").value === "Jasa Treatment";
  const data = {
    nama_item: byId("item-name").value.trim(),
    jenis: byId("item-type").value,
    harga_jual: Number(byId("item-price").value),
    harga_pokok: service ? 0 : Number(byId("item-cost").value),
    stok: service ? null : Number(byId("item-stock").value)
  };
  try {
    await api(id ? `/api/items/${id}` : "/api/items", { method: id ? "PUT" : "POST", body: JSON.stringify(data) });
    byId("item-form").reset();
    byId("item-id").value = "";
    byId("item-cost").value = "0";
    byId("item-stock").value = "0";
    byId("item-form-title").textContent = "Tambah produk atau jasa";
    byId("item-submit").textContent = "Simpan item";
    byId("item-cancel").hidden = true;
    updateItemTypeFields();
    state.items = await api("/api/items");
    renderItems();
    showNotice(id ? "Item berhasil diperbarui." : "Item berhasil ditambahkan.");
  } catch (error) { handleError(error); }
});

byId("item-cancel").addEventListener("click", () => {
  byId("item-form").reset();
  byId("item-id").value = "";
  byId("item-cost").value = "0";
  byId("item-stock").value = "0";
  byId("item-form-title").textContent = "Tambah produk atau jasa";
  byId("item-submit").textContent = "Simpan item";
  byId("item-cancel").hidden = true;
  updateItemTypeFields();
});

byId("items-body").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const item = state.items.find((row) => String(row.id_item) === button.dataset.id);
  if (!item) return;
  if (button.dataset.action === "edit-item") {
    byId("item-id").value = item.id_item;
    byId("item-name").value = item.nama_item;
    byId("item-type").value = item.jenis;
    byId("item-price").value = item.harga_jual;
    byId("item-cost").value = item.harga_pokok;
    byId("item-stock").value = item.stok ?? "";
    updateItemTypeFields();
    byId("item-form-title").textContent = "Edit produk atau jasa";
    byId("item-submit").textContent = "Simpan perubahan";
    byId("item-cancel").hidden = false;
    byId("item-name").focus();
  } else if (window.confirm(`Hapus item ${item.nama_item}?`)) {
    try {
      await api(`/api/items/${item.id_item}`, { method: "DELETE" });
      state.items = await api("/api/items");
      renderItems();
      showNotice("Item berhasil dihapus.");
    } catch (error) { handleError(error); }
  }
});

byId("add-sale-item").addEventListener("click", () => {
  const item = state.items.find((row) => String(row.id_item) === byId("sale-item").value);
  const quantity = Number(byId("sale-quantity").value);
  if (!item) return showNotice("Pilih produk atau jasa terlebih dahulu.", "error");
  if (!Number.isInteger(quantity) || quantity < 1) return showNotice("Jumlah item minimal satu.", "error");
  const existing = state.cart.find((line) => String(line.id_item) === String(item.id_item));
  const requestedQuantity = quantity + (existing?.jumlah || 0);
  if (item.jenis === "Produk" && requestedQuantity > Number(item.stok)) {
    return showNotice(`Stok ${item.nama_item} hanya ${item.stok}.`, "error");
  }
  if (existing) existing.jumlah = requestedQuantity;
  else state.cart.push({ ...item, jumlah: quantity });
  byId("sale-item").value = "";
  byId("sale-quantity").value = "1";
  renderCart();
});

byId("cart-body").addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-item]");
  if (!button) return;
  state.cart = state.cart.filter((line) => String(line.id_item) !== button.dataset.removeItem);
  renderCart();
});

function renderInstallmentPreview() {
  const preview = byId("installment-preview");
  const months = Number(byId("installment-months").value);
  const total = state.cart.reduce((sum, line) => sum + line.harga_jual * line.jumlah, 0);
  const firstDue = byId("installment-first-due").value;
  if (!months || !firstDue || !total) {
    preview.innerHTML = "<span>Tambahkan item dan pilih tenor untuk melihat jadwal cicilan.</span>";
    return;
  }
  const baseAmount = Math.floor(total / months);
  preview.innerHTML = Array.from({ length: months }, (_, index) => {
    const amount = index === months - 1 ? total - baseAmount * (months - 1) : baseAmount;
    return `<div class="installment-preview-row"><span>Ke-${index + 1}</span><span>Jatuh tempo ${formatDate(addMonths(firstDue, index))}</span><strong>${formatMoney(amount)}</strong></div>`;
  }).join("");
}

function updateInstallmentFields() {
  const isCredit = byId("sale-method").value === "Kredit";
  byId("installment-fields").hidden = !isCredit;
  byId("installment-months").required = isCredit;
  byId("installment-first-due").required = isCredit;
  byId("installment-first-due").min = byId("sale-date").value || todayIso();
  byId("sale-status").disabled = isCredit;
  if (isCredit) {
    byId("sale-status").value = "Belum Lunas";
    if (!byId("installment-first-due").value) {
      byId("installment-first-due").value = addMonths(byId("sale-date").value || todayIso(), 1);
    }
  }
  renderInstallmentPreview();
}

byId("sale-method").addEventListener("change", updateInstallmentFields);
byId("sale-date").addEventListener("change", () => {
  byId("installment-first-due").min = byId("sale-date").value || todayIso();
  if (byId("sale-method").value === "Kredit") {
    byId("installment-first-due").value = addMonths(byId("sale-date").value || todayIso(), 1);
  }
  renderInstallmentPreview();
});
byId("installment-months").addEventListener("change", renderInstallmentPreview);
byId("installment-first-due").addEventListener("change", renderInstallmentPreview);

byId("receivables-body").addEventListener("click", (event) => {
  const detailButton = event.target.closest("[data-receivable-detail]");
  if (detailButton) {
    openReceivableDetail(detailButton.dataset.receivableDetail);
    return;
  }
  const payButton = event.target.closest("[data-pay-receivable]");
  if (!payButton) return;
  openReceivableDetail(payButton.dataset.payReceivable);
  const nextInstallment = state.activeReceivable?.jadwal_cicilan.find((installment) => installment.status !== "Lunas");
  openInstallmentConfirmation(nextInstallment);
});

byId("receivable-installments-body").addEventListener("click", (event) => {
  const button = event.target.closest("[data-pay-installment]");
  if (!button || !state.activeReceivable) return;
  const installment = state.activeReceivable.jadwal_cicilan.find((row) => String(row.cicilan_ke) === button.dataset.payInstallment);
  openInstallmentConfirmation(installment);
});

byId("cancel-installment-payment").addEventListener("click", () => {
  byId("installment-payment-form").hidden = true;
});

byId("installment-payment-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.activeReceivable || !state.activeInstallmentNumber) return;
  const saleId = state.activeReceivable.id_penjualan;
  const submitButton = byId("installment-payment-form").querySelector("button[type='submit']");
  submitButton.disabled = true;
  try {
    await api(`/api/sales/${saleId}/installments/${state.activeInstallmentNumber}/payments`, {
      method: "POST",
      body: JSON.stringify({
        tanggal_bayar: byId("installment-payment-date").value,
        metode_bayar: byId("installment-payment-method").value,
        catatan: byId("installment-payment-note").value.trim()
      })
    });
    await Promise.all([loadReceivables(), loadSales(), loadReport(), loadJournal()]);
    renderDashboard(await api("/api/dashboard"));
    const updatedSale = state.receivables.find((row) => String(row.id_penjualan) === String(saleId));
    state.activeReceivable = null;
    state.activeInstallmentNumber = null;
    state.activeInstallmentAmount = 0;
    byId("installment-payment-form").hidden = true;
    closeModal(byId("receivable-detail-modal"));
    showNotice(`Pembayaran cicilan transaksi #${saleId} berhasil dicatat.`);
  } catch (error) { handleError(error); }
  finally { submitButton.disabled = false; }
});

byId("sale-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.cart.length) return showNotice("Tambahkan minimal satu item penjualan.", "error");
  const button = byId("sale-form").querySelector("button[type='submit']");
  button.disabled = true;
  try {
    const result = await api("/api/sales", {
      method: "POST",
      body: JSON.stringify({
        id_pelanggan: Number(byId("sale-customer").value),
        tanggal: byId("sale-date").value,
        metode_pembayaran: byId("sale-method").value,
        status_pembayaran: byId("sale-status").value,
        cicilan_bulan: Number(byId("installment-months").value),
        tanggal_jatuh_tempo_pertama: byId("installment-first-due").value,
        items: state.cart.map((line) => ({ id_item: line.id_item, jumlah: line.jumlah }))
      })
    });
    state.cart = [];
    renderCart();
    byId("sale-form").reset();
    byId("sale-date").value = todayIso();
    byId("installment-first-due").value = addMonths(todayIso(), 1);
    byId("sale-status").value = "Lunas";
    updateInstallmentFields();
    await loadInitialData();
    await openSaleDetail(result.id_penjualan);
    showNotice(`Transaksi #${result.id_penjualan} berhasil disimpan.`);
  } catch (error) { handleError(error); }
  finally { button.disabled = false; }
});

byId("report-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (byId("report-start").value && byId("report-end").value && byId("report-start").value > byId("report-end").value) {
    return showNotice("Tanggal awal tidak boleh melewati tanggal akhir.", "error");
  }
  loadReport().catch(handleError);
});

byId("sales-body").addEventListener("click", (event) => {
  const button = event.target.closest("[data-sale-action]");
  if (!button) return;
  if (button.dataset.saleAction === "detail") openSaleDetail(button.dataset.id).catch(handleError);
  if (button.dataset.saleAction === "receipt") openSaleReceipt(button.dataset.id).catch(handleError);
  if (button.dataset.saleAction === "edit-sale") openSaleEdit(button.dataset.id).catch(handleError);
});

document.querySelectorAll("[data-close-modal]").forEach((button) => {
  button.addEventListener("click", () => closeModal(button.closest(".modal-backdrop")));
});
document.querySelectorAll(".modal-backdrop").forEach((modal) => {
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal(modal);
  });
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    document.querySelectorAll(".modal-backdrop:not([hidden])").forEach(closeModal);
  }
});

byId("detail-open-receipt").addEventListener("click", () => {
  closeModal(byId("sale-detail-modal"));
  openSaleReceipt().catch(handleError);
});

byId("detail-mark-paid").addEventListener("click", () => {
  performPaymentAction("paid").catch(handleError);
});

byId("detail-add-installment").addEventListener("click", () => {
  performPaymentAction("installment").catch(handleError);
});

byId("receipt-open-detail").addEventListener("click", () => {
  closeModal(byId("receipt-modal"));
  if (state.activeSale) {
    renderSaleDetail(state.activeSale);
    openModal(byId("sale-detail-modal"));
  }
});

byId("receipt-print").addEventListener("click", () => window.print());

byId("sale-edit-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.activeSale) return;
  const payload = {
    id_pelanggan: Number(byId("edit-sale-customer").value),
    tanggal: byId("edit-sale-date").value,
    metode_pembayaran: byId("edit-sale-method").value,
    status_pembayaran: byId("edit-sale-status").value
  };
  try {
    await api(`/api/sales/${state.activeSale.id_penjualan}`, { method: "PUT", body: JSON.stringify(payload) });
    closeModal(byId("sale-edit-modal"));
    await loadInitialData();
    showNotice("Transaksi berhasil diperbarui.");
  } catch (error) { handleError(error); }
});

document.querySelectorAll("[data-report-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    const selected = button.dataset.reportTab;
    document.querySelectorAll("[data-report-tab]").forEach((tab) => tab.classList.toggle("is-active", tab === button));
    document.getElementById("profit-loss-panel").classList.toggle("is-active", selected === "profit-loss");
    document.getElementById("ledger-panel").classList.toggle("is-active", selected === "ledger");
  });
});

byId("export-report-csv").addEventListener("click", () => {
  const rows = state.report || [];
  if (!rows.length) {
    showNotice("Belum ada data untuk diekspor.", "error");
    return;
  }
  const csv = [
    ["Tanggal", "No. transaksi", "Pelanggan", "Item", "Jenis", "Jumlah", "Subtotal"],
    ...rows.map((row) => [row.tanggal, row.id_penjualan, row.nama_pelanggan, row.nama_item, row.jenis, row.jumlah, row.subtotal])
  ].map((line) => line.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "laporan-penjualan.csv";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  showNotice("Laporan berhasil diekspor ke Excel/CSV.");
});

byId("print-report-pdf").addEventListener("click", () => window.print());

updateInstallmentFields();
initializeDemoMode();
