# Plan implementasi: recreation + transisi akar–pakis

Status: rencana, belum dieksekusi. Acuan perilaku: [spec](multi-map-recreation-spec.md).

## Urutan dan strategi

Kerjakan bertahap dalam repository existing; tidak perlu rewrite Canvas/Socket.IO/WebRTC. Lindungi perubahan pengguna yang sudah ada, termasuk aset untracked. Tidak ada commit/push/deploy otomatis dalam rencana ini. Pengerjaan dapat berurutan; tidak memerlukan sub-agent.

```text
Baseline/aset → registry + geometri → protokol server → client/render + transisi
                                                    → audio/chat/UI → bukti akhir
```

## P0 — Baseline dan aset (AC01, AC10)

- [ ] Baca instruksi repo terbaru dan `git status`; catat HEAD dan changes pengguna. `RTK.md` yang dirujuk belum ditemukan saat penyusunan; cek lagi bila kini tersedia.
- [ ] Jalankan `npm test`; simpan ringkasan baseline. Jangan menganggap hasil tes sesi lama berlaku.
- [ ] Konfirmasi file night recreation dan dua PNG panel final dapat di-load; inspeksi visual hasil di viewport dengan alpha asli.
- [ ] Baca `assets/transitions/README.md` serta proof lokal jika tersedia; pakai rumus final, bukan perkiraan prompt awal.
- [ ] Tambahkan serving `/assets/transitions`, cek URL dan MIME PNG; jangan mengedit aset pengguna.

Exit: baseline tercatat, semua path final jelas dan dapat disajikan. Jika aset rusak, laporkan perbaikan spesifik; jangan mengganti gambar pilihan secara diam-diam.

## P1 — Registry map dan tracing recreation (AC01, AC04, AC06)

File utama: `public/office.js`, baru `public/recreation.js` dan `public/maps.js`, `public/index.html`, `server.js`, `test.js`.

- [ ] Tambahkan registry allowlist dengan office/recreation; pertahankan wrapper `buildOffice()` dan urutan kursi office.
- [ ] Pakai world 1499 × 1049 untuk night recreation. Catat identitas aset di definisi map.
- [ ] Trace walkable polygons mengikuti lantai aktual, koneksi kamar mandi, barak, lounge, party dan area belakang DJ.
- [ ] Trace collision rectangles/polygons sesuai kemampuan geom existing. Prefer reuse bentuk sederhana dan gabungan polygon daripada physics engine baru.
- [ ] Petakan 18 kursi bundar, 6 stool, 2 toilet, 6 bed-edge. Inventarisasi sofa berdasarkan artwork lalu tetapkan ID, jumlah dan arah eksplisit.
- [ ] Tambahkan standPoints/approach points agar karakter berdiri tanpa melewati meja/ranjang. Terapkan aturan yang kompatibel untuk office.
- [ ] Tentukan trigger office bawah, recreation atas, arrival points dan kandidat spawn alternatif; ukur di artwork, jangan pakai koordinat perkiraan dokumen.
- [ ] Buat overlay debug development-only untuk floor/collision/seat/portal/spawn bila diperlukan saat tracing; tidak tampil secara default.
- [ ] Jalankan flood-fill reachability menggunakan RADIUS aktual untuk semua slot, portal, stand points dan landmark area. Cek dinding/air dengan negative samples.

Exit: dua map valid dan seluruh target interaksi/portal reachable; belum perlu menyelesaikan animasi. Test expectations untuk jumlah sofa berasal dari inventory final, bukan disesuaikan sekadar agar lolos.

## P2 — World state dan protokol travel server (AC02, AC03, AC05, AC12)

File utama: `server.js`, `public/maps.js`, `public/geom.js`, `test.js`. Extract modul kecil server world/travel bila perlu agar logika dapat diuji tanpa membuka port; hindari refactor unrelated.

