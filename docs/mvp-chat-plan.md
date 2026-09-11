# Atrium Chat — MVP Implementation Plan

MVP chat sambil menunggu desain karakter selesai. Ruang lingkupnya sengaja sempit:
**chat global sebagai default, plus mention yang mengarahkan pesan hanya ke user yang
disebut.** Fitur lain (proximity chat, room chat, bubble di atas avatar, emote, DM, poll,
sticky note, gambar) ditunda sampai desain karakter beres — jangan dikerjakan di sini.

Dipecah per ticket supaya bisa dikerjakan bertahap: satu ticket = satu sesi = satu commit.
Status: `[ ]` belum · `[~]` jalan · `[x]` selesai. Update checkbox saat ticket selesai.

---

## Perilaku yang dituju

1. Tanpa `@`, pesan masuk ke **semua orang** yang sedang join. Ini default.
2. Dengan `@nama`, pesan **hanya** dikirim ke user yang disebut (boleh lebih dari satu)
   dan ke pengirim sendiri. Orang lain tidak menerima event-nya sama sekali.
3. Mengetik `@` memunculkan autocomplete berisi nama user yang sedang join.
4. Nama yang disebut tapi tidak ada di daftar user → pesan **tidak terkirim**, pengirim
   dapat peringatan. Jangan diam-diam dikirim sebagai pesan global; itu kebocoran isi
   pesan yang diniatkan privat.

---

## Konvensi (baca sebelum ticket apa pun)

Repo ini kecil dan tanpa build step. Ikuti gayanya, jangan bawa tooling baru.

- **Tanpa framework, tanpa bundler.** Vanilla JS, `<script>` tag di `public/index.html`.
  Jangan tambah dependency npm.
- **Kode pure yang dipakai browser dan Node** ditaruh dengan pola persis seperti
  `public/geom.js`: deklarasi biasa, lalu `Object.assign(globalThis, { ... })` di baris
  terakhir. Server memakainya lewat `require('./public/<file>.js')`, begitu juga `test.js`.
- **Komentar menjelaskan _kenapa_, bukan _apa_.** Lihat gaya di `public/rtc.js`.
- **Keamanan render.** Teks dari user WAJIB masuk DOM via `textContent` atau
  `document.createTextNode`. **Jangan pernah `innerHTML`** untuk isi pesan, nama, atau
  hasil parsing mention. Non-negotiable.
- **Server adalah otoritas.** Client boleh mem-parse mention untuk UX, tapi server tetap
  mem-parse ulang dan server-lah yang menentukan penerima. Jangan pernah percaya daftar
  penerima yang dikirim client.
- **Test:** `npm test` (`node --test test.js`). Semua fungsi pure yang ditambahkan harus
  punya test. Jangan menambah test runner lain.
- **Verifikasi manual:** `npm start`, buka 3 tab, Join di semuanya.
- Jangan refactor di luar scope ticket. Temuan lain tulis di bagian **Catatan** di bawah.

### Protokol socket (kontrak final)

Client → server:

| Event | Payload |
|---|---|
| `chat` | `{ text }` — mention ada di dalam `text`, penerima ditentukan server |

Server → client:

| Event | Payload |
|---|---|
| `chat` | satu objek Message |
| `chat-history` | `Message[]` — dikirim sekali saat join, isinya hanya pesan global |

Bentuk **Message**:

```js
{
  id: 'm7',            // unik per sesi server, string
  at: 1757500000000,   // Date.now()
  scope: 'all',        // 'all' | 'mention' | 'system'
  from: '<socketId>',  // null untuk scope 'system'
  name: 'Budi',
  color: '#3f8ee0',
  text: '@Sari tolong cek ini',
  mentions: ['<socketId>'], // [] untuk 'all' dan 'system'
}
```

Daftar user untuk autocomplete tidak perlu event baru: `server.js` sudah memancarkan
`players`, `player-joined`, dan `player-left`, dan `public/main.js` sudah memelihara objek
`players`. Pakai itu.

### Batas & anti-spam

