# Penyusup

Social deduction 2D ala *Among Us* untuk **4–10 pemain**, berdiri sendiri seperti game
`games/*` lainnya. Dibuka dari menu **Main Game** di kantor — duduk di kursi yang
menghadap monitor, pilih **🔪 Penyusup**.

```bash
cd games/impostor
npm install
npm start        # http://localhost:3500
```

Atau semuanya sekaligus dari root: `npm run start:all`.

## Cara main

1. Semua pemain buka dari kursinya masing-masing (nama ikut dari profil kantor).
2. **Siapa saja** boleh menekan *Mulai permainan* — kursi kosong diisi bot sampai 6
   pemain, jadi tidak perlu menunggu orang lengkap. 7 pemain ke atas → 2 penyusup.
3. **Kru** mengerjakan 5 tugas di berbagai ruangan (masing-masing punya minigame:
   tahan tombol, sambungkan kabel, atau tekan angka berurutan). **Penyusup** dapat
   daftar tugas palsu supaya bisa pura-pura sibuk.
4. Penyusup membunuh kru dari dekat (cooldown 25 detik), bisa memadamkan lampu untuk
   mempersempit jarak pandang semua orang sampai diperbaiki di Kelistrikan, dan bisa
   masuk **vent** (`F`) untuk berpindah diam-diam. Saat di dalam vent dia tidak
   terlihat oleh kru, tapi juga tidak bisa membunuh sebelum keluar.
5. Temukan mayat → **LAPOR**, atau tekan tombol **DARURAT** di Kafetaria (sekali per
   pemain) untuk memanggil rapat.
6. **Rapat**: diskusi lewat **voice chat kantor** yang tetap jalan di halaman induk,
   lalu voting lewat UI. Suara terbanyak dilempar ke luar angkasa; seri atau kalah
   dari "lewati" = tidak ada yang dilempar.
7. Menang: **kru** kalau semua tugas selesai atau semua penyusup tersingkir;
   **penyusup** kalau jumlahnya sudah menyamai jumlah kru.

Pemain yang mati jadi hantu: masih bisa jalan dan menyelesaikan tugas (tetap dihitung
untuk kemenangan kru), bisa melihat peran semua orang, tapi tidak bisa voting,
melapor, atau membunuh.

## Kontrol

| Tombol | Aksi |
|---|---|
| `WASD` / panah | gerak |
| `E` | pakai (tugas / tombol darurat / perbaiki lampu) |
| `R` | lapor mayat |
| `Q` | bunuh (penyusup) |
| `F` | masuk / keluar vent (penyusup) |

## Peta

Kapal punya **15 ruangan** yang dihubungkan koridor bercabang, dengan beberapa rute
memutar (tidak ada satu jalur yang bisa dijaga sendirian) dan tiga jalan buntu — O2,
Navigasi, dan Lab. Ada **15 stasiun tugas** dan **10 vent** dalam 4 jaringan terpisah:

| Jaringan | Menghubungkan |
|---|---|
| kiri | Reaktor · Mesin Atas · Mesin Bawah |
| bawah | Kelistrikan · Gudang · Komunikasi |
| tengah | Kafetaria · Admin |
| kanan | Senjata · Navigasi |

Peta ada di `map.js`, terpisah dari server supaya bisa diuji. Area yang bisa dijalani
adalah gabungan kotak-kotak ruangan dan koridor; tiap ruangan punya `style` yang
menentukan perabot apa yang digambar klien (inti reaktor, meja kafetaria, ranjang
medbay, tumpukan peti gudang, dan seterusnya) — jadi 15 ruangan tidak perlu 15 daftar
properti yang ditulis tangan.

## Tes

```bash
cd games/impostor
npm test
```

Yang diperiksa: semua ruangan saling terhubung, tiap pintu cukup lebar untuk dilewati
pemain, semua stasiun/vent/tombol berdiri di lantai yang bisa dijalani dan di ruangan
yang diklaimnya, jaringan vent valid, dan — yang paling penting — **rute antar setiap
pasang ruangan tidak pernah keluar dari lantai**. Tes terakhir itu ada karena versi
pertama peta ini membuat bot tersangkut permanen di sudut koridor; dengan cara routing
yang lama, 54 dari 210 rute gagal.

## Catatan teknis

- Server yang jadi wasit: peran, posisi, pembunuhan, progres tugas, dan voting semua
  divalidasi di `server.js`. Klien hanya menggambar dan mengirim niat — termasuk
  jarak untuk tombol aksi, yang dihitung dari posisi versi server supaya tombol tidak
  pernah menyala saat server sebenarnya menolak.
- Bot berjalan lewat graf titik-pintu (tengah irisan antar kotak), bukan titik tengah
  ruangan, sehingga garis lurus antar titik dijamin tetap di dalam satu kotak cembung
  dan tidak pernah menyerempet sudut.
- Tidak ada kode audio di sini sama sekali — diskusi memakai proximity voice kantor.

Port lewat env `PORT` (default `3500`).
