# Rexify Design System v1.0

## 0. Intent

Dashboard SaaS untuk platform WhatsApp bot. Target user: pengguna biasa hingga developer.
UI harus terasa ringan, modern, dan tidak overwhelming — semua informasi penting tersaji tanpa kepadatan visual.

---

## 1. Core Principles

- **Clarity first** — setiap elemen punya tujuan, tidak ada dekorasi tanpa fungsi
- **Status visibility** — user selalu tahu kondisi bot mereka (aktif, mati, connecting)
- **Incremental complexity** — user biasa melihat yang sederhana, developer bisa drill down
- **Dark-native** — dark mode adalah default, light mode opsional

---

## 2. Visual Foundations

### Colors

#### Brand
```
--color-primary:        #6C63FF   /* ungu elektrik — identitas utama */
--color-primary-hover:  #574FD6
--color-primary-muted:  #6C63FF22
```

#### Surface (Dark mode default)
```
--color-bg:             #0F0F13   /* background utama */
--color-surface:        #17171D   /* card, panel */
--color-surface-raised: #1E1E27   /* dropdown, modal */
--color-border:         #2A2A35
--color-border-subtle:  #1E1E27
```

#### Surface (Light mode)
```
--color-bg:             #F5F5F7
--color-surface:        #FFFFFF
--color-surface-raised: #F0F0F5
--color-border:         #E2E2E8
--color-border-subtle:  #EFEFEF
```

#### Text
```
--color-text-primary:   #EDEDED   /* dark */ / #111111   /* light */
--color-text-secondary: #9898A8   /* dark */ / #555566   /* light */
--color-text-muted:     #55555F   /* dark */ / #9898A8   /* light */
```

#### Semantic
```
--color-success:        #22C55E
--color-success-muted:  #22C55E18
--color-error:          #EF4444
--color-error-muted:    #EF444418
--color-warning:        #F59E0B
--color-warning-muted:  #F59E0B18
--color-info:           #38BDF8
--color-info-muted:     #38BDF818
```

#### Status bot (dipakai di badge dan indikator)
```
--status-active:        #22C55E   /* aktif */
--status-connecting:    #F59E0B   /* connecting / qr pending */
--status-disconnected:  #55555F   /* disconnected */
--status-banned:        #EF4444   /* banned */
```

---

### Typography

Font: **Inter** (Google Fonts)
Monospace: **JetBrains Mono** (untuk token, ID, kode)

```
Display   — 28–32px, weight 700, tracking -0.02em
Heading   — 20–24px, weight 600
Subhead   — 16–18px, weight 500
Body      — 14–15px, weight 400
Caption   — 12px,    weight 400, color text-secondary
Mono      — 13px,    JetBrains Mono
```

---

### Spacing Scale

```
4px   xs
8px   sm
12px  md
16px  base
24px  lg
32px  xl
48px  2xl
64px  3xl
```

---

### Border Radius

```
4px   sm    — input, badge kecil
8px   md    — card, button
12px  lg    — modal, panel besar
16px  xl    — full card besar
9999px pill — badge status, tag
```

---

### Shadows (dark mode)

```
shadow-sm:  0 1px 3px rgba(0,0,0,0.4)
shadow-md:  0 4px 12px rgba(0,0,0,0.5)
shadow-lg:  0 8px 24px rgba(0,0,0,0.6)
```

---

## 3. Components

### Button

Variants: `primary` | `secondary` | `ghost` | `danger`
Sizes: `sm` (32px) | `md` (40px) | `lg` (48px)

```
primary   — bg: --color-primary, text: white, hover: --color-primary-hover
secondary — bg: --color-surface-raised, text: text-primary, border: --color-border
ghost     — bg: transparent, text: text-secondary, hover bg: --color-surface-raised
danger    — bg: --color-error-muted, text: --color-error, hover bg: --color-error
```

Loading state: tampilkan spinner kecil di kiri teks, teks tetap terlihat, button disabled.
Semua button: border-radius md, transition 150ms ease.

---

### Input

```
height:       40px (md), 36px (sm)
bg:           --color-surface-raised
border:       1px solid --color-border
border-focus: 1px solid --color-primary
border-radius: md
padding:      0 12px
font-size:    14px
```

Error state: border warna `--color-error`, pesan error di bawah input, warna caption error.

---

### Card

```
bg:           --color-surface
border:       1px solid --color-border
border-radius: lg
padding:      20px 24px
```

Card interaktif (hover): `border-color: --color-primary-muted`, `shadow-md`.

---

### Badge / Status Pill

```
border-radius: pill
padding:       2px 10px
font-size:     12px
font-weight:   500
```

Variants mengikuti semantic colors + status bot.
Selalu sertakan dot indikator (8px circle) di kiri teks untuk status bot.

```
● Aktif        — dot + teks --status-active,       bg --color-success-muted
● Connecting   — dot + teks --status-connecting,   bg --color-warning-muted  (animasi pulse)
● Disconnected — dot + teks --status-disconnected, bg surface-raised
● Banned       — dot + teks --status-banned,       bg --color-error-muted
```

