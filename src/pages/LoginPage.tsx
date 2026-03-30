import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { LABELS } from '../lib/utils';
import { LogIn } from 'lucide-react';

export function LoginPage() {
  const navigate = useNavigate();
  const { signIn, loading } = useAdminAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
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
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-8 shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {/* Email */}
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

            {/* Password */}
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

            {/* Error message */}
            {error && (
              <div className="bg-red-900/30 border border-red-700/50 text-red-400 rounded-lg px-4 py-3 text-sm">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting || loading}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
            >
              <LogIn size={16} />
              {submitting ? 'מתחבר...' : LABELS.login}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
