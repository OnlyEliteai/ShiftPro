import { useMemo, useState } from 'react';
import { X, Trash2 } from 'lucide-react';
import type { Chatter, Model, Platform, Shift } from '../../lib/types';
import { LABELS, getIsraelDateKey } from '../../lib/utils';
import { getShiftWindowEditAssignments } from '../../lib/shiftWindowEditing';

interface ShiftCombination {
  model_id: string;
  model: string;
  platform: Platform;
}

interface ShiftFormData {
  chatter_id: string;
  date: string;
  shift_type: 'morning' | 'evening';
  start_time: string;
  end_time: string;
  model: string;
  model_id: string;
  platform: Platform | null;
  selected_model_ids: string[];
  selected_platforms: Platform[];
  combinations: ShiftCombination[];
  status: Shift['status'];
}

interface ShiftEditorProps {
  shift?: Shift;
  chatters: Chatter[];
  models: Model[];
  existingShifts: Shift[];
  availableDates: string[];
  date?: string;
  shiftType?: 'morning' | 'evening';
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
  existingShifts,
  availableDates,
  date,
  shiftType = 'morning',
  onSave,
  onDelete,
  onClose,
}: ShiftEditorProps) {
  const activeModels = models.filter((m) => m.active);
  const hasModels = activeModels.length > 0;
  const isEditing = !!shift;
  const inferredShiftType: 'morning' | 'evening' = shift
    ? shift.start_time.startsWith('19:00')
      ? 'evening'
      : 'morning'
    : shiftType;

  const getTimesByType = (type: 'morning' | 'evening') =>
    type === 'morning'
      ? { start_time: '12:00', end_time: '19:00' }
      : { start_time: '19:00', end_time: '02:00' };

  const existingAssignments = useMemo<ShiftCombination[]>(() => {
    if (!shift) return [];
    return getShiftWindowEditAssignments(existingShifts, shift, models);
  }, [shift, existingShifts, models]);

  const initialSelectedModelIds = useMemo(
    () => Array.from(new Set(existingAssignments.map((assignment) => assignment.model_id))),
    [existingAssignments]
  );

  const initialSelectedPlatforms = useMemo(
    () => Array.from(new Set(existingAssignments.map((assignment) => assignment.platform))),
    [existingAssignments]
  );

  const [form, setForm] = useState<ShiftFormData>({
    chatter_id: shift?.chatter_id ?? (chatters[0]?.id ?? ''),
    date: shift?.date ?? date ?? availableDates[0] ?? getIsraelDateKey(),
    shift_type: inferredShiftType,
    start_time: shift?.start_time ?? getTimesByType(inferredShiftType).start_time,
    end_time: shift?.end_time ?? getTimesByType(inferredShiftType).end_time,
    model: shift?.model ?? '',
    model_id:
      shift?.model_id ??
      (shift?.model ? models.find((m) => m.name === shift.model)?.id ?? '' : ''),
    platform: shift?.platform ?? null,
    selected_model_ids: initialSelectedModelIds,
    selected_platforms: initialSelectedPlatforms,
    combinations: existingAssignments,
    status: shift?.status ?? 'scheduled',
  });

  const [selectedModelIds, setSelectedModelIds] = useState<string[]>(initialSelectedModelIds);
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>(initialSelectedPlatforms);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    const { name, value } = e.target;
    if (name === 'shift_type') {
      const typed = value as 'morning' | 'evening';
      const times = getTimesByType(typed);
      setForm((prev) => ({ ...prev, shift_type: typed, ...times }));
      return;
    }

    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function togglePlatform(platform: Platform) {
    setSelectedPlatforms((prev) =>
      prev.includes(platform) ? prev.filter((item) => item !== platform) : [...prev, platform]
    );
  }

  function toggleModel(modelId: string) {
    setSelectedModelIds((prev) =>
      prev.includes(modelId) ? prev.filter((item) => item !== modelId) : [...prev, modelId]
    );
  }

  const selectedModels = useMemo(
    () =>
      selectedModelIds
        .map((modelId) => models.find((model) => model.id === modelId))
        .filter((model): model is Model => Boolean(model)),
    [selectedModelIds, models]
  );

  const selectedCombinations = useMemo<ShiftCombination[]>(
    () =>
      selectedModels.flatMap((model) =>
        selectedPlatforms.map((platform) => ({
          model_id: model.id,
          model: model.name,
          platform,
        }))
      ),
    [selectedModels, selectedPlatforms]
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setValidationError(null);

    if (!form.chatter_id) {
      setValidationError(LABELS.selectChatter);
      return;
    }

    if (selectedPlatforms.length === 0) {
      setValidationError('יש לבחור פלטפורמה');
      return;
    }

    if (selectedModelIds.length === 0 && hasModels) {
      setValidationError('יש לבחור מודל');
      return;
    }

    if (selectedCombinations.length === 0) {
      setValidationError('יש לבחור לפחות מודל ופלטפורמה אחד');
      return;
    }

    const duplicate = existingShifts.some((existing) => {
      if (isEditing) {
        const isSibling =
          existing.chatter_id === shift?.chatter_id &&
          existing.date === shift?.date &&
          existing.start_time === shift?.start_time &&
          existing.end_time === shift?.end_time;
        if (isSibling) return false;
      }
      const matchesWindow =
        form.shift_type === 'morning'
          ? existing.start_time.startsWith('12:00')
          : existing.start_time.startsWith('19:00');
      if (
        existing.chatter_id !== form.chatter_id ||
        existing.date !== form.date ||
        !matchesWindow ||
        !existing.platform
      ) {
        return false;
      }

      const resolvedModelId =
        existing.model_id ??
        (existing.model ? models.find((model) => model.name === existing.model)?.id ?? null : null);
      if (!resolvedModelId) return false;

      return selectedCombinations.some(
        (combination) =>
          combination.model_id === resolvedModelId &&
          combination.platform === existing.platform
      );
    });

    if (duplicate) {
      setValidationError('כבר קיימת משמרת זהה לצ׳אטר, חלון, מודל ופלטפורמה ביום זה');
      return;
    }

    const primaryCombination = selectedCombinations[0];

    onSave({
      ...form,
      model: primaryCombination.model,
      model_id: primaryCombination.model_id,
      platform: primaryCombination.platform,
      selected_model_ids: [...selectedModelIds],
      selected_platforms: [...selectedPlatforms],
      combinations: selectedCombinations,
      status: isEditing ? form.status : 'scheduled',
    });
  }

  const inputClass =
    'w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-base text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors';

  const labelClass = 'block text-sm font-medium text-gray-300 mb-1';

  return (
    /* Overlay */
    <div
      className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-black/70 backdrop-blur-sm lg:p-4"
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
              {LABELS.chatter}
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
              {LABELS.date}
            </label>
            <select
              id="date"
              name="date"
              value={form.date}
              onChange={handleChange}
              className={inputClass}
              required
            >
              {availableDates.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>

          {/* Shift type */}
          <div>
            <label className={labelClass}>חלון</label>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center gap-2 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white">
                <input
                  type="radio"
                  name="shift_type"
                  value="morning"
                  checked={form.shift_type === 'morning'}
                  onChange={handleChange}
                />
                <span>בוקר (12:00-19:00)</span>
              </label>
              <label className="flex items-center gap-2 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white">
                <input
                  type="radio"
                  name="shift_type"
                  value="evening"
                  checked={form.shift_type === 'evening'}
                  onChange={handleChange}
                />
                <span>ערב (19:00-02:00)</span>
              </label>
            </div>
          </div>

          {/* Fixed window time display */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="start_time" className={labelClass}>
                {LABELS.startTime}
              </label>
              <input
                id="start_time"
                type="time"
                name="start_time"
                value={form.start_time}
                className={inputClass}
                readOnly
              />
            </div>
            <div>
              <label htmlFor="end_time" className={labelClass}>
                {LABELS.endTime}
              </label>
              <input
                id="end_time"
                type="time"
                name="end_time"
                value={form.end_time}
                className={inputClass}
                readOnly
              />
            </div>
          </div>

          {/* Platform */}
          <div>
            <label className={labelClass}>{LABELS.platform}</label>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center gap-2 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white">
                <input
                  type="checkbox"
                  checked={selectedPlatforms.includes('telegram')}
                  onChange={() => togglePlatform('telegram')}
                />
                <span>טלגרם</span>
              </label>
              <label className="flex items-center gap-2 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white">
                <input
                  type="checkbox"
                  checked={selectedPlatforms.includes('onlyfans')}
                  onChange={() => togglePlatform('onlyfans')}
                />
                <span>אונלי</span>
              </label>
            </div>
          </div>

          {/* Model */}
          <div>
            <label className={labelClass}>
              {LABELS.model}
            </label>
            {hasModels ? (
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {activeModels.map((model) => (
                  <label
                    key={model.id}
                    className="flex items-center gap-2 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white"
                  >
                    <input
                      type="checkbox"
                      checked={selectedModelIds.includes(model.id)}
                      onChange={() => toggleModel(model.id)}
                    />
                    <span>{model.name}</span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-sm text-yellow-400 py-2">{LABELS.addModelFirst}</p>
            )}
          </div>

          {/* Selection Preview */}
          <div className="space-y-2">
            <p className={labelClass}>שיבוצים נבחרים</p>
            <div className="flex flex-wrap gap-2">
              {selectedModels.map((model) => (
                <span
                  key={`model-${model.id}`}
                  className="px-2 py-1 rounded-full text-xs bg-blue-500/20 text-blue-300"
                >
                  {model.name}
                </span>
              ))}
              {selectedPlatforms.map((platform) => (
                <span
                  key={`platform-${platform}`}
                  className="px-2 py-1 rounded-full text-xs bg-purple-500/20 text-purple-300"
                >
                  {platform === 'telegram' ? 'טלגרם' : 'אונלי'}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedCombinations.map((combination) => (
                <span
                  key={`${combination.model_id}|${combination.platform}`}
                  className="px-2 py-1 rounded-full text-xs bg-green-500/20 text-green-300"
                >
                  {combination.model} × {combination.platform === 'telegram' ? 'טלגרם' : 'אונלי'}
                </span>
              ))}
            </div>
          </div>

          {/* Status — only show when editing */}
          {isEditing && (
            <div>
              <label htmlFor="status" className={labelClass}>
                {LABELS.status}
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
                  <span className="text-sm text-red-400 flex-1">{LABELS.sureToDelete}</span>
                  <button
                    type="button"
                    onClick={onDelete}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-sm rounded-lg font-medium transition-colors"
                  >
                    {LABELS.delete}
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
