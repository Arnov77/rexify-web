import { useEffect, useRef, useState } from 'react';
import Button from '../ui/Button';
import { IconClose } from '../icons';
import { getToken } from '../../lib/api';
import '../../styles/dialog.css';
import '../../styles/modal-qr.css';

type QRStatus = 'waiting' | 'qr' | 'connected' | 'error';

interface QRModalProps {
  sessionId: string;
  sessionLabel: string;
  onClose: () => void;
  onConnected: () => void;
}

interface IncomingMessage {
  type: 'qr' | 'connected' | 'error';
  data?: string;
  message?: string;
}

export default function QRModal({
  sessionId,
  sessionLabel,
  onClose,
  onConnected,
}: QRModalProps) {
  const [status, setStatus] = useState<QRStatus>('waiting');
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setStatus('error');
      setError('Sesi login tidak ditemukan. Masuk ulang untuk melanjutkan.');
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(
      `${protocol}://${window.location.host}/api/ws/qr/${sessionId}?token=${encodeURIComponent(token)}`,
    );

    socket.onmessage = (event) => {
      let payload: IncomingMessage;
      try {
        payload = JSON.parse(String(event.data)) as IncomingMessage;
      } catch {
        setStatus('error');
        setError('Pesan QR tidak terbaca');
        return;
      }

      if (payload.type === 'qr' && payload.data) {
        setQr(payload.data);
        setStatus('qr');
        return;
      }

      if (payload.type === 'connected') {
        setStatus('connected');
        onConnected();
        return;
      }

      if (payload.type === 'error') {
        setStatus('error');
        setError(payload.message ?? 'Gagal menyiapkan QR');
      }
    };

    socket.onerror = () => {
      setStatus('error');
      setError('Koneksi ke server terputus. Tutup lalu coba Connect lagi.');
    };

    return () => {
      socket.close();
    };
  }, [sessionId, onConnected]);

  useEffect(() => {
    cancelRef.current?.focus();

    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="dialog-overlay" role="presentation">
      <div
        className="dialog qr-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="qr-modal-title"
      >
        <button
          ref={cancelRef}
          type="button"
          className="qr-modal__cancel"
          onClick={onClose}
          aria-label="Batalkan"
        >
          Batal
        </button>

        <h2 className="qr-modal__title" id="qr-modal-title">
          Hubungkan WhatsApp
        </h2>
        <p className="qr-modal__hint">
          Buka WhatsApp di HP, pilih Perangkat tertaut, lalu scan QR untuk {sessionLabel}.
        </p>

        <div className="qr-box">
          {status === 'qr' && qr ? (
            <img src={qr} alt={`QR WhatsApp untuk ${sessionLabel}`} width={176} height={176} />
          ) : status === 'connected' ? (
            <p className="qr-box__state">Terhubung</p>
          ) : status === 'error' ? (
            <p className="qr-box__state qr-box__state--error">
              <IconClose size={28} />
            </p>
          ) : (
            <span className="qr-skeleton" aria-hidden="true" />
          )}
        </div>

        {status === 'waiting' && (
          <p className="qr-modal__status" role="status">
            Menyiapkan QR…
          </p>
        )}

        {status === 'qr' && (
          <p className="qr-modal__status" role="status">
            <span className="qr-modal__pulse" aria-hidden="true" />
            Menunggu scan...
          </p>
        )}

        {status === 'connected' && (
          <p className="qr-modal__status" role="status">
            WhatsApp terhubung
          </p>
        )}

        {status === 'error' && (
          <p className="qr-modal__error" role="alert">
            {error}
          </p>
        )}

        <div className="qr-modal__actions">
          <Button variant="ghost" size="sm" disabled title="Pairing code belum tersedia">
            Gunakan Pairing Code
          </Button>
        </div>
      </div>
    </div>
  );
}