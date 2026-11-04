import { useEffect, useRef, useState, type FormEvent } from 'react';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { IconClose } from '../icons';
import { ApiError } from '../../lib/api';
import { createSession } from '../../lib/sessions';
import type { ConnectMode } from '../../lib/types';
import '../../styles/dialog.css';
import '../../styles/dashboard.css';

interface AddSessionModalProps {
  onClose: () => void;
  onCreated: () => void | Promise<void>;
}

const MODES: { value: ConnectMode; label: string; hint: string }[] = [
  { value: 'qr', label: 'QR Code', hint: 'Scan lewat kamera WhatsApp' },
  { value: 'pairing', label: 'Pairing Code', hint: 'Masukkan 8 digit dari WhatsApp' },
];

export default function AddSessionModal({ onClose, onCreated }: AddSessionModalProps) {
  const [label, setLabel] = useState('');
  const [phone, setPhone] = useState('');
  const [mode, setMode] = useState<ConnectMode>('qr');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const labelRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    labelRef.current?.focus();

    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  function handlePhoneChange(value: string) {
    // Hanya angka yang diterima; format internasional tanpa tanda +.
    setPhone(value.replace(/\D/g, ''));
    if (phoneError) setPhoneError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) {
      setPhoneError('Nomor minimal 10 digit angka');
      return;
    }

    setSubmitting(true);
    try {
      const trimmed = label.trim();
      await createSession({
        label: trimmed.length > 0 ? trimmed : null,
        phoneNumber: digits,
        connectMode: mode,
      });
      await onCreated();
      onClose();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Gagal membuat session');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="dialog-overlay" role="presentation">
      <form
        className="dialog add-session"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-session-title"
        onSubmit={handleSubmit}
        noValidate
      >
        <div className="dialog__header">
          <h2 className="dialog__title" id="add-session-title">
            Tambah session
          </h2>
          <button
            type="button"
            className="dialog__close"
            onClick={onClose}
            aria-label="Tutup"
          >
            <IconClose size={16} />
          </button>
        </div>

        <Input
          ref={labelRef}
          label="Nama bot (opsional)"
          placeholder="Contoh: Bot Utama"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          maxLength={60}
        />

        <Input
          label="Nomor WhatsApp"
          placeholder="628123456789"
          hint="Gunakan format internasional tanpa +"
          error={phoneError ?? undefined}
          value={phone}
          onChange={(event) => handlePhoneChange(event.target.value)}
          inputMode="numeric"
          autoComplete="tel"
          maxLength={15}
          required
        />

        <fieldset className="radio-group">
          <legend className="radio-group__legend">Mode koneksi</legend>
          {MODES.map((item) => (
            <label className="radio" key={item.value}>
              <input
                type="radio"
                name="connect_mode"
                className="radio__input"
                value={item.value}
                checked={mode === item.value}
                onChange={() => setMode(item.value)}
              />
              <span className="radio__text">
                <span className="radio__label">{item.label}</span>
                <span className="radio__hint">{item.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {formError && (
          <p className="notice notice--error" role="alert">
            {formError}
          </p>
        )}

        <div className="dialog__actions">
          <Button type="button" variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" loading={submitting}>
            Tambah
          </Button>
        </div>
      </form>
    </div>
  );
}
