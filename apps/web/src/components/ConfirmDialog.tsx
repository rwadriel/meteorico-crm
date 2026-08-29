import { Modal } from './Modal.js';
import { Button } from './Button.js';

interface ConfirmDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: 'danger' | 'primary';
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  onConfirm,
  onCancel,
  title,
  message,
  confirmLabel = 'Confirmar',
  variant = 'primary',
  loading = false,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <div className="confirm-dialog-actions">
          <Button variant="secondary" onClick={onCancel} type="button">
            Cancelar
          </Button>
          <Button variant={variant} onClick={onConfirm} type="button" loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <p>{message}</p>
    </Modal>
  );
}
