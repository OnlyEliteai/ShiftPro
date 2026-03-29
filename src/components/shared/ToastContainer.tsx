import { X } from 'lucide-react';
import type { Toast } from '../../lib/types';

const TOAST_COLORS: Record<Toast['type'], string> = {
  success: 'bg-green-600 border-green-500',
  error: 'bg-red-600 border-red-500',
  warning: 'bg-yellow-600 border-yellow-500',
  info: 'bg-blue-600 border-blue-500',
};

export function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex flex-col gap-2">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`flex items-center gap-2 px-4 py-3 rounded-lg border text-white text-sm shadow-lg animate-slide-in ${TOAST_COLORS[toast.type]}`}
        >
          <span className="flex-1">{toast.message}</span>
          <button onClick={() => onDismiss(toast.id)} className="hover:opacity-70">
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
