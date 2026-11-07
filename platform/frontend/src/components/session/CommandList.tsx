import { useEffect, useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../ui/Button';
import type { CommandCatalog, CommandEntry, CommandPreset } from '../../lib/types';

const PAGE_SIZE = 25;

const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

interface CommandListProps {
  catalog: CommandCatalog | null;
  loading: boolean;
  disabled: string[];
  // Plan user untuk caption gating; kategori di luar plan terkunci di katalog.
  plan: string | null;
  // File plugin yang togglenya sedang disimpan (optimistic lock per baris).
  savingFile: string | null;
  // Preset yang sedang diterapkan; semua tombol preset dikunci selama proses.
  presetBusy: string | null;
  refreshing: boolean;
  onToggle: (entry: CommandEntry, enabled: boolean) => void;
  onBulkToggle: (entries: CommandEntry[], enabled: boolean) => void;
  onApplyPreset: (preset: CommandPreset) => void;
  onRefresh: () => void;
}

const catalogDateFormat = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function formatGeneratedAt(value: string): string {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 'belum pernah' : catalogDateFormat.format(new Date(parsed));
}

function commandLabel(entry: CommandEntry): string {
  if (entry.commands.length === 0) return '(event)';
  const head = entry.commands.slice(0, 3).join(' / ');
  return entry.commands.length > 3 ? `${head} +${entry.commands.length - 3}` : head;
}

function matchesQuery(entry: CommandEntry, query: string): boolean {
  if (!query) return true;
  const haystack = [entry.file, entry.category, ...entry.commands, ...entry.tags]
    .join(' ')
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token));
}

