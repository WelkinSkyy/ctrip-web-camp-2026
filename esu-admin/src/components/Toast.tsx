import { toastMessage } from '../store';
import './Toast.css';

export function Toast() {
  const msg = toastMessage.value;
  if (!msg) return null;

  const close = () => {
    toastMessage.value = null;
  };

  return (
    <div
      className="toast-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="toast-title"
      onClick={close}
    >
      <div className="toast-card" onClick={(e) => e.stopPropagation()}>
        <div className="toast-icon" aria-hidden>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
        </div>
        <p id="toast-title" className="toast-text">{msg}</p>
        <button type="button" className="toast-btn" onClick={close}>
          确定
        </button>
      </div>
    </div>
  );
}
