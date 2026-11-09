import { useEffect, useRef, useState } from 'react';
import Button from '../ui/Button';
import { IconClose } from '../icons';
import { getToken } from '../../lib/api';
import '../../styles/dialog.css';
import '../../styles/modal-qr.css';

type QRStatus = 'waiting' | 'qr' | 'connected' | 'error';

type ConnectMode = 'qr' | 'pairing';

const QR_STEPS = [
  'Buka WhatsApp di HP kamu',
  'Ketuk ⋮ (tiga titik) → Perangkat tertaut',
  'Ketuk "Tautkan perangkat"',
  'Arahkan kamera ke QR di bawah',
];

const PAIRING_STEPS = [
  'Buka WhatsApp di HP kamu',
  'Ketuk ⋮ (tiga titik) → Perangkat tertaut',
  'Ketuk "Tautkan dengan nomor telepon"',
  'Masukkan 8 digit kode di bawah',
];

// Bot butuh waktu untuk spawn + menulis qr.txt, jadi error socket di awal ditahan dulu.
const GRACE_MS = 8_000;
// Kalau sampai 60 detik tidak ada QR, hentikan penantian dengan pesan jelas.
const WAIT_TIMEOUT_MS = 60_000;

interface QRModalProps {
  sessionId: string;
  sessionLabel: string;
  connectMode: ConnectMode;
  onClose: () => void;
  onConnected: () => void;
}

interface IncomingMessage {
  type: 'qr' | 'pairing' | 'connected' | 'error';
  data?: string;
  message?: string;
}

export default function QRModal({
  sessionId,
  sessionLabel,
  connectMode,
  onClose,
  onConnected,
}: QRModalProps) {
  const [status, setStatus] = useState<QRStatus>('waiting');
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Tampilan awal mengikuti mode yang dipilih user saat membuat session; tombol di bawah
  // modal bisa menukarnya tanpa reconnect WebSocket.
  const [mode, setMode] = useState<ConnectMode>(connectMode);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Handler socket membaca status terkini lewat ref, bukan state yang ter-capture saat mount.
  const statusRef = useRef<QRStatus>('waiting');
  const openedAt = useRef(Date.now());

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  async function handleCopy() {
    if (!pairingCode) return;
    try {
      await navigator.clipboard.writeText(pairingCode);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setStatus('error');
      setError('Sesi login tidak ditemukan. Masuk ulang untuk melanjutkan.');
      return;
    }

    let closedByUs = false;

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(
      `${protocol}://${window.location.host}/api/ws/qr/${sessionId}?token=${encodeURIComponent(token)}`,
    );

    function fail(message: string) {
      setStatus('error');
      setError(message);
    }

    // Bot butuh beberapa detik untuk spawn dan menulis qr.txt, jadi error di awal ditahan
    // sampai grace lewat selama status masih waiting.
    function failUnlessWaitingYoung(message: string) {
      // Socket memang ditutup server setelah pairing sukses; itu bukan error.
      if (statusRef.current === 'connected') return;
      if (statusRef.current !== 'waiting') {
        fail(message);
        return;
      }
      if (Date.now() - openedAt.current >= GRACE_MS) fail(message);
    }

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

      if (payload.type === 'pairing' && payload.data) {
        setPairingCode(payload.data);
        setMode('pairing');
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
      if (closedByUs) return;
      failUnlessWaitingYoung('Koneksi ke server terputus. Tutup lalu coba Connect lagi.');
    };

    socket.onclose = () => {
      if (closedByUs) return;
      failUnlessWaitingYoung('Koneksi ke server terputus. Tutup lalu coba Connect lagi.');
    };

    // Batas atas: kalau sampai 60 detik bot tidak pernah mengirim QR, jangan biarkan user menunggu.
    const waitTimeout = setTimeout(() => {
      if (statusRef.current === 'waiting') {
        fail('Bot membutuhkan waktu terlalu lama. Tutup lalu coba Connect lagi.');
      }
    }, WAIT_TIMEOUT_MS);

    return () => {
      closedByUs = true;
      clearTimeout(waitTimeout);
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
        <p className="qr-modal__hint">Hubungkan {sessionLabel} lewat langkah berikut.</p>

        <ol className="qr-steps">
          {(mode === 'pairing' ? PAIRING_STEPS : QR_STEPS).map((step) => (
            <li className="qr-steps__item" key={step}>
              {step}
            </li>
          ))}
        </ol>

        {mode === 'pairing' ? (
          <div className="pairing-code">
            <p className="pairing-code__value mono">{pairingCode ?? '········'}</p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleCopy()}
              disabled={!pairingCode}
            >
              {copied ? 'Tersalin' : 'Salin kode'}
            </Button>
          </div>
        ) : (
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
        )}

        {status === 'connected' ? (
          <p className="qr-modal__status" role="status">
            WhatsApp terhubung
          </p>
        ) : status === 'error' ? (
          <p className="qr-modal__error" role="alert">
            {error}
          </p>
        ) : mode === 'pairing' ? (
          // Pairing memakai kode, bukan QR: jangan bilang "menunggu scan".
          <p className="qr-modal__status" role="status">
            {pairingCode ? (
              <>
                <span className="qr-modal__pulse" aria-hidden="true" />
                Masukkan kode di atas di WhatsApp
              </>
            ) : (
              'Menyiapkan kode pairing, harap tunggu...'
            )}
          </p>
        ) : status === 'qr' ? (
          <p className="qr-modal__status" role="status">
            <span className="qr-modal__pulse" aria-hidden="true" />
            Menunggu scan...
          </p>
        ) : (
          <p className="qr-modal__status" role="status">
            Menyiapkan bot, harap tunggu...
          </p>
        )}

        <div className="qr-modal__actions">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMode(mode === 'pairing' ? 'qr' : 'pairing')}
          >
            {mode === 'pairing' ? 'Gunakan QR Code' : 'Gunakan Pairing Code'}
          </Button>
        </div>
      </div>
    </div>
  );
}