- [ ] Tambahkan mapId/mapRevision pada player, payload movement, seat dan corrections; map lookup berdasarkan state server.
- [ ] Scope occupancy dan movement validation ke map pemain. Unknown map, nonfinite position, stale revision dan wrong-map interaction ditolak.
- [ ] Implement prepare → commit → finish sesuai spec, ID unik, TTL, freeze input server, terminal result idempotent, dan world-sync.
- [ ] Validasi request portal dari posisi terakhir; server menentukan target. Tetapkan urutan flush move sebelum request di client nanti.
- [ ] Pilih spawn bebas obstacle/pemain dengan pencarian terbatas; pulihkan sumber jika tidak ada titik valid.
- [ ] Atomik saat commit: release seat, mapId, revision++, spawn, direction, broadcast. Jangan reset identity/voice/roster.
- [ ] Tambahkan anti-loop re-arm dan cooldown server, disconnect cleanup, pending/terminal state bounded.
- [ ] Sesuaikan stand/sit dan seatTaken agar index sama antar-map independen; interaksi yang sudah pending tidak boleh lolos setelah commit.
- [ ] Test duplicate commit, request invalid, timeout sebelum/sesudah commit, dua arrival, stale movement dan disconnect.

Exit: server berpindah map secara valid/idempotent tanpa bergantung pada sukses animasi client. Paket lama tidak memindahkan pemain kembali.

## P3 — Client, kamera, dan input per map (AC02, AC05, AC07)

File utama: `public/main.js`, `public/bubble.js`, `public/index.html`.

- [ ] Ganti asumsi singleton map dengan getMap(me.mapId), image cache per map dan daftar pemain same-map.
- [ ] Terapkan same-map filtering pada render, bubbles, range overlay, collision, nearestSeat, seatTaken, labels/rings.
- [ ] Handle snapshot map-changed dan travel-result secara konsisten; snap rx/ry/camera, reset movement send cache dan interpolasi.
- [ ] Deteksi edge masuk trigger otomatis; flush posisi lalu request travel; satu perjalanan aktif saja.
- [ ] Kunci hanya gerakan/interaksi dunia; jangan mengganggu chat, mic, DND dan keyup PTT. Reset tombol movement secara terpisah.
- [ ] Implement slot toilet/bed-edge/sofa, hint dan safe stand; pastikan pose/anchor cocok artwork.
- [ ] Tutup arcade saat tidak lagi di kursi game; guard callback async arcade terhadap mapRevision lama.

Exit: dua map bisa dirender dan disinkronkan tanpa ghost player, phantom occupied seat, atau kamera terbang antarkoordinat.

## P4 — Transisi dua panel final (AC10–AC12)

File utama: baru `public/map-transition.js`, `public/main.js`, `public/index.html`, `public/style.css`.

- [ ] Bangun controller eksplisit idle/preparing/closing/covered/opening/recovery, satu owner dan satu promise per transitionId.
- [ ] Preload/decode panel dan background tujuan dengan promise cache; gunakan assets/transitions final.
- [ ] Buat overlay viewport clipped dengan kanan di atas kiri; terapkan rumus README, full alpha dan offscreen endpoints.
- [ ] Implement close 450 ms, minimum cover 120 ms, open 500 ms. Commit hanya pada covered + destination ready; buka setelah state server dan scene siap.
- [ ] Sambungkan travel-finished, timeout fallback dan world-sync recovery. Tidak mengasumsikan hilang ACK = commit gagal.
- [ ] Fallback charcoal bila panel gagal, batal ke sumber bila background gagal sebelum commit, loading/status di atas cover jika perlu.
- [ ] Recompute fit saat resize/orientation change tanpa membuka seam. Tangani tab background, animation cancellation, serta prefers-reduced-motion.
- [ ] Susun z-index agar map/avatar/bubble tertutup tetapi kontrol komunikasi/recovery tetap tersedia. Tidak mengganti artwork panel.

Exit: rekam transisi dua arah dengan timestamp/frame covered saat swap. Tidak boleh ada frame world terlihat melalui celah panel pada empat ukuran acuan. Periksa gerakan real-time di browser; proof alpha statis bukan bukti animasi selesai.

## P5 — Audio lintas map dan komunikasi (AC08, AC09)

File utama: `public/rtc.js`, `public/geom.js`, `public/walkie.js`, `public/main.js`, `public/chat-ui.js`, `public/bubble.js`, `public/style.css`.

