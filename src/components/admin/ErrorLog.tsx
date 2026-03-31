import { useState, useEffect, useCallback } from 'react';
import { CheckCircle, RefreshCw, AlertTriangle, Filter } from 'lucide-react';
import type { ErrorLog as ErrorLogType } from '../../lib/types';
import { LABELS, cn } from '../../lib/utils';
import { supabase } from '../../lib/supabase';
import { LoadingSpinner } from '../shared/LoadingSpinner';

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function ErrorLog() {
  const [rows, setRows] = useState<ErrorLogType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unresolvedOnly, setUnresolvedOnly] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const fetchErrors = useCallback(async () => {
    setLoading(true);
    setError(null);

    let query = supabase
      .from('error_log')
      .select('*')
      .order('created_at', { ascending: false });

    if (unresolvedOnly) {
      query = query.eq('resolved', false);
    }

    const { data, errorObj } = await query.then(({ data, error }) => ({
      data,
      errorObj: error,
    }));

    if (errorObj) {
      setError(LABELS.errorLoadFailed);
    } else {
      setRows((data as ErrorLogType[]) ?? []);
    }
    setLoading(false);
  }, [unresolvedOnly]);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) {
        void fetchErrors();
      }
    });
    return () => {
      active = false;
    };
  }, [fetchErrors]);

  async function handleMarkResolved(id: string) {
    setResolvingId(id);
    const { error: err } = await supabase
      .from('error_log')
      .update({ resolved: true, resolved_at: new Date().toISOString() })
      .eq('id', id);

    if (!err) {
      setRows((prev) =>
        prev.map((r) =>
          r.id === id
            ? { ...r, resolved: true, resolved_at: new Date().toISOString() }
            : r
        )
      );
    }
    setResolvingId(null);
  }

  const unresolvedCount = rows.filter((r) => !r.resolved).length;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            {LABELS.errors}
            {unresolvedCount > 0 && (
              <span className="px-2 py-0.5 bg-red-600 text-white text-xs font-bold rounded-full">
                {unresolvedCount}
              </span>
            )}
          </h2>
          <p className="text-sm text-gray-400 mt-1">{LABELS.errorLogTitle}</p>
        </div>

        <div className="flex items-center gap-2">
          {/* Filter toggle */}
          <button
            onClick={() => setUnresolvedOnly((v) => !v)}
            className={cn(
              'flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors',
              unresolvedOnly
                ? 'bg-red-600/20 border-red-600/50 text-red-400'
                : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
            )}
          >
            <Filter size={15} />
            {LABELS.unresolvedErrors}
          </button>

          {/* Refresh */}
          <button
            onClick={fetchErrors}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white text-sm rounded-lg transition-colors border border-gray-700"
          >
            <RefreshCw size={15} className={cn(loading && 'animate-spin')} />
            {LABELS.refresh}
          </button>
        </div>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <div className="text-center py-10 text-red-400">{error}</div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-500 gap-3">
          <CheckCircle size={32} className="text-green-500 opacity-60" />
          <p>אין שגיאות {unresolvedOnly ? 'פתוחות' : ''}</p>
        </div>
      ) : (
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700 bg-gray-900/50">
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                    {LABELS.time}
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Workflow
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Node
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    {LABELS.errorMessage}
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                    {LABELS.retries}
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    {LABELS.status}
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    {LABELS.actions}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className={cn(
                      'border-b border-gray-700/40 transition-colors',
                      row.resolved
                        ? 'hover:bg-gray-700/20 opacity-60'
                        : 'bg-red-950/10 hover:bg-red-950/20'
                    )}
                  >
                    {/* Timestamp */}
                    <td className="px-4 py-3 text-gray-400 font-mono text-xs whitespace-nowrap">
                      {formatTimestamp(row.created_at)}
                    </td>

                    {/* Workflow */}
                    <td className="px-4 py-3 text-gray-200 whitespace-nowrap">
                      {row.workflow_name}
                    </td>

                    {/* Node */}
                    <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                      {row.node_name ?? '—'}
                    </td>

                    {/* Error message */}
                    <td className="px-4 py-3 max-w-[280px]">
                      <p
                        className={cn(
                          'text-xs truncate',
                          row.resolved ? 'text-gray-400' : 'text-red-300'
                        )}
                        title={row.error_message}
                      >
                        {row.resolved ? null : (
                          <AlertTriangle
                            size={12}
                            className="inline-block text-red-400 mr-1 shrink-0"
                          />
                        )}
                        {row.error_message}
                      </p>
                    </td>

                    {/* Retry count */}
                    <td className="px-4 py-3 text-center text-gray-400 text-xs">
                      {row.retry_count}/{row.max_retries}
                    </td>

                    {/* Resolved status */}
                    <td className="px-4 py-3 text-center">
                      {row.resolved ? (
                        <span className="flex items-center justify-center gap-1 text-xs text-green-400">
                          <CheckCircle size={13} />
                          {LABELS.handled}
                        </span>
                      ) : (
                        <span className="flex items-center justify-center gap-1 text-xs text-red-400">
                          <AlertTriangle size={13} />
                          {LABELS.open}
                        </span>
                      )}
                    </td>

                    {/* Mark resolved action */}
                    <td className="px-4 py-3 text-center">
                      {!row.resolved && (
                        <button
                          onClick={() => handleMarkResolved(row.id)}
                          disabled={resolvingId === row.id}
                          className={cn(
                            'flex items-center gap-1 mx-auto px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
                            resolvingId === row.id
                              ? 'opacity-50 cursor-not-allowed bg-gray-700 text-gray-400'
                              : 'bg-green-600/20 text-green-400 hover:bg-green-600/40 border border-green-700/50'
                          )}
                        >
                          <CheckCircle size={12} />
                          {resolvingId === row.id ? 'שומר...' : LABELS.markResolved}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
