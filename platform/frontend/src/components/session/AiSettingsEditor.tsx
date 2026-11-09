import { useState, type ChangeEvent, type FormEvent } from 'react';
import Button from '../ui/Button';
import { useToast } from '../ui/Toast';
import { ApiError } from '../../lib/api';
import { updateConfig } from '../../lib/sessions';
import {
  AI_PRESET_CUSTOM,
  DEFENSE_PRESETS,
  PERSONA_PRESETS,
  TONE_PRESETS,
  matchPreset,
  type AiPresetOption,
} from '../../lib/aiPresets';
import type { AiSettings, BotConfig } from '../../lib/types';

interface AiSettingsEditorProps {
  sessionId: string;
  config: BotConfig;
  onChange: (config: BotConfig) => void;
}

interface PresetFieldProps {
  id: string;
  label: string;
  value: string;
  rows: number;
  presets: AiPresetOption[];
  onChange: (value: string) => void;
}

// Header (label + dropdown preset) di atas textarea; dropdown mengikuti isi teks, jadi
// begitu user mengedit manual pilihannya otomatis jadi "Custom".
function PresetField({ id, label, value, rows, presets, onChange }: PresetFieldProps) {
  function handlePreset(event: ChangeEvent<HTMLSelectElement>) {
    const next = presets.find((option) => option.id === event.target.value);
    // "custom" = user mau tulis sendiri: teks yang ada dibiarkan apa adanya.
    if (next) onChange(next.text);
  }

  return (
    <div className="field">
      <div className="ai-field__head">
        <label className="field__label" htmlFor={id}>
          {label}
        </label>
        <select
          className="ai-preset"
          value={matchPreset(value, presets)}
          onChange={handlePreset}
          aria-label={`Preset ${label}`}
        >
          {presets.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
          <option value={AI_PRESET_CUSTOM}>Custom</option>
        </select>
      </div>
      <textarea
        id={id}
        className="textarea"
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

export default function AiSettingsEditor({ sessionId, config, onChange }: AiSettingsEditorProps) {
  const { showToast } = useToast();
  const [draft, setDraft] = useState<AiSettings>(config.aiSettings);
  const [saving, setSaving] = useState(false);

  function update<K extends keyof AiSettings>(key: K, value: AiSettings[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!draft.name.trim()) {
      showToast('Nama karakter wajib diisi', 'error');
      return;
    }

    setSaving(true);
    try {
      const updated = await updateConfig(sessionId, { aiSettings: draft });
      onChange(updated);
      showToast('Konfigurasi AI disimpan', 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Gagal menyimpan konfigurasi AI', 'error');
    } finally {
      setSaving(false);
    }
  }

  const hasOverride = draft.system_prompt.trim().length > 0;

  return (
    <form className="settings-form" onSubmit={handleSave} noValidate>
      <p className="notice notice--info notice--with-icon">
        <span className="notice__icon" aria-hidden="true">
          ℹ
        </span>
        <span>Perubahan langsung dipakai bot tanpa restart.</span>
      </p>

      <fieldset className="settings-group">
        <legend className="settings-group__title">Karakter</legend>

        <div className="field">
          <label className="field__label" htmlFor="ai-name">
            Nama karakter
          </label>
          <input
            id="ai-name"
            className="input"
            type="text"
            maxLength={60}
            value={draft.name}
            placeholder="Contoh: Heru, Alex, Budi"
            onChange={(event) => update('name', event.target.value)}
          />
          <p className="field__hint">
            Mengisi <span className="mono">{'{name}'}</span> di preset persona.
          </p>
        </div>

        <PresetField
          id="ai-persona"
          label="Persona & peran"
          value={draft.persona}
          rows={3}
          presets={PERSONA_PRESETS}
          onChange={(value) => update('persona', value)}
        />

        <PresetField
          id="ai-tone"
          label="Tone & gaya bicara"
          value={draft.tone}
          rows={4}
          presets={TONE_PRESETS}
          onChange={(value) => update('tone', value)}
        />

        <PresetField
          id="ai-defense"
          label="Aturan proteksi identitas"
          value={draft.defense_rules}
          rows={4}
          presets={DEFENSE_PRESETS}
          onChange={(value) => update('defense_rules', value)}
        />
      </fieldset>

      <fieldset className="settings-group">
        <legend className="settings-group__title">Tambahan</legend>
        <div className="field">
          <label className="field__label" htmlFor="ai-custom-instructions">
            Instruksi tambahan
          </label>
          <textarea
            id="ai-custom-instructions"
            className="textarea"
            rows={3}
            value={draft.custom_instructions}
            placeholder="Contoh: Selalu akhiri kalimat dengan emoji kucing, atau jangan pernah membahas topik bola."
            onChange={(event) => update('custom_instructions', event.target.value)}
          />
          <p className="field__hint">Opsional.</p>
        </div>
      </fieldset>

      <details className="ai-advanced">
        <summary className="ai-advanced__summary">
          <span>Advanced settings</span>
          <span className="caption">
            {hasOverride ? 'Override prompt aktif' : 'Override full prompt'}
          </span>
        </summary>
        <div className="field ai-advanced__body">
          <label className="field__label" htmlFor="ai-system-prompt">
            System prompt
          </label>
          <textarea
            id="ai-system-prompt"
            className="textarea"
            rows={8}
            value={draft.system_prompt}
            placeholder="Kosongkan untuk memakai field di atas."
            onChange={(event) => update('system_prompt', event.target.value)}
          />
          <p className="field__hint">
            Kalau diisi, seluruh field di atas dilewati dan prompt ini yang dipakai penuh.
          </p>
        </div>
      </details>

      <div className="settings-actions">
        <Button type="submit" loading={saving}>
          Simpan
        </Button>
      </div>
    </form>
  );
}
