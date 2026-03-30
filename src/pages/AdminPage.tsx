import { useEffect, useState, useCallback } from 'react';
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
import { TemplateManager } from '../components/admin/TemplateManager';
import { ReminderLog } from '../components/admin/ReminderLog';
import { ErrorLog } from '../components/admin/ErrorLog';
import { Analytics } from '../components/admin/Analytics';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { ToastContainer } from '../components/shared/ToastContainer';
import type { Shift, ShiftWithChatter, Chatter } from '../lib/types';

// ─── Form data type that ShiftEditor returns via onSave ───────────────────────

interface ShiftFormData {
  chatter_id: string;
  date: string;
  start_time: string;
  end_time: string;
  model: string;
  platform: string;
  status: Shift['status'];
}

// ─── Admin tabs ───────────────────────────────────────────────────────────────

type Tab =
  | 'dashboard'
  | 'schedule'
  | 'chatters'
  | 'templates'
  | 'models'
  | 'reminders'
  | 'errors'
  | 'analytics';

// ─── AdminPage ────────────────────────────────────────────────────────────────

export function AdminPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading, signOut } = useAdminAuth();
  const { shifts, createShift, updateShift, deleteShift } = useShifts();
  const { chatters, createChatter, updateChatter, deleteChatter, toggleActive } = useChatters();
  const { stats, loading: analyticsLoading } = useAnalytics();
  const { models, createModel, toggleModelActive, deleteModel } = useModels();
  const { toasts, showToast, dismissToast } = useToast();

  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  // Schedule tab state
  const [weekOffset, setWeekOffset] = useState(0);
  const [editingShift, setEditingShift] = useState<Shift | undefined>(undefined);
  const [editorDate, setEditorDate] = useState<string | undefined>(undefined);
  const [showEditor, setShowEditor] = useState(false);

  // Unresolved error count for badge
  const unresolvedErrorCount = 0; // updated dynamically by ErrorLog internally; start at 0

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

  const openAddShift = useCallback((date: string) => {
    setEditingShift(undefined);
    setEditorDate(date);
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
  }, []);

  const handleSaveShift = useCallback(
    async (formData: ShiftFormData) => {
      if (editingShift) {
        const { error } = await updateShift(editingShift.id, formData);
        if (error) showToast('error', error);
        else {
          showToast('success', 'המשמרת עודכנה');
          closeEditor();
        }
      } else {
        const { error } = await createShift(formData);
        if (error) showToast('error', error);
        else {
          showToast('success', 'המשמרת נוספה');
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
      showToast('success', 'המשמרת נמחקה');
      closeEditor();
    }
  }, [editingShift, deleteShift, showToast, closeEditor]);

  // ── Chatter callbacks ───────────────────────────────────────────────────────

  // ChatterManager uses sync callbacks — fire-and-forget with toast feedback
  const handleAddChatter = useCallback(
    (name: string, phone: string) => {
      createChatter(name, phone).then(({ error }) => {
        if (error) showToast('error', error);
      });
    },
    [createChatter, showToast]
  );

  const handleUpdateChatter = useCallback(
    (id: string, data: Partial<Chatter>) => {
      updateChatter(id, data).then(({ error }) => {
        if (error) showToast('error', error);
      });
    },
    [updateChatter, showToast]
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
        return analyticsLoading ? <LoadingSpinner /> : <Dashboard stats={stats} />;

      case 'schedule':
        return (
          <WeeklyGrid
            shifts={shifts as ShiftWithChatter[]}
            chatters={chatters}
            weekOffset={weekOffset}
            onWeekChange={setWeekOffset}
            onAddShift={openAddShift}
            onEditShift={openEditShift}
          />
        );

      case 'chatters':
        return (
          <ChatterManager
            chatters={chatters}
            onAdd={handleAddChatter}
            onUpdate={handleUpdateChatter}
            onDelete={handleDeleteChatter}
            onToggleActive={handleToggleActive}
          />
        );

      case 'templates':
        return <TemplateManager chatters={chatters} />;

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
        return <Analytics />;

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
      >
        {renderContent()}
      </AdminLayout>

      {showEditor && (
        <ShiftEditor
          shift={editingShift}
          chatters={chatters}
          models={models}
          date={editorDate}
          onSave={handleSaveShift}
          onDelete={editingShift ? handleDeleteShift : undefined}
          onClose={closeEditor}
        />
      )}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}
