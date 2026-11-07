// Ops: refresh katalog command tanpa restart platform.
//   npm run catalog:refresh
// Token dibaca dari `.env` (CATALOG_REFRESH_TOKEN), URL dari PLATFORM_URL
// (default http://127.0.0.1:3000). Tidak perlu export variabel di shell.
const token = process.env.CATALOG_REFRESH_TOKEN ?? '';
if (!token) {
  console.error('[catalog] CATALOG_REFRESH_TOKEN kosong. Isi dulu di platform/.env');
  process.exit(1);
}

const base = (process.env.PLATFORM_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');

try {
  const res = await fetch(`${base}/api/ops/catalog/refresh`, {
    method: 'POST',
    headers: { 'x-catalog-token': token },
  });
  const body = await res.text();

  if (!res.ok) {
    console.error(`[catalog] gagal ${res.status}: ${body}`);
    process.exit(1);
  }

  const payload = JSON.parse(body);
  console.log(`[catalog] ok: ${payload.total} plugin, generatedAt ${payload.generatedAt}`);
} catch (err) {
  console.error(`[catalog] gagal menghubungi platform: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}
