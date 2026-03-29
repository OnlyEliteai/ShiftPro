import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Play, ToggleLeft, ToggleRight } from 'lucide-react';
import type { Chatter, ShiftTemplate } from '../../lib/types';
import { LABELS, formatTime, cn } from '../../lib/utils';
import { supabase, callEdgeFunction } from '../../lib/supabase';
import { useToast } from '../../hooks/useToast';
import { ToastContainer } from '../shared/ToastContainer';
import { LoadingSpinner } from '../shared/LoadingSpinner';

interface TemplateManagerProps {
  chatters: Chatter[];
}

interface TemplateWithChatter extends ShiftTemplate {
  chatters?: { name: string };
}

const DAY_NAMES = LABELS.days;
const MODEL_OPTIONS = ['GPT-4o', 'Claude 3', 'Gemini Pro', 'Llama 3', 'אחר'];

const DEFAULT_FORM = {
  chatter_id: '',
  day_of_week: 0,
  start_time: '09:00',
  end_time: '17:00',
  model: '',
};

export function TemplateManager({ chatters }: TemplateManagerProps) {
  const { toasts, showToast, dismissToast } = useToast();
  const [templates, setTemplates] = useState<TemplateWithChatter[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [form, setForm] = useState({ ...DEFAULT_FORM, chatter_id: chatters[0]?.id ?? '' });

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('shift_templates')
      .select('*, chatters(name)')
      .order('day_of_week', { ascending: true });

    if (error) {
      showToast('error', 'שגיאה בטעינת תבניות');
    } else {
      setTemplates((data as TemplateWithChatter[]) ?? []);
    }
    setLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.chatter_id) {
      showToast('warning', 'יש לבחור צ׳אטר/ית');
      return;
    }

    const { error } = await supabase.from('shift_templates').insert({
      chatter_id: form.chatter_id,
      day_of_week: Number(form.day_of_week),
      start_time: form.start_time,
      end_time: form.end_time,
      model: form.model || null,
      active: true,
    });

    if (error) {
      showToast('error', 'שגיאה בהוספת תבנית');
    } else {
      showToast('success', 'התבנית נוספה בהצלחה');
      setForm({ ...DEFAULT_FORM, chatter_id: chatters[0]?.id ?? '' });
      await fetchTemplates();
    }
  }

  async function handleToggleActive(template: TemplateWithChatter) {
    const { error } = await supabase
      .from('shift_templates')
      .update({ active: !template.active })
      .eq('id', template.id);

    if (error) {
      showToast('error', 'שגיאה בעדכון תבנית');
    } else {
      setTemplates((prev) =>
        prev.map((t) => (t.id === template.id ? { ...t, active: !t.active } : t))
      );
    }
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('shift_templates').delete().eq('id', id);
    if (error) {
      showToast('error', 'שגיאה במחיקת תבנית');
    } else {
      showToast('info', 'התבנית נמחקה');
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    }
  }

  async function handleApplyTemplates() {
    setApplying(true);
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const result = await callEdgeFunction('apply-templates', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session?.access_token ?? ''}`,
      },
    });

    if (result.success) {
      showToast('success', 'התבניות הוחלו לשבוע הבא בהצלחה');
    } else {
      showToast('error', result.error ?? 'שגיאה בהחלת תבניות');
    }
    setApplying(false);
  }

  function handleFormChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  // Group by chatter
  const grouped: Record<string, TemplateWithChatter[]> = {};
  templates.forEach((t) => {
    const key = t.chatters?.name ?? t.chatter_id;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(t);
  });

  const inputClass =
    'bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors';

  return (
    <div className="p-6" dir="rtl">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">{LABELS.templates}</h2>
          <p className="text-sm text-gray-400 mt-1">תבניות משמרות שבועיות חוזרות</p>
        </div>
        <button
          onClick={handleApplyTemplates}
          disabled={applying}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
        >
          <Play size={16} />
          {applying ? 'מחיל...' : LABELS.applyTemplates}
        </button>
      </div>

      {/* Add form */}
      <form
        onSubmit={handleAdd}
        className="bg-gray-800 rounded-xl border border-gray-700 p-4 mb-6"
      >
        <p className="text-sm font-semibold text-gray-300 mb-3">הוסף תבנית חדשה</p>
        <div className="flex flex-wrap gap-3 items-end">
          {/* Chatter */}
          <div className="flex-1 min-w-[130px]">
            <label className="block text-xs text-gray-400 mb-1">צ׳אטר/ית</label>
            <select
              name="chatter_id"
              value={form.chatter_id}
              onChange={handleFormChange}
              className={cn(inputClass, 'w-full')}
              required
            >
              <option value="">בחר/י...</option>
              {chatters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Day of week */}
          <div className="flex-1 min-w-[110px]">
            <label className="block text-xs text-gray-400 mb-1">יום בשבוע</label>
            <select
              name="day_of_week"
              value={form.day_of_week}
              onChange={handleFormChange}
              className={cn(inputClass, 'w-full')}
            >
              {DAY_NAMES.map((day, i) => (
                <option key={i} value={i}>
                  {day}
                </option>
              ))}
            </select>
          </div>

          {/* Start time */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">התחלה</label>
            <input
              type="time"
              name="start_time"
              value={form.start_time}
              onChange={handleFormChange}
              className={cn(inputClass)}
              required
            />
          </div>

          {/* End time */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">סיום</label>
            <input
              type="time"
              name="end_time"
              value={form.end_time}
              onChange={handleFormChange}
              className={cn(inputClass)}
              required
            />
          </div>

          {/* Model */}
          <div className="flex-1 min-w-[110px]">
            <label className="block text-xs text-gray-400 mb-1">מודל</label>
            <select
              name="model"
              value={form.model}
              onChange={handleFormChange}
              className={cn(inputClass, 'w-full')}
            >
              <option value="">ללא</option>
              {MODEL_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            <Plus size={16} />
            הוסף
          </button>
        </div>
      </form>

      {/* Templates grouped by chatter */}
      {loading ? (
        <LoadingSpinner />
      ) : Object.keys(grouped).length === 0 ? (
        <div className="text-center py-12 text-gray-500">אין תבניות עדיין</div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([chatterName, tpls]) => (
            <div
              key={chatterName}
              className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden"
            >
              <div className="px-4 py-3 bg-gray-900/50 border-b border-gray-700">
                <p className="font-semibold text-white text-sm">{chatterName}</p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700/50">
                    <th className="text-right px-4 py-2 text-xs text-gray-500 font-medium">יום</th>
                    <th className="text-right px-4 py-2 text-xs text-gray-500 font-medium">שעות</th>
                    <th className="text-right px-4 py-2 text-xs text-gray-500 font-medium">מודל</th>
                    <th className="text-center px-4 py-2 text-xs text-gray-500 font-medium">פעיל</th>
                    <th className="text-center px-4 py-2 text-xs text-gray-500 font-medium">מחק</th>
                  </tr>
                </thead>
                <tbody>
                  {tpls.map((tpl) => (
                    <tr
                      key={tpl.id}
                      className={cn(
                        'border-b border-gray-700/30 transition-colors',
                        !tpl.active && 'opacity-50'
                      )}
                    >
                      <td className="px-4 py-2.5 text-gray-200">
                        {DAY_NAMES[tpl.day_of_week]}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-gray-300">
                        {formatTime(tpl.start_time)} – {formatTime(tpl.end_time)}
                      </td>
                      <td className="px-4 py-2.5 text-gray-400">{tpl.model ?? '—'}</td>
                      <td className="px-4 py-2.5 text-center">
                        <button
                          onClick={() => handleToggleActive(tpl)}
                          className="text-gray-400 hover:text-white transition-colors"
                          title={tpl.active ? 'השבת תבנית' : 'הפעל תבנית'}
                        >
                          {tpl.active ? (
                            <ToggleRight size={22} className="text-green-400" />
                          ) : (
                            <ToggleLeft size={22} />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <button
                          onClick={() => handleDelete(tpl.id)}
                          className="text-red-400 hover:text-red-300 transition-colors"
                          title="מחק תבנית"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
