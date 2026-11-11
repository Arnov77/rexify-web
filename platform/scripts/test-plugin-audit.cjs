// Uji lapisan audit statis plugin user. Jalankan setelah `npm run build`:
//   node scripts/test-plugin-audit.cjs
// Fixture inline supaya satu file ini cukup: tiap kasus = kode plugin + ekspektasi.

const { auditPluginSource } = require('../dist/plugins/audit.js');

const src = (...l) => l.join('\n');

const mustBlock = [
  {
    name: 'import node:fs',
    code: src(
      "import fs from 'node:fs';",
      'export default function (m) { return m.reply(fs.readFileSync("/etc/passwd", "utf8")); }',
    ),
  },
  {
    name: 'import node:child_process',
    code: src("import cp from 'node:child_process';", 'export default function (m) { cp.execSync("id"); }'),
  },
  {
    name: 'require() CJS',
    code: src('const fs = require("fs");', 'export default function (m) { m.reply("x"); }'),
  },
  {
    name: 'eval()',
    code: src('export default function (m) { eval("1+1"); }'),
  },
  {
    name: 'new Function()',
    code: src('export default function (m) { const f = new Function("return 1"); m.reply(f()); }'),
  },
  {
    name: 'process.env',
    code: src('export default function (m) { m.reply(process.env.BOT_RUNNER_SECRET); }'),
  },
  {
    name: 'global.token',
    code: src('export default function (m) { m.reply(global.token.jerexd); }'),
  },
  {
    name: 'globalThis',
    code: src('export default function (m) { m.reply(globalThis.process.env.HOME); }'),
  },
  {
    name: 'import() dinamis dengan variabel',
    code: src('export default async function (m, { text }) { const mod = await import(text); m.reply(typeof mod); }'),
  },
  {
    name: 'import() dinamis modul terlarang',
    code: src('export default async function (m) { const cp = await import("node:child_process"); m.reply("x"); }'),
  },
  {
    name: 'obfuscation: base64 lalu import dinamis',
    code: src(
      'export default async function (m) {',
      '  const name = Buffer.from("Y2hpbGRfcHJvY2Vzcw==", "base64").toString();',
      '  const mod = await import(name);',
      '  m.reply(typeof mod);',
      '}',
    ),
  },
  {
    name: 'setTimeout dengan string',
    code: src('export default function (m) { setTimeout("m.reply(1)", 100); }'),
  },
  {
    name: 'SSRF: endpoint metadata cloud',
    code: src(
      "import api from '#rex/api';",
      'export default async function (m) {',
      '  const res = await api.get("http://169.254.169.254/latest/meta-data/");',
      '  return m.reply(String(res));',
      '}',
    ),
  },
  {
    name: 'SSRF: IP privat 10.x',
    code: src(
      "import api from '#rex/api';",
      'export default async function (m) { await api.get("http://10.0.0.5/admin"); }',
    ),
  },
  {
    name: 'SSRF: IP privat 192.168.x',
    code: src(
      "import api from '#rex/api';",
      'export default async function (m) { await api.get("http://192.168.1.1/"); }',
    ),
  },
  {
    name: 'SSRF: localhost',
    code: src(
      "import api from '#rex/api';",
      'export default async function (m) { await api.get("http://localhost:3000/api/admin/users"); }',
    ),
  },
  {
    name: 'SSRF: IP privat sebagai argumen',
    code: src(
      "import api from '#rex/api';",
      'export default async function (m) { await api.get("172.16.0.9"); }',
    ),
  },
];

