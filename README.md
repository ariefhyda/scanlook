# ScanLook — PDF seperti hasil scan

Aplikasi web sederhana (HTML + JavaScript) untuk mengubah PDF atau gambar menjadi
PDF yang tampak seperti hasil scanner: sedikit miring, ada noise/grain, debu,
bayangan tepi, warna kertas, dan kompresi JPEG.

Semua proses berjalan **di browser Anda**. File tidak diunggah ke server mana pun.

## Cara menjalankan

1. Buka folder `scan-pdf`.
2. Klik dua kali `index.html` (buka dengan Chrome atau Edge).
3. Pilih atau seret file PDF / gambar (JPG, PNG, WEBP). Bisa lebih dari satu file;
   halaman digabung sesuai urutan file ditambahkan.
4. Atur tampilan, lalu klik **Buat PDF Scan**. File akan terunduh otomatis.

> Membaca PDF memakai pustaka pdf.js dari CDN, jadi saat membuka aplikasi perlu
> koneksi internet. File gambar tetap bisa diproses tanpa internet.

## Fitur

### Rekomendasi
- **Rekomendasi otomatis** — setelah file dimasukkan, aplikasi menganalisis isi
  dokumen:
  - ada logo/stempel/tanda tangan berwarna → disarankan **Scan Warna**
  - dominan teks hitam atau ada foto → disarankan **Scan Standar** (abu-abu)
  - dokumen ≥ 25 halaman → 150 DPI & kualitas 60% agar file tetap ringan
  - gambar sumber beresolusi rendah → 150 DPI
  Klik **Terapkan rekomendasi** untuk memakainya.
- **Tujuan file** — WA/Email (150 DPI, file kecil), Standar (200 DPI),
  Arsip/Cetak (300 DPI, tajam).
- **Gaya scan (preset)** — Scan Standar, Kantor Rapi, Scan Warna, Fotokopi,
  Dokumen Lama, Fax.

### Pengaturan manual
| Kelompok | Pengaturan |
|---|---|
| Warna | Mode (warna / abu-abu / hitam-putih), saturasi, ambang hitam-putih, kecerahan, kontras |
| Kertas & cahaya | Warna kertas, kekuatan warna kertas, cahaya tidak rata, bayangan tepi, latar pemindai |
| Posisi kertas | Kemiringan maks., pergeseran maks., acak berbeda tiap halaman |
| Tekstur & kotoran | Noise/grain, debu & bintik, garis scanner, blur |
| Output | Resolusi (DPI), kualitas JPEG, ukuran kertas (asli/A4/F4/Letter/Legal), variasi acak |

- Pengaturan terakhir tersimpan otomatis di browser.
- **Simpan sebagai preset** untuk menyimpan kombinasi pengaturan sendiri.
- Klik dua kali slider untuk mengembalikan nilai bawaannya.
- **Variasi acak** mengubah posisi debu, arah miring, dan pola noise; nilai yang
  sama selalu memberi hasil yang sama.

### Pratinjau
- Pratinjau memakai resolusi dan kualitas JPEG yang sama dengan hasil akhir,
  lengkap dengan perkiraan ukuran file.
- Klik gambar atau tombol **Zoom 100%** untuk melihat detail.
- Tahan tombol **Tahan: lihat asli** untuk membandingkan dengan dokumen asli.
- Tombol **×** pada thumbnail = halaman tidak disertakan di PDF.
- Panah ← / → untuk berpindah halaman. Gambar juga bisa ditempel dengan Ctrl+V.

## Catatan
- Hasil PDF berupa gambar (seperti hasil scan sungguhan), jadi teks di dalamnya
  tidak bisa diseleksi/dicari.
- PDF yang dilindungi kata sandi harus dibuka proteksinya terlebih dahulu.
- Untuk dokumen sangat panjang, gunakan tujuan **WA / Email** agar proses lebih
  cepat dan file lebih kecil.

## Struktur file
```
scan-pdf/
├── index.html   tampilan aplikasi
├── style.css    gaya tampilan (tema putih)
├── app.js       logika: baca PDF/gambar, efek scan, rekomendasi, penulis PDF
└── README.md
```
