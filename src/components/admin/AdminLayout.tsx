import {
  LayoutDashboard,
  Calendar,
  Users,
  Copy,
  Database,
  Bell,
  AlertTriangle,
  BarChart3,
  LogOut,
} from 'lucide-react';
import { LABELS, cn } from '../../lib/utils';

interface AdminLayoutProps {
  children: React.ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onLogout: () => void;
  errorCount?: number;
  adminName?: string | null;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
}

export function AdminLayout({
  children,
  activeTab,
  onTabChange,
  onLogout,
  errorCount = 0,
  adminName,
}: AdminLayoutProps) {
  const navItems: NavItem[] = [
    {
      id: 'dashboard',
      label: LABELS.dashboard,
      icon: <LayoutDashboard size={20} />,
    },
    {
      id: 'schedule',
      label: LABELS.schedule,
      icon: <Calendar size={20} />,
    },
    {
      id: 'chatters',
      label: LABELS.chatters,
      icon: <Users size={20} />,
    },
    {
      id: 'templates',
      label: LABELS.templates,
      icon: <Copy size={20} />,
    },
    {
      id: 'models',
      label: LABELS.models,
      icon: <Database size={20} />,
    },
    {
      id: 'reminders',
      label: LABELS.reminders,
      icon: <Bell size={20} />,
    },
    {
      id: 'errors',
      label: LABELS.errors,
      icon: <AlertTriangle size={20} />,
      badge: errorCount,
    },
    {
      id: 'analytics',
      label: LABELS.analytics,
      icon: <BarChart3 size={20} />,
    },
  ];

  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden" dir="rtl">
      {/* Sidebar */}
      <aside className="flex flex-col w-64 bg-gray-900 border-l border-gray-800 shrink-0">
        {/* Logo / Brand */}
        <div className="px-6 py-5 border-b border-gray-800">
          <h1 className="text-xl font-bold text-white tracking-tight">ShiftPro</h1>
          <p className="text-xs text-gray-500 mt-0.5">ניהול משמרות</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 text-right',
                  isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                )}
              >
                <span
                  className={cn(
                    'shrink-0',
                    isActive ? 'text-white' : 'text-gray-500'
                  )}
                >
                  {item.icon}
                </span>
                <span className="flex-1">{item.label}</span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="shrink-0 min-w-[20px] h-5 px-1.5 flex items-center justify-center bg-red-600 text-white text-xs font-bold rounded-full">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Admin name + Logout */}
        <div className="px-3 py-4 border-t border-gray-800 space-y-2">
          {adminName && (
            <div className="px-3 py-1.5 text-xs text-gray-500 truncate">
              {adminName}
            </div>
          )}
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-red-400 hover:bg-gray-800 transition-all duration-150"
          >
            <LogOut size={20} className="shrink-0" />
            <span>{LABELS.logout}</span>
          </button>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-y-auto bg-gray-950">
        {children}
      </main>
    </div>
  );
}
