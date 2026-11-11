import { useState, type FormEvent } from 'react';
import Button from '../ui/Button';
import { useToast } from '../ui/Toast';
import { ApiError } from '../../lib/api';
import { updateConfig } from '../../lib/sessions';
import type {
  BotConfig,
  CommandCategory,
  Customization,
  GroupTexts,
  MenuTagStyle,
} from '../../lib/types';

interface CustomizationEditorProps {
  sessionId: string;
  config: BotConfig;
  categories: CommandCategory[];
  onChange: (config: BotConfig) => void;
}

// Kunci di sini harus sama dengan GROUP_TEXT_SLOTS di core/lib/customization.js,
// kalau tidak nilainya tersimpan tapi tidak pernah terbaca bot.
const MAIN_TEXT_FIELDS: Array<{ key: keyof GroupTexts; label: string; hint: string; rows: number }> = [
  { key: 'welcome', label: 'Anggota baru masuk', hint: 'Token: %user, %subject, %desc', rows: 5 },
  { key: 'bye', label: 'Anggota keluar', hint: 'Token: %user', rows: 2 },
  { key: 'promote', label: 'Dijadikan admin', hint: 'Token: %user', rows: 2 },
  { key: 'demote', label: 'Admin dicabut', hint: 'Token: %user', rows: 2 },
];

const EXTRA_TEXT_FIELDS: Array<{ key: keyof GroupTexts; label: string; hint: string }> = [
  { key: 'desc', label: 'Deskripsi grup diubah', hint: 'Token: %desc' },
  { key: 'subject', label: 'Judul grup diubah', hint: 'Token: %subject' },
  { key: 'icon', label: 'Ikon grup diubah', hint: 'Tanpa token' },
  { key: 'revoke', label: 'Link grup direset', hint: 'Token: %revoke' },
  { key: 'announce_on', label: 'Grup ditutup', hint: 'Tanpa token' },
  { key: 'announce_off', label: 'Grup dibuka', hint: 'Tanpa token' },
  { key: 'restrict_on', label: 'Edit info: admin saja', hint: 'Tanpa token' },
  { key: 'restrict_off', label: 'Edit info: semua peserta', hint: 'Tanpa token' },
];

// Kosong = core memakai teks default di core/main.js.
function emptyCustomization(): Customization {
  return {
    group_texts: {
      welcome: '',
      bye: '',
      promote: '',
      demote: '',
      desc: '',
      subject: '',
      icon: '',
      revoke: '',
      announce_on: '',
      announce_off: '',
      restrict_on: '',
      restrict_off: '',
    },
    menu: { header: '', footer: '', tags: {} },
  };
}

