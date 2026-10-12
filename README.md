# Lsty Klinik - Sistem Informasi Akuntansi Penjualan Produk dan Jasa Treatment pada Klinik Kecantikan

Lsty Klinik adalah aplikasi demo Sistem Informasi Akuntansi untuk membantu pencatatan penjualan produk dan jasa treatment pada klinik kecantikan. Aplikasi ini mengelola data pelanggan, katalog, transaksi, serta pencatatan dan laporan keuangan. Data utama disimpan menggunakan Supabase (PostgreSQL), sementara server Node.js menyediakan antarmuka untuk penggunaan lokal.

## Identitas Tugas

| Keterangan | Detail |
|---|---|
| Nama | Anisa Listiyani |
| NIM | 12030124120060 |
| Mata Kuliah | Pengkodean dan Pemrograman |
| Kelas | D |
| Dosen Pengampu | Dr. Totok Dewayanto, S.E., M.Si., Akt. |

**Disusun untuk memenuhi Tugas Project UTS Pengkodean dan Pemrograman.**

## Tautan Proyek

- Repository GitHub: [https://github.com/listiyanianisa20-collab/LstyKlinik](https://github.com/listiyanianisa20-collab/LstyKlinik)
- Demo aplikasi: [https://listiyanianisa20-collab.github.io/LstyKlinik/](https://listiyanianisa20-collab.github.io/LstyKlinik/)

## Demo

[Buka demo Lsty Klinik](https://listiyanianisa20-collab.github.io/LstyKlinik/)

Situs tersebut merupakan **mode demo**. Tombol login hanya formalitas; pengguna dapat masuk tanpa mengisi email maupun kata sandi.

## Fitur Utama

- CRUD data pelanggan serta produk dan jasa treatment.
- Pencatatan transaksi penjualan produk dan jasa.
- Pengelolaan piutang dan jadwal serta pembayaran cicilan.
- Pembuatan jurnal umum otomatis dari transaksi dan pembayaran cicilan.
- Laporan penjualan dan pelunasan piutang berdasarkan periode.
- Laporan Laba Rugi dan Buku Besar.
- Pembuatan serta pencetakan nota transaksi.
- Ekspor laporan ke format CSV yang dapat dibuka di Excel.
- Cetak laporan melalui dialog cetak browser dan simpan sebagai PDF.

## Struktur Folder

```text
.
├── index.html                 # Pengarah dari folder luar ke frontend/index.html
├── frontend/
│   ├── index.html             # Halaman aplikasi
│   ├── style.css              # Gaya dan tata letak antarmuka
│   └── script.js              # Logika aplikasi dan koneksi ke Supabase
└── backend/
    ├── database.sql           # Skema, view, fungsi, kebijakan demo, dan data contoh Supabase
    ├── app.js                 # Server Node.js untuk menyajikan frontend secara lokal
    └── data.json              # Data contoh yang disertakan untuk referensi/demo
```

## ERD dan Entitas

Database memiliki **4 entitas (tabel)**:

| Entitas | Fungsi |
|---|---|
| `pelanggan` | Menyimpan identitas dan informasi kontak pelanggan klinik. |
| `item` | Menyimpan katalog produk dan jasa treatment beserta harga dan informasi stok produk. |
| `penjualan` | Menyimpan transaksi penjualan, pelanggan, tanggal, metode, status pembayaran, dan total. |
| `detail_penjualan` | Menyimpan item, jumlah, harga satuan, dan subtotal untuk setiap transaksi penjualan. |

Relasi antartabel:

- `pelanggan` **1 : N** `penjualan`: satu pelanggan dapat memiliki banyak transaksi.
- `penjualan` **1 : N** `detail_penjualan`: satu transaksi dapat memiliki banyak baris detail.
- `item` **1 : N** `detail_penjualan`: satu item dapat muncul di banyak baris detail penjualan.

Jadwal dan pembayaran cicilan disimpan pada kolom `jadwal_cicilan` (JSONB) dan tenor pada kolom `tenor` di tabel `penjualan`. Jurnal umum, laporan, dan piutang disajikan lewat *view* database, bukan tabel tambahan.

## Teknologi

- HTML
- CSS
- JavaScript
- Node.js
- Supabase (PostgreSQL)

## Cara Menjalankan

### a. Melalui GitHub Pages

Buka [halaman demo Lsty Klinik](https://listiyanianisa20-collab.github.io/LstyKlinik/). Login di halaman tersebut bersifat formalitas dan tidak memerlukan email atau kata sandi.

### b. Menjalankan secara lokal

Pastikan Node.js sudah terpasang. Dari folder utama proyek, jalankan:

```bash
node backend/app.js
```

Kemudian buka [http://localhost:3000](http://localhost:3000) di browser. Server lokal ini menyajikan frontend; agar fitur yang menggunakan data berjalan, siapkan koneksi Supabase seperti pada langkah berikut.

### c. Menyiapkan database Supabase

1. Buka **SQL Editor** pada proyek Supabase, lalu jalankan isi file `backend/database.sql`.
2. Buka `frontend/script.js` dan isi `SUPABASE_URL` serta `SUPABASE_ANON_KEY` di bagian atas file menggunakan URL proyek dan *publishable key* milik Anda.

Jangan mencantumkan kunci Supabase di README atau membagikan kunci rahasia.

## Catatan Keamanan

Aplikasi menggunakan *publishable key*, bukan *secret key*. Kebijakan akses database pada skema disiapkan secara terbuka untuk kebutuhan demo dan penilaian, sehingga aplikasi ini **tidak ditujukan untuk menyimpan data pelanggan sungguhan** atau digunakan sebagai sistem produksi.
