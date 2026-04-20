import { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';

export interface ChatterAnalyticsRow {
  chatterId: string;
  name: string;
  rate: number | null;
  totalShifts: number;
  completed: number;
  missed: number;
  rejected: number;
  avgDelayMinutes: number | null;
  incomeThisMonth: number;
  goalPct: number | null;
}

interface ChattersTabProps {
  rows: ChatterAnalyticsRow[];
  isMobile: boolean;
}

interface ChartRow extends ChatterAnalyticsRow {
  chartRate: number;
  rateLabel: string;
}

export function ChattersTab({ rows, isMobile }: ChattersTabProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const chartRows = useMemo<ChartRow[]>(
    () =>
      rows.map((row) => ({
        ...row,
        chartRate: row.rate == null ? 2 : row.rate,
        rateLabel: row.rate == null ? '—' : `${Math.round(row.rate)}%`,
      })),
    [rows]
  );

  const expanded = rows.find((row) => row.chatterId === expandedId) ?? null;

  if (rows.length === 0) {
    return <p className="py-12 text-center text-sm text-gray-400">אין נתונים לטווח הזה</p>;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <section className="rounded-xl border border-gray-800 bg-gray-900 p-3">
        <h3 className="mb-3 text-sm font-semibold text-white">אחוז נוכחות לפי צ׳אטר</h3>
        <div className={isMobile ? 'h-[380px]' : 'h-[320px] overflow-x-auto'}>
          <div className={isMobile ? 'h-full' : 'h-full min-w-[680px]'}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartRows}
                layout={isMobile ? 'vertical' : 'horizontal'}
                margin={{ top: 8, right: 8, left: isMobile ? 18 : 0, bottom: isMobile ? 8 : 58 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                {isMobile ? (
                  <>
                    <XAxis type="number" domain={[0, 100]} tick={{ fill: '#9ca3af', fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" tick={{ fill: '#9ca3af', fontSize: 10 }} width={96} />
                  </>
                ) : (
                  <>
                    <XAxis
                      dataKey="name"
                      tick={{ fill: '#9ca3af', fontSize: 11 }}
                      angle={-45}
                      textAnchor="end"
                      height={60}
                      interval={0}
                      reversed
                    />
                    <YAxis domain={[0, 100]} tick={{ fill: '#9ca3af', fontSize: 11 }} />
                  </>
                )}
                <Tooltip
                  contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 10 }}
                  labelStyle={{ direction: 'rtl' }}
                />
                <Bar
                  dataKey="chartRate"
                  onClick={(data) => {
                    const row = data as { chatterId?: string; payload?: { chatterId?: string } };
                    const chatterId = row.chatterId ?? row.payload?.chatterId;
                    if (!chatterId) return;
                    setExpandedId((prev) => (prev === chatterId ? null : chatterId));
                  }}
                  cursor="pointer"
                >
                  {chartRows.map((row) => (
                    <Cell key={row.chatterId} fill={row.rate == null ? '#6b7280' : '#3b82f6'} />
                  ))}
                  <LabelList
                    dataKey="rateLabel"
                    position={isMobile ? 'right' : 'top'}
                    fill="#d1d5db"
                    fontSize={10}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {expanded && (
        <section className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <h4 className="text-sm font-semibold text-white">{expanded.name}</h4>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <div className="rounded-lg bg-gray-800 p-2"><span className="text-gray-400">סה״כ משמרות</span><p className="font-bold text-white">{expanded.totalShifts}</p></div>
            <div className="rounded-lg bg-gray-800 p-2"><span className="text-gray-400">הושלמו</span><p className="font-bold text-white">{expanded.completed}</p></div>
            <div className="rounded-lg bg-gray-800 p-2"><span className="text-gray-400">הוחמצו</span><p className="font-bold text-white">{expanded.missed}</p></div>
            <div className="rounded-lg bg-gray-800 p-2"><span className="text-gray-400">נדחו</span><p className="font-bold text-white">{expanded.rejected}</p></div>
            <div className="rounded-lg bg-gray-800 p-2"><span className="text-gray-400">איחור ממוצע</span><p className="font-bold text-white">{expanded.avgDelayMinutes == null ? '—' : `${Math.round(expanded.avgDelayMinutes)} דק׳`}</p></div>
            <div className="rounded-lg bg-gray-800 p-2"><span className="text-gray-400">הכנסה חודשית</span><p className="font-bold text-white">${Math.round(expanded.incomeThisMonth)}</p></div>
            <div className="rounded-lg bg-gray-800 p-2 col-span-2 sm:col-span-3"><span className="text-gray-400">התקדמות יעד</span><p className="font-bold text-white">{expanded.goalPct == null ? '—' : `${Math.round(expanded.goalPct)}%`}</p></div>
          </div>
        </section>
      )}
    </div>
  );
}
