import { useState, useEffect } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { LABELS } from '../../lib/utils';
import { LoadingSpinner } from '../shared/LoadingSpinner';

const COLORS = ['#3b82f6', '#22c55e', '#ef4444', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

interface AttendanceData {
  name: string;
  rate: number;
  completed: number;
  missed: number;
}

interface WeeklyData {
  week: string;
  rate: number;
}

interface ModelData {
  model: string;
  count: number;
}

interface ShiftAnalyticsRow {
  chatter_id: string;
  status: string;
  date: string;
  model: string | null;
  chatters: { name: string }[] | { name: string } | null;
}

export function Analytics() {
  const [attendance, setAttendance] = useState<AttendanceData[]>([]);
  const [weeklyTrend, setWeeklyTrend] = useState<WeeklyData[]>([]);
  const [modelCoverage, setModelCoverage] = useState<ModelData[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchAnalytics() {
    setLoading(true);
    try {
      // Attendance rate per chatter (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const dateStr = thirtyDaysAgo.toISOString().split('T')[0];

      const { data: shifts } = await supabase
        .from('shifts')
        .select('chatter_id, status, date, model, chatters(name)')
        .gte('date', dateStr)
        .in('status', ['completed', 'missed']);

      // Per-chatter attendance
      const chatterMap = new Map<string, { name: string; completed: number; missed: number }>();
      const shiftRows = (shifts ?? []) as unknown as ShiftAnalyticsRow[];
      for (const s of shiftRows) {
        const key = s.chatter_id;
        const chatterName = Array.isArray(s.chatters)
          ? s.chatters[0]?.name
          : s.chatters?.name;
        if (!chatterMap.has(key)) {
          chatterMap.set(key, { name: chatterName || 'Unknown', completed: 0, missed: 0 });
        }
        const entry = chatterMap.get(key)!;
        if (s.status === 'completed') entry.completed++;
        else if (s.status === 'missed') entry.missed++;
      }

      const attendanceData: AttendanceData[] = [];
      for (const [, v] of chatterMap) {
        const total = v.completed + v.missed;
        attendanceData.push({
          name: v.name,
          rate: total > 0 ? Math.round((v.completed / total) * 100) : 0,
          completed: v.completed,
          missed: v.missed,
        });
      }
      attendanceData.sort((a, b) => b.rate - a.rate);
      setAttendance(attendanceData);

      // Weekly trend (last 12 weeks)
      const weeklyMap = new Map<string, { completed: number; total: number }>();
      for (const s of shiftRows) {
        const d = new Date(s.date + 'T00:00:00');
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - d.getDay());
        const weekKey = weekStart.toISOString().split('T')[0];
        if (!weeklyMap.has(weekKey)) weeklyMap.set(weekKey, { completed: 0, total: 0 });
        const entry = weeklyMap.get(weekKey)!;
        entry.total++;
        if (s.status === 'completed') entry.completed++;
      }

      const weeklyData: WeeklyData[] = [];
      const sortedWeeks = [...weeklyMap.entries()].sort(([a], [b]) => a.localeCompare(b));
      for (const [week, v] of sortedWeeks) {
        weeklyData.push({
          week: new Date(week + 'T00:00:00').toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' }),
          rate: v.total > 0 ? Math.round((v.completed / v.total) * 100) : 0,
        });
      }
      setWeeklyTrend(weeklyData);

      // Model coverage
      const { data: allShifts } = await supabase
        .from('shifts')
        .select('model')
        .gte('date', dateStr)
        .not('model', 'is', null);

      const modelMap = new Map<string, number>();
      for (const s of ((allShifts ?? []) as Array<{ model: string | null }>)) {
        const m = s.model || LABELS.noModel;
        modelMap.set(m, (modelMap.get(m) || 0) + 1);
      }
      const modelData: ModelData[] = [];
      for (const [model, count] of modelMap) {
        modelData.push({ model, count });
      }
      modelData.sort((a, b) => b.count - a.count);
      setModelCoverage(modelData);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAnalytics();
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{LABELS.analytics}</h2>
        <button onClick={fetchAnalytics} className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 rounded-lg hover:bg-gray-600 text-sm">
          <RefreshCw size={14} />
          {LABELS.refresh}
        </button>
      </div>

      {/* Attendance Rate per Chatter */}
      <div className="bg-gray-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold mb-4">{LABELS.attendanceByChatter} לפי צ׳אטר (30 יום)</h3>
        {attendance.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={attendance} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis type="number" domain={[0, 100]} tick={{ fill: '#9ca3af' }} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#9ca3af' }} width={80} />
              <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: 8, color: '#fff' }} />
              <Bar dataKey="rate" fill="#3b82f6" radius={[0, 4, 4, 0]} name="אחוז נוכחות" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-400 text-center py-8">{LABELS.noDataYet}</p>
        )}
      </div>

      {/* Weekly Trend */}
      <div className="bg-gray-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold mb-4">{LABELS.weeklyTrend}</h3>
        {weeklyTrend.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={weeklyTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="week" tick={{ fill: '#9ca3af' }} />
              <YAxis domain={[0, 100]} tick={{ fill: '#9ca3af' }} />
              <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: 8, color: '#fff' }} />
              <Line type="monotone" dataKey="rate" stroke="#22c55e" strokeWidth={2} dot={{ fill: '#22c55e' }} name="אחוז נוכחות" />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-400 text-center py-8">{LABELS.noDataYet}</p>
        )}
      </div>

      {/* Model Coverage */}
      <div className="bg-gray-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold mb-4">{LABELS.modelCoverage}</h3>
        {modelCoverage.length > 0 ? (
          <div className="flex items-center gap-8">
            <ResponsiveContainer width="50%" height={250}>
              <PieChart>
                <Pie data={modelCoverage} dataKey="count" nameKey="model" cx="50%" cy="50%" outerRadius={80} label={({ name }) => name}>
                  {modelCoverage.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: 8, color: '#fff' }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2">
              {modelCoverage.map((m, i) => (
                <div key={m.model} className="flex items-center gap-2 text-sm">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span>{m.model}: {m.count} {LABELS.shifts}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-gray-400 text-center py-8">{LABELS.noDataYet}</p>
        )}
      </div>
    </div>
  );
}
