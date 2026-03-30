import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { callEdgeFunction } from '../lib/supabase';
import type { ChatterSession } from '../lib/types';
import { LABELS } from '../lib/utils';
import { LogIn, User } from 'lucide-react';

type LoginTab = 'chatter' | 'admin';

const SESSION_KEY = 'shiftpro-chatter-session';

export function LoginPage() {
  const navigate = useNavigate();
  const { signIn, loading: authLoading } = useAdminAuth();

  const [activeTab, setActiveTab] = useState<LoginTab>('chatter');

  // Admin form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Chatter form state
  const [chatterName, setChatterName] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleAdminSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const { error: authError } = await signIn(email.trim(), password);
    setSubmitting(false);

    if (authError) {
      setError(authError);
    } else {
      navigate('/admin', { replace: true });
    }
  };

  const handleChatterSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmed = chatterName.trim();
    if (!trimmed) {
      setError('נא להזין שם');
      return;
    }

    setSubmitting(true);

    const result = await callEdgeFunction<{ id: string; name: string; token: string }>(
      'chatter-login',
      {
        method: 'POST',
        body: JSON.stringify({ name: trimmed }),
      }
    );

    setSubmitting(false);

    if (!result.success || !result.data) {
      setError(result.error ?? 'הצ\'אטר לא נמצא במערכת. פנה למנהל.');
      return;
    }

    // Save session to localStorage
    const session: ChatterSession = {
      chatterId: result.data.id,
      chatterName: result.data.name,
      token: result.data.token,
      loggedInAt: Date.now(),
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));

    navigate('/shift', { replace: true });
  };

  const switchTab = (tab: LoginTab) => {
    setActiveTab(tab);
    setError(null);
  };

  return (
    <div
      className="min-h-screen bg-gray-950 flex items-center justify-center px-4"
      dir="rtl"
    >
      <div className="w-full max-w-sm">
        {/* Logo / title */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white tracking-tight">ShiftPro</h1>
          <p className="text-sm text-gray-400 mt-1">ניהול משמרות</p>
        </div>

        {/* Card */}
        <div className="bg-gray-900 rounded-2xl border border-gray-800 shadow-xl overflow-hidden">
          {/* Tab buttons */}
          <div className="flex border-b border-gray-800">
            <button
              type="button"
              onClick={() => switchTab('chatter')}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                activeTab === 'chatter'
                  ? 'text-white bg-gray-800/50 border-b-2 border-blue-500'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              <User size={14} className="inline-block ml-1.5 -mt-0.5" />
              כניסת צ׳אטר
            </button>
            <button
              type="button"
              onClick={() => switchTab('admin')}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                activeTab === 'admin'
                  ? 'text-white bg-gray-800/50 border-b-2 border-blue-500'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              <LogIn size={14} className="inline-block ml-1.5 -mt-0.5" />
              כניסת מנהל
            </button>
          </div>

          <div className="p-8">
            {activeTab === 'chatter' ? (
              /* Chatter Login Form */
              <form onSubmit={handleChatterSubmit} className="space-y-5" noValidate>
                <div>
                  <label
                    htmlFor="chatter-name"
                    className="block text-sm font-medium text-gray-300 mb-1.5"
                  >
                    שם מלא
                  </label>
                  <input
                    id="chatter-name"
                    type="text"
                    autoComplete="name"
                    required
                    value={chatterName}
                    onChange={(e) => setChatterName(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 text-white placeholder-gray-500 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                    placeholder="הכנס את שמך המלא"
                  />
                </div>

                {error && (
                  <div className="bg-red-900/30 border border-red-700/50 text-red-400 rounded-lg px-4 py-3 text-sm">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
                >
                  <User size={16} />
                  {submitting ? 'מתחבר...' : 'כניסה'}
                </button>
              </form>
            ) : (
              /* Admin Login Form */
              <form onSubmit={handleAdminSubmit} className="space-y-5" noValidate>
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-gray-300 mb-1.5"
                  >
                    אימייל
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 text-white placeholder-gray-500 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                    placeholder="admin@example.com"
                  />
                </div>

                <div>
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium text-gray-300 mb-1.5"
                  >
                    סיסמה
                  </label>
                  <input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 text-white placeholder-gray-500 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                    placeholder="••••••••"
                  />
                </div>

                {error && (
                  <div className="bg-red-900/30 border border-red-700/50 text-red-400 rounded-lg px-4 py-3 text-sm">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting || authLoading}
                  className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
                >
                  <LogIn size={16} />
                  {submitting ? 'מתחבר...' : LABELS.login}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