- Panjang teks maksimal **280 karakter** setelah `trim()`. Pesan kosong dibuang.
- Rate limit token bucket per socket: **5 pesan / 3 detik**. Global adalah channel utama di
  MVP ini, jadi limitnya dibuat cukup longgar untuk percakapan normal tapi tetap menahan
  spam.
- Kena limit → server balas satu Message `scope: 'system'` **ke pengirim saja**. Jangan
  `throw`, jangan disconnect.
- History ring buffer di memori: **50 pesan global terakhir**. Pesan `mention` **tidak
  masuk history** — kalau masuk, orang yang baru join bisa membaca pesan privat orang lain.
- Tidak ada persistensi. Server restart = chat hilang. Ini disengaja.

---

## Peta file

| File | Isi | Dibuat di ticket |
|---|---|---|
| `public/chat-core.js` | logika pure: validasi teks, rate limit, parsing mention, resolusi penerima | M0, M1 |
| `public/chat-ui.js` | panel chat: daftar pesan, input, autocomplete | M0, M1, M2 |
| `server.js` | handler `chat`, routing penerima, history, dedupe nama | M0, M1 |
| `public/main.js` | wiring: fokus keyboard, tampilkan panel setelah join | M0 |
| `public/index.html` | markup panel + urutan `<script>` | M0 |
| `public/style.css` | styling panel | M0 |
| `test.js` | test semua fungsi pure | tiap ticket |

---

## M0 — Fondasi + chat global `[x]`

**Depends on:** —

**Kerjakan**

1. `public/chat-core.js` — fungsi pure:
   - `normalizeText(raw)` → string ter-`trim()` dipotong 280 char, atau `''` kalau kosong.
   - `makeBucket(limit, windowMs)` → `{ take(now) }` mengembalikan boolean. Token bucket
     sederhana pakai array timestamp.
   - `CHAT_LIMIT = [5, 3000]`, `MAX_LEN = 280`.
   - `Object.assign(globalThis, { ... })` di baris terakhir.
2. `server.js`:
   - `require('./public/chat-core.js')` di dekat `require('./public/office.js')` yang ada.
   - Ring buffer `messages` (maks 50) + counter id (`m1`, `m2`, …).
   - **Dedupe nama saat join.** Nama sekarang bisa kembar, dan itu membuat mention di M1
     ambigu. Kalau nama sudah dipakai, tambahkan suffix (`Budi (2)`). Lakukan di handler
     `join` yang sudah ada, sebelum `players[socket.id]` dibuat.
   - Handler `socket.on('chat', ...)`: tolak kalau socket belum ada di `players`,
     `normalizeText`, cek bucket, bangun Message `scope: 'all'`, push ke ring buffer,
     `io.emit('chat', msg)`.
   - Saat join, setelah `socket.emit('players', ...)`, kirim `socket.emit('chat-history', messages)`.
3. `public/chat-ui.js` — panel kanan-bawah:
   - Header (judul + tombol collapse), list pesan, input + tombol kirim.
   - Render pesan: nama diwarnai `msg.color`, teks via `textContent`, timestamp `HH:MM`.
   - `scope: 'system'` dirender italic dan redup, tanpa nama.
   - Auto-scroll ke bawah **hanya kalau** user sudah dekat bawah — jangan paksa scroll saat
     user sedang membaca ke atas.
   - Ekspor `addMessage(msg)` dan `focusChat()` lewat `globalThis` supaya `main.js` bisa pakai.
4. `public/main.js`:
   - `socket.on('chat', addMessage)` dan `socket.on('chat-history', ...)`.
   - `Enter` → fokus input chat; `Escape` → blur dan fokus balik ke game.
   - Pastikan gerakan tidak jalan saat input fokus. Guard `if (e.target.tagName === 'INPUT') return;`
     di listener `keydown` sudah ada — **tapi verifikasi `keyup` tidak meninggalkan key
     nyangkut di `held`**: tekan `W`, tekan `Enter`, lepas `W`; avatar tidak boleh terus jalan.
   - Tampilkan `#chat` bersamaan dengan `#hud` setelah join.
