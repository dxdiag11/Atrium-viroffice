# Spec: Recreation map dan transisi akar–pakis

Status: siap menjadi acuan implementasi; dokumen ini tidak menyatakan fitur sudah dibuat.
Tanggal: 11 September 2026.
Rencana pengerjaan: [multi-map-recreation-plan.md](multi-map-recreation-plan.md).

## 1. Tujuan dan keputusan scope

Pemain dapat berjalan dari pintu bawah office ke recreation, dan kembali melalui pintu atas recreation, tanpa join ulang. Perpindahan ditutupi dua panel akar–pakis: masuk dari kiri/kanan, menutup seluruh viewport, lalu membuka dari tengah ke samping. Identitas, chat, dan koneksi voice tetap tersambung.

Scope tahap ini mencakup dua map, perpindahan otomatis dua arah, collision, kursi/sofa/stool/toilet, duduk di tepi ranjang, sinkronisasi multiplayer, proximity voice per map, walkie global, informasi lokasi, serta pengujian. Musik/DJ interaktif, playback tersinkron, animasi dance dan berbaring ditunda. DJ console dan dance floor tetap dapat didekati/dilewati sesuai bentuk artwork. Tidak perlu generate aset baru.

Keputusan implementasi yang melengkapi kesepakatan:
- Gunakan recreation versi night yang sesuai gambar pilihan pengguna. Varian terang tetap disimpan sebagai alternatif, bukan map ketiga atau sistem siang/malam.
- Ranjang menggunakan pose duduk yang tersedia di tepi ranjang, satu slot per ranjang. Jangan menampilkan klaim animasi tidur.
- Join baru/reconnect tetap dimulai di office sesuai perilaku join sekarang; tidak menambah persistence lokasi atau akun.
- Walkie global berarti lintas map dan tanpa batas jarak. DND yang sudah ada tetap membisukan audio masuk termasuk walkie; perpindahan tidak mengubah mute/DND.

## 2. Baseline yang diperiksa

| Bagian | Kondisi repository |
|---|---|
| Server | Express + Socket.IO, `server.js`, satu `buildOffice()` saat startup |
| Map | `public/office.js`, data dipakai bersama client/server |
| Gerakan | `public/geom.js`, `canMove`, `canTraverse`, `separateFrom` |
| Render | Canvas 2D di `public/main.js`, background raster, kamera mengikuti pemain |
| Office | 1499 × 1049 world units; 51 kursi, 18 kursi game |
| Voice | `public/rtc.js`, proximity dan radio; DND sudah diimplementasikan |
| Identitas/avatar | `public/characters.js`, `public/sprites.js`, sprite duduk/bicara tersedia |
| Chat | `public/chat-core.js`, `public/chat-ui.js`, `public/bubble.js` |
| Verifikasi | `npm test` menjalankan `node --test test.js`; baseline perlu dijalankan ulang saat implementasi |

Jangan mengasumsikan README lama selalu sama dengan perilaku kode terkini. Pertahankan perbedaan terbaru seperti focus booth office yang tidak membuka game dan DND.

## 3. Aset final dan koordinat

| Peran | Path | Ukuran file |
|---|---|---|
| Office | `assets/maps/atrium-cave-office.png` | 1499 × 1049 RGB |
| Recreation aktif | `assets/maps/atrium-cave-recreation-night.png` | 1499 × 1049 RGB |
| Alternatif tidak aktif | `assets/maps/atrium-cave-recreation.png` | 3000 × 2100 RGB |
| Panel kiri | `assets/transitions/root-fern-left.png` | 1800 × 2400 RGBA |
| Panel kanan | `assets/transitions/root-fern-right.png` | 1800 × 2400 RGBA |

Gunakan world 1499 × 1049 untuk kedua map aktif, tanpa resize artwork atau menggandakan skala karakter. Koordinat collision, seat, trigger dan spawn berada dalam world units, bukan CSS pixels, device pixels, atau resolusi varian terang.

