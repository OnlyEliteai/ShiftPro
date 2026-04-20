import { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface WeeklyPlatformRow {
  label: string;
  telegram: number;
  onlyfans: number;
}

interface ModelCoverageRow {
  model: string;
  shifts: number;
}

interface PlatformsTabProps {
  weeklyPlatform: WeeklyPlatformRow[];
  modelCoverage: ModelCoverageRow[];
  isMobile: boolean;
}

export function PlatformsTab({ weeklyPlatform, modelCoverage, isMobile }: PlatformsTabProps) {
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

  const sortedCoverage = useMemo(() => {
    const copy = [...modelCoverage];
    copy.sort((a, b) => (sortDir === 'desc' ? b.shifts - a.shifts : a.shifts - b.shifts));
    return copy;
  }, [modelCoverage, sortDir]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <section className="rounded-xl border border-gray-800 bg-gray-900 p-3">
        <h3 className="mb-3 text-sm font-semibold text-white">הכנסות לפי פלטפורמה (שבועי)</h3>
        {weeklyPlatform.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-400">אין נתונים לטווח הזה</p>
        ) : (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyPlatform} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="label" tick={{ fill: '#9ca3af', fontSize: isMobile ? 10 : 12 }} reversed />
                <YAxis tick={{ fill: '#9ca3af', fontSize: isMobile ? 10 : 12 }} />
                <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 10 }} />
                <Legend />
                <Bar dataKey="telegram" stackId="a" fill="#3b82f6" name="Telegram" />
                <Bar dataKey="onlyfans" stackId="a" fill="#f97316" name="OnlyFans" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-gray-800 bg-gray-900 p-3">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">כיסוי מודלים</h3>
          <button
            type="button"
            onClick={() => setSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
            className="rounded-md border border-gray-700 px-2 py-1 text-xs text-gray-200"
          >
            מיין: {sortDir === 'desc' ? 'גבוה לנמוך' : 'נמוך לגבוה'}
          </button>
        </div>

        {sortedCoverage.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">אין נתונים לטווח הזה</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400">
                  <th className="py-2 text-start font-medium">מודל</th>
                  <th className="py-2 text-start font-medium">מס׳ משמרות</th>
                </tr>
              </thead>
              <tbody>
                {sortedCoverage.map((row) => (
                  <tr key={row.model} className="border-b border-gray-900">
                    <td className="py-2 text-white">{row.model}</td>
                    <td className="py-2 text-white">{row.shifts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
