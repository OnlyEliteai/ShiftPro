import { useEffect, useState, useCallback, useMemo, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { useShifts } from '../hooks/useShifts';
import { useChatters } from '../hooks/useChatters';
import { useAnalytics } from '../hooks/useAnalytics';
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
const Analytics = lazy(() => import('../components/admin/Analytics').then(m => ({ default: m.Analytics })));
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { ToastContainer } from '../components/shared/ToastContainer';
import type { Shift, ShiftWithChatter } from '../lib/types';
import { LABELS, getWeekDates } from '../lib/utils';

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
  const { shifts, createShift, updateShift, deleteShift } = useShifts();
  const { chatters, createChatter, deleteChatter, toggleActive } = useChatters();
  const { stats, loading: analyticsLoading } = useAnalytics();
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
        return analyticsLoading ? (
          <LoadingSpinner />
        ) : (
          <div className="p-4 sm:p-6">
            <Dashboard stats={stats} />
            <MonthlyGoalsSection chatters={chatters} showToast={showToast} />
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
        return <AdminApproval models={models.filter((m) => m.active)} />;

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
