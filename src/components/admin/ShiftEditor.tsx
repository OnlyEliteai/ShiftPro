import { useState, useEffect } from 'react';
import { X, Trash2 } from 'lucide-react';
import type { Chatter, Model, Shift } from '../../lib/types';
import { LABELS } from '../../lib/utils';

interface ShiftFormData {
  chatter_id: string;
  date: string;
  start_time: string;
  end_time: string;
  model: string;
  platform: 'telegram' | 'onlyfans' | '';
  status: Shift['status'];
}

interface ShiftEditorProps {
  shift?: Shift;
  chatters: Chatter[];
  models: Model[];
  date?: string;
  onSave: (data: ShiftFormData) => void;
  onDelete?: () => void;
  onClose: () => void;
}

const STATUS_OPTIONS: { value: Shift['status']; label: string }[] = [
  { value: 'pending', label: LABELS.pending },
  { value: 'scheduled', label: LABELS.scheduled },
  { value: 'active', label: LABELS.active },
  { value: 'completed', label: LABELS.completed },
  { value: 'missed', label: LABELS.missed },
  { value: 'rejected', label: LABELS.rejected },
];

export function ShiftEditor({
  shift,
  chatters,
  models,
  date,
  onSave,
  onDelete,
  onClose,
}: ShiftEditorProps) {
  const activeModels = models.filter((m) => m.active);
  const hasModels = activeModels.length > 0;
  const isEditing = !!shift;

  const [form, setForm] = useState<ShiftFormData>({
    chatter_id: shift?.chatter_id ?? (chatters[0]?.id ?? ''),
    date: shift?.date ?? date ?? new Date().toISOString().split('T')[0],
    start_time: shift?.start_time ?? '09:00',
    end_time: shift?.end_time ?? '17:00',
    model: shift?.model ?? '',
    platform: shift?.platform ?? '',
    status: shift?.status ?? 'scheduled',
  });

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Keep date in sync if prop changes
  useEffect(() => {
    if (!shift && date) {
      setForm((prev) => ({ ...prev, date }));
    }
  }, [date, shift]);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setValidationError(null);

    if (!form.chatter_id) {
      setValidationError('יש לבחור צ׳אטר/ית');
      return;
    }

    if (!form.platform) {
      setValidationError('יש לבחור פלטפורמה');
      return;
    }

    if (!form.model && hasModels) {
      setValidationError('יש לבחור מודל');
      return;
    }

    // Validate end_time > start_time; equal times are not allowed.
    // end_time < start_time is permitted (overnight shift).
    if (form.end_time === form.start_time) {
      setValidationError('שעת הסיום חייבת להיות שונה משעת ההתחלה');
      return;
    }

    onSave(form);
  }

  const inputClass =
    'w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-base text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors';

  const labelClass = 'block text-sm font-medium text-gray-300 mb-1';

  return (
    /* Overlay */
    <div
      className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-black/70 backdrop-blur-sm lg:p-4"
      dir="rtl"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Modal — bottom sheet on mobile, centered on desktop */}
      <div className="w-full lg:max-w-md bg-gray-800 rounded-t-2xl lg:rounded-2xl shadow-2xl border border-gray-700 overflow-hidden max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 className="text-lg font-bold text-white">
            {isEditing ? LABELS.editShift : LABELS.addShift}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Chatter */}
          <div>
            <label htmlFor="chatter_id" className={labelClass}>
              צ׳אטר/ית
            </label>
            <select
              id="chatter_id"
              name="chatter_id"
              value={form.chatter_id}
              onChange={handleChange}
              className={inputClass}
              required
            >
              <option value="">בחר/י צ׳אטר/ית</option>
              {chatters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Date */}
          <div>
            <label htmlFor="date" className={labelClass}>
              תאריך
            </label>
            <input
              id="date"
              type="date"
              name="date"
              value={form.date}
              onChange={handleChange}
              className={inputClass}
              required
            />
          </div>

          {/* Time range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="start_time" className={labelClass}>
                שעת התחלה
              </label>
              <input
                id="start_time"
                type="time"
                name="start_time"
                value={form.start_time}
                onChange={handleChange}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label htmlFor="end_time" className={labelClass}>
                שעת סיום
              </label>
              <input
                id="end_time"
                type="time"
                name="end_time"
                value={form.end_time}
                onChange={handleChange}
                className={inputClass}
                required
              />
            </div>
          </div>

          {/* Platform */}
          <div>
            <label htmlFor="platform" className={labelClass}>
              {LABELS.platform}
            </label>
            <select
              id="platform"
              name="platform"
              value={form.platform}
              onChange={handleChange}
              className={inputClass}
              required
            >
              <option value="">{LABELS.selectPlatform}</option>
              <option value="telegram">{LABELS.telegram}</option>
              <option value="onlyfans">{LABELS.onlyfans}</option>
            </select>
          </div>

          {/* Model */}
          <div>
            <label htmlFor="model" className={labelClass}>
              מודל
            </label>
            {hasModels ? (
              <select
                id="model"
                name="model"
                value={form.model}
                onChange={handleChange}
                className={inputClass}
                required
              >
                <option value="">{LABELS.selectModel}</option>
                {activeModels.map((m) => (
                  <option key={m.id} value={m.name}>
                    {m.name}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-yellow-400 py-2">{LABELS.addModelFirst}</p>
            )}
          </div>

          {/* Status — only show when editing */}
          {isEditing && (
            <div>
              <label htmlFor="status" className={labelClass}>
                סטטוס
              </label>
              <select
                id="status"
                name="status"
                value={form.status}
                onChange={handleChange}
                className={inputClass}
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Validation error */}
          {validationError && (
            <p className="text-sm text-red-400">{validationError}</p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={!hasModels}
              className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold min-h-[48px] py-2.5 rounded-lg text-sm transition-colors"
            >
              {LABELS.save}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-200 font-semibold min-h-[48px] py-2.5 rounded-lg text-sm transition-colors"
            >
              {LABELS.cancel}
            </button>
          </div>

          {/* Delete */}
          {isEditing && onDelete && (
            <div className="pt-1">
              {confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-red-400 flex-1">בטוח/ה למחוק?</span>
                  <button
                    type="button"
                    onClick={onDelete}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-sm rounded-lg font-medium transition-colors"
                  >
                    מחק
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-lg transition-colors"
                  >
                    {LABELS.cancel}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="w-full flex items-center justify-center gap-2 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-950/40 rounded-lg transition-colors"
                >
                  <Trash2 size={15} />
                  {LABELS.deleteShift}
                </button>
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
