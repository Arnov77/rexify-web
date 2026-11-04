# Rexify — Platform Specification

## Overview

Rexify adalah platform SaaS WhatsApp bot. User mendaftarkan akun, menghubungkan nomor WhatsApp mereka, lalu mengkonfigurasi bot melalui dashboard web. Bot yang berjalan berbasis codebase **rex-bot-v2** (WhatsApp bot berbasis Baileys fork).

**Domain:** `rexify.rexapi.my.id`
- Dashboard: `https://rexify.rexapi.my.id`
- API: `https://rexify.rexapi.my.id/api`

---

## Tech Stack

| Layer | Teknologi |
|---|---|
| Platform API | Fastify + TypeScript |
| Database | PostgreSQL |
| Auth | JWT via `@fastify/jwt` |
| Password hashing | bcrypt |
| Bot instance manager | PM2 programmatic API |
| Bot base | rex-bot-v2 (JavaScript ESM) |
| Bot library | `@rexxhayanasi/elaina-baileys` (Baileys fork) |
| Real-time (QR) | WebSocket (`@fastify/websocket`) |
| Dashboard frontend | React (Vite) |

---

## Struktur Folder

```
/home/rexify/
  core/                        ← codebase rex-bot-v2 (read-only, template)
    index.js
    main.js
    handler.js
    plugins/
    lib/
    package.json

  instances/
    {sessionId}/               ← satu folder per session bot
      config.json              ← di-generate platform dari setting user di DB
      sessions/                ← auth credentials Baileys
      data/
        db.json                ← lowdb bot (users WA, stats, dll)
      index.js                 ← symlink ke core/index.js
      main.js                  ← symlink ke core/main.js
      handler.js               ← symlink ke core/handler.js
      plugins/                 ← symlink ke core/plugins/
      lib/                     ← symlink ke core/lib/
      node_modules/            ← symlink ke core/node_modules/
      package.json             ← symlink ke core/package.json

  platform/                    ← Fastify API + source dashboard
    src/
      index.ts                 ← entry point Fastify
      db.ts                    ← PostgreSQL client (pg)
      auth/
        register.ts
        login.ts
        middleware.ts
        password.ts
      session/
        pm2-manager.ts         ← spawn/stop/status instance via PM2
        store.ts               ← sync status session ke DB
        restore.ts             ← restore session aktif saat server boot
      config/
        generator.ts           ← generate config.json instance dari DB
        defaults.ts            ← nilai default config bot
        bot-config.ts          ← CRUD bot_configs di DB + cache
        validator.ts           ← validasi input dari dashboard
        plans.ts               ← PLAN_LIMITS konstanta
      ws/
        qr-server.ts           ← WebSocket server untuk streaming QR ke dashboard
      types/
        auth.ts
        session.ts
        config.ts
    frontend/                  ← React dashboard (Vite)
      src/
        pages/
          Login.tsx
          Register.tsx
          Dashboard.tsx
          SessionDetail.tsx
        components/
          QRModal.tsx
          AutoReplyEditor.tsx
          PluginToggle.tsx
```

---

## Database Schema

Jalankan SQL berikut untuk setup database.

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free',
  trial_ends_at TIMESTAMPTZ DEFAULT (now() + interval '7 days'),
  plan_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL,
  label TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phone_number TEXT,
  status TEXT NOT NULL DEFAULT 'connecting',
  label TEXT,
  connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE bot_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL UNIQUE REFERENCES sessions(id) ON DELETE CASCADE,
  auto_reply JSONB DEFAULT '[]',
  welcome_msg JSONB DEFAULT '{}',
  plugins_enabled JSONB DEFAULT '{}',
  custom_settings JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE plugin_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  plugin_name TEXT NOT NULL,
  trigger TEXT,
  status TEXT NOT NULL DEFAULT 'ok',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON sessions(user_id);
