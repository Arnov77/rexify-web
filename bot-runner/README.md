# Rexify Bot Runner

Service Node.js terpisah untuk menjalankan instance bot WhatsApp (PM2) di machine B (VPS NAT).
Platform memanggil service ini lewat HTTP + WebSocket yang diekspos Cloudflare Tunnel.

## Endpoint

Semua endpoint HTTP butuh header `Authorization: Bearer <BOT_RUNNER_SECRET>`.
Khusus WebSocket, secret dikirim lewat query `?secret=...`.

| Method | Path | Keterangan |
| --- | --- | --- |
| POST | `/spawn/:sessionId` | Buat instance (symlink core/) lalu start PM2. Body: `{ "userId": "...", "env": { ... } }` |
| POST | `/stop/:sessionId` | Stop proses PM2 |
| DELETE | `/destroy/:sessionId` | Hapus proses + isi instance (folder `sessions/` dipertahankan) |
| GET | `/status/:sessionId` | `{ "status": "online" \| null }` |
| GET | `/stream/:sessionId?secret=...` | WebSocket: kirim `{ type: 'qr' \| 'pairing' \| 'connected' }` |
| POST | `/config/:sessionId` | Timpa `config.json` instance (atomik). Body: `{ "configJson": "..." }`. Dipakai platform agar toggle command/limit langsung berlaku (hot reload) |
| POST | `/catalog` | Generate ulang katalog command dari `core/plugins` dan kembalikan JSON-nya (manual/ops) |

## Install

```bash
cd bot-runner
npm install
```

## Setup

```bash
cp .env.example .env
```

Isi `.env`:

```env
PORT=4000
BOT_RUNNER_SECRET=<string-panjang-random, sama dengan yang dipakai platform>
REXIFY_ROOT=/home/rexify
```

`REXIFY_ROOT` wajib berisi folder `core/` (codebase rex-bot-v2). Folder `instances/`
dibuat otomatis saat `/spawn` dipanggil.

Jalankan dengan env ter-load (Node 20+):

```bash
node --env-file=.env src/index.js
```

## Katalog command (manual)

Platform mode `other` tidak menyentuh `core/`, jadi katalog command dibuat manual di mesin runner
saat plugin berubah:

```bash
curl -X POST http://127.0.0.1:4000/catalog \
  -H "Authorization: Bearer $BOT_RUNNER_SECRET" \
  -H "Content-Type: application/json" -d '{}' \
  > command-catalog.json
```

Lalu salin `command-catalog.json` ke `platform/src/config/commands.catalog.json` saat deploy.
Alternatif tanpa HTTP: `cd /home/rexify/core && node scripts/list-commands.mjs --out <file>`.

## Run

```bash
npm start
```

Atau lewat PM2:

```bash
pm2 start src/index.js --name rexify-bot-runner
pm2 save
```

## Cloudflare Tunnel

```bash
cloudflared tunnel create rexify-bot-runner
cloudflared tunnel route dns rexify-bot-runner bot-runner.rexapi.my.id
cloudflared tunnel run rexify-bot-runner
```

Konfigurasi `~/.cloudflared/config.yml`:

```yaml
tunnel: rexify-bot-runner
credentials-file: /root/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: bot-runner.rexapi.my.id
    service: http://localhost:4000
  - service: http_status:404
```

WebSocket ikut lewat hostname yang sama (Cloudflare meneruskan upgrade).

## Struktur instance

```
$REXIFY_ROOT/
  core/                     # codebase bot (index.js, main.js, handler.js, plugins/, lib/, ...)
  instances/
    <sessionId>/
      index.js -> ../../core/index.js     # symlink (copy di Windows tanpa hak symlink)
      main.js, handler.js, package.json, plugins/, lib/, node_modules/
      sessions/                            # auth state WhatsApp (tidak dihapus saat destroy)
      data/                                # db.json bot
      qr.txt / pairing.txt / connected.txt # output yang dipantau file-watcher
```

## Catatan

- File watcher polling tiap 2 detik: `qr.txt`, `pairing.txt`, `connected.txt`.
- `connected.txt` ada → kirim `{ type: 'connected' }`, hentikan polling, WS ditutup setelah 500 ms.
- Kalau `REXIFY_ROOT` kosong, service gagal start. Kalau `core/` tidak ada, `/spawn` balas `503 { "error": "CORE_NOT_FOUND" }`.
