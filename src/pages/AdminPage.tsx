import { useEffect, useState, useCallback, useMemo, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { useShifts } from '../hooks/useShifts';
import { useChatters } from '../hooks/useChatters';
import { useModels } from '../hooks/useModels';
import { useToast } from '../hooks/useToast';
import { AdminLayout } from '../components/admin/AdminLayout';
import { Dashboard } from '../components/admin/Dashboard';
import { WeeklyGrid } from '../components/admin/WeeklyGrid';
import { ShiftEditor } from '../components/admin/ShiftEditor';
import { ChatterManager } from '../components/admin/ChatterManager';
import { ModelManager } from '../components/admin/ModelManager';
import { AdminApproval } from '../components/admin/AdminApproval';
import { ReminderLog } from '../components/admin/ReminderLog';
import { ErrorLog } from '../components/admin/ErrorLog';
import { MonthlyGoalsSection } from '../components/admin/MonthlyGoalsSection';
import { AdminExportPanel } from '../components/admin/AdminExportPanel';
const Analytics = lazy(() => import('../components/admin/Analytics').then(m => ({ default: m.Analytics })));
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { ToastContainer } from '../components/shared/ToastContainer';
import type { Shift, ShiftWithChatter } from '../lib/types';
import { LABELS, getWeekDates } from '../lib/utils';
import { SUPABASE_URL, supabase } from '../lib/supabase';

// ─── Form data type that ShiftEditor returns via onSave ───────────────────────

interface ShiftFormData {
  chatter_id: string;
  date: string;
  shift_type: 'morning' | 'evening';
  start_time: string;
  end_time: string;
  model: string;
  model_id: string;
  platform: 'telegram' | 'onlyfans' | null;
  status: Shift['status'];
}

interface BroadcastMessageResponse {
  success?: boolean;
  error?: string;
  sent?: number;
  failed?: number;
  total_recipients?: number;
  data?: {
    sent?: number;
    failed?: number;
    total_recipients?: number;
  };
}

// ─── Admin tabs ───────────────────────────────────────────────────────────────

type Tab =
  | 'dashboard'
  | 'schedule'
  | 'approval'
  | 'chatters'
  | 'models'
  | 'reminders'
  | 'errors'
  | 'analytics';

// ─── AdminPage ────────────────────────────────────────────────────────────────

export function AdminPage() {
  const navigate = useNavigate();
  const { user, profile, loading: authLoading, signOut } = useAdminAuth();
  const { shifts, loading: shiftsLoading, fetchShifts, createShift, updateShift, deleteShift } = useShifts();
  const { chatters, loading: chattersLoading, createChatter, deleteChatter, toggleActive } = useChatters();
  const { models, createModel, toggleModelActive, deleteModel } = useModels();
  const { toasts, showToast, dismissToast } = useToast();

  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  // Schedule tab state
  const [weekOffset, setWeekOffset] = useState(0);
  const [editingShift, setEditingShift] = useState<Shift | undefined>(undefined);
  const [editorDate, setEditorDate] = useState<string | undefined>(undefined);
  const [editorShiftType, setEditorShiftType] = useState<'morning' | 'evening'>('morning');
  const [showEditor, setShowEditor] = useState(false);

  // Unresolved error count for badge
  const unresolvedErrorCount = 0;
  const pendingCount = useMemo(
    () => shifts.filter((shift) => shift.status === 'pending').length,
    [shifts]
  );
  const dashboardStats = useMemo(() => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const thirtyDaysAgoDate = new Date(now);
    thirtyDaysAgoDate.setDate(now.getDate() - 30);
    const thirtyDaysAgo = thirtyDaysAgoDate.toISOString().split('T')[0];

    const totalChatters = chatters.filter((chatter) => chatter.active).length;
    const currentlyOnShift = shifts.filter(
      (shift) => shift.date === today && shift.status === 'active'
    ).length;
    const todayShifts = shifts.filter(
      (shift) => shift.date === today && ['scheduled', 'active', 'completed'].includes(shift.status)
    ).length;

    const trackedWindow = shifts.filter((shift) => shift.date >= thirtyDaysAgo);
    const completed = trackedWindow.filter((shift) => shift.status === 'completed').length;
    const missed = trackedWindow.filter((shift) => shift.status === 'missed').length;
    const trackedTotal = completed + missed;

    return {
      totalChatters,
      currentlyOnShift,
      todayShifts,
      attendanceRate: trackedTotal > 0 ? Math.round((completed / trackedTotal) * 100) : 0,
      missRate: trackedTotal > 0 ? Math.round((missed / trackedTotal) * 100) : 0,
      pendingApprovals: pendingCount,
    };
  }, [chatters, shifts, pendingCount]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/login', { replace: true });
    }
  }, [user, authLoading, navigate]);

  const handleLogout = useCallback(async () => {
    await signOut();
    navigate('/login', { replace: true });
  }, [signOut, navigate]);

  const handleBroadcastMessage = useCallback(
    async (message: string): Promise<{ sent: number; failed: number; total_recipients: number }> => {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) {
        throw new Error('לא ניתן לאמת מנהל כרגע');
      }

      const response = await fetch(`${SUPABASE_URL}/functions/v1/broadcast-message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ message }),
      });

      const payload = (await response.json().catch(() => ({}))) as BroadcastMessageResponse;
      if (!response.ok || payload.success === false) {
        throw new Error(payload.error || 'שגיאה בשליחת ההודעה');
      }

      const result = payload.data ?? payload;
      return {
        sent: Number(result.sent ?? 0),
        failed: Number(result.failed ?? 0),
        total_recipients: Number(result.total_recipients ?? 0),
      };
    },
    []
  );

  // ── Schedule callbacks ──────────────────────────────────────────────────────

  const openAddShift = useCallback((date: string, shiftType: 'morning' | 'evening') => {
    setEditingShift(undefined);
    setEditorDate(date);
    setEditorShiftType(shiftType);
    setShowEditor(true);
  }, []);

  const openEditShift = useCallback((shift: Shift) => {
    setEditingShift(shift);
    setEditorDate(undefined);
    setShowEditor(true);
  }, []);

  const closeEditor = useCallback(() => {
    setShowEditor(false);
    setEditingShift(undefined);
    setEditorDate(undefined);
    setEditorShiftType('morning');
  }, []);

  const handleSaveShift = useCallback(
    async (formData: ShiftFormData) => {
      const payload = {
        chatter_id: formData.chatter_id,
        date: formData.date,
        start_time: formData.start_time,
        end_time: formData.end_time,
        model: formData.model,
        model_id: formData.model_id,
        platform: formData.platform,
        status: formData.status,
      };
      if (editingShift) {
        const { error } = await updateShift(editingShift.id, payload);
        if (error) showToast('error', error);
        else {
          showToast('success', LABELS.shiftUpdated);
          closeEditor();
        }
      } else {
        const { error } = await createShift(payload);
        if (error) showToast('error', error);
        else {
          showToast('success', LABELS.shiftAdded);
          closeEditor();
        }
      }
    },
    [editingShift, createShift, updateShift, showToast, closeEditor]
  );

  const handleDeleteShift = useCallback(async () => {
    if (!editingShift) return;
    const { error } = await deleteShift(editingShift.id);
    if (error) showToast('error', error);
    else {
      showToast('success', LABELS.shiftDeleted);
      closeEditor();
    }
  }, [editingShift, deleteShift, showToast, closeEditor]);

  // ── Chatter callbacks ───────────────────────────────────────────────────────

  const handleAddChatter = useCallback(
    (name: string, phone: string) => {
      createChatter(name, phone).then(({ error }) => {
        if (error) showToast('error', error);
      });
    },
    [createChatter, showToast]
  );

  const handleDeleteChatter = useCallback(
    (id: string) => {
      deleteChatter(id).then(({ error }) => {
        if (error) showToast('error', error);
      });
    },
    [deleteChatter, showToast]
  );

  const handleToggleActive = useCallback(
    (id: string, active: boolean) => {
      toggleActive(id, active).then(({ error }) => {
        if (error) showToast('error', error);
      });
    },
    [toggleActive, showToast]
  );

  // ── Loading / auth guard ────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (!user) return null;

  // ── Tab content ─────────────────────────────────────────────────────────────

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return shiftsLoading || chattersLoading ? (
          <LoadingSpinner />
        ) : (
          <div className="p-4 sm:p-6">
            <Dashboard
              stats={dashboardStats}
              onPendingApprovalsClick={() => setActiveTab('approval')}
            />
            <MonthlyGoalsSection chatters={chatters} showToast={showToast} />
            <AdminExportPanel showToast={showToast} />
          </div>
        );

      case 'schedule':
        return (
          <WeeklyGrid
            shifts={shifts as ShiftWithChatter[]}
            weekOffset={weekOffset}
            onWeekChange={setWeekOffset}
            onAddShift={openAddShift}
            onEditShift={openEditShift}
            showToast={showToast}
          />
        );

      case 'approval':
        return (
          <AdminApproval
            models={models.filter((m) => m.active)}
            shifts={shifts}
            showToast={showToast}
            onRefreshShifts={fetchShifts}
          />
        );

      case 'chatters':
        return (
          <ChatterManager
            chatters={chatters}
            onAdd={handleAddChatter}
            onDelete={handleDeleteChatter}
            onToggleActive={handleToggleActive}
          />
        );

      case 'models':
        return (
          <ModelManager
            models={models}
            onCreateModel={createModel}
            onToggleActive={toggleModelActive}
            onDeleteModel={deleteModel}
          />
        );

      case 'reminders':
        return <ReminderLog />;

      case 'errors':
        return <ErrorLog />;

      case 'analytics':
        return <Suspense fallback={<LoadingSpinner />}><Analytics /></Suspense>;

      default:
        return null;
    }
  };

  return (
    <>
      <AdminLayout
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab as Tab)}
        onLogout={handleLogout}
        onBroadcastMessage={handleBroadcastMessage}
        showToast={showToast}
        errorCount={unresolvedErrorCount}
        pendingCount={pendingCount}
        adminName={profile?.display_name ?? profile?.email ?? null}
      >
        {renderContent()}
      </AdminLayout>

      {showEditor && (
        <ShiftEditor
          shift={editingShift}
          chatters={chatters}
          models={models}
          date={editorDate}
          shiftType={editorShiftType}
          availableDates={getWeekDates(weekOffset)}
          existingShifts={shifts as Shift[]}
          onSave={handleSaveShift}
          onDelete={editingShift ? handleDeleteShift : undefined}
          onClose={closeEditor}
        />
      )}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}
