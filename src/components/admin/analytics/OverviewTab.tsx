import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

interface WeeklyTrendPoint {
  label: string;
  completed: number;
  missed: number;
}

interface PlatformSplitPoint {
  name: string;
  value: number;
}

interface KpiData {
  attendanceRate: number | null;
  avgDelayMinutes: number | null;
  activeNow: number;
  goalProgressPct: number | null;
  hasGoal: boolean;
}

interface OverviewTabProps {
  kpi: KpiData;
  weeklyTrend: WeeklyTrendPoint[];
  platformSplit: PlatformSplitPoint[];
  isMobile: boolean;
}

const COLORS = ['#3b82f6', '#f97316', '#22c55e', '#a855f7'];

function kpiValue(value: number | null, suffix = '%') {
  if (value == null) return '—';
  return `${Math.round(value)}${suffix}`;
}

export function OverviewTab({ kpi, weeklyTrend, platformSplit, isMobile }: OverviewTabProps) {
  const trendHasData = weeklyTrend.some((item) => item.completed > 0 || item.missed > 0);
  const platformHasData = platformSplit.some((item) => item.value > 0);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-3">
          <p className="text-xs text-gray-400">אחוז נוכחות</p>
          <p className="mt-1 text-xl font-bold text-white">{kpiValue(kpi.attendanceRate)}</p>
          {kpi.attendanceRate == null && <p className="text-xs text-gray-500">אין נתונים לטווח הזה</p>}
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-900 p-3">
          <p className="text-xs text-gray-400">איחור ממוצע</p>
          <p className="mt-1 text-xl font-bold text-white">{kpi.avgDelayMinutes == null ? '—' : `${Math.round(kpi.avgDelayMinutes)} דק׳`}</p>
          {kpi.avgDelayMinutes == null && <p className="text-xs text-gray-500">אין נתונים לטווח הזה</p>}
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-900 p-3">
          <p className="text-xs text-gray-400">משמרות פעילות כעת</p>
          <p className="mt-1 text-xl font-bold text-white">{kpi.activeNow}</p>
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-900 p-3">
          <p className="text-xs text-gray-400">התקדמות יעד חודשי</p>
          <p className="mt-1 text-xl font-bold text-white">{kpiValue(kpi.goalProgressPct)}</p>
          {!kpi.hasGoal && <p className="text-xs text-gray-500">לא הוגדרו יעדים</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="rounded-xl border border-gray-800 bg-gray-900 p-3">
          <h3 className="mb-3 text-sm font-semibold text-white">מגמת נוכחות שבועית</h3>
          {!trendHasData ? (
            <p className="py-12 text-center text-sm text-gray-400">אין נתונים לטווח הזה</p>
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weeklyTrend} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: '#9ca3af', fontSize: isMobile ? 10 : 12 }}
                    interval="preserveStartEnd"
                    reversed
                  />
                  <YAxis tick={{ fill: '#9ca3af', fontSize: isMobile ? 10 : 12 }} />
                  <Tooltip
                    contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 10 }}
                    labelStyle={{ direction: 'rtl' }}
                  />
                  <Line type="monotone" dataKey="completed" name="הושלמו" stroke="#22c55e" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="missed" name="הוחמצו" stroke="#ef4444" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-gray-800 bg-gray-900 p-3">
          <h3 className="mb-3 text-sm font-semibold text-white">פילוח פלטפורמות</h3>
          {!platformHasData ? (
            <p className="py-12 text-center text-sm text-gray-400">אין נתונים לטווח הזה</p>
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={platformSplit} dataKey="value" nameKey="name" outerRadius={isMobile ? 84 : 96}>
                    {platformSplit.map((entry, index) => (
                      <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 10 }} />
                  <Legend layout={isMobile ? 'horizontal' : 'vertical'} verticalAlign={isMobile ? 'bottom' : 'middle'} align={isMobile ? 'center' : 'right'} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
