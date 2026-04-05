import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { CheckCircle, XCircle, Clock, Inbox } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Model, Platform, ShiftWithChatter } from '../../lib/types';
import { LABELS, formatDate, formatTime, cn } from '../../lib/utils';

interface PendingShift {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  chatters: { name: string } | null;
}

interface AdminApprovalProps {
  models: Model[];
  shifts: ShiftWithChatter[];
  showToast?: (type: 'success' | 'error' | 'warning' | 'info', message: string) => void;
  onRefreshShifts?: () => Promise<void> | void;
}

const PLATFORM_OPTIONS: { value: Platform; label: string }[] = [
  { value: 'telegram', label: 'טלגרם' },
  { value: 'onlyfans', label: 'אונליפאנס' },
];

const OCCUPIED_STATUSES = new Set(['pending', 'scheduled', 'active', 'completed']);
const DUPLICATE_ASSIGNMENT_MESSAGE = 'הדוגמנית+פלטפורמה הזו כבר משובצת בחלון הזה — בחר שילוב אחר';

function makeSelectionKey(modelId: string, platform: Platform) {
  return `${modelId}|${platform}`;
}

function parseSelectionKey(key: string) {
  const [modelId, platform] = key.split('|') as [string, Platform];
  return { modelId, platform };
}

function getShiftAssignments(shift: ShiftWithChatter) {
  if (shift.shift_assignments && shift.shift_assignments.length > 0) {
    return shift.shift_assignments.map((assignment) => ({
      model_id: assignment.model_id,
      model: assignment.model,
      platform: assignment.platform,
    }));
  }

  if (shift.model && shift.platform) {
    return [
      {
        model_id: shift.model_id,
        model: shift.model,
        platform: shift.platform,
      },
    ];
  }

  return [];
}

