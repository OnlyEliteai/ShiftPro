import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { LABELS } from '../lib/utils';
import { LogIn } from 'lucide-react';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from '../components/shared/ToastContainer';

export function LoginPage() {
  const navigate = useNavigate();
  const { toasts, showToast, dismissToast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    async function checkExistingSession() {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) {
        setCheckingSession(false);
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profile?.role === 'admin') {
        navigate('/admin', { replace: true });
      } else if (profile?.role === 'chatter') {
        navigate('/shift', { replace: true });
      } else {
        await supabase.auth.signOut();
        setCheckingSession(false);
      }
    }

    checkExistingSession();
  }, [navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (authError || !data.user) {
      showToast('error', 'שם משתמש או סיסמה שגויים');
      setSubmitting(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, display_name')
      .eq('id', data.user.id)
      .single();

    if (profileError || !profile) {
      await supabase.auth.signOut();
      showToast('error', LABELS.noConnection);
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    if (profile.role === 'admin') {
      navigate('/admin', { replace: true });
      return;
    }

    if (profile.role === 'chatter') {
      navigate('/shift', { replace: true });
      return;
    }

    await supabase.auth.signOut();
    showToast('error', LABELS.noAdminPermission);
  };

  const inputClass =
    'w-full bg-gray-800 border border-gray-700 text-white placeholder-gray-500 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors';

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <p className="text-sm text-gray-400">{LABELS.connecting}</p>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-white tracking-tight">
              ShiftPro — מערכת ניהול משמרות
            </h1>
          </div>

          <div className="bg-gray-900 rounded-2xl border border-gray-800 shadow-xl overflow-hidden">
            <div className="p-8">
              <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-gray-300 mb-1.5"
                  >
                    {LABELS.email}
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputClass}
                    placeholder="name@example.com"
                  />
                </div>

                <div>
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium text-gray-300 mb-1.5"
                  >
                    {LABELS.password}
                  </label>
                  <input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputClass}
                    placeholder="••••••••"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold min-h-[48px] py-2.5 rounded-lg text-sm transition-colors"
                >
                  <LogIn size={16} />
                  {submitting ? LABELS.connecting : 'כניסה'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}