Tambahkan static route `/assets/transitions` dengan pola caching seperti aset lain. Gunakan file final di atas, bukan sumber mentah `output/imagegen`. README aset menjelaskan pemrosesan alpha, rumus penempatan, dan bukti coverage; integrasi tetap harus diperiksa di browser.

## 4. Pengalaman pemain dan layout recreation

1. Pemain berjalan menuju bagian tengah bawah office. Area trigger berada di lantai pintu yang dapat dicapai, sebelum batas map.
2. Tidak perlu tombol E atau dialog. Saat masuk trigger, sistem meminta perpindahan tervalidasi.
3. Gerakan dan interaksi dunia dikunci; panel menutup. Audio/chat tetap berjalan.
4. Saat tertutup dan background tujuan siap, server mengesahkan perpindahan; client mengganti map dan kamera.
5. Panel membuka. Pemain muncul di lorong tengah atas recreation, menghadap ke bawah, di luar trigger balik.
6. Berjalan kembali ke pintu atas membawa pemain ke office, menghadap ke atas menuju interior.

Area recreation:
- Tiga meja bundar dengan enam kursi masing-masing: 18 slot.
- Nook sofa tengah bawah: petakan slot duduk yang benar-benar muat di artwork.
- Dua bathroom kiri bawah: satu toilet interaktif per room, dengan arah duduk logis dan akses depan.
- Barak kiri atas: enam slot duduk tepi ranjang; badan ranjang tetap solid.
- Party kanan: enam stool bar dan slot sofa booth mengikuti luas dudukan; dance floor kosong dan dapat dilalui.
- DJ console, speaker, counter, wastafel, meja, batu, air, dan tanaman besar adalah penghalang.

Jumlah slot sofa harus ditentukan lewat inspeksi visual saat tracing, dicatat sebagai daftar ID eksplisit, lalu dikunci oleh acceptance tests. Jangan menebak jumlah berdasarkan prompt generasi atau menaruh avatar di meja. Semua slot memerlukan titik pendekatan dan titik berdiri yang aman. Tidak ada slot recreation yang bertanda game.

## 5. Model data

Tambahkan registry map bersama, tanpa mengganti renderer atau framework:

```js
MapDefinition = {
  id, name, width, height, image,
  spawn, walkable, collisions, seats, portals
};
Seat = { id, x, y, dir, kind, game, standPoints };
Portal = { id, trigger, targetMapId, targetSpawnId };
Player = { /* field lama */, mapId, mapRevision, seat, transitioning };
```

`kind`: chair, sofa, stool, toilet, bed-edge. Tetap gunakan pose duduk existing; kind hanya memberi semantics/hint. Untuk office, pertahankan urutan index kursi agar integrasi game tidak berubah; ID stabil dapat ditambahkan. Occupancy menggunakan pasangan `(mapId, seatId/index)`, tidak index global.

`getMap(id)` hanya menerima allowlist office/recreation; jangan memakai input client sebagai path aset. `buildOffice()` tetap tersedia untuk compatibility test lama. Jangan mengubah collision office selain portal/akses yang memang dibutuhkan. Renderer, physics dan audio memperoleh map melalui player/current map, bukan singleton office tersembunyi.

Pemain tetap berada dalam satu roster global agar chat, mention, walkie, dan WebRTC tetap bekerja. Render, nearby, bubble dan collision menggunakan subset map aktif. Tidak perlu memutus peer atau berpindah Socket.IO room untuk tahap ini; optimasi distribusi posisi ke room ditunda.

## 6. Perpindahan: protokol dan otoritas server

Client mendeteksi masuk trigger dari posisi lokal dan mengirim `travel-request {portalId, mapRevision}` setelah mengirim posisi gerakan terakhir. Server memeriksa posisi terakhir yang telah diterima/valid, current map, trigger, revision, serta tidak ada perpindahan berjalan. Server menentukan tujuan; client tidak boleh memilih koordinat spawn atau target map bebas.

