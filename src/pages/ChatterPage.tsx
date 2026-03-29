import { useSearchParams } from 'react-router-dom';
import { useChatterAuth } from '../hooks/useChatterAuth';
import { useToast } from '../hooks/useToast';
import { ChatterLayout } from '../components/chatter/ChatterLayout';
import { MySchedule } from '../components/chatter/MySchedule';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { ToastContainer } from '../components/shared/ToastContainer';
import { LABELS } from '../lib/utils';
import { AlertCircle } from 'lucide-react';

export function ChatterPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const { chatter, shifts, loading, error, refetch } = useChatterAuth();
  const { toasts, showToast, dismissToast } = useToast();

  // Wrap refetch to show toast on success
  const handleRefetch = async () => {
    await refetch();
    // Toast is shown from ShiftCard on action completion — no extra toast needed here
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !chatter) {
    return (
      <div
        className="min-h-screen bg-gray-950 flex items-center justify-center px-4"
        dir="rtl"
      >
        <div className="max-w-sm w-full text-center space-y-3">
          <AlertCircle size={40} className="text-red-500 mx-auto" />
          <p className="text-red-400 text-sm">
            {error ?? 'לא ניתן לאמת את הקישור'}
          </p>
          {!token && (
            <p className="text-gray-500 text-xs">
              נא לפתוח את הקישור האישי שנשלח אליך
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <ChatterLayout chatterName={chatter.name}>
        <div className="mb-4">
          <h2 className="text-lg font-bold text-white">המשמרות שלי</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {LABELS.scheduled} · {LABELS.active} · {LABELS.completed}
          </p>
        </div>

        <MySchedule
          shifts={shifts}
          token={token}
          onRefetch={handleRefetch}
        />
      </ChatterLayout>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}
