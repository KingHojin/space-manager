import { X } from "lucide-react";

export default function OverlayModal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/55 p-4">
      <div className="modal-panel">
        <div className="flex items-center justify-between border-b border-slate-700 px-5 py-4">
          <h2 className="text-lg font-bold text-slate-50">{title}</h2>
          <button className="icon-button" onClick={onClose} title="닫기">
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-auto p-5">{children}</div>
      </div>
    </div>
  );
}
