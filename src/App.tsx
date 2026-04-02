import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { AdminPage } from './pages/AdminPage';
import { ChatterPage } from './pages/ChatterPage';
import { supabase } from './lib/supabase';
import { LoadingSpinner } from './components/shared/LoadingSpinner';

function RoleBasedHomeRedirect() {
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function resolveRoute() {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;

      if (!user) {
        if (mounted) setTarget('/login');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      if (!mounted) return;

      if (profile?.role === 'admin') {
        setTarget('/admin');
        return;
      }

      if (profile?.role === 'chatter') {
        setTarget('/shift');
        return;
      }

      await supabase.auth.signOut();
      if (mounted) setTarget('/login');
    }

    void resolveRoute();
    return () => {
      mounted = false;
    };
  }, []);

  if (!target) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return <Navigate to={target} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RoleBasedHomeRedirect />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/shift" element={<ChatterPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
