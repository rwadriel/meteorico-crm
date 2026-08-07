interface AlertProps {
  variant?: 'info' | 'success' | 'warning' | 'danger';
  children: React.ReactNode;
  onDismiss?: () => void;
}

export function Alert({ variant = 'info', children, onDismiss }: AlertProps) {
  return (
    <div className={`alert alert-${variant}`} role="alert">
      <div className="alert-content">{children}</div>
      {onDismiss && (
        <button
          className="alert-dismiss"
          onClick={onDismiss}
          aria-label="Dispensar alerta"
          type="button"
        >
          &times;
        </button>
      )}
    </div>
  );
}
