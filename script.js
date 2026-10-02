const state = { customers: [], items: [], sales: [], cart: [], report: [], activeSale: null };
const money = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const dateFormatter = new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" });
const viewNames = {
  dashboard: "Dashboard",
  transactions: "Transaksi",
  customers: "Pelanggan",
  items: "Produk & Jasa",
  reports: "Laporan Penjualan",
  journal: "Jurnal Umum"
};

const byId = (id) => document.getElementById(id);
const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[character]));
const formatMoney = (value) => money.format(Number(value) || 0);
const formatDate = (value) => value ? dateFormatter.format(new Date(`${String(value).slice(0, 10)}T00:00:00`)) : "—";

async function api(path, options = {}) {
  if (window.location.protocol === "file:") {
    throw new Error("Untuk mengakses data, jalankan node backend/app.js lalu buka http://localhost:3000.");
  }
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const text = await response.text();
  let payload = null;
  if (text) {
    try { payload = JSON.parse(text); } catch { payload = text; }
  }
  if (!response.ok) throw new Error(payload?.message || "Permintaan tidak bisa diproses.");
  return payload;
}

function showNotice(message, type = "success") {
  const notice = byId("notice");
  notice.textContent = message;
  notice.className = `notice ${type}`;
  notice.hidden = false;
  window.clearTimeout(showNotice.timeout);
  showNotice.timeout = window.setTimeout(() => { notice.hidden = true; }, 5000);
}

function handleError(error) {
  showNotice(error.message || "Terjadi kesalahan.", "error");
}

function emptyRow(columnCount, message) {
  return `<tr><td colspan="${columnCount}" class="empty-state">${escapeHtml(message)}</td></tr>`;
}

function setView(view) {
  if (!viewNames[view]) return;
  document.querySelectorAll(".view-panel").forEach((panel) => panel.classList.toggle("active", panel.id === `view-${view}`));
  document.querySelectorAll(".nav-link").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  byId("current-page").textContent = viewNames[view];
  byId("page-title").textContent = view === "dashboard" ? "Selamat datang kembali" : viewNames[view];
  if (view === "reports") loadReport().catch(handleError);
  if (view === "journal") loadJournal().catch(handleError);
  if (view === "transactions") loadSales().catch(handleError);
}

function setSelectOptions(select, rows, placeholder, idKey, nameKey, nameSuffix = "") {
  const selected = select.value;
  select.innerHTML = `<option value="">${placeholder}</option>${rows.map((row) =>
    `<option value="${escapeHtml(row[idKey])}">${escapeHtml(row[nameKey])}${nameSuffix ? ` · ${escapeHtml(row[nameSuffix])}` : ""}</option>`
  ).join("")}`;
  if (rows.some((row) => String(row[idKey]) === selected)) select.value = selected;
}