Protokol yang direncanakan:

| Event | Arah | Makna |
|---|---|---|
| `travel-request` | client → server | Minta portal tertentu dari state yang berlaku |
| `travel-prepared` | server → peminta | `{transitionId, targetMapId, expiresAt}`; freeze dan mulai tutup |
| `travel-commit` | client → server | `{transitionId}` setelah tertutup dan aset siap |
| `player-map-changed` | server → semua | Snapshot atomik `{id,mapId,mapRevision,x,y,direction,seat:null}` |
| `travel-result` | server → peminta | Hasil terminal + snapshot otoritatif, termasuk replay commit |
| `travel-cancel` | client → server | Batalkan persiapan sebelum commit |
| `travel-finished` | client → server | Buka selesai, lepas lock server |
| `world-sync` | client ↔ server | Ambil roster/state otoritatif saat hasil commit tidak diketahui |

Event names adalah kontrak baru yang direncanakan, bukan API yang sudah ada. Terapkan handler/payload secara konsisten dan batasi payload/rate permintaan. `travel-result` mengandung `transitionId`, status, dan state terkini sehingga peminta tidak bergantung pada broadcast saja.

Saat prepare, posisi/map sumber masih berlaku dan gerakan/sit ditolak sementara. Saat commit, server memilih spawn valid dan mengubah map, posisi, arah, seat, dan revision dalam satu operasi, kemudian broadcast. Jangan menyiarkan `player-left`/`player-joined` untuk perpindahan map. Lepaskan kursi saat commit; disconnect selalu membersihkan state pending dan occupancy.

Satu transition ID berlaku untuk satu pemain dan satu perjalanan. Duplikat commit mengembalikan hasil yang sama, tidak teleport kedua kali. Simpan hasil terminal terakhir secara bounded sampai perjalanan berikutnya/disconnect. Revision naik saat commit dan wajib ikut move/sit/stand/correction terkait dunia; abaikan paket revision/map lama. Jangan memvalidasi perjalanan lintas map dengan `canTraverse` antara dua koordinat beda map.

TTL awal: prepare 10 detik, lock setelah commit maksimum 5 detik. Timeout sebelum commit membatalkan persiapan dan mengembalikan kontrol di sumber; timeout sesudah commit melepas lock di tujuan. Client yang kehilangan ACK melakukan `world-sync`; jangan mengembalikan map lokal ke sumber secara spekulatif. Balasan travel terminal dan snapshot harus membuat recovery idempotent.

Sebelum commit, kegagalan pemuatan background membatalkan travel dan membuka kembali sumber dengan pesan singkat/retry. Panel gagal dimuat menggunakan tirai warna charcoal opaque sebagai fallback, bukan menampilkan pergantian terbuka. Saat disconnect, hentikan animasi dan ikuti flow koneksi existing; jangan membiarkan overlay mengunci layar selamanya.

Anti-loop: spawn dan seluruh radius pemain berada di luar trigger. Setelah commit, portal dinonaktifkan sampai pemain keluar dari zona trigger dan melewati cooldown singkat (awal 750 ms); input arah gerakan dibersihkan agar tombol yang masih ditahan tidak membawa karakter kembali tanpa niat. Pelepasan input movement tidak boleh menghilangkan bookkeeping tombol walkie/PTT.

Pilih spawn dari daftar kandidat aman dekat entrance, periksa collision dan pemain pada map tujuan, termasuk kedatangan yang sudah commit. Jika penuh, cari secara terbatas di arrival area; jika tidak tersedia, tolak commit dengan alasan penuh dan pulihkan sumber. Jangan spawn menembus batu atau menumpuk kursi. Catat koordinat akhir setelah tracing, bukan menganggap sketsa koordinat sebagai fakta.

## 7. State animasi dan panel

