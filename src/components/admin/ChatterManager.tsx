import { useState } from 'react';
import { Copy, Trash2, UserCheck, UserX, Plus, Check } from 'lucide-react';
import type { Chatter } from '../../lib/types';
import { LABELS, cn } from '../../lib/utils';
import { useToast } from '../../hooks/useToast';
import { ToastContainer } from '../shared/ToastContainer';

interface ChatterManagerProps {
  chatters: Chatter[];
  onAdd: (name: string, phone: string) => void;
  onUpdate: (id: string, data: Partial<Chatter>) => void;
  onDelete: (id: string) => void;
  onToggleActive: (id: string, active: boolean) => void;
}

export function ChatterManager({
  chatters,
  onAdd,
  onUpdate: _onUpdate,
  onDelete,
  onToggleActive,
}: ChatterManagerProps) {
  const { toasts, showToast, dismissToast } = useToast();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimName = name.trim();
    const trimPhone = phone.trim();
    if (!trimName || !trimPhone) return;
    onAdd(trimName, trimPhone);
    setName('');
    setPhone('');
    showToast('success', 'הצ׳אטר/ית נוספ/ה בהצלחה');
  }

  function handleCopyLink(chatter: Chatter) {
    const link = `${window.location.origin}/shift?token=${chatter.token}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopiedId(chatter.id);
      showToast('success', LABELS.linkCopied);
      setTimeout(() => setCopiedId(null), 2000);
    }).catch(console.error);
  }

  function handleDelete(id: string) {
    onDelete(id);
    setConfirmDeleteId(null);
    showToast('info', 'הצ׳אטר/ית נמחק/ה');
  }

  const inputClass =
    'bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors';

  return (
    <div className="p-6" dir="rtl">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white">{LABELS.chatters}</h2>
        <p className="text-sm text-gray-400 mt-1">ניהול צ׳אטרים ולינקים אישיים</p>
      </div>

      {/* Add chatter form */}
      <form
        onSubmit={handleAdd}
        className="flex flex-wrap items-end gap-3 mb-6 bg-gray-800 rounded-xl p-4 border border-gray-700"
      >
        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs font-medium text-gray-400 mb-1">שם</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="שם הצ׳אטר/ית"
            className={cn(inputClass, 'w-full')}
            required
          />
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs font-medium text-gray-400 mb-1">טלפון</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="05X-XXXXXXX"
            className={cn(inputClass, 'w-full')}
            required
          />
        </div>
        <button
          type="submit"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          <Plus size={16} />
          {LABELS.addChatter}
        </button>
      </form>

      {/* Table */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700 bg-gray-900/50">
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                שם
              </th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                טלפון
              </th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                סטטוס
              </th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                לינק אישי
              </th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                פעולות
              </th>
            </tr>
          </thead>
          <tbody>
            {chatters.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-10 text-gray-500">
                  אין צ׳אטרים עדיין
                </td>
              </tr>
            ) : (
              chatters.map((chatter) => (
                <tr
                  key={chatter.id}
                  className="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors"
                >
                  {/* Name */}
                  <td className="px-4 py-3 font-medium text-white">{chatter.name}</td>

                  {/* Phone */}
                  <td className="px-4 py-3 text-gray-300 font-mono">{chatter.phone}</td>

                  {/* Active toggle */}
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => onToggleActive(chatter.id, !chatter.active)}
                      className={cn(
                        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                        chatter.active
                          ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                          : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                      )}
                      title={chatter.active ? 'לחץ לביטול פעיל' : 'לחץ להפעלה'}
                    >
                      {chatter.active ? (
                        <>
                          <UserCheck size={13} />
                          פעיל/ה
                        </>
                      ) : (
                        <>
                          <UserX size={13} />
                          לא פעיל/ה
                        </>
                      )}
                    </button>
                  </td>

                  {/* Copy link */}
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleCopyLink(chatter)}
                      className={cn(
                        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
                        copiedId === chatter.id
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'
                      )}
                      title={LABELS.copyLink}
                    >
                      {copiedId === chatter.id ? (
                        <>
                          <Check size={13} />
                          הועתק!
                        </>
                      ) : (
                        <>
                          <Copy size={13} />
                          {LABELS.copyLink}
                        </>
                      )}
                    </button>
                  </td>

                  {/* Delete */}
                  <td className="px-4 py-3 text-center">
                    {confirmDeleteId === chatter.id ? (
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleDelete(chatter.id)}
                          className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded-md font-medium transition-colors"
                        >
                          אשר מחיקה
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded-md transition-colors"
                        >
                          ביטול
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(chatter.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-red-400 hover:text-red-300 hover:bg-red-950/40 transition-colors"
                      >
                        <Trash2 size={13} />
                        מחק
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