CREATE INDEX ON sessions(status);
CREATE INDEX ON plugin_logs(session_id);
CREATE INDEX ON plugin_logs(created_at DESC);
```

---

## Plan & Limits

Hardcode di `src/config/plans.ts`. Jangan simpan di DB.

```ts
export const PLAN_LIMITS = {
  free:       { sessions: 1, trial_days: 7 },
  pro:        { sessions: 2, duration_days: 30 },
  enterprise: { sessions: 5, duration_days: 30 },
} as const
```

**Logic akses aktif:**
- `free`: akses aktif selama `trial_ends_at > now()`
- `pro` / `enterprise`: akses aktif selama `plan_expires_at > now()`
- Saat user upgrade: set `plan = 'pro'`, `plan_expires_at = now() + 30 days`

---

## Komponen Platform

### 1. Auth

**`src/auth/password.ts`**
- `hashPassword(plain)` → bcrypt hash, salt rounds 12
- `verifyPassword(plain, hashed)` → boolean

**`src/auth/register.ts`** — `POST /api/auth/register`
- Body: `{ email, password }` (password min 8 karakter)
- Validasi: email unik, format email valid
- Jika email sudah ada → 409
- Insert user baru dengan `plan = 'free'`, `trial_ends_at = now() + 7 days`
- Return JWT + data user (tanpa password_hash)
- JWT langsung di-issue, user tidak perlu login ulang setelah register

**`src/auth/login.ts`** — `POST /api/auth/login`
- Body: `{ email, password }`
- Error message sama untuk email tidak ada dan password salah (hindari user enumeration)
- Return JWT + data user termasuk `active: boolean`

**`src/auth/middleware.ts`** — `authMiddleware`
- Verify JWT
- Ambil data user fresh dari DB (bukan hanya dari token) — penting agar perubahan plan langsung berlaku
- Cek `isAccessActive(user)` → jika tidak aktif, return 403
- Set `req.user` untuk dipakai handler berikutnya

**JWT:**
- Payload: `{ userId, email, plan }`
- Expires: 30 hari
- Secret dari `process.env.JWT_SECRET`

---

### 2. Session Manager

Setiap session bot berjalan sebagai **proses Node.js terpisah** dimanage PM2. Nama proses PM2: `rexify-{sessionId}`.

**`src/session/pm2-manager.ts`**

Fungsi yang dibutuhkan:

`spawnSession(userId, sessionId)`
1. Cek kuota: hitung `sessions` aktif user di DB, bandingkan dengan `PLAN_LIMITS[plan].sessions`
2. Jika kuota penuh → throw `SESSION_QUOTA_EXCEEDED`
3. Buat folder `/home/rexify/instances/{sessionId}/`
4. Buat symlink: `index.js`, `main.js`, `handler.js`, `plugins/`, `lib/`, `node_modules/`, `package.json` → semua ke `/home/rexify/core/`
5. Buat folder `sessions/` dan `data/`
6. Panggil `generateConfig(sessionId)` → tulis `config.json`
7. Start PM2 process:
   ```ts
   pm2.start({
     name: `rexify-${sessionId}`,
     script: `/home/rexify/instances/${sessionId}/index.js`,
     cwd: `/home/rexify/instances/${sessionId}`,
     interpreter: 'node',
     env: {
       SESSION_ID: sessionId,
       USER_ID: userId,
       QR_OUTPUT_PATH: `/home/rexify/instances/${sessionId}/qr.txt`,
     },
   })
   ```
8. Update status DB → `connecting`

`destroySession(sessionId)`
1. PM2 delete `rexify-{sessionId}`
2. Hapus folder `/home/rexify/instances/{sessionId}/` (kecuali `sessions/` — simpan untuk reconnect)
3. Update status DB → `disconnected`

`getSessionStatus(sessionId)` → baca dari PM2 list, return status proses

**`src/session/store.ts`** — `syncStatus(sessionId, status, phone?)`
- Update kolom `status`, `phone_number` (jika ada), `connected_at` (jika status `active`), `updated_at` di tabel `sessions`

**`src/session/restore.ts`** — `restoreActiveSessions()`
- Query semua sessions dengan `status = 'active'` dari DB
- Panggil `spawnSession` untuk masing-masing
- Dipanggil saat server platform boot

---

### 3. Config Generator

**`src/config/generator.ts`** — `generateConfig(sessionId)`
1. Ambil `bot_configs` untuk sessionId dari DB
2. Ambil data session (phone_number, label) dari DB
3. Merge dengan `defaultBotConfig()`
4. Tulis ke `/home/rexify/instances/{sessionId}/config.json`

Format `config.json` yang di-generate harus kompatibel dengan format yang dipakai rex-bot-v2 (`example.config.json`). Field penting:

```json
{
  "botname": "Rexify Bot",
  "owner": ["<phone_number_user>"],
  "nomor": "<phone_number_bot>",
  "tz": "Asia/Jakarta",
  "limit": {
    "free": 25,
    "premium": 200
  },
  "antilink": {
    "whitelist_domain": [],
    "whitelist_number": []
  },
  "apikey": {
    "rex": "https://rexapi.my.id"
  },
  "token": {
    "rex": "<dari env platform>"
  }
}
```

Field yang dikontrol user (dari `bot_configs`):
- `botname` ← dari `custom_settings.botname`
- `antilink.whitelist_domain` ← dari `custom_settings.antilink_whitelist`
- Plugins enabled/disabled diatur di level platform engine, bukan di config.json bot

**`src/config/defaults.ts`** — nilai default semua field config bot

**`src/config/bot-config.ts`** — CRUD `bot_configs` di DB
- `getConfig(sessionId)` → cache-first (in-memory Map), fallback ke DB
- `updateConfig(sessionId, patch)` → validasi → update DB → update cache
- `createDefaultConfig(sessionId)` → insert row default saat session pertama connect
- `invalidateCache(sessionId)` → hapus dari Map cache
- `addAutoReplyRule(sessionId, rule)` → tambah satu rule ke array `auto_reply`
- `removeAutoReplyRule(sessionId, ruleId)` → hapus rule by id

**`src/config/validator.ts`**
- `validateAutoReply(rules)` → cek trigger tidak kosong, response tidak kosong, match type valid, regex valid jika tipe regex
- `validateCustomSettings(settings)` → prefix max 3 karakter, language `id|en`, typingDelay 0–5000ms

---

### 4. WebSocket — QR Streaming

**Mekanisme QR:**
1. Saat `spawnSession` dipanggil, instance bot mulai berjalan
2. Bot mendeteksi belum ada credentials → Baileys generate QR
3. Bot menulis QR string ke file `qr.txt` di folder instance
4. Platform polling file `qr.txt` setiap 2 detik
5. Jika file ada dan berisi QR baru → convert ke base64 PNG → kirim ke dashboard via WebSocket
6. Saat bot berhasil connect → bot hapus `qr.txt` → platform berhenti polling → kirim event `connected` via WebSocket
7. Platform update status DB → `active`

**`src/ws/qr-server.ts`**
- WebSocket endpoint: `ws://rexify.rexapi.my.id/api/ws/qr/{sessionId}`
- Auth: JWT di query param `?token=...`
- Saat client connect → mulai polling `qr.txt`
- Kirim message format: `{ type: 'qr', data: '<base64>' }` atau `{ type: 'connected' }` atau `{ type: 'error', message: '...' }`
- Hentikan polling saat client disconnect atau status berubah `active`