function renderCustomerOptions() {
  setSelectOptions(byId("sale-customer"), state.customers, "Pilih pelanggan", "id_pelanggan", "nama");
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
  const body = byId("customers-body");
  byId("customer-list-count").textContent = `${state.customers.length} pelanggan`;
  byId("customer-count").textContent = state.customers.length;
  if (!state.customers.length) body.innerHTML = emptyRow(5, "Belum ada data pelanggan.");
  else body.innerHTML = state.customers.map((customer) => `<tr>
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
  const salesBody = byId("sales-body");
  const recentBody = byId("recent-sales-body");
  if (!state.sales.length) {
    salesBody.innerHTML = emptyRow(6, "Belum ada transaksi penjualan.");
    recentBody.innerHTML = emptyRow(5, "Belum ada transaksi penjualan.");
    return;
  }
  const rows = state.sales.map((sale) => `<tr>
    <td class="id-cell">#${escapeHtml(sale.id_penjualan)}</td><td>${escapeHtml(sale.pelanggan?.nama || "Pelanggan")}</td>
    <td>${formatDate(sale.tanggal)}</td><td>${escapeHtml(sale.metode_pembayaran)}</td><td>${paymentBadge(sale.status_pembayaran)}</td>
    <td class="money-cell align-right">${formatMoney(sale.total)}</td>
    <td class="action-cell"><button class="row-action" data-sale-action="detail" data-id="${escapeHtml(sale.id_penjualan)}">Detail</button><button class="row-action" data-sale-action="receipt" data-id="${escapeHtml(sale.id_penjualan)}">Nota</button></td>
  </tr>`);
  salesBody.innerHTML = rows.join("");
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
}

function renderCart() {
  const body = byId("cart-body");
  const total = state.cart.reduce((sum, line) => sum + line.harga_jual * line.jumlah, 0);
  byId("sale-total").textContent = formatMoney(total);
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
  byId("detail-items-body").innerHTML = sale.items.map((line) => {
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
  byId("receipt-items-body").innerHTML = sale.items.map((line) => {
    const item = line.item || {};
    return `<tr>
      <td>${escapeHtml(item.nama_item || line.nama_item || "Item")}</td>
      <td>${escapeHtml(line.jumlah)}</td>
      <td class="align-right">${formatMoney(line.subtotal)}</td>
    </tr>`;
  }).join("") || `<tr><td colspan="3">Detail item tidak tersedia.</td></tr>`;
}

async function openSaleDetail(id) {
  const sale = await api(`/api/sales/${encodeURIComponent(id)}`);
  state.activeSale = sale;
  renderSaleDetail(sale);
  openModal(byId("sale-detail-modal"));
}

async function openSaleReceipt(id = state.activeSale?.id_penjualan) {
  const sale = state.activeSale?.id_penjualan === id
    ? state.activeSale
    : await api(`/api/sales/${encodeURIComponent(id)}`);
  state.activeSale = sale;
  renderReceipt(sale);
  openModal(byId("receipt-modal"));
}

byId("sales-body").addEventListener("click", (event) => {
  const button = event.target.closest("[data-sale-action]");
  if (!button) return;
  const action = button.dataset.saleAction === "receipt" ? openSaleReceipt(button.dataset.id) : openSaleDetail(button.dataset.id);
  action.catch(handleError);
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
byId("receipt-open-detail").addEventListener("click", () => {
  closeModal(byId("receipt-modal"));
  if (state.activeSale) {
    renderSaleDetail(state.activeSale);
    openModal(byId("sale-detail-modal"));
  }
});
byId("receipt-print").addEventListener("click", () => window.print());

async function loadReport() {
  const start = byId("report-start").value;
  const end = byId("report-end").value;
  const params = new URLSearchParams();
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  state.report = await api(`/api/reports?${params.toString()}`);
  renderReport();
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
  const body = byId("reports-body");
  if (!state.report.length) {
    body.innerHTML = emptyRow(7, "Tidak ada penjualan pada periode ini.");
    return;
  }
  body.innerHTML = state.report.map((row) => `<tr>
    <td>${formatDate(row.tanggal)}</td><td class="id-cell">#${escapeHtml(row.id_penjualan)}</td>
    <td>${escapeHtml(row.nama_pelanggan)}</td><td><strong>${escapeHtml(row.nama_item)}</strong></td>
    <td><span class="badge ${row.jenis === "Produk" ? "badge-product" : "badge-treatment"}">${escapeHtml(row.jenis)}</span></td>
    <td>${escapeHtml(row.jumlah)}</td><td class="money-cell align-right">${formatMoney(row.subtotal)}</td>
  </tr>`).join("");
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
  byId("customer-date").value = todayIso();
  const today = todayIso();
  const firstDay = `${today.slice(0, 8)}01`;
  byId("report-start").value = firstDay;
  byId("report-end").value = today;
  try {
    const [customers, items, sales, summary] = await Promise.all([
      api("/api/customers"), api("/api/items"), api("/api/sales"), api("/api/dashboard")
    ]);
    state.customers = customers;
    state.items = items;
    state.sales = sales;
    renderCustomers();
    renderItems();
    renderSales();
    renderDashboard(summary);
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

document.querySelectorAll(".nav-link").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.view));
});
document.querySelectorAll("[data-go]").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.go));
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

byId("sale-method").addEventListener("change", () => {
  if (byId("sale-method").value === "Kredit") byId("sale-status").value = "Belum Lunas";
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
        items: state.cart.map((line) => ({ id_item: line.id_item, jumlah: line.jumlah }))
      })
    });
    state.cart = [];
    renderCart();
    byId("sale-form").reset();
    byId("sale-date").value = todayIso();
    byId("sale-status").value = "Lunas";
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

loadInitialData();
