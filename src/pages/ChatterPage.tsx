import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChatterAuth } from '../hooks/useChatterAuth';
import { useToast } from '../hooks/useToast';
import { ChatterLayout } from '../components/chatter/ChatterLayout';
import { MySchedule } from '../components/chatter/MySchedule';
import { AvailableShifts } from '../components/chatter/AvailableShifts';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { ToastContainer } from '../components/shared/ToastContainer';
import { LABELS } from '../lib/utils';
import { AlertCircle } from 'lucide-react';

export function ChatterPage() {
  const navigate = useNavigate();
  const { chatter, shifts, availableShifts, loading, error, token, refetch, logout } =
    useChatterAuth();
  const { toasts, dismissToast } = useToast();

  // If no auth at all, redirect to login
  useEffect(() => {
    if (!loading && error === 'NO_AUTH') {
      navigate('/login', { replace: true });
    }
  }, [loading, error, navigate]);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const handleRefetch = async () => {
    await refetch();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error === 'NO_AUTH') {
    // Will redirect via useEffect above
    return null;
  }

  if (error || !chatter) {
    return (
      <div
        className="min-h-screen bg-gray-950 flex items-center justify-center px-4"
      >
        <div className="max-w-sm w-full text-center space-y-3">
          <AlertCircle size={40} className="text-red-500 mx-auto" />
          <p className="text-red-400 text-sm">
            {error ?? LABELS.cannotVerifyLink}
          </p>
          <button
            onClick={() => navigate('/login', { replace: true })}
            className="text-blue-400 hover:text-blue-300 text-sm underline"
          >
            {LABELS.backToLogin}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <ChatterLayout chatterName={chatter.name} onLogout={handleLogout}>
        {/* My Shifts */}
        <div className="mb-4">
          <h2 className="text-lg font-bold text-white">{LABELS.myShifts}</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {LABELS.scheduled} · {LABELS.active} · {LABELS.completed}
          </p>
        </div>

        <MySchedule
          shifts={shifts}
          token={token}
          onRefetch={handleRefetch}
        />

        {/* Available Shifts */}
        <div className="mt-10 mb-4">
          <h2 className="text-lg font-bold text-white">{LABELS.availableShifts}</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {LABELS.openShiftsForSignup}
          </p>
        </div>

        <AvailableShifts
          shifts={availableShifts}
          token={token}
          onRefetch={handleRefetch}
        />
      </ChatterLayout>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}
