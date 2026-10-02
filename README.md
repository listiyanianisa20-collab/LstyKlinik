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

- `backend/` - server Node.js dan API lokal
- `frontend/` - antarmuka web
- `database.sql` - skema database SQL

## Cara menjalankan

1. Pastikan Node.js sudah terinstal.
2. Buka terminal di folder project.
3. Jalankan:

```bash
node backend/app.js
```

4. Buka browser ke:

```text
http://localhost:3000
```

## Catatan penting

- Backend menggunakan file lokal `backend/data.json` untuk data demo.
- Jika akan dipakai untuk production atau integrasi database, sesuaikan konfigurasi API dan data storage.

## Lisensi

Project ini dibuat untuk kebutuhan internal / demo. Sesuaikan lisensi sesuai kebutuhan Anda sebelum dipublikasikan ke GitHub.
