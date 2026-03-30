import { LABELS } from '../../lib/utils';

export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center p-8" role="status" aria-label={LABELS.loading}>
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
