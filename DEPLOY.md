# Panduan Deploy Rexify (Web + Bot Runner)

Repo ini punya 3 komponen:

| Komponen | Folder | Butuh |
| --- | --- | --- |
| Backend API (Fastify) | `platform/` | Node 20, PostgreSQL |
| Frontend dashboard (Vite/React) | `platform/frontend/` | cuma static files setelah build |
| Bot Runner (PM2 + bot WhatsApp) | `bot-runner/` + `$REXIFY_ROOT/core` | Node 20, PM2, VPS yang bisa konek WhatsApp |

Dua topologi yang didukung kode:

| | **Mode `same`** | **Mode `other`** |
| --- | --- | --- |
| Bot jalan di | mesin backend (PM2 lokal) | Bot Runner di VPS lain |
| Backend butuh PM2 | ya | tidak (aman di Render/Railway/Fly.io) |
| Env backend | `BOT_RUNNER_MODE=same` | `BOT_RUNNER_MODE=other` + `BOT_RUNNER_URL` + `BOT_RUNNER_SECRET` |
| Env bot runner | opsional | wajib |

Kalau backend di cloud (Render/Railway/Fly.io) → **mode `other`**.
Kalau semua di satu VPS → **mode `same`** (paling sederhana).

> Frontend memakai path relatif `/api` (tanpa base URL env), jadi **wajib satu origin**
> dengan backend lewat reverse proxy. Lihat bagian 5.

---

## 1. Prasyarat

- Node.js **20+** (`node -v`).
- PostgreSQL 14+ (Neon/Supabase/RDS atau `apt install postgresql`).
- Domain + akses DNS (contoh: `app.rexapi.my.id`, `api.rexapi.my.id`, `bot-runner.rexapi.my.id`).
- VPS Linux untuk Bot Runner (boleh di belakang NAT, tanpa IP publik).
- `cloudflared` di VPS Bot Runner.

---

## 2. Deploy Bot Runner (VPS NAT)

### 2.1 Struktur folder

```bash
sudo mkdir -p /home/rexify
sudo chown -R $USER:$USER /home/rexify
cd /home/rexify
```

Layout akhir:

```
/home/rexify/
  core/            # codebase bot (index.js, main.js, handler.js, plugins/, lib/, node_modules/)
  instances/       # dibuat otomatis oleh bot-runner
```

Copy codebase bot ke `core/` lalu install dependency-nya:

```bash
cd /home/rexify/core
npm install            # wajib: plugins/ butuh node_modules
node -e "console.log('core ok')"
```

### 2.2 Install service

```bash
sudo mkdir -p /opt/rexify-bot-runner
sudo chown -R $USER:$USER /opt/rexify-bot-runner

# copy folder bot-runner/ dari repo ke /opt/rexify-bot-runner
rsync -av ./bot-runner/ /opt/rexify-bot-runner/

cd /opt/rexify-bot-runner
npm ci --omit=dev
cp .env.example .env
nano .env
```

Isi `.env`:

```env
PORT=4000
BOT_RUNNER_SECRET=<openssl rand -hex 32>
REXIFY_ROOT=/home/rexify
```

Generate secret: `openssl rand -hex 32` — **simpan nilai yang sama** untuk `platform/.env`.

### 2.3 Jalankan dengan PM2

`npm start` tidak membaca `.env` otomatis, jadi lewat PM2 pakai `--env-file`:

```bash
sudo npm install -g pm2
cd /opt/rexify-bot-runner
pm2 start src/index.js --name rexify-bot-runner --node-args="--env-file=.env"
pm2 save
pm2 startup      # ikuti perintah yang dicetak, supaya hidup setelah reboot
```

Cek:

```bash
pm2 logs rexify-bot-runner --lines 50
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4000/status/tes
# harapan: 401 (authMiddleware aktif, tidak ada secret)
```

Jangan buka port 4000 ke publik.

### 2.4 Cloudflare Tunnel

```bash
cloudflared tunnel login
cloudflared tunnel create rexify-bot-runner
cloudflared tunnel route dns rexify-bot-runner bot-runner.rexapi.my.id
```

`~/.cloudflared/config.yml`:

```yaml
tunnel: rexify-bot-runner
credentials-file: /home/<user>/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: bot-runner.rexapi.my.id
    service: http://localhost:4000
  - service: http_status:404
```

Jalankan sebagai service:

```bash
sudo cloudflared service install
sudo systemctl enable --now cloudflared
sudo systemctl status cloudflared --no-pager
```