5. `public/index.html`: markup panel + `<script src="chat-core.js">` dan
   `<script src="chat-ui.js">` **sebelum** `main.js`.
6. `public/style.css`: ikut palet yang ada (`#1b1e27`, border `#2c3040`, teks `#e8eaf0`).
   Lebar maks ~320px, tinggi ~40vh. Jangan menutupi `#hud` di kiri-bawah.

**Acceptance**

- Tiga tab bisa saling kirim pesan; semua pesan muncul di ketiganya.
- Tab keempat yang baru join langsung melihat sampai 50 pesan terakhir.
- Dua user dengan nama sama → yang kedua jadi `Budi (2)`.
- Mengetik "wasd" di input tidak menggerakkan avatar; `Escape` mengembalikan kontrol gerak.
- Pesan >280 char dipotong; pesan kosong tidak terkirim.
- Kirim 8 pesan cepat → sisanya ditolak dengan pesan sistem, koneksi tetap hidup.
- `<img src=x onerror=alert(1)>` tampil sebagai teks apa adanya.

**Test (`test.js`)**: `normalizeText` (trim, potong tepat di 280, string kosong, string
spasi saja); `makeBucket` (izinkan sampai limit, tolak sesudahnya, pulih setelah window lewat).

---

## M1 — Mention sebagai routing `[x]`

**Depends on:** M0

Ini inti MVP-nya: `@nama` mengubah pesan dari global menjadi hanya-untuk-yang-disebut.

**Kerjakan**

1. `public/chat-core.js`:
   - `parseMentions(text, names)` → `{ mentioned: string[], unknown: string[], tokens }`.
     - `names` adalah array nama user yang sedang join.
     - Cocokkan **nama terpanjang lebih dulu**, case-insensitive. Nama bisa mengandung
       spasi dan panjangnya maks 16 char (lihat `.slice(0, 16)` di handler `join`), jadi
       pencocokan tidak bisa sekadar memotong di spasi.
     - `unknown` = token `@sesuatu` yang tidak cocok dengan nama mana pun.
     - `tokens` = array `{ type: 'text' | 'mention', value }` untuk dipakai renderer.
   - `resolveRecipients(text, senderId, players)` → `{ scope, ids, unknown }`.
     - Tidak ada mention → `{ scope: 'all', ids: null }` (`null` artinya broadcast).
     - Ada mention → `{ scope: 'mention', ids: [<id yang disebut>, senderId] }`, tanpa duplikat.
     - Ada `unknown` → kembalikan `unknown` supaya server bisa menolak.
2. `server.js` — handler `chat` memakai `resolveRecipients`:
   - `unknown` tidak kosong → balas Message `scope: 'system'` ke pengirim saja
     ("Tidak ada user bernama @xxx"), **jangan kirim pesannya ke siapa pun**.
   - `scope: 'all'` → `io.emit` + push ke ring buffer seperti M0.
   - `scope: 'mention'` → kirim hanya ke `ids` pakai `io.to(id).emit('chat', msg)`,
     **jangan** push ke ring buffer.
   - **Jangan broadcast lalu filter di client.** Kalau difilter di client, siapa pun bisa
     membaca semua pesan mention dari devtools dan seluruh gunanya hilang.
3. `public/chat-ui.js`:
   - Render `tokens`: mention jadi `<span class="mention">` yang dibuat dengan
     `createElement` + `textContent`. **Bukan** string HTML.
   - `scope: 'mention'` dirender jelas berbeda dari global — beri latar/garis tepi dan
     label kecil (mis. "hanya ke Sari, Budi") supaya pengirim yakin pesannya privat dan
     penerima tahu ini bukan pesan global.
   - Kalau nama kita sendiri yang disebut, sorot lebih kuat lagi.

**Acceptance**

- Tiga tab (Budi, Sari, Andi). Budi kirim `@Sari cek ini` → hanya Budi dan Sari yang
  melihatnya. **Di tab Andi, event `chat` untuk pesan itu benar-benar tidak diterima** —
  verifikasi di console/Network, bukan hanya "tidak tampil".
