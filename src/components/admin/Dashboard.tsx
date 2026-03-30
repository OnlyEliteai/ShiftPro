import {
  Users,
  Calendar,
  Activity,
  TrendingUp,
  AlertTriangle,
  Wifi,
} from 'lucide-react';
import { LABELS, cn } from '../../lib/utils';

interface DashboardStats {
  totalChatters: number;
  activeChatters: number;
  todayShifts: number;
  currentlyOnShift: number;
  attendanceRate: number;
  missedRate: number;
}

interface DashboardProps {
  stats: DashboardStats;
}

interface StatCard {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  accent: string;
  extra?: React.ReactNode;
}

export function Dashboard({ stats }: DashboardProps) {
  const cards: StatCard[] = [
    {
      label: LABELS.chatters,
      value: stats.totalChatters,
      icon: <Users size={22} />,
      accent: 'text-blue-400',
    },
    {
      label: LABELS.activeChatters,
      value: stats.activeChatters,
      icon: <Wifi size={22} />,
      accent: 'text-green-400',
      extra: (
        <span className="flex items-center gap-1.5 text-xs text-green-400">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
          {LABELS.active}
        </span>
      ),
    },
    {
      label: LABELS.todayShifts,
      value: stats.todayShifts,
      icon: <Calendar size={22} />,
      accent: 'text-purple-400',
    },
    {
      label: LABELS.currentlyOnShift,
      value: stats.currentlyOnShift,
      icon: <Activity size={22} />,
      accent: 'text-yellow-400',
    },
    {
      label: LABELS.attendanceRate,
      value: `${stats.attendanceRate}%`,
      icon: <TrendingUp size={22} />,
      accent:
        stats.attendanceRate >= 80
          ? 'text-green-400'
          : stats.attendanceRate >= 60
          ? 'text-yellow-400'
          : 'text-red-400',
    },
    {
      label: LABELS.missedRate,
      value: `${stats.missedRate}%`,
      icon: <AlertTriangle size={22} />,
      accent:
        stats.missedRate <= 10
          ? 'text-green-400'
          : stats.missedRate <= 25
          ? 'text-yellow-400'
          : 'text-red-400',
    },
  ];

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white">{LABELS.dashboard}</h2>
        <p className="text-sm text-gray-400 mt-1">{LABELS.overviewSubtitle}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="bg-gray-800 rounded-xl p-5 flex flex-col gap-3 border border-gray-700/50 hover:border-gray-600 transition-colors"
          >
            {/* Icon + label */}
            <div className="flex items-center justify-between">
              <span className={cn('p-2 rounded-lg bg-gray-900/60', card.accent)}>
                {card.icon}
              </span>
              {card.extra}
            </div>

            {/* Value */}
            <div>
              <p className="text-3xl font-bold text-white leading-none">{card.value}</p>
              <p className="text-sm text-gray-400 mt-1">{card.label}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