**Mode koneksi (implementasi nanti):**
- QR code (default)
- Pairing code (diaktifkan via flag di request)
- Untuk sekarang: hanya QR

---

### 5. API Endpoints

Semua endpoint di bawah `/api`. Endpoint protected menggunakan `authMiddleware`.

**Public:**
```
POST /api/auth/register
POST /api/auth/login
```

**Protected:**
```
GET  /api/me                              ← data user + status plan

POST   /api/sessions                      ← buat session baru (insert DB, belum spawn)
GET    /api/sessions                      ← list semua session milik user
GET    /api/sessions/:sessionId           ← detail session + status PM2
POST   /api/sessions/:sessionId/connect   ← spawn instance bot (PM2 start)
POST   /api/sessions/:sessionId/disconnect ← stop instance bot (PM2 stop)
DELETE /api/sessions/:sessionId           ← destroy session + hapus folder

GET    /api/sessions/:sessionId/config    ← ambil bot_configs
PATCH  /api/sessions/:sessionId/config    ← update sebagian config

POST   /api/sessions/:sessionId/config/auto-reply        ← tambah rule
DELETE /api/sessions/:sessionId/config/auto-reply/:ruleId ← hapus rule

GET    /api/sessions/:sessionId/logs      ← plugin_logs (paginasi, default 50 terbaru)
```

---

