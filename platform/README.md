# Rexify Platform API

Fastify + TypeScript API untuk platform SaaS bot WhatsApp Rexify. Bot yang berjalan tetap
codebase `rex-bot-v2` (JavaScript ESM) di `{REXIFY_ROOT}/core`, platform hanya meng-generate
config dan memanage prosesnya lewat PM2.

## Setup

```bash
npm install
cp .env.example .env      # isi DATABASE_URL, JWT_SECRET (min 32 karakter), REX_API_KEY
npm run migrate           # jalankan migrations/*.sql
npm run dev               # tsx watch
```

Produksi:

```bash
npm run build
npm start
```

## Environment

| Variable | Wajib | Keterangan |
|---|---|---|
| `DATABASE_URL` | ya | PostgreSQL |
| `JWT_SECRET` | ya | minimal 32 karakter |
| `PORT` | tidak | default 3000 |
| `REX_API_KEY` | tidak | di-inject ke `config.json` tiap instance sebagai `token.rex` |
| `REXIFY_ROOT` | tidak | default `/home/rexify`; berisi `core/` dan `instances/` |

## Endpoint

Public: `POST /api/auth/register`, `POST /api/auth/login`.

Protected (JWT `Authorization: Bearer`):

| Method | Path |
|---|---|
| GET | `/api/me` |
| GET/POST | `/api/sessions` |
| GET/DELETE | `/api/sessions/:sessionId` |
| POST | `/api/sessions/:sessionId/connect` |
| POST | `/api/sessions/:sessionId/disconnect` |
| GET/PATCH | `/api/sessions/:sessionId/config` |
| POST | `/api/sessions/:sessionId/config/auto-reply` |
| DELETE | `/api/sessions/:sessionId/config/auto-reply/:ruleId` |
| GET | `/api/sessions/:sessionId/logs?limit=&offset=` |

WebSocket: `GET /api/ws/qr/:sessionId?token=<jwt>` mengirim `{type:'qr',data}`,
`{type:'connected'}`, atau `{type:'error',message}`.

## Format error

Semua respons error memakai bentuk `{ error: string, message: string }`:

| HTTP | `error` | Sumber |
|---|---|---|
| 400 | `VALIDATION_ERROR` | validator config |
| 400 | `INVALID_EMAIL`, `INVALID_PASSWORD`, `INVALID_BODY`, `INVALID_LABEL` | validasi body |
| 400 | `BAD_REQUEST` | body/param tidak bisa diparse Fastify |
| 401 | `UNAUTHORIZED`, `INVALID_CREDENTIALS` | auth |
| 403 | `ACCESS_EXPIRED`, `SESSION_QUOTA_EXCEEDED` | plan habis, kuota session |
| 404 | `SESSION_NOT_FOUND`, `AUTO_REPLY_NOT_FOUND`, `NOT_FOUND` | resource/route tidak ada |
| 409 | `EMAIL_TAKEN` | email sudah terdaftar |
| 500 | `INTERNAL_ERROR` | pesan generik, detail hanya di log |

## Alur QR

`connect` men-spawn proses `rexify-{sessionId}` lewat PM2. Instance bot menulis QR ke
`instances/{sessionId}/qr.txt`, platform polling tiap 2 detik dan mengirimnya sebagai PNG
base64. Setelah pairing, bot menghapus `qr.txt`, platform set status `active` dan menutup socket.

## Asumsi implementasi

Dicatat karena SPEC tidak eksplisit:

1. Platform di-build sebagai CommonJS (`tsc`), bukan ESM. Bot di `core/` tetap ESM dan tidak disentuh.
2. Path deployment lewat `REXIFY_ROOT` (default `/home/rexify`) supaya bisa dijalankan di mesin dev.
3. Tanpa `dotenv`; `.env` dibaca lewat flag Node `--env-file-if-exists`.
4. `sessions.updated_at` ditambahkan di schema karena `store.syncStatus` wajib meng-update kolom itu.
5. Tabel `schema_migrations` hanya bookkeeping runner migrasi.
6. Session baru di-insert dengan status `disconnected`, bukan default kolom `connecting`.
7. Endpoint session dan config ditaruh di `src/session/routes.ts` dan `src/config/routes.ts`
   (spec tidak punya folder `routes/`).