Test dari mesin lain (bukan localhost):

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://bot-runner.rexapi.my.id/status/tes
# 401 = tunnel + service OK

curl -s -X POST https://bot-runner.rexapi.my.id/stop/tes \
  -H "Authorization: Bearer <BOT_RUNNER_SECRET>"
# {"ok":true} = secret OK, bot tidak ada (idempotent)
```

Cloudflare mendukung WebSocket, jadi `/stream/:sessionId` lewat hostname yang sama.

---

## 3. Deploy Backend (mode `other`, cloud)

Target: Render / Railway / Fly.io. Semua mendukung WebSocket.

### 3.1 Build & start

| Setting | Nilai |
| --- | --- |
| Root directory | `platform` |
| Install | `npm ci --include=dev` |
| Build | `npm run build && npm run migrate` |
| Start | `node dist/index.js` |

`npm run migrate` butuh `tsx` (devDependency), karena itu `--include=dev`. Migrasi
idempotent: file yang sudah tercatat di `schema_migrations` di-skip.

Alternatif: jalankan migrasi manual sekali dari laptop:

```bash
cd platform
DATABASE_URL="postgres://..." npm run migrate
```

### 3.2 Environment

```env
DATABASE_URL=postgresql://user:pass@host:5432/rexify?sslmode=require
JWT_SECRET=<openssl rand -hex 32>          # minimal 32 karakter, kalau kurang backend gagal start
PORT=3000                                   # Render/Railway biasanya inject otomatis
SMTP_HOST=smtp.zoho.com
SMTP_PORT=465
SMTP_USER=support@rexapi.my.id
SMTP_PASS=<app password Zoho>
SMTP_FROM=Rexify <support@rexapi.my.id>
REX_API_KEY=<key rexapi>
JEREXD_API_KEY=<key jerexd, opsional>
BOT_RUNNER_MODE=other
BOT_RUNNER_URL=https://bot-runner.rexapi.my.id
BOT_RUNNER_SECRET=<sama persis dengan bot-runner/.env>
GOOGLE_CLIENT_ID=<client id OAuth, akhiran .apps.googleusercontent.com>
GOOGLE_CLIENT_SECRET=<client secret OAuth>
GOOGLE_REDIRECT_URI=https://app.rexapi.my.id/api/auth/google/callback
```

Login Google memakai OAuth 2.0 Authorization Code flow. Di Google Cloud Console
(Credentials → OAuth client ID → Web application) daftarkan **Authorized redirect URI**
persis seperti `GOOGLE_REDIRECT_URI` di atas. Kalau `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`
kosong, `GET /api/auth/google` membalas 503 dan tombol Google di halaman masuk tidak bisa dipakai.

`REXIFY_ROOT` tidak perlu di mode `other` (folder instance tidak dipakai di backend).

Kalau `BOT_RUNNER_MODE=other` tapi `BOT_RUNNER_URL` kosong, request connect akan error
`BOT_RUNNER_URL wajib di-set kalau BOT_RUNNER_MODE=other`.

### 3.3 Verifikasi

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://api.rexapi.my.id/api/me
# 401 = server hidup (tanpa JWT)
```

---

## 4. Deploy Backend (mode `same`, satu VPS)

```bash
sudo mkdir -p /home/rexify && cd /home/rexify
# copy platform/ dan core/ ke sini
cd /home/rexify/platform
npm ci
cp .env.example .env
nano .env      # DATABASE_URL, JWT_SECRET, REXIFY_ROOT=/home/rexify, BOT_RUNNER_MODE=same
npm run migrate
npm run build
pm2 start dist/index.js --name rexify-platform --node-args="--env-file=.env"
pm2 save && pm2 startup
```

Syarat mode `same`: `/home/rexify/core` ada, dan `pm2` bisa jalan (butuh mesin normal —
**tidak** bisa di Render/Railway/Fly.io).

---

## 5. Deploy Frontend

### 5.1 Build

```bash
cd platform/frontend
npm ci
npm run build          # hasil: dist/
```

Upload `dist/` ke VPS (mis. `/var/www/rexify`) atau host static.

### 5.2 Reverse proxy WAJIB satu origin

Frontend memanggil `/api/...` relatif dan WebSocket `/api/ws/qr/:id?token=...`.
Host static biasa (Vercel/Netlify/Cloudflare Pages) **tidak bisa** proxy WebSocket lewat
`rewrites`, jadi QR streaming akan gagal. Pakai Nginx/Caddy di depan frontend + backend.

**Nginx** (`/etc/nginx/sites-available/rexify`):