### 6. Types

**`src/types/auth.ts`**
```ts
interface JWTPayload { userId: string; email: string; plan: string }
interface AuthUser { id: string; email: string; plan: string; trial_ends_at: Date|null; plan_expires_at: Date|null }
```

**`src/types/session.ts`**
```ts
type SessionStatus = 'connecting' | 'qr_pending' | 'active' | 'disconnected' | 'banned'
interface ManagedSession { userId: string; sessionId: string; status: SessionStatus }
```

**`src/types/config.ts`**
```ts
interface AutoReplyRule { id: string; trigger: string; response: string; match: 'exact'|'contains'|'startswith'|'regex'; enabled: boolean }
interface WelcomeMsg { enabled: boolean; message: string; onlyOnce: boolean }
interface PluginsEnabled { autoReply: boolean; welcomeMsg: boolean; aiChat: boolean; downloader: boolean; antiLink: boolean }
interface CustomSettings { botname: string; prefix: string; language: 'id'|'en'; typingDelay: number; readReceipt: boolean; antilink_whitelist: string[] }
interface BotConfig { sessionId: string; autoReply: AutoReplyRule[]; welcomeMsg: WelcomeMsg; pluginsEnabled: PluginsEnabled; customSettings: CustomSettings; updatedAt: Date }
```

---

### 7. Environment Variables

```env
# Platform
DATABASE_URL=postgresql://user:pass@localhost:5432/rexify
JWT_SECRET=<random string min 32 karakter>
PORT=3000

# Bot API tokens (di-inject ke config.json tiap instance)
REX_API_KEY=<api key rexapi.my.id>
```

---

### 8. Entry Point

**`src/index.ts`**
1. Register plugin `@fastify/jwt` dengan `JWT_SECRET`
2. Register plugin `@fastify/websocket`
3. Register public routes (register, login)
4. Register protected routes dengan `authMiddleware` sebagai hook `onRequest`
5. Register WebSocket route
6. Panggil `restoreActiveSessions()`
7. Listen di `PORT`

---

## Alur Utama

### User Register & Connect Bot

```
1. POST /api/auth/register → dapat JWT
2. POST /api/sessions { label: "Bot Utama" } → dapat sessionId
3. POST /api/sessions/:sessionId/connect → platform spawn PM2 instance
4. WS  /api/ws/qr/:sessionId → terima QR base64
5. User scan QR di WhatsApp
6. Bot connect → WS kirim { type: 'connected' }
7. Dashboard update tampilan → status aktif
```

### Pesan Masuk → Plugin

```
Pesan masuk (Baileys di instance bot)
  → handler.js rex-bot-v2 memproses
  → plugin file-based di core/plugins/ dijalankan
  → bot_configs dibaca dari config.json (untuk auto-reply)
  → response dikirim
```

> Catatan: Plugin engine di platform (src/plugins/) adalah rancangan untuk versi selanjutnya.
> Untuk MVP, plugin berjalan native di dalam instance bot menggunakan sistem plugin bawaan rex-bot-v2.
> Bot membaca auto_reply dari config.json yang di-generate platform.

---

## Scope Boundaries (Belum Diimplementasi)

Hal berikut sengaja dikecualikan dari spec ini — implementasi belakangan:

- **Pairing code mode** — saat ini hanya QR
- **Billing / payment** — upgrade plan dilakukan manual oleh admin dulu
- **Frontend dashboard** — spec ini hanya mencakup API; UI menyusul
- **Multi-region / clustering** — satu VPS, satu proses platform
- **Rate limiting per endpoint** — tambahkan `@fastify/rate-limit` setelah MVP
- **Email verification** — register langsung aktif tanpa verifikasi email
- **Admin panel** — manajemen user oleh pemilik platform

---

## Dependencies Platform

```json
{
  "dependencies": {
    "fastify": "^4",
    "@fastify/jwt": "^8",
    "@fastify/websocket": "^8",
    "bcrypt": "^5",
    "pg": "^8",
    "pm2": "^5",
    "qrcode": "^1"
  },
  "devDependencies": {
    "typescript": "^5",
    "@types/bcrypt": "^5",
    "@types/pg": "^8",
    "@types/node": "^20",
    "tsx": "^4"
  }
}
```