import { useEffect } from "react";
import { X } from "lucide-react";

export default function OverlayModal({ title, children, onClose }) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 grid items-end justify-stretch sm:items-center sm:justify-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="hud-sheet modal-panel"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-header flex items-center justify-between px-5 py-4">
          <h2 className="modal-title text-lg">{title}</h2>
          <button className="icon-button h-11 w-11 p-0" onClick={onClose} title="닫기" aria-label={`${title} 닫기`}>
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-auto p-4 sm:p-5">{children}</div>
      </div>
    </div>
  );
}