- `@Sari @Andi halo` sampai ke keduanya, satu pesan saja, tidak dobel.
- `@Sarii halo` (nama tidak ada) → pesan tidak terkirim, Budi dapat peringatan.
- `@sari` (huruf kecil) tetap cocok ke `Sari`.
- Pesan mention tidak muncul di history user yang baru join.
- Nama dengan spasi (`Budi Ganteng`) bisa di-mention utuh.

**Test**: `parseMentions` — mention di awal/tengah/akhir, dua mention beruntun, nama yang
merupakan prefix nama lain (`Budi` vs `Budiman`, harus pilih yang lebih panjang), nama
dengan spasi, `@` di akhir string, `@` tanpa nama, email-like (`a@b.com`) tidak dianggap
mention. `resolveRecipients` — tanpa mention, satu mention, mention ganda tanpa duplikat,
mention ke diri sendiri, mention tidak dikenal.

---

## M2 — Autocomplete `@` `[x]`

**Depends on:** M1

**Kerjakan**

- Mengetik `@` di input membuka daftar nama user yang sedang join, terfilter oleh teks
  setelah `@`. Sumber datanya objek `players` yang sudah dipelihara `main.js` — jangan
  bikin event socket baru dan jangan simpan salinan daftar user sendiri.
- Navigasi: `↑`/`↓` pindah pilihan, `Tab`/`Enter` melengkapi, `Escape` menutup daftar
  **tanpa** mem-blur input (`Escape` kedua baru keluar dari chat).
- Melengkapi nama menyisipkan `@Nama ` (dengan spasi di belakang) dan menaruh kursor
  sesudahnya.
- Jangan tampilkan diri sendiri di daftar.
- Daftar ikut ter-update saat ada yang join/left selagi daftar terbuka.
- Kalau tidak ada nama yang cocok, tutup daftar dan biarkan user mengetik bebas — jangan
  memblokir input.

**Acceptance**

- Ketik `@` → daftar muncul; ketik `s` → menyusut ke nama berawalan `S`; `Enter`
  menyisipkan `@Sari ` dan pesan terkirim benar sebagai mention.
- User baru join selagi daftar terbuka → langsung ikut muncul di daftar.
- `Enter` saat daftar tertutup tetap mengirim pesan (jangan sampai autocomplete menelan
  tombol kirim).

**Test**: fungsi pure filter kandidat (`matchNames(prefix, names, selfName)`) — case-insensitive,
tanpa diri sendiri, prefix kosong mengembalikan semua, tidak ada yang cocok mengembalikan `[]`.

---

## M3 — Unread badge + system message `[x]`

**Depends on:** M0

Polish terakhir supaya MVP terasa jadi, bukan setengah.

**Kerjakan**

- Panel bisa collapse jadi tombol kecil; state-nya disimpan di `localStorage`.
- Badge angka unread saat panel collapsed. Mention ke diri sendiri dihitung terpisah dan
  ditandai warna berbeda supaya tidak tertimbun pesan global.
- Server memancarkan Message `scope: 'system'` saat player join ("Budi masuk") dan left
  ("Budi keluar"), masuk ring buffer global.
- Bunyi notifikasi halus saat pesan datang selagi panel collapsed, dan selalu saat kita
  di-mention. **Jangan pakai file audio** — bangkitkan tone pendek dengan WebAudio memakai
  `audioCtx` yang sudah ada di `public/rtc.js` (ekspor accessor kecil kalau perlu). Volume
  rendah, tidak berbunyi untuk pesan sendiri.
- Toggle mute notifikasi, ikut disimpan di `localStorage`.
- Perbarui baris hint di `#hud` (`Enter` untuk chat) dan bagian **Limits** di `README.md`
  yang masih menyebut "no chat".

**Acceptance**: collapse panel, kirim pesan dari tab lain → badge naik + satu bunyi; badge
mention warnanya beda. Buka panel → badge reset. Tutup satu tab → muncul "keluar" di tab lain.

---

## M4 — Emoji reactions + `/vote` `[x]`