- [ ] Tambahkan sameMap gate pada gain proximity; cross-map distance tidak dipakai untuk keputusan kedekatan.
- [ ] Radio lintas map memakai RADIO_LEVEL saat holder aktif, tunduk DND. Pertahankan dedup proximity/radio map sama.
- [ ] Pastikan WebRTC peer tetap global dan tidak rebuild saat travel; timer audio tetap berjalan selama overlay.
- [ ] Pertahankan PTT holder saat travel, keyup release, timeout radio, mute dan DND. DND on saat menahan PTT mengikuti perilaku release existing.
- [ ] Nearby hanya map sama; indikator global walkie tetap mengenali nama speaker map lain.
- [ ] HUD map name + roster location; reuse UI existing. Chat/mention/poll/reaction/history global tetap menggunakan roster semua map.
- [ ] Test pure gain matrix; lalu smoke dengan dua browser/perangkat audio untuk benar-benar mendengar same-map, cross-map, PTT dan DND.

Exit: tidak ada proximity bocor antarmap, walkie global berfungsi, dan travel tidak memutus panggilan. Tandai apa yang diuji lewat signal/gain saja versus audio manusia/perangkat.

## P6 — Verifikasi terpadu dan handoff (AC01–AC13)

Jalankan tes existing + baru yang relevan. Jangan menambah snapshot brittle atau tes yang hanya menyalin implementasi. Gunakan assertion perilaku dan integration harness untuk race/protokol.

| Skenario | Bukti yang diperlukan |
|---|---|
| Office regression | 51 kursi, 18 game seats, movement/voice/chat existing lolos |
| Furniture recreation | Inventory final + flood-fill + inspeksi duduk/berdiri toilet, ranjang, sofa/stool |
| Portal dua arah | Dua client; arrival tidak mengaktifkan portal balik, direction benar |
| Pemain beda map | Koordinat sama tidak render/collide/hear proximity; occupancy independen |
| Concurrency | Simultaneous arrival, duplicate commit, delayed old move, occupied spawn |
| Connection | Disconnect/rejoin pada preparing, covered dan opening; tidak lock permanen |
| Aset/latensi | Block PNG tujuan/panel, throttle ack, server timeout; recovery state benar |
| Viewport | 390×844, 844×390, 1920×1080, 3440×1440; DPR dan resize mid-animation |
| Aksesibilitas | Reduced motion dan focus/input chat/PTT tetap bekerja |
| Komunikasi | Gain tests + browser smoke; cross-map walkie, same-map dedup, DND, mention/poll |

- [ ] Update README: map aktif, pintu dua arah, duduk tepi ranjang, DND/walkie lintas map, aset transisi, cara tes.
- [ ] Catat hasil dan keterbatasan di `docs/multi-map-recreation-validation.md` saat implementasi selesai, bukan membuat hasil lulus terlebih dahulu.
- [ ] Review diff terhadap scope; jangan menyertakan perubahan aset/fitur unrelated milik pengguna.
- [ ] Handoff menyebut hasil tes, lokasi file, inventory interaksi final, visual evidence dan risiko yang masih ada.

## Risiko yang harus diselesaikan dalam implementasi

1. Collision furniture menghalangi target seat: tempatkan anchor dan approach di sisi yang dapat diakses, verifikasi dengan RADIUS nyata serta inspeksi visual.
2. Input lama setelah travel: revision di seluruh event world + reset interpolation/send state, bukan hanya cooldown UI.
3. Overlay menutup tetapi server belum commit: tunggu ACK/state dan sediakan timeout + authoritative resync.
4. Alpha edge/resize membocorkan map: gunakan overlap dan formula final; verifikasi komposit/animasi pada viewport ekstrem.
5. Audio punya asumsi semua pemain satu map: audit gain, nearby dan range opacity, serta DND sebelum mengubah roster.
6. Koordinat asset terang berbeda: night adalah aset aktif; jangan mencampur tracing dari gambar 3000 × 2100 tanpa transform eksplisit.

## Stop condition

Semua AC terpenuhi atau keterbatasan eksternal pengujian dinyatakan dengan bukti yang tersedia. Jangan menyebut fitur terverifikasi penuh jika audio real-device atau visual transisi belum diperiksa. Tidak meneruskan ke musik, dance, pose tidur, redesign map, deployment, atau optimasi arsitektur yang tidak diperlukan.
