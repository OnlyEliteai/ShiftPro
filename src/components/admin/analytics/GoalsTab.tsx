export interface GoalRow {
  chatterId: string;
  name: string;
  goal: number | null;
  achieved: number;
  pct: number | null;
}

interface GoalsTabProps {
  month: string;
  onMonthChange: (month: string) => void;
  rows: GoalRow[];
}

function rowClassName(row: GoalRow) {
  if (row.goal == null || row.pct == null) return '';
  if (row.pct >= 100) return 'bg-green-500/10';
  if (row.pct >= 70) return 'bg-yellow-500/10';
  return 'bg-gray-500/10';
}

function trendArrow(row: GoalRow) {
  if (row.goal == null || row.pct == null) return '—';
  if (row.pct >= 100) return '↗';
  if (row.pct >= 70) return '→';
  return '↘';
}

export function GoalsTab({ month, onMonthChange, rows }: GoalsTabProps) {
  const totalWithGoal = rows.filter((row) => row.goal != null).length;
  const metGoal = rows.filter((row) => row.goal != null && (row.pct ?? 0) >= 100).length;

  return (
    <div className="space-y-4 sm:space-y-6">
      <section className="rounded-xl border border-gray-800 bg-gray-900 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-gray-200">
            {metGoal} מתוך {totalWithGoal} צ׳אטרים עומדים ביעד החודש
          </p>
          <label className="text-sm text-gray-300">
            <span className="me-2">חודש</span>
            <input
              type="month"
              value={month}
              onChange={(event) => onMonthChange(event.target.value)}
              className="rounded-md border border-gray-700 bg-gray-800 px-2 py-1 text-white"
            />
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-gray-800 bg-gray-900 p-3">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400">
                <th className="py-2 text-start font-medium">צ׳אטר</th>
                <th className="py-2 text-start font-medium">יעד</th>
                <th className="py-2 text-start font-medium">מה השיג</th>
                <th className="py-2 text-start font-medium">%</th>
                <th className="py-2 text-start font-medium">מגמה</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.chatterId} className={`border-b border-gray-900 ${rowClassName(row)}`}>
                  <td className="py-2 text-white">{row.name}</td>
                  <td className="py-2 text-white">{row.goal == null ? '—' : `$${Math.round(row.goal)}`}</td>
                  <td className="py-2 text-white">${Math.round(row.achieved)}</td>
                  <td className="py-2 text-white">{row.pct == null ? '—' : `${Math.round(row.pct)}%`}</td>
                  <td className="py-2 text-white">{trendArrow(row)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-gray-400">אין נתונים לטווח הזה</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