8. `src/paths.ts` jadi satu-satunya sumber path instance.
9. `config.json` memuat `auto_reply`, `welcome_msg`, dan `commands_disabled` (semuanya dibaca bot).
   `plugins_enabled` tetap disimpan di DB untuk kompatibilitas, tapi tidak ditulis ke `config.json`
   dan tidak lagi dipakai UI.
10. `owner` di `config.json` diisi `phone_number` session; platform tidak menyimpan nomor user.
11. `validateWelcomeMsg` dan `validatePluginsEnabled` ditambah agar PATCH config bisa memvalidasi
    semua bagian config.
12. `/disconnect` = PM2 stop; `DELETE` = PM2 delete + bersihkan folder instance kecuali `sessions/`.
13. Cek kuota mengecualikan session yang sedang di-spawn, supaya `restoreActiveSessions` tidak
    memblokir dirinya sendiri.
14. Di Windows tanpa hak symlink, link ke `core/` diganti junction/copy. Di Linux tetap symlink.
15. Status `active` ditentukan dari `qr.txt` yang dihapus bot, bukan dari `sessions/creds.json`.
16. `phone_number` tidak diisi otomatis saat connect karena bot tidak melaporkannya ke platform.
17. Socket QR ditutup kode `1000` setelah `connected`, `1008` saat auth/ownership gagal.
18. Frontend dashboard di luar scope (SPEC § Scope Boundaries), jadi tidak dibuat.
19. `keys PluginsEnabled` memakai `antiLink` persis seperti SPEC § Types (bukan `antilink`).
20. `GET /api/sessions/:id/config` tidak menulis row DB; row default baru dibuat saat PATCH atau
    saat session pertama connect, sesuai SPEC.
21. Error 5xx selalu `INTERNAL_ERROR` dengan pesan generik; detail hanya masuk log. Route tak
    dikenal memakai `NOT_FOUND`.
22. Cache config di-invalidasi saat session dihapus, supaya Map tidak menyimpan entry yatim.
23. Tab Command memakai katalog statis `src/config/commands.catalog.json`, di-generate dari
    source plugin core: `cd core && npm run catalog`. Isinya `{ file, category, commands, tags,
    help, locked }` per file plugin yang punya `.command` (saat ini 184 dari 197 file; plugin
    event murni dikecualikan karena tidak bisa dipanggil user). Tidak ada import plugin saat
    generate — source dibaca sebagai teks supaya tidak menjalankan kode top-level.
24. Toggle command menyimpan path file plugin (`plugins/<kategori>/<file>.js`) di
    `bot_configs.commands_disabled`, ditulis generator ke `config.json`, lalu
    `core/handler.js` melewati plugin tersebut (termasuk `plugin.before` seperti antilink/AI).
25. Command milik owner (`plugin.owner`/`plugin.rowner`) ditandai `locked` di katalog dan
    disaring di server, jadi client tidak bisa mematikan command pemulihan bot.
26. Hot reload: `core/lib/global.js` memantau `config.json` (1 dtk) dan memperbarui
    `global.commands_disabled` + `global.limit` tanpa restart. Bot yang dijalankan sebelum
    patch ini tetap perlu satu kali restart untuk memuat watcher-nya.
27. `POST /api/commands/refresh` hanya untuk mode `same` (core ada di mesin platform): jalankan
    `core/scripts/list-commands.mjs` lalu buang cache katalog. Mode `other` sengaja read-only
    untuk user — katalog dibuat manual oleh ops di mesin Bot Runner (`node
    scripts/list-commands.mjs` atau `POST /catalog`), lalu file `commands.catalog.json` ikut
    deploy platform. UI hanya menampilkan tanggal katalog.
28. `applyConfigToBot()` dipakai semua endpoint config: mode `same` menulis `config.json` lokal,
    mode `other` mengirim config ke `POST /config/:sessionId` di Bot Runner (tulis atomik).
    Dengan begitu hot reload `commands_disabled`/`limit` jalan di kedua mode; push gagal hanya
    di-warn karena config tetap dikirim saat `/spawn` berikutnya.
29. Saat boot, `refreshCatalogIfStale()` membandingkan `generatedAt` katalog dengan mtime plugin
    terbaru dan regenerate kalau ketinggalan (dilewati di mode `other` karena folder plugin
    tidak ada di mesin platform). `GET /api/commands` menyertakan `canRefresh` untuk
    menampilkan/menyembunyikan tombol "Muat ulang katalog".