---

### Sidebar Navigation

```
width:        240px (desktop), collapsible ke icon-only 64px
bg:           --color-surface
border-right: 1px solid --color-border
```

Nav item:
```
padding:        10px 16px
border-radius:  md
font-size:      14px
font-weight:    500
color default:  text-secondary
color active:   text-primary
bg active:      --color-primary-muted
icon:           20px, warna mengikuti teks
```

Sections: **Main** (Dashboard, Sessions), **Config** (Auto Reply, Plugins, Settings), **Account** (Billing, Logout)

---

### Session Card

Kartu utama di dashboard — representasi satu nomor WA yang terconnect.

```
Layout:   horizontal flex, space-between
Kiri:     avatar bulat (inisial nomor) + nama session + nomor WA (mono, caption)
Kanan:    status badge + tombol aksi (Connect / Disconnect / Settings)
Footer:   tanggal dibuat, jumlah plugin aktif
```

---

### QR Modal

Modal fullscreen-overlay saat user connect bot baru.

```
bg overlay:   rgba(0,0,0,0.75), blur 4px
modal bg:     --color-surface
border-radius: xl
padding:      32px
max-width:    420px
```

Konten:
- Judul "Hubungkan WhatsApp"
- Instruksi singkat 2 baris
- QR code box (200×200px, bg putih, padding 12px, border-radius md)
- Teks "Menunggu scan..." dengan animasi pulse
- Tombol ghost "Gunakan Pairing Code" di bawah (nanti)
- Tombol danger ghost "Batal" pojok kanan atas

---

### Toggle (Plugin Enable/Disable)

```
width:  44px, height: 24px
track:  bg --color-border (off), bg --color-primary (on)
thumb:  white circle 18px, shadow-sm
transition: 200ms ease
```

---

### Auto Reply Rule Item

List item dalam editor auto reply.

```
Layout:    horizontal flex
Kiri:      trigger text (mono) + match type badge
Tengah:    response text preview (truncate 1 baris)
Kanan:     toggle enable/disable + icon edit + icon hapus
border-bottom: 1px solid --color-border-subtle
```

---

### Empty State

Dipakai saat belum ada session, belum ada rule auto reply, dsb.

```
Layout:    center vertical
Icon:      48px, warna text-muted
Heading:   16px, text-secondary
Subtext:   14px, text-muted
CTA:       button primary (opsional)
```

---

### Toast / Notification

```
posisi:       bottom-right, stack ke atas
width:        320px
bg:           --color-surface-raised
border:       1px solid --color-border
border-left:  3px solid (warna semantic)
border-radius: md
padding:      12px 16px
shadow:       shadow-lg
auto-dismiss: 4 detik
```

---

## 4. Layout

### Dashboard Layout

```
┌─────────────────────────────────────────────────────┐
│  Sidebar (240px)  │  Main Content                   │
│                   │  ┌─ Topbar (56px) ────────────┐ │
│  Logo             │  │ Page title    User avatar   │ │
│                   │  └────────────────────────────┘ │
│  Nav items        │                                 │
│                   │  Content area (padding 24px)    │
│                   │                                 │
│  ─────────────    │                                 │
│  Account section  │                                 │
└─────────────────────────────────────────────────────┘
```

Mobile (< 768px): sidebar jadi bottom navigation bar, 4–5 icon.

---

### Content Grid

```
gap:              16px (card grid)
kolom default:    1 (mobile), 2 (tablet 768px+), 3 (desktop 1280px+)
max-width konten: 1200px, centered
```

---

## 5. Motion

```
duration-fast:   100ms   — hover, tooltip
duration-base:   200ms   — button, toggle
duration-slow:   350ms   — modal open/close, sidebar collapse
easing:          ease    — default
easing-enter:    ease-out
easing-exit:     ease-in
```

Animasi khusus:
- Status `connecting`: dot pulse `opacity 1 → 0.3 → 1`, 1.2s infinite
- QR loading: skeleton shimmer
- Toast: slide-in dari kanan, fade-out saat dismiss

---

## 6. Dark / Light Mode

Default: **dark**. Toggle tersedia di sidebar bawah.
Implementasi via CSS custom properties di `:root` dan `[data-theme="light"]`.
Simpan preferensi user di `localStorage`.

---

## 7. Do & Don't

**Do:**
- Gunakan status badge di setiap session card
- Teks CTA singkat: "Connect", "Simpan", "Hapus"
- Konfirmasi sebelum aksi destruktif (hapus session, hapus rule)
- Mono font untuk nomor WA, token, ID

**Don't:**
- Jangan pakai lebih dari 2 warna brand dalam satu komponen
- Jangan sembunyikan error — selalu tampilkan inline atau toast
- Jangan pakai tabel untuk data yang bisa jadi card
- Jangan animasi yang > 400ms untuk interaksi biasa