```text
idle → preparing → closing → covered/commit → opening → idle
          └ failure/cancel → recover to authoritative map → idle
```

Prefetch background recreation dan kedua panel setelah join utama siap, jangan menghambat first paint office. Gunakan promise cache dan `decode()`/load completion, bukan hanya menetapkan `src`. Saat closing, background tujuan dapat dimuat; commit hanya setelah viewport tertutup dan tujuan siap. Pertahankan cover selama menunggu, dengan status loading singkat jika lebih dari 1 detik. Client memberi batas waktu pemuatan/ack dan menjalankan recovery di atas.

Gunakan overlay fixed screen-space; panel kiri di bawah kanan, bukan digambar pada koordinat world. Panel berada di atas map/avatar/bubble/hint, di bawah kontrol penting chat, mute, DND, walkie dan status recovery. Overlay tidak mengambil focus keyboard atau memblokir kontrol ini. Kunci gameplay pada input handler, bukan memblokir semua event document.

Penempatan tertutup dari `assets/transitions/README.md`:

```js
const scale = Math.max(0.70 * vw / 1800, 1.10 * vh / 2400);
const panelWidth = Math.ceil(1800 * scale);
const panelHeight = Math.ceil(2400 * scale);
const leftX = -Math.round(0.02 * vw);
const rightX = vw - panelWidth + Math.round(0.02 * vw);
const y = Math.floor((vh - panelHeight) / 2);
```

Gunakan CSS viewport dimensions; jangan mengalikan DPR dua kali. Awal/akhir terbuka: panel kiri seluruhnya di kiri viewport dan panel kanan seluruhnya di kanan viewport (beri overscan beberapa pixel). Animasikan transform, tidak ukuran gambar. Clip overflow; opacity panel 1 saat closed. Jangan fit masing-masing panel menjadi setengah viewport.

Timing awal: tutup 450 ms ease-in-out, hold minimum 120 ms sampai commit/scene siap, buka 500 ms ease-out. Tidak bounce, tidak motion blur, tidak sound effect tambahan. Map dan kamera berganti hanya saat fully covered. Resize/orientasi berubah harus menghitung ulang ukuran/posisi dan mempertahankan progress/coverage; jangan memulai travel lagi. Timer tidak boleh bergantung pada `transitionend` saja: tangani animation cancel, tab tersembunyi, dan fallback deadline.

`prefers-reduced-motion`: gunakan fade charcoal singkat dengan kontrak commit saat tertutup yang sama. Saat idle overlay offscreen/hidden dan tidak menghalangi render/input. Aset tersedia sudah cukup; tidak ada regenerasi atau edit gambar sebagai bagian implementasi normal.

## 8. Gerakan, duduk, render, dan UI

- Movement rate, radius, skala avatar, remote interpolation, dan perilaku wall sliding dipertahankan.
- Filter pemain beda map sebelum `separateFrom`, seatTaken, label, ring, bubble, nearest-seat dan proximity display.
- Saat map changed, set `x/y` serta `rx/ry` bersamaan; kosongkan interpolation/walkUntil, cache nearest seat dan range terkait, reset sent position/revision. Jangan lerp karakter melintasi map.
- Stand points harus lolos collision/path dari slot interaksi dan bebas pemain. Bila semua titik keluar terisi, tetap duduk dan tampilkan hint singkat, tidak teleport melalui furnitur.
- Slot toilet/ranjang menggunakan akses pendekatan di lantai; collision furnitur tidak boleh membuat duduk/berdiri gagal. Tentukan anchor di sisi yang valid, tidak menghapus collision seluruh ranjang.
- Arcade office tetap hanya di 18 kursi existing. Saat keluar seat/map, tutup dialog/game overlay dan cegah callback lama membukanya kembali. Perpindahan tidak membuat kursi recreation menjalankan game.
- HUD menampilkan Office/Recreation, daftar pemain menampilkan lokasinya. Gunakan UI existing atau roster ringkas bila belum ada daftar; tidak perlu minimap atau tombol teleport.