**Depends on:** M0

Di luar MVP, dikerjakan setelah desain karakter beres. Dua fitur yang diangkat dari daftar
"ditunda" di bawah.

**Sintaks `/vote`** — pertanyaan dan pilihan dipisah `|`, karena pertanyaan poll hampir
selalu mengandung koma dan spasi sedangkan `|` tidak pernah diketik tanpa sengaja:

```
/vote Makan siang di mana? | Padang | Sate | Bakso
/vote Lanjut meeting?                       -> otomatis jadi Ya / Tidak
```

Maksimal 5 pilihan, pertanyaan 120 char, pilihan 40 char, pilihan kembar ditolak. Perintah
salah → satu Message `scope: 'system'` ke pengirim saja, pesannya tidak dikirim ke siapa
pun. Perintah lain (`/roll`, dst.) belum ada dan dibalas dengan daftar yang tersedia,
bukan diam-diam dikirim sebagai chat biasa.

**Perilaku poll:** satu suara per orang; klik pilihan lain memindahkan suara, klik pilihan
sendiri membatalkannya. Poll tutup sendiri setelah 10 menit (`POLL_MS`) — tidak ada
perintah tutup manual, dan tidak bisa dibuka lagi. Setelah tutup, pemenang ditandai, tapi
hanya kalau pemenangnya tunggal: seri tidak mengumumkan siapa pun.

**Perilaku reaction:** palet tetap 6 emoji (`REACTIONS`). Emoji di luar palet ditolak
server — satu-satunya cara mengirimnya adalah melewati UI. Klik kedua oleh orang yang
sama menariknya kembali, dan chip yang kosong dihapus sekalian supaya tidak ada chip "0".

**Kenapa hanya pesan global yang bisa direaksi/divoting.** Reaction dan vote adalah
perubahan pada pesan yang masih dipegang server, dan satu-satunya pesan yang dipegang
server adalah ring buffer global. Pesan mention sengaja diteruskan lalu dilupakan — itulah
yang membuatnya privat — jadi tidak ada apa pun untuk ditempeli. UI karenanya tidak
menampilkan tombol reaksi di pesan mention sama sekali, bukan menampilkannya lalu gagal.

**Tambahan protokol socket**

Client → server:

| Event | Payload |
|---|---|
| `react` | `{ id, emoji }` — toggle; emoji wajib anggota `REACTIONS` |
| `vote` | `{ id, option }` — `option` index integer |

Server → client:

| Event | Payload |
|---|---|
| `reacted` | `{ id, reactions }` — seluruh peta emoji, bukan delta |
| `voted` | `{ id, poll }` — seluruh objek poll |

Dikirim utuh, bukan delta: dua browser yang mengklik bersamaan akan berakhir sepakat.
Rate limit terpisah dari chat (`TAP_LIMIT`, 20/3 detik) supaya salah klik chip tidak
memakan jatah untuk membalas orang.

Bentuk **Message** bertambah dua field, keduanya selalu ada:

```js
reactions: { '👍': [{ id, name }] },  // {} kalau belum ada
poll: { question, options: [{ text, votes: [{ id, name }] }], endsAt } // null selain scope 'poll'
```

`scope` bertambah satu nilai: `'poll'`. Pemilih dan pereaksi disimpan `{ id, name }`, bukan
id saja, karena orangnya bisa saja sudah pulang saat tallynya dibaca dan `?` di tooltip
lebih buruk daripada nama yang basi beberapa menit.

**Test**: `parseCommand`, `parseVote`, `castVote`, `pollTotals`, `toggleReaction` di
`test.js`.

## Urutan

```
M0 ── M1 ── M2
 └─── M3   (boleh paralel dengan M1/M2)
```

Rilis MVP = **M0 + M1 + M2**. M3 boleh menyusul.

## Ditunda sampai desain karakter selesai

Jangan kerjakan di MVP ini. Dicatat supaya keputusannya tidak hilang:

