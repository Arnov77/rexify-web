import { useEffect, useRef, type ReactNode } from 'react';
import Button from './Button';
import { IconClose } from '../icons';
import '../../styles/dialog.css';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Batal',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    cancelRef.current?.focus();

    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel();
    }

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="dialog-overlay" role="presentation" onClick={onCancel}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dialog__header">
          <h2 className="dialog__title" id="dialog-title">
            {title}
          </h2>
          <button type="button" className="dialog__close" onClick={onCancel} aria-label="Tutup">
            <IconClose size={18} />
          </button>
        </div>

        <div className="dialog__body">{description}</div>

        <div className="dialog__actions">
          <Button variant="ghost" onClick={onCancel} ref={cancelRef}>
            {cancelLabel}
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}