export default function CommandList({
  catalog,
  loading,
  disabled,
  plan,
  savingFile,
  presetBusy,
  refreshing,
  onToggle,
  onBulkToggle,
  onApplyPreset,
  onRefresh,
}: CommandListProps) {
  const searchId = useId();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [page, setPage] = useState(1);

  const disabledSet = useMemo(() => new Set(disabled), [disabled]);

  const filtered = useMemo(() => {
    const list = catalog?.commands ?? [];
    const byCategory =
      category === 'all' ? list : list.filter((entry) => entry.category === category);
    return byCategory.filter((entry) => matchesQuery(entry, query.trim()));
  }, [catalog, category, query]);

  // Filter berubah → kembali ke halaman pertama, bukan halaman kosong.
  useEffect(() => {
    setPage(1);
  }, [query, category]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Bulk hanya berlaku untuk baris yang terlihat di halaman ini dan boleh dipakai plan.
  const runnable = visible.filter((entry) => !entry.locked && entry.available);
  const allEnabledOnPage =
    runnable.length > 0 && runnable.every((entry) => !disabledSet.has(entry.file));

  const activeTotal = useMemo(() => {
    const list = (catalog?.commands ?? []).filter(
      (entry) => entry.commands.length > 0 && entry.available,
    );
    return list.filter((entry) => !disabledSet.has(entry.file)).length;
  }, [catalog, disabledSet]);

  const availableTotal = useMemo(
    () =>
      (catalog?.commands ?? []).filter(
        (entry) => entry.commands.length > 0 && entry.available,
      ).length,
    [catalog],
  );

  const runnableTotal = (catalog?.commands ?? []).filter((entry) => entry.commands.length > 0).length;
  const gatedTotal = Math.max(0, runnableTotal - availableTotal);

  if (loading) {
    return (
      <p className="caption" role="status">
        Memuat daftar command…
      </p>
    );
  }

  if (!catalog || catalog.commands.length === 0) {
    return (
      <p className="caption">
        Katalog command belum tersedia. Jalankan <code>npm run catalog</code> di folder core lalu
        deploy ulang platform.
      </p>
    );
  }

  return (
    <div className="command-list">
      <div className="command-toolbar">
        <div className="command-toolbar__search">
          <label className="sr-only" htmlFor={searchId}>
            Cari command
          </label>
          <input
            id={searchId}
            className="input"
            type="search"
            placeholder="Cari command, file, atau tag…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <p className="command-toolbar__count caption">
          {activeTotal}/{runnableTotal} command aktif
        </p>
      </div>

      <div className="command-meta">
        <p className="caption">
          Katalog {formatGeneratedAt(catalog.generatedAt)} · {catalog.total} plugin
        </p>
        {catalog.canRefresh ? (
          <Button variant="ghost" size="sm" loading={refreshing} onClick={onRefresh}>
            Muat ulang katalog
          </Button>
        ) : (
          <p className="caption">
            Katalog diperbarui admin. Hubungi admin kalau ada plugin baru yang belum muncul.
          </p>
        )}
      </div>

      {gatedTotal > 0 && (
        <p className="caption command-plan-note">
          Plan {plan ? (PLAN_LABELS[plan] ?? plan) : '-'} membuka {availableTotal} dari{' '}
          {runnableTotal} plugin.{' '}
          <Link to="/billing">Upgrade</Link> untuk membuka {gatedTotal} plugin lain.
        </p>
      )}

      {(catalog.presets ?? []).length > 0 && (
        <div className="command-presets" role="group" aria-label="Preset command">
          <span className="caption">Preset:</span>
          {(catalog.presets ?? []).map((preset) => (
            <Button
              key={preset.id}
              variant="ghost"
              size="sm"
              title={preset.description}
              loading={presetBusy === preset.id}
              disabled={presetBusy !== null}
              onClick={() => onApplyPreset(preset)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      )}

      <div className="command-filters" role="group" aria-label="Filter kategori">
        <button
          type="button"
          className={category === 'all' ? 'command-chip command-chip--active' : 'command-chip'}
          aria-pressed={category === 'all'}
          onClick={() => setCategory('all')}
        >
          Semua
        </button>
        {catalog.categories.map((item) => (
          <button
            key={item.id}
            type="button"
            className={category === item.id ? 'command-chip command-chip--active' : 'command-chip'}
            aria-pressed={category === item.id}
            onClick={() => setCategory(item.id)}
          >
            {item.label}
            <span className="command-chip__count">{item.total}</span>
          </button>
        ))}
      </div>

      <div className="command-bulk">
        <p className="caption">{filtered.length} hasil</p>
        <Button
          variant="ghost"
          size="sm"
          disabled={runnable.length === 0 || presetBusy !== null}
          onClick={() => onBulkToggle(runnable, !allEnabledOnPage)}
        >
          {allEnabledOnPage ? 'Matikan semua di halaman ini' : 'Aktifkan semua di halaman ini'}
        </Button>
      </div>

      <div className="card plugin-list">
        {visible.length === 0 && <p className="command-empty caption">Tidak ada command cocok.</p>}
        {visible.map((entry) => {
          const enabled = !disabledSet.has(entry.file);
          return (
            <div className="plugin-row" key={entry.file}>
              <div className="plugin-row__text">
                <p className="plugin-row__label mono">{commandLabel(entry)}</p>
                <p className="plugin-row__desc">
                  <span
                    className={entry.available ? 'command-tag' : 'command-tag command-tag--locked'}
                  >
                    {entry.category}
                  </span>{' '}
                  {entry.file}
                  {entry.locked && ' · khusus owner'}
                  {!entry.available && ' · perlu upgrade'}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                aria-label={`${entry.commands[0] ?? entry.file} ${enabled ? 'aktif' : 'mati'}`}
                className={enabled ? 'toggle toggle--on' : 'toggle'}
                disabled={
                  entry.locked || !entry.available || savingFile === entry.file || presetBusy !== null
                }
                onClick={() => onToggle(entry, !enabled)}
              >
                <span className="sr-only">{commandLabel(entry)}</span>
              </button>
            </div>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div className="command-pagination">
          <Button
            variant="ghost"
            size="sm"
            disabled={safePage <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Sebelumnya
          </Button>
          <span className="caption">
            Halaman {safePage} dari {totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={safePage >= totalPages}
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
          >
            Berikutnya
          </Button>
        </div>
      )}
    </div>
  );
}
