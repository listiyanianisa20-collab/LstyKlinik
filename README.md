# Lsty Klinik

Sistem Informasi Akuntansi Penjualan Produk dan Jasa Treatment untuk klinik kecantikan.

## Fitur

- Kelola pelanggan
- Kelola produk dan jasa treatment
- Catat transaksi penjualan
- Lihat laporan penjualan per periode
- Lihat jurnal umum otomatis
- Nota transaksi / bukti pembayaran

## Struktur project

- `backend/` - server statis Node.js untuk pengujian lokal
- `frontend/` - antarmuka web
- `database.sql` - skema database SQL

## Cara menjalankan

1. Isi `SUPABASE_URL` dan `SUPABASE_ANON_KEY` di bagian atas `frontend/script.js` menggunakan URL project dan anon/publishable key Supabase Anda. Jangan gunakan service-role key.
2. Jalankan `backend/database.sql` di SQL Editor Supabase.
3. Untuk uji lokal, pastikan Node.js terinstal lalu jalankan dari folder project:

```bash
node backend/app.js
```

4. Buka browser ke:

```text
http://localhost:3000
```

## Catatan penting

- `frontend/` memakai Supabase REST API dan RPC langsung dari browser; `backend/app.js` hanya menyajikan file statis saat uji lokal.
- Login hanya formalitas demo dan statusnya disimpan di `sessionStorage`; policy anon pada SQL sengaja terbuka untuk penilaian, bukan konfigurasi production.
- Untuk GitHub Pages, publikasikan isi folder `frontend/` sebagai artifact situs statis.

## Lisensi

Project ini dibuat untuk kebutuhan internal / demo. Sesuaikan lisensi sesuai kebutuhan Anda sebelum dipublikasikan ke GitHub.
