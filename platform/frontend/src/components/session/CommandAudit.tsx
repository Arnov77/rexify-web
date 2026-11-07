import type { ConfigAuditEntry } from '../../lib/types';

interface CommandAuditProps {
  logs: ConfigAuditEntry[];
}

const auditDateFormat = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function formatTime(value: string): string {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? '-' : auditDateFormat.format(new Date(parsed));
}

// Ringkasan pendek per aksi; detail lengkap (contoh path plugin) sengaja tidak ditampilkan.
function describe(entry: ConfigAuditEntry): string {
  const detail = entry.detail;

  switch (entry.action) {
    case 'commands_updated': {
      const added = num(detail.addedCount);
      const removed = num(detail.removedCount);
      const total = num(detail.disabledTotal);
      return `${added} plugin dimatikan, ${removed} diaktifkan · total ${total} mati`;
    }
    case 'preset_applied': {
      const label = String(detail.label ?? detail.presetId ?? 'preset');
      return `Preset "${label}" diterapkan · total ${num(detail.disabledTotal)} plugin mati`;
    }
    case 'limit_updated': {
      const field = String(detail.field ?? 'limit');
      return `Limit ${field}: ${num(detail.before)} → ${num(detail.after)}`;
    }
    default:
      return entry.action;
  }
}

export default function CommandAudit({ logs }: CommandAuditProps) {
  return (
    <div className="audit">
      <h3 className="audit__title">Riwayat perubahan</h3>
      {logs.length === 0 ? (
        <p className="caption">Belum ada perubahan command atau limit.</p>
      ) : (
        <ul className="audit-list">
          {logs.map((entry) => (
            <li className="audit-row" key={entry.id}>
              <span className="audit-row__time mono caption">{formatTime(entry.createdAt)}</span>
              <span className="audit-row__text">{describe(entry)}</span>
              <span className="audit-row__user caption">{entry.userEmail ?? 'sistem'}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
