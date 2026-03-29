import { formatTime } from '../../lib/utils';

export function TimeDisplay({ start, end }: { start: string; end: string }) {
  return (
    <span className="text-sm text-gray-300 font-mono">
      {formatTime(start)} — {formatTime(end)}
    </span>
  );
}
