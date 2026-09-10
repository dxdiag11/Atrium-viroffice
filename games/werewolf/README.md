# Werewolf

Social deduction untuk **6–12 pemain**, sebuah game berdiri sendiri (seperti `games/gaple`
dan `games/tumble`). Dibuka dari menu **Main Game** di Virtual Office — duduk di kursi yang
menghadap monitor, pilih **🐺 Werewolf**.

```bash
cd games/werewolf
npm install
npm start        # http://localhost:3400
```

Atau jalankan semuanya sekaligus dari root: `npm run start:all`.

## Cara main

1. Semua pemain buka game dari kursi masing-masing (nama & warna ikut dari profil kantor).
2. Setelah **6–12** pemain di ruang tunggu, **host** menekan *Mulai*.
3. Peran rahasia dibagi acak: **Werewolf**, **Peramal**, **Dokter**, sisanya **Warga**
   (1 werewolf untuk 6–7 pemain, 2 untuk 8–11, 3 untuk 12).
4. **Malam** — Werewolf memilih mangsa (punya chat rahasia sesama werewolf), Peramal
   menerawang satu orang, Dokter melindungi satu orang.
5. **Siang** — semua berdiskusi lewat **voice chat Virtual Office** yang tetap jalan di
   halaman induk (game ini tidak punya kode audio sendiri).
6. **Voting** — klik pemain untuk dieliminasi, atau *Lewati*. Suara terbanyak kalah;
   seri / kalah dari "skip" = tidak ada yang tersingkir.
7. Ulang sampai **Werewolf** (jumlah werewolf ≥ warga) atau **Warga** (semua werewolf
   mati) menang. Layar pemenang membuka semua peran.

Pemain yang mati jadi **spectator**: melihat semua peran, tapi tidak bisa voting atau
memakai kemampuan. Peran hanya terlihat oleh yang berhak (diri sendiri; sesama werewolf;
pemain yang sudah mati; dan semua orang saat game selesai).

## UI

Room + player list + role card + indikator Malam/Siang + timer + voting + panel
kill/ability + wolf-chat + riwayat + layar pemenang + tombol **Kembali ke Virtual Office**
(menutup overlay lewat `postMessage` saat dijalankan di dalam kantor).

Port lewat env `PORT` (default `3400`).
