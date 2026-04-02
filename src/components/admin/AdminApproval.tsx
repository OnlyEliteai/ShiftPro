import { useState, useEffect, useCallback } from 'react';
import { CheckCircle, XCircle, Clock, Inbox } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Model } from '../../lib/types';
import { LABELS, formatDate, formatTime, cn } from '../../lib/utils';

interface PendingShift {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  model: string | null;
  platform: string | null;
  chatters: { name: string } | null;
}

interface AdminApprovalProps {
  models: Model[];
}

export function AdminApproval({ models }: AdminApprovalProps) {
  const [pendingShifts, setPendingShifts] = useState<PendingShift[]>([]);
  const [loading, setLoading] = useState(true);

  // Per-card state: { [shiftId]: { modelId, platform } }
  const [selections, setSelections] = useState<
    Record<string, { modelId: string; platform: string }>
  >({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchPending = useCallback(async () => {
    const { data, error } = await supabase
      .from('shifts')
      .select('id, date, start_time, end_time, model, platform, chatters(name)')
      .eq('status', 'pending')
      .order('date');

    if (!error && data) {
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

  // Realtime: refetch when shifts change
  useEffect(() => {
    const channel = supabase
      .channel('approval-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shifts' },
        () => {
          fetchPending();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchPending]);

  const updateSelection = (
    shiftId: string,
    field: 'modelId' | 'platform',
    value: string
  ) => {
    setSelections((prev) => ({
      ...prev,
      [shiftId]: {
        ...prev[shiftId],
        [field]: value,
      },
    }));
  };

  const handleApprove = async (shiftId: string) => {
    const sel = selections[shiftId];
    if (!sel?.modelId || !sel?.platform) {
      setError(LABELS.selectModelAndPlatform);
      return;
    }

    const model = models.find((m) => m.id === sel.modelId);
    if (!model) {
      setError(LABELS.modelNotFound);
      return;
    }
    setError(null);

    setActionLoading(shiftId);
    const { error } = await supabase
      .from('shifts')
      .update({
        status: 'scheduled',
        model_id: sel.modelId,
        platform: sel.platform,
        model: model.name,
        updated_at: new Date().toISOString(),
      })
      .eq('id', shiftId)
      .eq('status', 'pending');

    if (!error) {
      setPendingShifts((prev) => prev.filter((s) => s.id !== shiftId));
      setSelections((prev) => {
        const next = { ...prev };
        delete next[shiftId];
        return next;
      });
    }
    setActionLoading(null);
  };

  const handleReject = async (shiftId: string) => {
    setActionLoading(shiftId);
    const { error } = await supabase
      .from('shifts')
      .update({
        status: 'rejected',
        updated_at: new Date().toISOString(),
      })
      .eq('id', shiftId)
      .eq('status', 'pending');

    if (!error) {
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

      {error && (
        <p className="text-sm text-red-400 mb-4">{error}</p>
      )}

      {pendingShifts.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <Inbox size={40} className="text-gray-600" />
          <p className="text-gray-400 text-sm">{LABELS.noPendingShiftsForApproval}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {pendingShifts.map((shift) => {
            const sel = selections[shift.id] ?? { modelId: '', platform: '' };
            const canApprove = !!sel.modelId && !!sel.platform;
            const isLoading = actionLoading === shift.id;

            return (
              <div
                key={shift.id}
                className="bg-gray-800 rounded-xl p-4 border border-yellow-500/30 space-y-3"
              >
                {/* Chatter name + date */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {shift.chatters?.name ?? LABELS.unknown}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {formatDate(shift.date)}
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-400">
                    {LABELS.pendingApproval}
                  </span>
                </div>

                {/* Time */}
                <div className="flex items-center gap-1.5 text-gray-300 text-sm">
                  <Clock size={14} className="text-gray-500 shrink-0" />
                  <span>
                    {formatTime(shift.start_time)} – {formatTime(shift.end_time)}
                  </span>
                </div>

                {/* Model select */}
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">
                    {LABELS.selectModel}
                  </label>
                  <select
                    value={sel.modelId}
                    onChange={(e) =>
                      updateSelection(shift.id, 'modelId', e.target.value)
                    }
                    required
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                  >
                    <option value="">{LABELS.selectModel}</option>
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Platform select */}
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">
                    {LABELS.platform}
                  </label>
                  <select
                    value={sel.platform}
                    onChange={(e) =>
                      updateSelection(shift.id, 'platform', e.target.value)
                    }
                    required
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                  >
                    <option value="">{LABELS.selectPlatform}</option>
                    <option value="telegram">{LABELS.telegram}</option>
                    <option value="onlyfans">{LABELS.onlyfans}</option>
                  </select>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => handleApprove(shift.id)}
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
