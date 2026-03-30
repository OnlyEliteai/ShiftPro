import type React from 'react';
import { LogOut } from 'lucide-react';

interface ChatterLayoutProps {
  chatterName: string;
  onLogout?: () => void;
  children: React.ReactNode;
}

export function ChatterLayout({ chatterName, onLogout, children }: ChatterLayoutProps) {
  return (
    <div className="min-h-screen bg-gray-950 text-white" dir="rtl">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400">{chatterName}</span>
            {onLogout && (
              <button
                onClick={onLogout}
                className="text-gray-500 hover:text-gray-300 transition-colors"
                title="יציאה"
              >
                <LogOut size={16} />
              </button>
            )}
          </div>
          <span className="text-lg font-bold text-white tracking-tight">ShiftPro</span>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-md mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  );
}