const mustPass = [
  {
    name: 'plugin normal dengan #rex/api',
    code: src(
      "import api from '#rex/api';",
      'const rex = async (m, { text }) => {',
      '  if (!text) return m.reply("Kirim kata kunci.");',
      '  const res = await api.get("https://api.example.com/search?q=" + encodeURIComponent(text));',
      '  return m.reply("Hasil: " + String(res));',
      '};',
      'rex.help = ["contoh <kata>"];',
      'rex.tags = ["tools"];',
      'rex.command = /^(contoh)$/i;',
      'rex.limit = true;',
      'export default rex;',
    ),
  },
  {
    name: 'helper ui',
    code: src(
      "import * as ui from '#library/ui.js';",
      'export default function (m) { m.reply(ui.warn("belum aktif")); }',
    ),
  },
  {
    name: 'node:crypto diizinkan',
    code: src(
      "import { randomUUID } from 'node:crypto';",
      'export default function (m) { m.reply(randomUUID()); }',
    ),
  },
  {
    name: 'kata "process" di dalam teks balasan',
    code: src("export default function (m) { m.reply('permintaan sedang di process'); }"),
  },
  {
    name: 'IP di tengah teks, bukan target panggilan',
    code: src("export default function (m) { m.reply('10.0.0.1 adalah gateway kantor'); }"),
  },
  {
    name: 'IP hanya di path URL publik',
    code: src(
      "import api from '#rex/api';",
      'export default async function (m) { await api.get("https://example.com/192.168.1.1"); }',
    ),
  },
  {
    name: 'nama properti .global bukan akses global',
    code: src('export default function (m, { bot }) { m.reply(String(bot.global)); }'),
  },
  {
    name: 'object literal berkunci process',
    code: src('export default function (m) { const o = { process: true }; m.reply(String(o.process)); }'),
  },
  {
    name: 'timer memakai fungsi, bukan string',
    code: src('export default function (m) { setTimeout(() => m.reply("ok"), 500); }'),
  },
];

// Bukan bug, tapi batas yang harus diakui: dua teknik di bawah ini memang tidak tertangkap
// analisis statis. Karena itu lapisan ini hanya triase, dan isolasi runtime tetap wajib.
const knownGaps = [
  {
    name: 'SSRF: host disusun dari potongan string',
    code: src(
      "import api from '#rex/api';",
      'export default async function (m) {',
      '  const host = ["10", "0", "0", "5"].join(".");',
      '  await api.get("http://" + host + "/admin");',
      '}',
    ),
  },
  {
    name: 'escape lewat Object constructor',
    code: src(
      'export default function (m) {',
      '  const F = [].constructor.constructor;',
      '  const p = F("return process")();',
      '  m.reply(p.env.BOT_RUNNER_SECRET);',
      '}',
    ),
  },
];

const fixtures = [
  ...mustBlock.map((f) => ({ ...f, expect: 'block' })),
  ...mustPass.map((f) => ({ ...f, expect: 'pass' })),
];

let falseNeg = 0;
let falsePos = 0;
const failures = [];

for (const f of fixtures) {
  const result = auditPluginSource(f.code);
  const got = result.ok ? 'pass' : 'block';
  const ok = got === f.expect;

  if (!ok) {
    failures.push(f.name);
    if (f.expect === 'block') falseNeg++;
    else falsePos++;
  }

  const rules = result.findings.map((x) => x.rule).join(',') || '-';
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${f.expect.padEnd(5)} -> ${got.padEnd(5)}  ${f.name.padEnd(42)} ${rules}`);
}

console.log('\n--- ringkasan ---');
console.log(`harus ditolak : ${mustBlock.length - falseNeg}/${mustBlock.length} tertangkap`);
console.log(`harus lolos   : ${mustPass.length - falsePos}/${mustPass.length} tanpa false positive`);

console.log('\n--- batas yang diketahui (tidak tertangkap, memang belum ditutup) ---');
let gapCaught = 0;
for (const g of knownGaps) {
  const result = auditPluginSource(g.code);
  const caught = !result.ok;
  if (caught) gapCaught++;
  console.log(`${caught ? 'TERTANGKAP' : 'LOLOS     '}  ${g.name}`);
}
console.log(
  gapCaught === 0
    ? '→ analisis statis bukan batas keamanan: isolasi runtime wajib'
    : `→ ${gapCaught} celah ternyata sudah tertangkap, perbarui dokumentasi`,
);

if (failures.length) {
  console.log(`GAGAL: ${failures.join(' | ')}`);
  process.exit(1);
}
console.log('SEMUA PASS');