```nginx
server {
    listen 80;
    server_name app.rexapi.my.id;

    root /var/www/rexify;
    index index.html;

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # REST + WebSocket QR
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/rexify /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d app.rexapi.my.id    # TLS
```

Kalau backend di cloud (mode `other`), ganti `proxy_pass` ke URL backend:

```nginx
proxy_pass https://api.rexapi.my.id;
proxy_ssl_server_name on;
```

**Caddy** (lebih ringkas, WS otomatis):

```
app.rexapi.my.id {
    root * /var/www/rexify
    handle /api/* {
        reverse_proxy 127.0.0.1:3000
    }
    try_files {path} /index.html
    file_server
}
```

---

## 6. Database

```bash
psql "$DATABASE_URL" -c "select name from schema_migrations order by name;"
```

Harapan (setelah semua migrasi):

```
001_init.sql
002_session_connect.sql
003_custom_settings_v2.sql
004_email_verification.sql
005_billing.sql
006_billing_qr_code.sql
007_commands_disabled.sql
008_config_audit.sql
009_google_auth.sql
```

- Pool backend `max: 10` → batasi connection di provider (Neon/Supabase pooler) minimal ~15.
- Backup harian; isi penting: `users`, `sessions`, `bot_configs`, `plugin_logs`.
- Restore: buat DB baru → `DATABASE_URL=<baru> npm run migrate` → `pg_restore`.
- User lama otomatis `email_verified = true` oleh migrasi 004; user baru wajib OTP.

---

## 7. Smoke test end-to-end

Urutan yang harus lulus setelah semua service naik:

1. **Register** di `https://app.rexapi.my.id/register` → harus diarahkan ke `/verify-email`.
2. **OTP email** masuk (kalau tidak masuk, cek log backend `EMAIL_SEND_FAILED`).
3. **Login** → dashboard.
4. **Buat session** → klik connect. Backend (mode `other`) memanggil
   `POST https://bot-runner.rexapi.my.id/spawn/:id`; `pm2 list` di VPS bot-runner harus
   menampilkan `rexify-<sessionId>`.
5. **QR muncul** di dashboard (platform proxy WS → Bot Runner `/stream`).
6. Setelah scan: status `active`, `instances/<id>/connected.txt` ada,
   `pm2 logs rexify-<sessionId>` menampilkan koneksi open.
7. Kirim `.menu` ke bot dari nomor lain:
   - plan `free` → ada pesan watermark setelah menu,
   - plan `pro`/`enterprise` → tidak ada watermark.
8. **Disconnect** → proses PM2 berhenti.
9. **Delete** → folder instance dihapus kecuali `sessions/`.

Debug manual:

```bash
# status semua bot di VPS runner
pm2 list
# log satu instance
pm2 logs rexify-<sessionId> --lines 100

# spawn manual lewat HTTP
curl -s -X POST https://bot-runner.rexapi.my.id/spawn/<sessionId> \
  -H "Authorization: Bearer $BOT_RUNNER_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"userId":"<uuid>","env":{"CONNECT_MODE":"qr"},"configJson":"{}"}'
```

---

## 8. Operasional

| Kebutuhan | Perintah |
| --- | --- |
| Restart backend | `pm2 restart rexify-platform --update-env` (mode same) |
| Restart bot runner | `pm2 restart rexify-bot-runner --update-env` |
| Log bot runner | `pm2 logs rexify-bot-runner` |
| Log satu bot | `pm2 logs rexify-<sessionId>` |
| Migrasi baru | `cd platform && npm run build && npm run migrate` |
| Rotasi secret | ganti `BOT_RUNNER_SECRET` di **dua** sisi lalu restart keduanya |
| Backup auth WhatsApp | `tar -czf backups/$(date +%F).tgz /home/rexify/instances/*/sessions` |

Catatan penting:

- `BOT_RUNNER_SECRET` harus identik di backend dan bot runner; kalau beda semua request 401.
- Restart bot runner tidak menghapus session WhatsApp: `sessions/` dipertahankan.
- Perubahan env (watermark, nomor, mode connect) baru berlaku setelah bot di-spawn ulang,
  karena env dibaca saat PM2 start.
- `restoreActiveSessions()` saat backend start memanggil `spawnSession` untuk session
  `active`/`connecting`; di mode `other` artinya bot di VPS ikut di-spawn ulang.
- Simpan `platform/.env` dan `bot-runner/.env` sebagai secret; jangan commit.
- Kalau QR tidak muncul tapi proses PM2 hidup: cek `curl -N` ke endpoint WS, pastikan
  reverse proxy meneruskan header `Upgrade`.