export default function CustomizationEditor({
  sessionId,
  config,
  categories,
  onChange,
}: CustomizationEditorProps) {
  const { showToast } = useToast();
  const [draft, setDraft] = useState<Customization>(
    config.customSettings.customization ?? emptyCustomization(),
  );
  const [saving, setSaving] = useState(false);

  function updateText(key: keyof GroupTexts, value: string) {
    setDraft((prev) => ({ ...prev, group_texts: { ...prev.group_texts, [key]: value } }));
  }

  function updateMenu(key: 'header' | 'footer', value: string) {
    setDraft((prev) => ({ ...prev, menu: { ...prev.menu, [key]: value } }));
  }

  function updateTag(id: string, patch: Partial<MenuTagStyle>) {
    setDraft((prev) => ({
      ...prev,
      menu: {
        ...prev.menu,
        tags: { ...prev.menu.tags, [id]: { ...prev.menu.tags[id], ...patch } },
      },
    }));
  }

  // Urutan kosong harus menghapus kuncinya, bukan mengirim undefined.
  function setTagOrder(id: string, raw: string) {
    setDraft((prev) => {
      const style: MenuTagStyle = { ...prev.menu.tags[id] };
      if (raw === '') delete style.order;
      else style.order = Number(raw);

      return {
        ...prev,
        menu: { ...prev.menu, tags: { ...prev.menu.tags, [id]: style } },
      };
    });
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      // customSettings dikirim utuh: server memvalidasi customization sebagai satu objek,
      // bukan patch per field.
      const updated = await updateConfig(sessionId, {
        customSettings: { ...config.customSettings, customization: draft },
      });
      onChange(updated);
      showToast('Tampilan disimpan', 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Gagal menyimpan tampilan', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="settings-form" onSubmit={handleSave} noValidate>
      <p className="notice notice--info notice--with-icon">
        <span className="notice__icon" aria-hidden="true">
          ℹ
        </span>
        <span>
          Perubahan langsung dipakai bot tanpa restart. Teks sambutan baru terkirim kalau grupnya
          sudah diaktifkan dengan <span className="mono">.onwlc</span>.
        </span>
      </p>

      <fieldset className="settings-group">
        <legend className="settings-group__title">Template grup</legend>

        {MAIN_TEXT_FIELDS.map((field) => (
          <div className="field" key={field.key}>
            <label className="field__label" htmlFor={`ct-${field.key}`}>
              {field.label}
            </label>
            <textarea
              id={`ct-${field.key}`}
              className="textarea"
              rows={field.rows}
              maxLength={1500}
              value={draft.group_texts[field.key]}
              placeholder="Kosongkan untuk memakai teks bawaan."
              onChange={(event) => updateText(field.key, event.target.value)}
            />
            <p className="field__hint">{field.hint}</p>
          </div>
        ))}

        <details className="ai-advanced">
          <summary className="ai-advanced__summary">
            <span>Notifikasi grup lainnya</span>
            <span className="caption">{EXTRA_TEXT_FIELDS.length} template</span>
          </summary>
          <div className="ai-advanced__body">
            {EXTRA_TEXT_FIELDS.map((field) => (
              <div className="field" key={field.key}>
                <label className="field__label" htmlFor={`ct-${field.key}`}>
                  {field.label}
                </label>
                <input
                  id={`ct-${field.key}`}
                  className="input"
                  type="text"
                  maxLength={1500}
                  value={draft.group_texts[field.key]}
                  placeholder="Kosongkan untuk memakai teks bawaan."
                  onChange={(event) => updateText(field.key, event.target.value)}
                />
                <p className="field__hint">{field.hint}</p>
              </div>
            ))}
          </div>
        </details>
      </fieldset>

      <fieldset className="settings-group">
        <legend className="settings-group__title">Menu</legend>

        <div className="field">
          <label className="field__label" htmlFor="ct-menu-header">
            Header menu
          </label>
          <textarea
            id="ct-menu-header"
            className="textarea"
            rows={4}
            maxLength={1200}
            value={draft.menu.header}
            placeholder="Kosongkan untuk memakai header bawaan."
            onChange={(event) => updateMenu('header', event.target.value)}
          />
          <p className="field__hint">Token: %botname, %ownername, %prefix</p>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="ct-menu-footer">
            Footer menu
          </label>
          <textarea
            id="ct-menu-footer"
            className="textarea"
            rows={3}
            maxLength={1200}
            value={draft.menu.footer}
            placeholder="Kosongkan untuk memakai footer bawaan."
            onChange={(event) => updateMenu('footer', event.target.value)}
          />
          <p className="field__hint">Token: %botname</p>
        </div>

        <p className="field__hint">
          Kosongkan ikon, label, atau urutan untuk memakai bawaan kategori. Mengubah baris di bawah
          hanya mengubah tampilan menu, bukan mengaktifkan atau mematikan command.
        </p>

        <div className="pkg-table-wrapper">
          <table className="pkg-table">
            <thead>
              <tr>
                <th>Kategori</th>
                <th>Ikon</th>
                <th>Label</th>
                <th>Urutan</th>
                <th>Sembunyikan</th>
              </tr>
            </thead>
            <tbody>
              {categories.length === 0 && (
                <tr>
                  <td className="caption" colSpan={5}>
                    Katalog command belum termuat.
                  </td>
                </tr>
              )}
              {categories.map((category) => {
                const style = draft.menu.tags[category.id] ?? {};
                return (
                  <tr key={category.id}>
                    <td data-label="Kategori">
                      <span className="mono">{category.id}</span>
                    </td>
                    <td data-label="Ikon">
                      <input
                        className="input pkg-input"
                        type="text"
                        maxLength={8}
                        aria-label={`Ikon kategori ${category.id}`}
                        value={style.icon ?? ''}
                        placeholder="🎮"
                        onChange={(event) => updateTag(category.id, { icon: event.target.value })}
                      />
                    </td>
                    <td data-label="Label">
                      <input
                        className="input pkg-input"
                        type="text"
                        maxLength={32}
                        aria-label={`Label kategori ${category.id}`}
                        value={style.label ?? ''}
                        placeholder={category.label}
                        onChange={(event) => updateTag(category.id, { label: event.target.value })}
                      />
                    </td>
                    <td data-label="Urutan">
                      <input
                        className="input pkg-input"
                        type="number"
                        min={0}
                        max={999}
                        aria-label={`Urutan kategori ${category.id}`}
                        value={style.order ?? ''}
                        onChange={(event) => setTagOrder(category.id, event.target.value)}
                      />
                    </td>
                    <td data-label="Sembunyikan">
                      <label className="pkg-toggle">
                        <input
                          type="checkbox"
                          checked={style.hidden === true}
                          onChange={(event) =>
                            updateTag(category.id, { hidden: event.target.checked })
                          }
                        />{' '}
                        Sembunyikan
                      </label>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </fieldset>

      <div className="settings-actions">
        <Button type="button" variant="ghost" onClick={() => setDraft(emptyCustomization())}>
          Kembalikan ke default
        </Button>
        <Button type="submit" loading={saving}>
          Simpan
        </Button>
      </div>
    </form>
  );
}