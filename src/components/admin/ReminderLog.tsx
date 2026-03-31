import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Bell } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { LABELS, formatTime, cn } from '../../lib/utils';
import { LoadingSpinner } from '../shared/LoadingSpinner';

interface ReminderRow {
  id: string;
  shift_id: string;
  reminder_type: '60min' | '15min';
  sent_at: string;
  delivery_status: string;
  twilio_sid: string | null;
  shifts: {
    date: string;
    start_time: string;
    chatters: { name: string } | null;
  } | null;
}

function formatSentAt(iso: string) {
  return new Date(iso).toLocaleString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatShiftDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: '2-digit' });
}

const DELIVERY_COLORS: Record<string, string> = {
  sent: 'bg-green-500/20 text-green-400',
  delivered: 'bg-green-500/20 text-green-400',
  failed: 'bg-red-500/20 text-red-400',
  queued: 'bg-yellow-500/20 text-yellow-400',
  pending: 'bg-yellow-500/20 text-yellow-400',
};

export function ReminderLog() {
  const [rows, setRows] = useState<ReminderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: err } = await supabase
      .from('reminder_log')
      .select('*, shifts(date, start_time, chatters(name))')
      .order('sent_at', { ascending: false })
      .limit(50);

    if (err) {
      setError(LABELS.reminderLogError);
    } else {
      setRows((data as ReminderRow[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) {
        void fetchLogs();
      }
    });
    return () => {
      active = false;
    };
  }, [fetchLogs]);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">{LABELS.reminders}</h2>
          <p className="text-sm text-gray-400 mt-1">{LABELS.reminderLogSubtitle}</p>
        </div>
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white text-sm rounded-lg transition-colors border border-gray-700"
        >
          <RefreshCw size={15} className={cn(loading && 'animate-spin')} />
          {LABELS.refresh}
        </button>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <div className="text-center py-10 text-red-400">{error}</div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-500 gap-3">
          <Bell size={32} className="opacity-40" />
          <p>{LABELS.noRemindersInLog}</p>
        </div>
      ) : (
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700 bg-gray-900/50">
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                    {LABELS.sentAt}
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    {LABELS.chatter}
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                    {LABELS.shiftDate}
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                    {LABELS.shiftTime}
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                    {LABELS.reminderType}
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    {LABELS.status}
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Twilio SID
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-gray-700/40 hover:bg-gray-700/30 transition-colors"
                  >
                    {/* Sent at */}
                    <td className="px-4 py-3 text-gray-300 font-mono text-xs whitespace-nowrap">
                      {formatSentAt(row.sent_at)}
                    </td>

                    {/* Chatter name */}
                    <td className="px-4 py-3 text-white font-medium">
                      {row.shifts?.chatters?.name ?? '—'}
                    </td>

                    {/* Shift date */}
                    <td className="px-4 py-3 text-gray-300 whitespace-nowrap">
                      {row.shifts?.date ? formatShiftDate(row.shifts.date) : '—'}
                    </td>

                    {/* Shift time */}
                    <td className="px-4 py-3 text-gray-300 font-mono whitespace-nowrap">
                      {row.shifts?.start_time ? formatTime(row.shifts.start_time) : '—'}
                    </td>

                    {/* Reminder type */}
                    <td className="px-4 py-3 text-center">
                      <span
                        className={cn(
                          'px-2 py-0.5 rounded-full text-xs font-semibold',
                          row.reminder_type === '60min'
                            ? 'bg-purple-500/20 text-purple-400'
                            : 'bg-orange-500/20 text-orange-400'
                        )}
                      >
                        {row.reminder_type === '60min' ? LABELS.sixtyMinReminder : LABELS.fifteenMinReminder}
                      </span>
                    </td>

                    {/* Delivery status */}
                    <td className="px-4 py-3 text-center">
                      <span
                        className={cn(
                          'px-2 py-0.5 rounded-full text-xs font-medium',
                          DELIVERY_COLORS[row.delivery_status] ?? 'bg-gray-700 text-gray-400'
                        )}
                      >
                        {row.delivery_status}
                      </span>
                    </td>

                    {/* Twilio SID */}
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs truncate max-w-[140px]">
                      {row.twilio_sid ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