proximity/local chat · room chat (butuh `roomAt()` + zones di `office.js`) · emote cepat ·
slash command lain (`/me`, `/roll`, `/here`) · DM/whisper via klik avatar · ping + waypoint
"samperin gue" · sticky note di whiteboard · paste gambar.

Sudah dikerjakan setelah MVP: bubble chat di atas avatar + typing indicator
(`public/bubble.js`), reaction ke pesan dan poll (M4 di atas).

Bentuk Message di MVP ini sudah menyisakan tempat untuk itu: `scope` cukup ditambah nilai
baru, dan penentuan penerima sudah terpusat di satu fungsi (`resolveRecipients`), jadi
menambah channel nanti tidak membongkar apa pun.

## Catatan

Tulis temuan di luar scope ticket di sini (bug lama, ide, utang teknis) supaya tidak
dikerjakan diam-diam di tengah ticket.

- Semua `<script>` berbagi satu scope global, jadi nama fungsi top-level bisa saling
  menimpa tanpa error. `setMuted` di `rtc.js` (mic) hampir tertimpa mute notifikasi
  chat; sekarang namanya `setChatMuted`. Kalau nanti menambah file, cek dulu nama
  top-level-nya belum dipakai file lain.
- Verifikasi manual 3 tab di browser belum dijalankan (ekstensi browser tidak tersedia
  di sesi ini). Yang sudah diverifikasi: unit test, plus skrip di luar repo yang
  menjalankan server sungguhan lewat websocket (routing mention, history, rate limit,
  dedupe nama) dan yang menjalankan `chat-ui.js` di atas DOM tiruan (autocomplete,
  badge, render). Tampilan/CSS-nya sendiri belum pernah dilihat mata.
- Di luar M0-M3, atas permintaan: history global dikosongkan begitu orang terakhir
  keluar (`server.js`, handler `disconnect`). Konsekuensinya, kalau kamu sendirian lalu
  me-refresh halaman, log ikut hilang — sepersekian detik itu ruangannya memang kosong.
  Kalau ini mengganggu, obatnya jeda beberapa detik sebelum menghapus, bukan mengubah
  syaratnya.
- Chat lewat socket.io, bukan WebRTC data channel. Disengaja: mesh WebRTC di `rtc.js` hanya
  untuk audio dan mati di NAT tanpa TURN, sementara socket.io pasti terhubung untuk semua.
- Poll dan reaction menempel di pesan yang ada di ring buffer global, jadi keduanya ikut
  hilang saat orang terakhir keluar dari kantor — sama seperti chatnya. Poll yang masih
  terbuka pun ikut hilang; kalau nanti terasa mengganggu, obatnya poll disimpan terpisah
  dari ring buffer chat, bukan membuat ring buffernya lebih awet.
- `chat-ui.js` menyimpan `rows` (id pesan → baris DOM) supaya reaction/vote yang datang
  belakangan bisa menemukan barisnya lagi. Peta ini tidak pernah dipangkas, sama seperti
  `#chat-log` yang juga tidak pernah dipangkas. Kalau suatu saat log dibatasi, pangkas
  keduanya bersamaan.
- Verifikasi M4: unit test; skrip websocket dengan 4 klien terhadap server sungguhan;
  `chat-ui.js` di atas DOM tiruan; **dan dua tab Chrome sungguhan** (Budi + Sari) —
  `/vote` membuat kartu, klik memindahkan suara, chip reaksi dan highlight "milik saya"
  benar per penonton, `/help` dan perintah tak dikenal hanya sampai ke pengirim, pesan
  mention tidak punya tombol reaksi.
- Tinggi `#chat` naik dari `40vh` ke `clamp(380px, 46vh, 520px)` setelah dilihat di
  browser: di layar laptop 694px, 40vh memotong kartu poll jadi setengah. Kalau nanti
  ada elemen chat yang lebih tinggi lagi, naikkan lantainya, jangan `vh`-nya — `vh` kecil
  di layar pendek justru saat ruangnya paling dibutuhkan.
- Tombol reaksi sempat `opacity: 0` sampai baris di-hover. Terbukti tidak ketemu orang.
  Sekarang `0.45` dan penuh saat hover.
