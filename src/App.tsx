import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { AdminPage } from './pages/AdminPage';
import { ChatterPage } from './pages/ChatterPage';

function RootRedirect() {
  // Check for chatter session in localStorage
  try {
    const raw = localStorage.getItem('shiftpro-chatter-session');
    if (raw) {
      const session = JSON.parse(raw);
      const maxAge = 12 * 60 * 60 * 1000;
      if (Date.now() - session.loggedInAt < maxAge) {
        return <Navigate to="/shift" replace />;
      }
    }
  } catch {
    // ignore
  }

  // No chatter session — try admin (Supabase auth state is async,
  // so we just redirect to login and let AdminPage/LoginPage handle it)
  return <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/shift" element={<ChatterPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
