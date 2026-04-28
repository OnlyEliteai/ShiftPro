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
import type { Platform, Shift, ShiftWithChatter } from '../lib/types';
import { LABELS, getWeekDates } from '../lib/utils';
import { SUPABASE_URL, supabase } from '../lib/supabase';
import { isAdminPreviewMode } from '../lib/previewMode';

type AdminPreviewData = typeof import('../lib/adminPreviewData');

// ─── Form data type that ShiftEditor returns via onSave ───────────────────────

interface ShiftFormData {
  chatter_id: string;
  date: string;
  shift_type: 'morning' | 'evening';
  start_time: string;
  end_time: string;
  model: string;
  model_id: string;
  platform: Platform | null;
  selected_model_ids: string[];
  selected_platforms: Platform[];
  combinations: Array<{ model: string; model_id: string; platform: Platform }>;
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
  const previewMode = isAdminPreviewMode();
  const [previewData, setPreviewData] = useState<AdminPreviewData | null>(null);
  const { user, profile, loading: authLoading, signOut } = useAdminAuth();
  const { shifts, loading: shiftsLoading, fetchShifts, createShift, updateShift, deleteShift } = useShifts();
  const {
    chatters,
    loading: chattersLoading,
    createChatter,
    deleteChatter,
  } = useChatters();
  const { models, createModel, toggleModelActive, deleteModel } = useModels();
  const { toasts, showToast, dismissToast } = useToast();

  const [activeTab, setActiveTab] = useState<Tab>(previewMode ? 'schedule' : 'dashboard');

  // Schedule tab state
  const [weekOffset, setWeekOffset] = useState(0);
  const [editingShift, setEditingShift] = useState<Shift | undefined>(undefined);
  const [editorDate, setEditorDate] = useState<string | undefined>(undefined);
  const [editorShiftType, setEditorShiftType] = useState<'morning' | 'evening'>('morning');
  const [showEditor, setShowEditor] = useState(false);

  useEffect(() => {
    if (!import.meta.env.DEV || !previewMode) {
      setPreviewData(null);
      return;
    }

    let mounted = true;
    void import('../lib/adminPreviewData').then((data) => {
      if (mounted) setPreviewData(data);
    });

    return () => {
      mounted = false;
    };
  }, [previewMode]);

