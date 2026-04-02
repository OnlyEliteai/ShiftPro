import {
  Users,
  Calendar,
  Activity,
  TrendingUp,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import { LABELS, cn } from '../../lib/utils';

interface DashboardStats {
  totalChatters: number;
  todayShifts: number;
  currentlyOnShift: number;
  attendanceRate: number;
  missRate: number;
  pendingApprovals: number;
}

interface DashboardProps {
  stats: DashboardStats;
  onPendingApprovalsClick: () => void;
}

interface StatCard {
  id: string;
  label: string;
  value: string | number;
  icon: React.ReactNode;
  accent: string;
  highlight?: boolean;
  pulse?: boolean;
  onClick?: () => void;
  extra?: React.ReactNode;
}

export function Dashboard({ stats, onPendingApprovalsClick }: DashboardProps) {
  const cards: StatCard[] = [
    {
      id: 'chatters',
      label: LABELS.chatters,
      value: stats.totalChatters,
      icon: <Users size={22} />,
      accent: 'text-blue-400',
    },
    {
      id: 'currentlyOnShift',
      label: LABELS.currentlyOnShift,
      value: stats.currentlyOnShift,
      icon: <Activity size={22} />,
      accent: 'text-green-400',
    },
    {
      id: 'todayShifts',
      label: LABELS.todayShifts,
      value: stats.todayShifts,
      icon: <Calendar size={22} />,
      accent: 'text-purple-400',
    },
    {
      id: 'attendanceRate',
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
      id: 'missRate',
      label: LABELS.missedRate,
      value: `${stats.missRate}%`,
      icon: <AlertTriangle size={22} />,
      accent:
        stats.missRate <= 10
          ? 'text-green-400'
          : stats.missRate <= 25
          ? 'text-yellow-400'
          : 'text-red-400',
    },
    {
      id: 'pendingApprovals',
      label: 'ממתינים לאישור',
      value: stats.pendingApprovals,
      icon: <Clock size={22} />,
      accent: 'text-yellow-300',
      highlight: stats.pendingApprovals > 0,
      pulse: stats.pendingApprovals > 0,
      onClick: onPendingApprovalsClick,
      extra: stats.pendingApprovals > 0 ? (
        <span className="flex items-center gap-1.5 text-xs text-yellow-300 font-semibold">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-300 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-300" />
          </span>
          חדש
        </span>
      ) : undefined,
    },
  ];

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white">{LABELS.dashboard}</h2>
        <p className="text-sm text-gray-400 mt-1">{LABELS.overviewSubtitle}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
        {cards.map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={card.onClick}
            disabled={!card.onClick}
            className={cn(
              'rounded-xl p-3 sm:p-4 flex flex-col gap-2 sm:gap-3 border transition-colors text-right',
              card.highlight
                ? 'bg-yellow-500/10 border-yellow-500/40 hover:border-yellow-400/60'
                : 'bg-gray-800 border-gray-700/50 hover:border-gray-600',
              card.onClick ? 'cursor-pointer' : 'cursor-default'
            )}
          >
            <div className="flex items-center justify-between">
              <span className={cn('p-2 rounded-lg bg-gray-900/60', card.accent)}>
                {card.icon}
              </span>
              {card.extra}
            </div>

            <div>
              <p className={cn('text-2xl sm:text-3xl font-bold text-white leading-none', card.pulse ? 'animate-pulse' : '')}>
                {card.value}
              </p>
              <p className="text-xs sm:text-sm text-gray-400 mt-1">{card.label}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
