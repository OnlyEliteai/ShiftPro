import { useState } from 'react';
import { Plus, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import type { Model } from '../../lib/types';
import { LABELS } from '../../lib/utils';

interface ModelManagerProps {
  models: Model[];
  onCreateModel: (name: string) => Promise<{ error?: string }>;
  onToggleActive: (id: string, active: boolean) => Promise<{ error?: string }>;
  onDeleteModel: (id: string) => Promise<{ error?: string }>;
}

export function ModelManager({
  models,
  onCreateModel,
  onToggleActive,
  onDeleteModel,
}: ModelManagerProps) {
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setLoading(true);
    setError(null);
    const result = await onCreateModel(newName.trim());
    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else {
      setNewName('');
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    const result = await onDeleteModel(id);
    if (result.error) {
      setError(result.error);
    }
    setDeletingId(null);
  }

  async function handleToggle(id: string, currentActive: boolean) {
    setError(null);
    const result = await onToggleActive(id, !currentActive);
    if (result.error) {
      setError(result.error);
    }
  }

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold text-white mb-6">{LABELS.models}</h2>

      {/* Add model form */}
      <form onSubmit={handleAdd} className="flex items-center gap-3 mb-6">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={LABELS.modelNameLabel}
          className="flex-1 max-w-xs bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
        />
        <button
          type="submit"
          disabled={loading || !newName.trim()}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
        >
          <Plus size={16} />
          {LABELS.addModel}
        </button>
      </form>

      {/* Error message */}
      {error && (
        <p className="text-sm text-red-400 mb-4">{error}</p>
      )}

      {/* Models list */}
      {models.length === 0 ? (
        <p className="text-gray-500 text-sm">{LABELS.noModelsYet}</p>
      ) : (
        <div className="space-y-2">
          {models.map((model) => (
            <div
              key={model.id}
              className="flex items-center justify-between bg-gray-800 rounded-lg px-4 py-3 border border-gray-700"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`text-sm font-medium ${
                    model.active ? 'text-white' : 'text-gray-500 line-through'
                  }`}
                >
                  {model.name}
                </span>
                {!model.active && (
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-600/30 text-gray-400">
                    {LABELS.inactive}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {/* Toggle active */}
                <button
                  onClick={() => handleToggle(model.id, model.active)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
                  title={model.active ? LABELS.disable : LABELS.enable}
                >
                  {model.active ? (
                    <ToggleRight size={20} className="text-green-400" />
                  ) : (
                    <ToggleLeft size={20} />
                  )}
                </button>

                {/* Delete */}
                {deletingId === model.id ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleDelete(model.id)}
                      className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded-md font-medium transition-colors"
                    >
                      {LABELS.delete}
                    </button>
                    <button
                      onClick={() => setDeletingId(null)}
                      className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded-md transition-colors"
                    >
                      {LABELS.cancel}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeletingId(model.id)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-gray-700 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
