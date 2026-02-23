import { confirmDialog } from '../store';
import './Toast.css';

export function ConfirmDialog() {
  const options = confirmDialog.value;
  if (!options) return null;

  const close = () => {
    confirmDialog.value = null;
  };

  const handleConfirm = () => {
    options.onConfirm();
    close();
  };

  return (
    <div
      className="toast-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      onClick={close}
    >
      <div className="toast-card" onClick={(e) => e.stopPropagation()}>
        <div className="toast-icon" aria-hidden>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4" />
            <circle cx="12" cy="17" r="0.9" fill="currentColor" />
          </svg>
        </div>
        <p id="confirm-title" className="toast-text">{options.message}</p>
        <div className="toast-actions">
          <button type="button" className="toast-btn-cancel" onClick={close}>
            取消
          </button>
          <button type="button" className="toast-btn" onClick={handleConfirm}>
            确定
          </button>
        </div>
      </div>
    </div>
  );
}