## 9. Audio, chat, dan DND

Proximity dihitung hanya bila listener.mapId === speaker.mapId. Beda map harus bernilai nol bahkan bila koordinat identik. Walkie sender aktif tetap terdengar pada listener map lain melalui jalur radio di `RADIO_LEVEL` yang sudah ada. Pada map sama, pertahankan logika menghindari suara ganda: speaker dekat lewat proximity, speaker jauh lewat radio.

| Kondisi listener | Speaker | Proximity | Walkie aktif |
|---|---|---|---|
| Normal | map sama, dekat | falloff existing | tidak menggandakan proximity |
| Normal | map sama, jauh | 0 setelah FAR | RADIO_LEVEL |
| Normal | map berbeda | 0 | RADIO_LEVEL |
| DND | map apa pun | 0 | 0 |

Pertahankan mute, mic permission, DND dan aturan PTT existing. Map change tidak melepas holder radio, membuat peer baru, atau menghentikan audio timer. Jangan berhenti menerima keyup T saat input gameplay dikunci. Timeout radio global tetap berlaku. Indikator walkie menampilkan pembicara lintas map; tidak menggambar avatar pembicara di map yang salah.

Chat global, mention, polling, reactions dan history tetap global dengan batas/privacy existing. Bubble hanya untuk pemain map aktif; typing state boleh tetap global. Jangan mengosongkan chat history saat satu map kosong jika roster global masih berisi pemain. Nearby hanya menghitung pemain/audibilitas map sama dengan definisi existing.

## 10. Acceptance criteria

| ID | Bukti selesai |
|---|---|
| AC01 | Office memakai artwork/51 kursi/18 game seats existing; recreation memakai night PNG pada world 1499 × 1049 |
| AC02 | Berjalan keluar office masuk recreation, kembali via atas tanpa tombol atau join ulang; arah masuk benar |
| AC03 | Spawn valid, di luar trigger; tahan tombol, spam request dan dua kedatangan bersamaan tidak menyebabkan loop/overlap solid |
| AC04 | Semua 18 kursi bundar, 6 stool, 2 toilet, 6 bed-edge, dan slot sofa yang terdaftar dapat dicapai, diduduki, ditinggalkan |
| AC05 | Satu occupant per slot per map; seat index sama di map berbeda tidak bentrok; disconnect membersihkan occupancy |
| AC06 | Batu/air/furnitur solid tidak dapat ditembus; semua zona, dance floor, dan sisi akses DJ terjangkau |
| AC07 | Karakter, bubble, seat checks dan player collision hanya map sama; roster/lokasi tetap global |
| AC08 | Proximity beda map nol; walkie lintas map berfungsi tanpa suara ganda; DND/mute/radio ownership tetap benar |
| AC09 | Chat/mention/poll/reaction tetap bekerja lintas map dan tidak reset karena perpindahan |
| AC10 | Dua panel menutup seluruh viewport sebelum swap, lalu membuka; tidak ada flash map/camera jump terlihat |
| AC11 | Coverage benar pada 390×844, 844×390, 1920×1080, 3440×1440, resize mid-animation dan reduced motion |
| AC12 | Asset failure, timeout prepare/commit, stale packet, duplikat, hidden tab, dan reconnect tidak menyisakan overlay/input lock atau map desync |
| AC13 | Semua tes existing dan tes baru relevan lulus; smoke multiplayer lintas map didokumentasikan |

## 11. Batas selesai

Selesai setelah AC01–AC13 terbukti dan catatan handoff mencakup koordinat/slot final, verifikasi browser, serta batas audio yang diuji. Tidak menambahkan musik, kontrol DJ, dance, sleeping sprites, map editor, framework baru, database, map ketiga, atau deployment dalam pekerjaan ini.
