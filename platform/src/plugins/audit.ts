import ts from 'typescript';

// Audit statis untuk plugin buatan user. Ini lapisan deterministik: hasilnya sama untuk
// input yang sama, jadi bisa diuji dan diukur. Bukan pengganti sandbox OS, tapi menutup
// jalur serangan yang paling gampang dipakai (fs, child_process, env, SSRF).

export type Severity = 'block' | 'warn';

export interface Finding {
  rule: string;
  message: string;
  line: number;
  severity: Severity;
}

export interface AuditResult {
  ok: boolean;
  findings: Finding[];
}

// Plugin user hanya boleh memakai helper platform. Akses HTTP lewat #rex/api supaya base
// URL dan token tetap dikelola platform, bukan oleh kode user.
export const ALLOWED_MODULES = ['#rex/api', '#library/ui.js', 'node:crypto'] as const;

// Core memasang config dan state bot di `global`, dan `process` membawa environment proses.
// Tidak ada alasan sah bagi plugin user untuk menyentuh keduanya.
const BLOCKED_IDENTIFIERS = new Set([
  'process',
  'global',
  'globalThis',
  'eval',
  'Function',
  'require',
]);

const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
const URL_WITH_HOST = /^[a-z][a-z0-9+.-]*:\/\/([^/?#:]+)/i;

// SSRF: host internal dan endpoint metadata cloud tidak boleh jadi tujuan plugin user.
function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h === 'metadata.google.internal' || h === '::1') return true;
  if (!IPV4.test(h)) return false;

  const [a = 0, b = 0] = h.split('.').map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function isStringLike(node: ts.Node | undefined): node is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral {
  return (
    node !== undefined &&
    (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
  );
}

export function auditPluginSource(source: string): AuditResult {
  const file = ts.createSourceFile(
    'plugin.js',
    source,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.JS,
  );

  const findings: Finding[] = [];
  const add = (node: ts.Node, rule: string, message: string, severity: Severity = 'block') => {
    const line = file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
    findings.push({ rule, message, line, severity });
  };

  const checkModule = (node: ts.Node, spec: string): void => {
    if ((ALLOWED_MODULES as readonly string[]).includes(spec)) return;
    add(
      node,
      'module-not-allowed',
      `modul "${spec}" tidak diizinkan. Yang boleh: ${ALLOWED_MODULES.join(', ')}`,
    );
  };

  const checkLiteral = (node: ts.Node, text: string): void => {
    const fromUrl = URL_WITH_HOST.exec(text);
    if (fromUrl) {
      const host = fromUrl[1] ?? '';
      if (isPrivateHost(host)) {
        add(node, 'private-host', `host internal "${host}" tidak boleh dipanggil (SSRF)`);
      }
      return;
    }
    // Literal yang isinya persis sebuah IP: anggap target panggilan.
    const bare = text.trim();
    if (IPV4.test(bare) && isPrivateHost(bare)) {
      add(node, 'private-host', `host internal "${bare}" tidak boleh dipanggil (SSRF)`);
    }
  };

  // Nama properti (a.process) bukan akses ke identifier global, jadi tidak dihitung.
  const isPropertyName = (node: ts.Identifier): boolean =>
    (ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) ||
    (ts.isPropertyAssignment(node.parent) && node.parent.name === node);

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && isStringLike(node.moduleSpecifier)) {
      checkModule(node, node.moduleSpecifier.text);
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      isStringLike(node.moduleSpecifier)
    ) {
      checkModule(node, node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const arg = node.arguments[0];
        if (!isStringLike(arg)) {
          add(node, 'dynamic-import', 'import() dengan argumen tidak tetap (modul disusun saat runtime)');
        } else {
          checkModule(node, arg.text);
        }
      } else if (ts.isIdentifier(node.expression)) {
        const name = node.expression.text;
        if (name === 'require') {
          add(node, 'require', 'require() tidak diizinkan, pakai import');
        } else if (name === 'eval') {
          add(node, 'eval', 'eval() tidak diizinkan');
        } else if (name === 'setTimeout' || name === 'setInterval') {
          if (isStringLike(node.arguments[0])) {
            add(node, 'string-timer', `${name}() dengan string setara eval`);
          }
        }
      }
    } else if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'Function'
    ) {
      add(node, 'new-function', 'new Function() tidak diizinkan');
    } else if (ts.isIdentifier(node)) {
      if (BLOCKED_IDENTIFIERS.has(node.text) && !isPropertyName(node)) {
        add(node, 'blocked-identifier', `"${node.text}" tidak boleh diakses plugin user`);
      }
    } else if (isStringLike(node)) {
      checkLiteral(node, node.text);
    }

    ts.forEachChild(node, visit);
  };

  visit(file);

  return { ok: !findings.some((f) => f.severity === 'block'), findings };
}