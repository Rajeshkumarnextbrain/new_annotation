import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<Props> = ({
  open,
  title = 'Confirm Action',
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}) => {
  if (!open) return null;

  return (
    <div
      onClick={onCancel}
      className="fixed inset-0 z-50 bg-[#13241F]/60 backdrop-blur-[2px] flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-[#EEF2EF] border border-[#13241F] rounded-xl overflow-hidden shadow-2xl"
      >
        <div className="px-4 py-3 border-b border-[#C4CCC7] bg-[#E2E7E4] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-[#E8553D]" />
            <h3 className="text-xs font-bold text-[#13241F] uppercase font-mono-label">
              {title}
            </h3>
          </div>
          <button
            onClick={onCancel}
            className="text-[#76817B] hover:text-[#13241F] font-mono-label text-xs cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="p-4 space-y-4">
          <p className="text-xs text-[#13241F] leading-relaxed">{message}</p>
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={onCancel}
              className="border border-[#76817B] text-[#13241F] hover:bg-[#E2E7E4] font-mono-label text-xs px-3.5 py-1.5 cursor-pointer transition-colors"
            >
              {cancelLabel}
            </button>
            <button
              onClick={onConfirm}
              className="bg-[#E8553D] hover:bg-[#C83E28] text-white font-mono-label text-xs px-4 py-1.5 cursor-pointer transition-colors"
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