export function AdminApproval({ models, shifts, showToast, onRefreshShifts }: AdminApprovalProps) {
  const [pendingShifts, setPendingShifts] = useState<PendingShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refreshTimeoutRef = useRef<number | null>(null);

  const modelsById = useMemo(
    () => new Map(models.map((model) => [model.id, model])),
    [models]
  );

  const modelIdByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const model of models) {
      map.set(model.name.trim().toLowerCase(), model.id);
    }
    return map;
  }, [models]);

  const takenBySlot = useMemo(() => {
    const map = new Map<string, Set<string>>();

    for (const shift of shifts) {
      if (!OCCUPIED_STATUSES.has(shift.status)) continue;

      const slotKey = `${shift.date}|${shift.start_time}|${shift.end_time}`;
      const slotAssignments = map.get(slotKey) ?? new Set<string>();

      for (const assignment of getShiftAssignments(shift)) {
        const modelId =
          assignment.model_id ??
          modelIdByName.get(assignment.model.trim().toLowerCase()) ??
          null;

        if (!modelId) continue;
        slotAssignments.add(makeSelectionKey(modelId, assignment.platform));
      }

      map.set(slotKey, slotAssignments);
    }

    return map;
  }, [shifts, modelIdByName]);

  const fetchPending = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from('shifts')
      .select('id, date, start_time, end_time, chatters(name)')
      .eq('status', 'pending')
      .order('date');

    if (!fetchError && data) {
      setPendingShifts(data as unknown as PendingShift[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) {
        void fetchPending();
      }
    });
    return () => {
      active = false;
    };
  }, [fetchPending]);

  useEffect(() => {
    const scheduleRefresh = () => {
      if (refreshTimeoutRef.current) {
        window.clearTimeout(refreshTimeoutRef.current);
      }
      refreshTimeoutRef.current = window.setTimeout(() => {
        refreshTimeoutRef.current = null;
        void fetchPending();
      }, 500);
    };

    const channel = supabase
      .channel('approval-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, scheduleRefresh)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shift_assignments' },
        scheduleRefresh
      )
      .subscribe();

    return () => {
      if (refreshTimeoutRef.current) {
        window.clearTimeout(refreshTimeoutRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, [fetchPending]);

  const toggleSelection = (shiftId: string, modelId: string, platform: Platform) => {
    setError(null);
    const key = makeSelectionKey(modelId, platform);
    setSelections((prev) => {
      const current = new Set(prev[shiftId] ?? []);
      if (current.has(key)) current.delete(key);
      else current.add(key);
      return { ...prev, [shiftId]: Array.from(current) };
    });
  };

  const handleApprove = async (shift: PendingShift) => {
    const selectedKeys = selections[shift.id] ?? [];
    if (selectedKeys.length === 0) {
      setError('בחר לפחות מודל+פלטפורמה אחד');
      showToast?.('warning', 'בחר לפחות מודל+פלטפורמה אחד');
      return;
    }

    const resolvedAssignments = selectedKeys
      .map((key) => {
        const { modelId, platform } = parseSelectionKey(key);
        const model = modelsById.get(modelId);
        if (!model) return null;
        return {
          model_id: model.id,
          model: model.name,
          platform,
        };
      })
      .filter(
        (assignment): assignment is { model_id: string; model: string; platform: Platform } =>
          Boolean(assignment)
      );

    if (resolvedAssignments.length !== selectedKeys.length) {
      setError(LABELS.modelNotFound);
      showToast?.('error', LABELS.modelNotFound);
      return;
    }

    const slotKey = `${shift.date}|${shift.start_time}|${shift.end_time}`;
    const slotTaken = takenBySlot.get(slotKey) ?? new Set<string>();
    const hasFreshConflict = selectedKeys.some((key) => slotTaken.has(key));
    if (hasFreshConflict) {
      setError(DUPLICATE_ASSIGNMENT_MESSAGE);
      showToast?.('error', DUPLICATE_ASSIGNMENT_MESSAGE);
      await fetchPending();
      await onRefreshShifts?.();
      return;
    }

    setError(null);
    setActionLoading(shift.id);

    const primaryAssignment = resolvedAssignments[0];
    const { error: shiftError } = await supabase
      .from('shifts')
      .update({
        status: 'scheduled',
        model_id: primaryAssignment.model_id,
        platform: primaryAssignment.platform,
        model: primaryAssignment.model,
        updated_at: new Date().toISOString(),
      })
      .eq('id', shift.id)
      .eq('status', 'pending');

    if (shiftError) {
      const errorMessage =
        shiftError.code === '23505'
          ? DUPLICATE_ASSIGNMENT_MESSAGE
          : shiftError.message || LABELS.serverError;
      setError(errorMessage);
      showToast?.('error', errorMessage);
      await fetchPending();
      await onRefreshShifts?.();
      setActionLoading(null);
      return;
    }

    const assignmentRows = resolvedAssignments.map((assignment) => ({
      shift_id: shift.id,
      model_id: assignment.model_id,
      model: assignment.model,
      platform: assignment.platform,
      shift_date: shift.date,
      shift_start_time: shift.start_time,
    }));

    const { error: assignmentError } = await supabase
      .from('shift_assignments')
      .insert(assignmentRows);

    if (assignmentError) {
      await supabase
        .from('shifts')
        .update({
          status: 'pending',
          model_id: null,
          model: null,
          platform: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', shift.id)
        .eq('status', 'scheduled');

      const errorMessage =
        assignmentError.code === '23505'
          ? DUPLICATE_ASSIGNMENT_MESSAGE
          : assignmentError.message || LABELS.serverError;
      setError(errorMessage);
      showToast?.('error', errorMessage);
      await fetchPending();
      await onRefreshShifts?.();
      setActionLoading(null);
      return;
    }

    setPendingShifts((prev) => prev.filter((row) => row.id !== shift.id));
    setSelections((prev) => {
      const next = { ...prev };
      delete next[shift.id];
      return next;
    });
    await onRefreshShifts?.();
    setActionLoading(null);
  };

  const handleReject = async (shiftId: string) => {
    setActionLoading(shiftId);
    const { error: rejectError } = await supabase
      .from('shifts')
      .update({
        status: 'rejected',
        updated_at: new Date().toISOString(),
      })
      .eq('id', shiftId)
      .eq('status', 'pending');

    if (!rejectError) {
      setPendingShifts((prev) => prev.filter((s) => s.id !== shiftId));
    }
    setActionLoading(null);
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white">{LABELS.adminApproval}</h2>
        <p className="text-sm text-gray-400 mt-1">
          {pendingShifts.length > 0
            ? `${pendingShifts.length} ${LABELS.pendingShiftsCount}`
            : LABELS.noPendingShifts}
        </p>
      </div>

      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

      {pendingShifts.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <Inbox size={40} className="text-gray-600" />
          <p className="text-gray-400 text-sm">{LABELS.noPendingShiftsForApproval}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {pendingShifts.map((shift) => {
            const slotKey = `${shift.date}|${shift.start_time}|${shift.end_time}`;
            const slotAssignments = takenBySlot.get(slotKey) ?? new Set<string>();
            const selectedKeys = selections[shift.id] ?? [];
            const selectedSet = new Set(selectedKeys);
            const canApprove =
              selectedKeys.length > 0 && selectedKeys.every((key) => !slotAssignments.has(key));
            const allPairsBlocked = models.every((model) =>
              PLATFORM_OPTIONS.every((platform) =>
                slotAssignments.has(makeSelectionKey(model.id, platform.value))
              )
            );
            const isLoading = actionLoading === shift.id;

            return (
              <div
                key={shift.id}
                className="bg-gray-800 rounded-xl p-4 border border-yellow-500/30 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {shift.chatters?.name ?? LABELS.unknown}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{formatDate(shift.date)}</p>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-400">
                    {LABELS.pendingApproval}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-gray-300 text-sm">
                  <Clock size={14} className="text-gray-500 shrink-0" />
                  <span>
                    {formatTime(shift.start_time)} – {formatTime(shift.end_time)}
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-2">
                    מודלים ופלטפורמות
                  </label>
                  <div className="rounded-lg border border-gray-700 overflow-hidden">
                    <div className="grid grid-cols-3 bg-gray-900 px-3 py-2 text-[11px] text-gray-400">
                      <span>מודל</span>
                      <span className="text-center">טלגרם</span>
                      <span className="text-center">אונליפאנס</span>
                    </div>
                    {models.map((model) => (
                      <div
                        key={model.id}
                        className="grid grid-cols-3 items-center px-3 py-2 border-t border-gray-800 text-xs"
                      >
                        <span className="text-white truncate">{model.name}</span>
                        {PLATFORM_OPTIONS.map((platform) => {
                          const selectionKey = makeSelectionKey(model.id, platform.value);
                          const checked = selectedSet.has(selectionKey);
                          const taken = slotAssignments.has(selectionKey);
                          const disabled = (taken && !checked) || isLoading;
                          return (
                            <label key={selectionKey} className="flex justify-center">
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={disabled}
                                onChange={() => toggleSelection(shift.id, model.id, platform.value)}
                                className="accent-blue-500"
                              />
                            </label>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                  {allPairsBlocked && (
                    <p className="text-xs text-yellow-400 mt-2">אין מודלים זמינים בחלון הזה</p>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => handleApprove(shift)}
                    disabled={!canApprove || isLoading}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-1.5 min-h-[48px] rounded-lg text-sm font-medium transition-colors',
                      canApprove && !isLoading
                        ? 'bg-green-600 hover:bg-green-500 text-white'
                        : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    )}
                  >
                    <CheckCircle size={16} />
                    {isLoading ? '...' : LABELS.approve}
                  </button>
                  <button
                    onClick={() => handleReject(shift.id)}
                    disabled={isLoading}
                    className="flex-1 flex items-center justify-center gap-1.5 min-h-[48px] bg-red-900/40 hover:bg-red-800/60 text-red-400 hover:text-red-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    <XCircle size={16} />
                    {isLoading ? '...' : LABELS.reject}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
