import { useState, useMemo } from 'react';
import {
  LayoutDashboard,
  Calendar,
  Users,
  ClipboardCheck,
  Database,
  Bell,
  AlertTriangle,
  BarChart3,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { LABELS, cn } from '../../lib/utils';

interface AdminLayoutProps {
  children: React.ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onLogout: () => void;
  errorCount?: number;
  pendingCount?: number;
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
  pendingCount = 0,
  adminName,
}: AdminLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems: NavItem[] = useMemo(() => [
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
      id: 'approval',
      label: LABELS.approval,
      icon: <ClipboardCheck size={20} />,
      badge: pendingCount,
    },
    {
      id: 'chatters',
      label: LABELS.chatters,
      icon: <Users size={20} />,
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
  ], [pendingCount, errorCount]);

  // Bottom nav shows a subset of important items on mobile
  const bottomNavItems = useMemo(() => navItems.slice(0, 5), [navItems]);

  const handleTabChange = (tab: string) => {
    onTabChange(tab);
    setMobileMenuOpen(false);
  };

  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden">
      {/* Desktop Sidebar — hidden on mobile */}
      <aside className="hidden lg:flex flex-col w-64 bg-gray-900 border-l border-gray-800 shrink-0">
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
                onClick={() => handleTabChange(item.id)}
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

      {/* Mobile Header — visible on < lg */}
      <div className="lg:hidden fixed top-0 inset-x-0 z-30 bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-white tracking-tight">ShiftPro</h1>
        </div>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
        >
          {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile Slide-down Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-20 bg-black/60" onClick={() => setMobileMenuOpen(false)}>
          <div
            className="absolute top-[52px] inset-x-0 bg-gray-900 border-b border-gray-800 px-3 py-3 space-y-1 max-h-[70vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleTabChange(item.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all duration-150 text-right',
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  )}
                >
                  <span className={cn('shrink-0', isActive ? 'text-white' : 'text-gray-500')}>
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
            <button
              onClick={onLogout}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium text-gray-400 hover:text-red-400 hover:bg-gray-800 transition-all duration-150"
            >
              <LogOut size={20} className="shrink-0" />
              <span>{LABELS.logout}</span>
            </button>
          </div>
        </div>
      )}

      {/* Mobile Bottom Nav */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-gray-900 border-t border-gray-800 flex pb-[env(safe-area-inset-bottom)]">
        {bottomNavItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleTabChange(item.id)}
              className={cn(
                'flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors relative',
                isActive ? 'text-blue-400' : 'text-gray-500'
              )}
            >
              <span className="relative">
                {item.icon}
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 flex items-center justify-center bg-red-600 text-white text-[9px] font-bold rounded-full">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </span>
              <span className="truncate max-w-[56px]">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Content */}
      <main className="flex-1 overflow-y-auto bg-gray-950 pt-[52px] pb-[60px] lg:pt-0 lg:pb-0">
        {children}
      </main>
    </div>
  );
}
