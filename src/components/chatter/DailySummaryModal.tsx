import { useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { Model, Shift } from '../../lib/types';

type AvailabilityStatus = 'full' | 'partial' | 'unavailable';

interface DailySummaryModalProps {
  shift: Shift;
  chatterId: string;
  models: Model[];
  onClose: () => void;
  onSubmitted: () => Promise<void> | void;
  showToast: (type: 'success' | 'error' | 'warning' | 'info', message: string) => void;
}

interface ModelAssignmentState {
  model_name: string;
  telegram: boolean;
  onlyfans: boolean;
}

function getDayOfWeekHebrew(date: string): string {
  const map = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'] as const;
  const [y, m, d] = date.split('-').map(Number);
  // Use UTC constructor to avoid timezone shifts changing the day
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return map[day];
}

function getShiftType(startTime: string): 'בוקר' | 'ערב' {
  if (startTime.startsWith('12:00')) return 'בוקר';
  if (startTime.startsWith('19:00')) return 'ערב';
  return 'ערב';
}

export function DailySummaryModal({
  shift,
  chatterId,
  models,
  onClose,
  onSubmitted,
  showToast,
}: DailySummaryModalProps) {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialAssignments = useMemo(() => {
    const base: Record<string, ModelAssignmentState> = {};
    for (const model of models) {
      base[model.id] = {
        model_name: model.name,
        telegram: false,
        onlyfans: false,
      };
    }
    if (shift.model_id && base[shift.model_id]) {
      if (shift.platform === 'telegram') base[shift.model_id].telegram = true;
      if (shift.platform === 'onlyfans') base[shift.model_id].onlyfans = true;
    }
    return base;
  }, [models, shift.model_id, shift.platform]);

  const [assignments, setAssignments] =
    useState<Record<string, ModelAssignmentState>>(initialAssignments);

  const [availabilityStatus, setAvailabilityStatus] = useState<AvailabilityStatus | ''>('');
  const [availabilityGapsDetail, setAvailabilityGapsDetail] = useState('');
  const [hasDebts, setHasDebts] = useState<boolean | null>(null);
  const [debtsDetail, setDebtsDetail] = useState('');
  const [hasPendingSales, setHasPendingSales] = useState<boolean | null>(null);
  const [pendingSalesDetail, setPendingSalesDetail] = useState('');
  const [hasUnusualEvents, setHasUnusualEvents] = useState<boolean | null>(null);
  const [unusualEventsDetail, setUnusualEventsDetail] = useState('');

  const [incomeTelegram, setIncomeTelegram] = useState<number>(0);
  const [incomeOnlyfans, setIncomeOnlyfans] = useState<number>(0);
  const [incomeOther, setIncomeOther] = useState<number>(0);
  const [allDepositsVerified, setAllDepositsVerified] = useState<boolean | null>(null);
  const [improvementSuggestions, setImprovementSuggestions] = useState('');
  const [contentRequest, setContentRequest] = useState('');

  const [selfImprovementPoint, setSelfImprovementPoint] = useState('');
  const [selfPreservationPoint, setSelfPreservationPoint] = useState('');

  const totalIncome = incomeTelegram + incomeOnlyfans + incomeOther;
  const formLocked = submitting || submitted;

  const assignmentPayload = useMemo(() => {
    return Object.values(assignments)
      .map((entry) => {
        const platforms: string[] = [];
        if (entry.telegram) platforms.push('telegram');
        if (entry.onlyfans) platforms.push('onlyfans');
        if (platforms.length === 0) return null;
        return { model_name: entry.model_name, platforms };
      })
      .filter((v): v is { model_name: string; platforms: string[] } => Boolean(v));
  }, [assignments]);

  function toggleAssignment(modelId: string, platform: 'telegram' | 'onlyfans') {
    setAssignments((prev) => ({
      ...prev,
      [modelId]: {
        ...prev[modelId],
        [platform]: !prev[modelId][platform],
      },
    }));
  }

  function validateCurrentStep() {
    if (step === 1) {
      if (assignmentPayload.length === 0) {
        setError('יש לבחור לפחות מיוצגת/פלטפורמה אחת');
        return false;
      }
    }

    if (step === 2) {
      if (!availabilityStatus) {
        setError('יש לבחור סטטוס זמינות');
        return false;
      }
      if (
        (availabilityStatus === 'partial' || availabilityStatus === 'unavailable') &&
        !availabilityGapsDetail.trim()
      ) {
        setError('נא לפרט פערים בזמינות');
        return false;
      }
      if (hasDebts === null || hasPendingSales === null || hasUnusualEvents === null) {
        setError('נא להשלים את כל שאלות כן/לא');
        return false;
      }
      if (hasDebts && !debtsDetail.trim()) {
        setError('נא לפרט חובות');
        return false;
      }
      if (hasPendingSales && !pendingSalesDetail.trim()) {
        setError('נא לפרט מכירות ממתינות');
        return false;
      }
      if (hasUnusualEvents && !unusualEventsDetail.trim()) {
        setError('נא לפרט אירועים חריגים');
        return false;
      }
    }

    if (step === 3) {
      if (allDepositsVerified === null) {
        setError('נא לציין האם כלל ההפקדות אומתו');
        return false;
      }
      if (!improvementSuggestions.trim()) {
        setError('שדה הצעות לשיפור/ייעול הוא חובה');
        return false;
      }
    }

    if (step === 4) {
      if (!selfImprovementPoint.trim() || !selfPreservationPoint.trim()) {
        setError('נא למלא את שתי הנקודות האישיות');
        return false;
      }
    }

    setError(null);
    return true;
  }

  function goNext() {
    if (!validateCurrentStep()) return;
    setStep((prev) => Math.min(4, prev + 1));
  }

  function goBack() {
    setError(null);
    setStep((prev) => Math.max(1, prev - 1));
  }

  async function handleSubmit() {
    if (submitting || submitted) return;
    if (!validateCurrentStep()) return;
    setSubmitting(true);

    const dayOfWeek = getDayOfWeekHebrew(shift.date);
    const shiftType = getShiftType(shift.start_time);

    const { error: summaryError } = await supabase.from('daily_summaries').insert({
      chatter_id: chatterId,
      shift_id: shift.id,
      date: shift.date,
      day_of_week: dayOfWeek,
      shift_type: shiftType,
      model_platform_assignments: assignmentPayload,
      availability_status: availabilityStatus,
      availability_gaps_detail: availabilityGapsDetail || null,
      has_debts: hasDebts ?? false,
      debts_detail: debtsDetail || null,
      has_pending_sales: hasPendingSales ?? false,
      pending_sales_detail: pendingSalesDetail || null,
      has_unusual_events: hasUnusualEvents ?? false,
      unusual_events_detail: unusualEventsDetail || null,
      income_telegram: incomeTelegram,
      income_onlyfans: incomeOnlyfans,
      income_other: incomeOther,
      all_deposits_verified: allDepositsVerified ?? false,
      improvement_suggestions: improvementSuggestions,
      content_request: contentRequest || null,
      self_improvement_point: selfImprovementPoint,
      self_preservation_point: selfPreservationPoint,
    });

    if (summaryError) {
      if (summaryError.code === '23505') {
        setSubmitted(true);
        setError(null);
        showToast('info', 'הסיכום כבר נשלח למשמרת הזו');
        await onSubmitted();
        setSubmitting(false);
        return;
      }
      console.error('[DailySummary] insert failed:', summaryError.message, summaryError.details, summaryError.hint);
      showToast('error', `שגיאה בשליחת הסיכום: ${summaryError.message}`);
      setSubmitting(false);
      return;
    }

    const nowIso = new Date().toISOString();
    const { data: completedShift, error: shiftError } = await supabase
      .from('shifts')
      .update({ status: 'completed', clocked_out: nowIso })
      .eq('id', shift.id)
      .eq('chatter_id', chatterId)
      .eq('status', 'active')
      .select('id')
      .maybeSingle();

    if (shiftError || !completedShift) {
      showToast('error', 'שגיאה ביציאה מהמשמרת');
      setSubmitting(false);
      return;
    }

    const { error: activityError } = await supabase.from('activity_log').insert({
      shift_id: shift.id,
      chatter_id: chatterId,
      action: 'clock_out',
    });

    if (activityError) {
      showToast('error', 'שגיאה ברישום פעילות');
      setSubmitting(false);
      return;
    }

    setSubmitted(true);
    setError(null);
    showToast('success', 'הסיכום נשלח בהצלחה!');
    setSubmitting(false);
    await onSubmitted();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="w-full max-w-2xl bg-gray-900 border border-gray-800 rounded-xl p-5 max-h-[92vh] overflow-y-auto">
        <div className="mb-4">
          <div className="flex items-center justify-between text-sm text-gray-300 mb-2">
            <span>שלב {step}/4</span>
            <span>{Math.round((step / 4) * 100)}%</span>
          </div>
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 transition-all" style={{ width: `${(step / 4) * 100}%` }} />
          </div>
        </div>

        {submitted && (
          <div className="mb-3 rounded-lg border border-green-700/60 bg-green-900/30 px-3 py-2 text-sm text-green-200">
            הסיכום נשמר. הטופס ננעל כדי למנוע שליחה כפולה.
          </div>
        )}

        <fieldset disabled={formLocked} className="border-0 m-0 p-0 min-w-0">
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-white">רקע פעילות</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <div className="bg-gray-800 rounded-lg p-3">
                  <p className="text-gray-400">תאריך</p>
                  <p className="text-white">{shift.date}</p>
                </div>
                <div className="bg-gray-800 rounded-lg p-3">
                  <p className="text-gray-400">יום</p>
                  <p className="text-white">{getDayOfWeekHebrew(shift.date)}</p>
                </div>
                <div className="bg-gray-800 rounded-lg p-3">
                  <p className="text-gray-400">חלון פעילות</p>
                  <p className="text-white">{getShiftType(shift.start_time)}</p>
                </div>
              </div>

              <div>
                <p className="text-sm text-gray-300 mb-2">אחיזת מיוצגות - פלטפורמות</p>
                <div className="rounded-lg border border-gray-800 overflow-hidden">
                  <div className="grid grid-cols-3 bg-gray-800 text-xs text-gray-300 px-3 py-2">
                    <span>מודל</span>
                    <span className="text-center">טלגרם</span>
                    <span className="text-center">אונלי</span>
                  </div>
                  {models.map((model) => (
                    <div key={model.id} className="grid grid-cols-3 px-3 py-2 border-t border-gray-800 text-sm">
                      <span className="text-white">{model.name}</span>
                      <label className="flex justify-center">
                        <input
                          type="checkbox"
                          checked={assignments[model.id]?.telegram ?? false}
                          onChange={() => toggleAssignment(model.id, 'telegram')}
                        />
                      </label>
                      <label className="flex justify-center">
                        <input
                          type="checkbox"
                          checked={assignments[model.id]?.onlyfans ?? false}
                          onChange={() => toggleAssignment(model.id, 'onlyfans')}
                        />
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-white">מהלך הפעילות</h3>

              <div>
                <label className="block text-sm text-gray-300 mb-1">פערים בזמינות מיוצגת</label>
                <select
                  value={availabilityStatus}
                  onChange={(e) => setAvailabilityStatus(e.target.value as AvailabilityStatus)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
                >
                  <option value="">בחר</option>
                  <option value="full">עמדה בזמינות</option>
                  <option value="partial">עמדה חלקית</option>
                  <option value="unavailable">לא עמדה בזמינות</option>
                </select>
              </div>

              {(availabilityStatus === 'partial' || availabilityStatus === 'unavailable') && (
                <textarea
                  value={availabilityGapsDetail}
                  onChange={(e) => setAvailabilityGapsDetail(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white min-h-[90px]"
                  placeholder="במידה והיו פערים אנא פרטו"
                />
              )}

              {[
                {
                  label: 'האם ישנם חובות?',
                  value: hasDebts,
                  setValue: setHasDebts,
                  detail: debtsDetail,
                  setDetail: setDebtsDetail,
                  placeholder: 'אנא נמקו',
                },
                {
                  label: 'האם ישנן מכירות שממתינות?',
                  value: hasPendingSales,
                  setValue: setHasPendingSales,
                  detail: pendingSalesDetail,
                  setDetail: setPendingSalesDetail,
                  placeholder: 'אנא פרטו',
                },
                {
                  label: 'האם היו אירועים חריגים?',
                  value: hasUnusualEvents,
                  setValue: setHasUnusualEvents,
                  detail: unusualEventsDetail,
                  setDetail: setUnusualEventsDetail,
                  placeholder: 'אנא פרטו',
                },
              ].map((section) => (
                <div key={section.label} className="space-y-2">
                  <p className="text-sm text-gray-300">{section.label}</p>
                  <div className="flex gap-4 text-sm">
                    <label className="flex items-center gap-1 text-white">
                      <input
                        type="radio"
                        checked={section.value === true}
                        onChange={() => section.setValue(true)}
                      />
                      כן
                    </label>
                    <label className="flex items-center gap-1 text-white">
                      <input
                        type="radio"
                        checked={section.value === false}
                        onChange={() => section.setValue(false)}
                      />
                      לא
                    </label>
                  </div>
                  {section.value === true && (
                    <textarea
                      value={section.detail}
                      onChange={(e) => section.setDetail(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white min-h-[80px]"
                      placeholder={section.placeholder}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-white">סיכום אישי</h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  { label: 'טלגרם', value: incomeTelegram, setValue: setIncomeTelegram },
                  { label: 'אונלי', value: incomeOnlyfans, setValue: setIncomeOnlyfans },
                  { label: 'חוץ', value: incomeOther, setValue: setIncomeOther },
                ].map((field) => (
                  <div key={field.label}>
                    <label className="block text-sm text-gray-300 mb-1">{field.label}</label>
                    <input
                      type="number"
                      min={0}
                      value={field.value}
                      onChange={(e) => field.setValue(Number(e.target.value) || 0)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
                    />
                  </div>
                ))}
              </div>

              <div className="text-sm text-gray-200">סה״כ: ₪{totalIncome}</div>

              <div>
                <p className="text-sm text-gray-300 mb-2">האם כלל ההפקדות אומתו?</p>
                <div className="flex gap-4 text-sm">
                  <label className="flex items-center gap-1 text-white">
                    <input
                      type="radio"
                      checked={allDepositsVerified === true}
                      onChange={() => setAllDepositsVerified(true)}
                    />
                    כן
                  </label>
                  <label className="flex items-center gap-1 text-white">
                    <input
                      type="radio"
                      checked={allDepositsVerified === false}
                      onChange={() => setAllDepositsVerified(false)}
                    />
                    לא
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-300 mb-1">הצעות לשיפור/ייעול</label>
                <textarea
                  value={improvementSuggestions}
                  onChange={(e) => setImprovementSuggestions(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white min-h-[90px]"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-300 mb-1">בקשת תוכן</label>
                <textarea
                  value={contentRequest}
                  onChange={(e) => setContentRequest(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white min-h-[90px]"
                />
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-white">נקודות אישיות</h3>
              <div>
                <label className="block text-sm text-gray-300 mb-1">נקודה לשיפור עצמי</label>
                <textarea
                  value={selfImprovementPoint}
                  onChange={(e) => setSelfImprovementPoint(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white min-h-[90px]"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">נקודה לשימור עצמי</label>
                <textarea
                  value={selfPreservationPoint}
                  onChange={(e) => setSelfPreservationPoint(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white min-h-[90px]"
                />
              </div>
            </div>
          )}
        </fieldset>

        {error && <p className="text-sm text-red-400 mt-3">{error}</p>}

        <div className="flex items-center justify-between mt-6">
          {submitted ? (
            <button
              onClick={onClose}
              className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm"
            >
              סגור
            </button>
          ) : (
            <>
              <button
                onClick={goBack}
                disabled={step === 1 || formLocked}
                className="bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm"
              >
                חזרה
              </button>

              {step < 4 ? (
                <button
                  onClick={goNext}
                  disabled={formLocked}
                  className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm"
                >
                  הבא
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={formLocked}
                  className="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm"
                >
                  {submitting ? 'שולח...' : 'שלח סיכום'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