30. Preset command (`src/config/presets.ts`: `all`, `minimal`, `hemat`) mengisi
    `commands_disabled` sekaligus berdasarkan kategori katalog lewat
    `POST /api/sessions/:sessionId/config/presets/:presetId`. Plugin owner/rowner tidak pernah
    ikut dimatikan, dan toggle per file plugin tetap bisa diubah sesudah preset diterapkan.
    `GET /api/commands` mengirim daftar `presets` supaya tombolnya bisa dirender frontend.
31. Audit log ada di tabel `config_audit_log` (migrasi 008): `commands_updated`, `preset_applied`,
    dan `limit_updated` dicatat dari PATCH config/preset (detail dibatasi 20 path contoh).
    Riwayat dibaca lewat `GET /api/sessions/:sessionId/audit?limit=&offset=` (join email user)
    dan tampil di bagian "Riwayat perubahan" tab Command. Gagal insert audit hanya di-warn,
    penyimpanan config tidak ikut gagal.
32. Gating plan untuk command: `PLAN_COMMANDS` di `config/plans.ts` menentukan kategori yang
    boleh dipakai (free: grup/info/tools/search/sticker/downloader/premium = 87 plugin, pro:
    +ai/fun/generator/mini-app/manga = 122 plugin, enterprise: semua 184 plugin; plan tak
    dikenal diperlakukan sebagai free). `GET /api/commands` menandai tiap entry dengan
    `available`, dan `PATCH config` + preset menyaring `commands_disabled` lewat
    `allowedFileSetForPlan()` supaya tidak bisa di-bypass dari request manual. Frontend
    menampilkan badge "perlu upgrade" + link `/billing` untuk entry terkunci.
33. Console log menggabungkan `out.log` dan `error.log` dengan `mergeChronological()`
    (urut timestamp, baris error diprefix `[ERR] `), baik untuk history 100 baris terakhir
    maupun baris live tiap detik. Timestamp yang diterima: `YYYY-MM-DD HH:MM:SS` (PM2) dan
    `HH:MM:SS` (logger bot core), ANSI di awal baris diabaikan. File yang isinya hanya jam
    ditempel ke tanggal lokal hari ini; kalau baris terakhir tampak di masa depan, seluruh
    file digeser ke hari sebelumnya, dan urutan lewat tengah malam dinormalkan. PM2 hanya
    menempel timestamp di baris pertama tiap chunk, jadi baris lanjutan (mis.
    `╰ Error: ENOENT ...`) mewarisi timestamp baris induknya; baris yang tetap tanpa
    timestamp (chunk kepotong di awal window) ditaruh di atas. Tanpa ini, error lama selalu
    muncul di bawah log baru setiap panel console dibuka ulang.

## Catatan kompatibilitas rex-bot-v2

Dicek langsung dari isi `rex-bot-v2.zip` (tanpa mengubah apa pun di dalamnya):

- `lib/global.js` membaca `./config.json` relatif ke cwd proses, dan cwd instance memang
  folder instance, jadi `config.json` hasil generator terbaca.
- `main.js` memakai `useSQLiteAuth('./sessions')`, cocok dengan folder `sessions/` yang dibuat
  platform.
- **Belum ada kode di bot yang menulis `qr.txt` atau membaca `SESSION_ID` / `QR_OUTPUT_PATH`.**
  Platform sudah polling `qr.txt` sesuai SPEC § WebSocket, tapi bridge QR baru jalan setelah
  `core/` menambah hook: tulis QR string ke `process.env.QR_OUTPUT_PATH` saat event
  `connection.update` membawa `qr`, lalu hapus file itu saat koneksi `open`.
- `example.config.json` punya field di luar daftar "field penting" SPEC (`link`, `id`,
  `ownername`, `thumbnailUrl`, `audioUrl`, `premium.packages`, `git`, `apikey.jerexd`,
  `token.gtcAppKeyHex`, dst). Generator hanya menulis field yang disebut SPEC, jadi
  plugin yang membaca field lain itu perlu nilai tambahan kalau dipakai.

## Validasi

`platform/.pgtest/` berisi harness di luar paket: PostgreSQL via PGlite (PG WASM), PM2 distub,
`pg` di-shim lewat require cache. Jalankan misalnya:

```bash
npx tsx .pgtest/routes.test.ts
```

Suite: `auth` (13), `session` (18), `config` (31), `pm2` (33), `ws` (18), `routes` (30) = 143
assertion, semuanya lulus.
