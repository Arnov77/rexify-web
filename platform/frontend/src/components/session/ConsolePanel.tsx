import { useCallback, useEffect, useRef, useState } from 'react';
import { IconClose } from '../icons';
import { getToken } from '../../lib/api';
import { parseAnsi, sliceSpans, stripAnsi, type AnsiSpan } from '../../lib/ansi';

// Batasi memori: simpan 500 baris terakhir, buang 100 sekaligus saat lewat.
const MAX_LINES = 500;
const TRIM_COUNT = 100;
// Jarak dari dasar dianggap "masih di bawah" untuk auto-scroll.
const BOTTOM_THRESHOLD_PX = 8;

interface ConsolePanelProps {
  sessionId: string;
  onClose: () => void;
}

interface LogEntry {
  key: number;
  isError: boolean;
  time: string | null;
  spans: AnsiSpan[];
}

type ConnectionState = 'connecting' | 'open' | 'closed';

// Log core memakai "HH:MM:SS", log lain (PM2/pino) "YYYY-MM-DD HH:MM:SS".
const TIME_RE =
  /^(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?|\d{2}:\d{2}:\d{2})\s*[:\-|]?\s*/;

// Baris bot diawali escape warna (ESC[90m...), jadi timestamp dicari di teks bersih
// lalu jumlah karakter itu dipotong dari span berwarna.
function buildEntry(key: number, line: string): LogEntry {
  const plain = stripAnsi(line);
  const match = TIME_RE.exec(plain);
  const offset = match ? match[0].length : 0;

  return {
    key,
    isError: plain.trimStart().startsWith('[ERR]'),
    time: match?.[1] ?? null,
    spans: sliceSpans(parseAnsi(line), offset),
  };
}

export default function ConsolePanel({ sessionId, onClose }: ConsolePanelProps) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState<ConnectionState>('connecting');

  const bodyRef = useRef<HTMLDivElement>(null);
  const nextKey = useRef(1);
  // Diisi false saat user scroll ke atas: jangan paksa auto-scroll selama dia membaca.
  const stickToBottom = useRef(true);

  const pushLines = useCallback((lines: string[], replace = false) => {
    setEntries((current) => {
      const added = lines.map((line) => buildEntry(nextKey.current++, line));
      const next = replace ? added : [...current, ...added];

      if (next.length <= MAX_LINES) return next;
      return next.slice(next.length - (MAX_LINES - TRIM_COUNT));
    });
  }, []);

  const clear = useCallback(() => {
    setEntries([]);
    stickToBottom.current = true;
  }, []);

  function handleScroll(): void {
    const body = bodyRef.current;
    if (!body) return;
    stickToBottom.current =
      body.scrollTop + body.clientHeight >= body.scrollHeight - BOTTOM_THRESHOLD_PX;
  }

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setStatus('closed');
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(
      `${protocol}://${window.location.host}/api/ws/logs/${sessionId}?token=${encodeURIComponent(token)}`,
    );

    socket.onopen = () => setStatus('open');
    socket.onclose = () => setStatus('closed');
    socket.onerror = () => setStatus('closed');

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(String(event.data)) as {
          type?: string;
          lines?: string[];
          data?: string;
        };

        if (payload.type === 'history' && Array.isArray(payload.lines)) {
          pushLines(payload.lines, true);
          return;
        }
        if (payload.type === 'line' && typeof payload.data === 'string') {
          pushLines([payload.data]);
        }
      } catch {
        // Frame bukan JSON (mis. pesan bawaan server): abaikan.
      }
    };

    return () => socket.close();
  }, [sessionId, pushLines]);

  // Auto-scroll ke bawah hanya kalau user memang sedang di bawah.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body || !stickToBottom.current) return;
    body.scrollTop = body.scrollHeight;
  }, [entries]);

  return (
    <section className="console-panel" aria-label="Console log bot">
      <header className="console-panel__header">
        <span className="console-panel__title">Console</span>

        <div className="console-panel__actions">
          <button type="button" className="console-panel__btn" onClick={clear}>
            Bersihkan
          </button>
          <button
            type="button"
            className="console-panel__btn console-panel__btn--icon"
            onClick={onClose}
            aria-label="Tutup console"
          >
            <IconClose size={14} />
          </button>
        </div>
      </header>

      <div className="console-panel__body" ref={bodyRef} onScroll={handleScroll}>
        {entries.length === 0 ? (
          <p className="console-panel__empty">Belum ada log.</p>
        ) : (
          entries.map((entry) => (
            <span
              key={entry.key}
              className={entry.isError ? 'console-line console-line--error' : 'console-line'}
            >
              {entry.time && <span className="console-line__time">{entry.time}</span>}
              {entry.spans.map((span, index) => (
                <span
                  // Span tidak punya id stabil; urutan dalam satu baris sudah tetap.
                  key={index}
                  className={span.className || undefined}
                  style={
                    span.color || span.background
                      ? { color: span.color ?? undefined, background: span.background ?? undefined }
                      : undefined
                  }
                >
                  {span.text}
                </span>
              ))}
            </span>
          ))
        )}
      </div>

      <footer className="console-panel__footer">
        <span
          className={
            status === 'open' ? 'console-status console-status--on' : 'console-status console-status--off'
          }
        >
          <span className="console-status__dot" aria-hidden="true" />
          {status === 'open' ? 'Terhubung' : status === 'connecting' ? 'Menghubungkan…' : 'Terputus'}
        </span>
        {entries.length > 0 && (
          <>
            <span aria-hidden="true">·</span>
            <span>{entries.length} baris</span>
          </>
        )}
      </footer>
    </section>
  );
}
