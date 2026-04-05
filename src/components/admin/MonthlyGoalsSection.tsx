import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { LABELS } from '../../lib/utils';
import type { Chatter } from '../../lib/types';

interface MonthlyGoalsSectionProps {
  chatters: Chatter[];
  showToast: (type: 'success' | 'error' | 'warning' | 'info', message: string) => void;
}

function getMonthStartDate() {
  // Use Israel timezone to determine the current month, then build YYYY-MM-01
  // without going through toISOString() which converts to UTC and can shift the date.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const year = parts.find(p => p.type === 'year')!.value;
  const month = parts.find(p => p.type === 'month')!.value;
  return `${year}-${month}-01`;
}

export function MonthlyGoalsSection({ chatters, showToast }: MonthlyGoalsSectionProps) {
  const [goalsByChatter, setGoalsByChatter] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  const monthStart = useMemo(() => getMonthStartDate(), []);

  const fetchGoals = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('monthly_goals')
      .select('chatter_id, goal_amount')
      .eq('month', monthStart);

    if (error) {
      showToast('error', 'שגיאה בטעינת יעדים חודשיים');
      setLoading(false);
      return;
    }

    const map: Record<string, number> = {};
    for (const row of data ?? []) {
      map[row.chatter_id] = Number(row.goal_amount ?? 0);
    }
    setGoalsByChatter(map);
    setLoading(false);
  }, [monthStart, showToast]);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) {
        void fetchGoals();
      }
    });
    return () => {
      active = false;
    };
  }, [fetchGoals]);

  // Realtime: re-fetch when monthly_goals or daily_summaries change
  useEffect(() => {
    const channel = supabase
      .channel('admin-goals-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'monthly_goals' },
        () => { void fetchGoals(); }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchGoals]);

  function startEdit(chatterId: string) {
    setEditingId(chatterId);
    setEditValue(String(goalsByChatter[chatterId] ?? 0));
  }

  async function saveGoal(chatterId: string) {
    const goalAmount = Number(editValue);
    if (!Number.isFinite(goalAmount) || goalAmount < 0) {
      showToast('error', 'סכום יעד לא תקין');
      return;
    }

    const { error } = await supabase.from('monthly_goals').upsert(
      {
        chatter_id: chatterId,
        month: monthStart,
        goal_amount: goalAmount,
      },
      { onConflict: 'chatter_id,month' }
    );

    if (error) {
      showToast('error', 'שגיאה בשמירת יעד');
      return;
    }

    showToast('success', 'היעד החודשי נשמר');
    setGoalsByChatter((prev) => ({ ...prev, [chatterId]: goalAmount }));
    setEditingId(null);
    setEditValue('');
  }

  async function handleCopyLastMonthGoals() {
    setLoading(true);
    const { error } = await supabase.rpc('auto_reset_monthly_goals');
    if (error) {
      showToast('error', 'שגיאה בהעתקת יעדים');
    } else {
      showToast('success', LABELS.goalsCopied);
      await fetchGoals();
    }
    setLoading(false);
  }

  return (
    <div className="mt-6 bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold text-white">יעדים חודשיים</h3>
        <button
          onClick={handleCopyLastMonthGoals}
          disabled={loading}
          className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-200 px-3 py-1.5 rounded-lg text-xs"
        >
          {LABELS.copyLastMonthGoals}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-gray-400 border-b border-gray-800">
              <th className="text-right py-2 px-2">צ׳אטר</th>
              <th className="text-right py-2 px-2">יעד חודשי ($)</th>
              <th className="text-right py-2 px-2">פעולה</th>
            </tr>
          </thead>
          <tbody>
            {chatters.map((chatter) => (
              <tr key={chatter.id} className="border-b border-gray-800/60">
                <td className="py-2 px-2 text-white">{chatter.name}</td>
                <td className="py-2 px-2 text-gray-200">
                  {editingId === chatter.id ? (
                    <input
                      type="number"
                      min={0}
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white w-32"
                    />
                  ) : (
                    `$${goalsByChatter[chatter.id] ?? 0}`
                  )}
                </td>
                <td className="py-2 px-2">
                  {editingId === chatter.id ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveGoal(chatter.id)}
                        className="bg-green-600 hover:bg-green-500 text-white px-3 py-1 rounded text-xs"
                      >
                        שמור
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded text-xs"
                      >
                        ביטול
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => startEdit(chatter.id)}
                      className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded text-xs"
                      disabled={loading}
                    >
                      ערוך
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
