# Tumble Rush

Battle royale rintangan ala *Fall Guys* untuk Virtual Office. Multiplayer via Socket.IO;
slot kosong diisi bot supaya tetap seru walau main sendirian.

```bash
cd games/tumble
npm install
npm start        # http://localhost:3300
```

Buka beberapa tab / kirim link LAN ke teman, klik **SIAP** di tiap tab. Kalau semua
pemain siap, pertandingan mulai dalam 6 detik; kalau tidak, 18 detik lalu sisanya
diisi bot (total 14–24 peserta).

## Alur pertandingan

1. **Lobby** — atur nama, warna, corak, wajah karakter (tersimpan di `localStorage`).
2. **Countdown 5 detik**, lalu semua pemain masuk ronde pertama.
3. **Ronde 1–2 — lomba rintangan.** Lari ke garis finish melewati gada berputar,
   piston, palu godam, dan slime yang naik dari belakang. Sebagian pemain terlambat
   → tersingkir. Kuota lolos mengecil tiap ronde (mis. 14 → 10 → 6).
4. **Ronde 3 — Lantai Runtuh.** Ubin runtuh 1,1 detik setelah diinjak, arena
   menyusut. Bertahan sampai peserta ≤ target.
5. **Ronde final — Adu Bertahan Terakhir.** Arena kecil, ubin runtuh cepat. Pemain
   terakhir yang bertahan jadi **juara**.
6. **Podium** 3 besar + peringkat kamu.
7. **Reward** coin & XP (juara dapat bonus besar), diakumulasi di profil lokal.
8. Kembali ke lobby otomatis.

## Kontrol

| Tombol | Aksi |
|---|---|
| `WASD` / panah | gerak |
| `SPASI` | dorongan (dash, ada cooldown) — bisa untuk lompati 1 ubin bolong |

## Struktur

- `server.js` — satu pertandingan global + state machine (lobby → ronde → podium),
  simulasi rintangan & ubin, deteksi finish/tabrakan/jatuh, dan AI bot. Klien hanya
  lapor posisi; server yang menentukan lolos/tersingkir.
- `public/game.js` — render canvas 2D (kamera mengikuti pemain / menonton pemimpin),
  prediksi gerak lokal, layar lobby / intermission / podium, confetti, bunyi.
- Ronde didefinisikan sebagai data di `makeRounds()` pada `server.js` — ubah angka di
  situ untuk menyetel jumlah rintangan, kecepatan, durasi, dan rasio kuota lolos.

Port diatur lewat env `PORT` (default `3300`).
