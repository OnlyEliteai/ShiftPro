import { getStatusColor, getStatusLabel } from '../../lib/utils';

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(status)}`}>
      {getStatusLabel(status)}
    </span>
  );
}
