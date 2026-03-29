import React from 'react';

interface ChatterLayoutProps {
  chatterName: string;
  children: React.ReactNode;
}

export function ChatterLayout({ chatterName, children }: ChatterLayoutProps) {
  return (
    <div className="min-h-screen bg-gray-950 text-white" dir="rtl">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <span className="text-sm text-gray-400">{chatterName}</span>
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