  // Unresolved error count for badge
  const unresolvedErrorCount = 0;
  const previewLoading = previewMode && !previewData;
  const visibleUser = previewMode
    ? previewData
      ? ({ id: previewData.previewAdminProfile.id } as typeof user)
      : null
    : user;
  const visibleProfile = previewMode ? (previewData?.previewAdminProfile ?? null) : profile;
  const visibleShifts = useMemo(
    () => (previewMode ? (previewData?.previewShifts ?? []) : shifts),
    [previewData, previewMode, shifts]
  );
  const visibleChatters = useMemo(
    () => (previewMode ? (previewData?.previewChatters ?? []) : chatters),
    [chatters, previewData, previewMode]
  );
  const visibleModels = useMemo(
    () => (previewMode ? (previewData?.previewModels ?? []) : models),
    [models, previewData, previewMode]
  );
  const visibleShiftsLoading = previewMode ? previewLoading : shiftsLoading;
  const visibleChattersLoading = previewMode ? previewLoading : chattersLoading;
  const pendingCount = useMemo(
    () => visibleShifts.filter((shift) => shift.status === 'pending').length,
    [visibleShifts]
  );
  const dashboardStats = useMemo(() => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const thirtyDaysAgoDate = new Date(now);
    thirtyDaysAgoDate.setDate(now.getDate() - 30);
    const thirtyDaysAgo = thirtyDaysAgoDate.toISOString().split('T')[0];

    const totalChatters = visibleChatters.filter((chatter) => chatter.active).length;
    const currentlyOnShift = visibleShifts.filter(
      (shift) => shift.date === today && shift.status === 'active'
    ).length;
    const todayShifts = visibleShifts.filter(
      (shift) => shift.date === today && ['scheduled', 'active', 'completed'].includes(shift.status)
    ).length;

    const trackedWindow = visibleShifts.filter((shift) => shift.date >= thirtyDaysAgo);
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
  }, [visibleChatters, visibleShifts, pendingCount]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!previewMode && !authLoading && !user) {
      navigate('/login', { replace: true });
    }
  }, [previewMode, user, authLoading, navigate]);

  const handleLogout = useCallback(async () => {
    if (previewMode) {
      navigate('/login', { replace: true });
      return;
    }

    await signOut();
    navigate('/login', { replace: true });
  }, [previewMode, signOut, navigate]);

  const handleBroadcastMessage = useCallback(
    async (message: string): Promise<{ sent: number; failed: number; total_recipients: number }> => {
      if (previewMode) {
        void message;
        return { sent: 2, failed: 0, total_recipients: 2 };
      }

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
    [previewMode]
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
      const combinations =
        formData.combinations.length > 0
          ? formData.combinations
          : formData.platform && formData.model_id
            ? [
                {
                  model: formData.model,
                  model_id: formData.model_id,
                  platform: formData.platform,
                },
              ]
            : [];

      if (combinations.length === 0) {
        showToast('error', 'יש לבחור לפחות מודל ופלטפורמה אחד');
        return;
      }

      const updatedAt = new Date().toISOString();
      const makeSelectionKey = (modelId: string, platform: Platform) => `${modelId}|${platform}`;
      const selectedKeys = new Set(
        combinations.map((combination) =>
          makeSelectionKey(combination.model_id, combination.platform)
        )
      );

      if (combinations.length === 1) {
        const [singleCombination] = combinations;
        const payload = {
          chatter_id: formData.chatter_id,
          date: formData.date,
          start_time: formData.start_time,
          end_time: formData.end_time,
          model: singleCombination.model,
          model_id: singleCombination.model_id,
          platform: singleCombination.platform,
          status: formData.status,
          updated_at: updatedAt,
        };

        if (editingShift) {
          const { error } = await updateShift(editingShift.id, payload);
          if (error) {
            showToast('error', error);
            return;
          }

          const { data: extraRows, error: extraRowsError } = await supabase
            .from('shifts')
            .select('id')
            .eq('chatter_id', formData.chatter_id)
            .eq('date', formData.date)
            .eq('start_time', formData.start_time)
            .eq('end_time', formData.end_time)
            .neq('id', editingShift.id);

          if (extraRowsError) {
            showToast('error', extraRowsError.message);
            return;
          }

          if (extraRows && extraRows.length > 0) {
            const { error: deleteError } = await supabase
              .from('shifts')
              .delete()
              .in('id', extraRows.map((row) => row.id));

            if (deleteError) {
              showToast('error', deleteError.message);
              return;
            }
          }

          showToast('success', LABELS.shiftUpdated);
          closeEditor();
          return;
        }

        const { error } = await createShift(payload);
        if (error) {
          showToast('error', error);
          return;
        }

        showToast('success', LABELS.shiftAdded);
        closeEditor();
        return;
      }

      const rowsToUpsert = combinations.map((combination) => ({
        chatter_id: formData.chatter_id,
        date: formData.date,
        start_time: formData.start_time,
        end_time: formData.end_time,
        model: combination.model,
        model_id: combination.model_id,
        platform: combination.platform,
        status: formData.status,
        updated_at: updatedAt,
      }));

      const { error: upsertError } = await supabase
        .from('shifts')
        .upsert(rowsToUpsert, {
          onConflict: 'chatter_id,date,start_time,end_time,model_id,platform',
        });

      if (upsertError) {
        showToast('error', upsertError.message);
        return;
      }

      const { data: windowRows, error: windowRowsError } = await supabase
        .from('shifts')
        .select('id, model_id, model, platform')
        .eq('chatter_id', formData.chatter_id)
        .eq('date', formData.date)
        .eq('start_time', formData.start_time)
        .eq('end_time', formData.end_time);

      if (windowRowsError) {
        showToast('error', windowRowsError.message);
        return;
      }

      const modelIdByName = new Map(
        visibleModels.map((model) => [model.name.trim().toLowerCase(), model.id])
      );

      const rowsToDelete = (windowRows ?? [])
        .filter((row) => {
          const resolvedModelId =
            row.model_id ??
            (row.model ? modelIdByName.get(row.model.trim().toLowerCase()) ?? null : null);

          if (!resolvedModelId || !row.platform) return true;

          return !selectedKeys.has(makeSelectionKey(resolvedModelId, row.platform as Platform));
        })
        .map((row) => row.id);

      if (rowsToDelete.length > 0) {
        const { error: deleteError } = await supabase
          .from('shifts')
          .delete()
          .in('id', rowsToDelete);

        if (deleteError) {
          showToast('error', deleteError.message);
          return;
        }
      }

      if (editingShift) {
        const movedWindow =
          editingShift.chatter_id !== formData.chatter_id ||
          editingShift.date !== formData.date ||
          editingShift.start_time !== formData.start_time ||
          editingShift.end_time !== formData.end_time;

        if (movedWindow) {
          const { error: cleanupError } = await supabase
            .from('shifts')
            .delete()
            .eq('id', editingShift.id);

          if (cleanupError) {
            showToast('error', cleanupError.message);
            return;
          }
        }
      }

      await fetchShifts();
      showToast('success', editingShift ? LABELS.shiftUpdated : LABELS.shiftAdded);
      closeEditor();
    },
    [editingShift, createShift, updateShift, showToast, closeEditor, visibleModels, fetchShifts]
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

  // ── Loading / auth guard ────────────────────────────────────────────────────

  if (previewLoading || (!previewMode && authLoading)) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (!visibleUser) return null;

  // ── Tab content ─────────────────────────────────────────────────────────────

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return visibleShiftsLoading || visibleChattersLoading ? (
          <LoadingSpinner />
        ) : (
          <div className="p-4 sm:p-6">
            <Dashboard
              stats={dashboardStats}
              onPendingApprovalsClick={() => setActiveTab('approval')}
            />
            <MonthlyGoalsSection chatters={visibleChatters} showToast={showToast} />
            <AdminExportPanel showToast={showToast} chatters={visibleChatters} models={visibleModels} />
          </div>
        );

      case 'schedule':
        return (
          <>
            <div className="flex justify-end px-4 pt-4 sm:px-6 sm:pt-6" dir="rtl">
              <AdminExportPanel
                showToast={showToast}
                chatters={visibleChatters}
                models={visibleModels}
                variant="button"
              />
            </div>
            <WeeklyGrid
              shifts={visibleShifts as ShiftWithChatter[]}
              models={visibleModels.filter((model) => model.active)}
              weekOffset={weekOffset}
              onWeekChange={setWeekOffset}
              onAddShift={openAddShift}
              onEditShift={openEditShift}
              onOpenApproval={() => setActiveTab('approval')}
              showToast={showToast}
            />
          </>
        );

      case 'approval':
        return (
          <AdminApproval
            models={visibleModels.filter((m) => m.active)}
            shifts={visibleShifts}
            showToast={showToast}
            onRefreshShifts={fetchShifts}
          />
        );

      case 'chatters':
        return (
          <ChatterManager
            chatters={visibleChatters}
            onAdd={handleAddChatter}
            onDelete={handleDeleteChatter}
          />
        );

      case 'models':
        return (
          <ModelManager
            models={visibleModels}
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
        adminName={visibleProfile?.display_name ?? visibleProfile?.email ?? null}
      >
        {renderContent()}
      </AdminLayout>

      {showEditor && (
        <ShiftEditor
          shift={editingShift}
          chatters={visibleChatters}
          models={visibleModels}
          date={editorDate}
          shiftType={editorShiftType}
          availableDates={getWeekDates(weekOffset)}
          existingShifts={visibleShifts as Shift[]}
          onSave={handleSaveShift}
          onDelete={editingShift ? handleDeleteShift : undefined}
          onClose={closeEditor}
        />
      )}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}
