import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, ChevronLeft, Plus, CalendarPlus } from 'lucide-react';
import type { Model, Platform, Shift, ShiftWithChatter } from '../../lib/types';
import {
  LABELS,
  cn,
  formatDateNumeric,
  formatTime,
  getHebrewWeekdayLabel,
  getWeekDates,
} from '../../lib/utils';
import { StatusBadge } from '../shared/StatusBadge';
import { supabase } from '../../lib/supabase';
import { getMergedShiftAssignmentGroups, groupChatterWindowBlocks } from '../../lib/shiftGrouping';

interface WeeklyGridProps {
  shifts: ShiftWithChatter[];
  models: Model[];
  weekOffset: number;
  onWeekChange: (offset: number) => void;
  onAddShift: (date: string, shiftType: 'morning' | 'evening') => void;
  onEditShift: (shift: Shift) => void;
  onOpenApproval?: () => void;
  showToast?: (type: 'success' | 'error', message: string) => void;
}

interface TooltipState {
  cellKey: string;
  left: number;
  top: number;
  bodyMaxHeight: number;
}

const TOOLTIP_WIDTH = 280;
const TOOLTIP_SAFETY_MARGIN = 16;
const TOOLTIP_EDGE_GAP = 8;
const TOOLTIP_MIN_BODY_HEIGHT = 160;
const TOOLTIP_MAX_BODY_HEIGHT = 300;
const TOOLTIP_FIXED_CHROME_HEIGHT = 96;
const COVERAGE_STATUSES = new Set<Shift['status']>(['scheduled', 'active', 'completed']);

export function WeeklyGrid({
  shifts,
  models,
  weekOffset,
  onWeekChange,
  onAddShift,
  onEditShift,
  onOpenApproval,
  showToast,
}: WeeklyGridProps) {
  const [generatingSlots, setGeneratingSlots] = useState(false);
  const [hoveredTooltip, setHoveredTooltip] = useState<TooltipState | null>(null);
  const [tappedTooltip, setTappedTooltip] = useState<TooltipState | null>(null);

  async function handleGenerateSlots() {
    setGeneratingSlots(true);
    const nextWeekDates = getWeekDates(1);
    const rows = nextWeekDates.flatMap((date) => [
      {
        date,
        shift_type: 'morning' as const,
        model: null,
        platform: null,
        max_chatters: 1,
        status: 'open' as const,
      },
      {
        date,
        shift_type: 'evening' as const,
        model: null,
        platform: null,
        max_chatters: 1,
        status: 'open' as const,
      },
    ]);

    const { data, error } = await supabase
      .from('shift_slots')
      .upsert(rows, {
        onConflict: 'date,shift_type',
        ignoreDuplicates: true,
      })
      .select('id');

    if (error) {
      showToast?.('error', error.message);
    } else {
      const createdCount = data?.length ?? 0;
      if (createdCount === 0) {
        showToast?.('success', 'כל החלונות לשבוע הזה כבר קיימים');
      } else {
        showToast?.('success', `נוצרו ${createdCount} חלונות חדשים`);
      }
    }
    setGeneratingSlots(false);
  }

  const weekDates = getWeekDates(weekOffset);
  const windows = [
    { key: 'morning' as const, label: 'בוקר', time: '12:00–19:00' },
    { key: 'evening' as const, label: 'ערב', time: '19:00–02:00' },
  ];
  const platformColumns: Platform[] = ['telegram', 'onlyfans'];
  const isTouchDevice =
    typeof window !== 'undefined' &&
    (window.matchMedia('(hover: none), (pointer: coarse)').matches || navigator.maxTouchPoints > 0);

  useEffect(() => {
    if (!isTouchDevice || !tappedTooltip) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('[data-coverage-cell="true"]')) {
        setTappedTooltip(null);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [isTouchDevice, tappedTooltip]);

  const shiftsByDateAndWindow: Record<
    string,
    { morning: ShiftWithChatter[]; evening: ShiftWithChatter[] }
  > = {};
  weekDates.forEach((date) => {
    shiftsByDateAndWindow[date] = { morning: [], evening: [] };
  });

  function getWindowByStartTime(startTime: string) {
    const hour = Number(startTime.slice(0, 2));
    if (startTime.startsWith('12:00') || (hour >= 6 && hour < 19)) {
      return 'morning' as const;
    }
    return 'evening' as const;
  }

  for (const shift of shifts) {
    if (!shiftsByDateAndWindow[shift.date]) continue;
    const window = getWindowByStartTime(shift.start_time);
    shiftsByDateAndWindow[shift.date][window].push(shift);
  }

  function formatWeekLabel() {
    const start = formatDateNumeric(weekDates[0]);
    const end = formatDateNumeric(weekDates[6]);
    return `${start} - ${end}`;
  }

  function getShiftAssignments(shift: ShiftWithChatter): {
    model_id: string | null;
    model: string;
    platform: Platform;
  }[] {
    if (shift.shift_assignments && shift.shift_assignments.length > 0) {
      return shift.shift_assignments.map((assignment) => ({
        model_id: assignment.model_id,
        model: assignment.model,
        platform: assignment.platform,
      }));
    }

    if (shift.model && shift.platform) {
      return [{ model_id: shift.model_id, model: shift.model, platform: shift.platform }];
    }

    return [];
  }

  function formatClockTimestamp(value: string | null) {
    if (!value) return '';
    if (value.includes('T')) return value.slice(11, 16);
    return formatTime(value);
  }

  const modelIdByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const model of models) {
      map.set(model.name.trim().toLowerCase(), model.id);
    }
    return map;
  }, [models]);

  function makeCoverageKey(modelId: string, platform: Platform) {
    return `${modelId}|${platform}`;
  }

  function getCellKey(date: string, windowKey: 'morning' | 'evening') {
    return `${date}|${windowKey}`;
  }

  function buildTooltipState(cellKey: string, element: HTMLDivElement): TooltipState {
    const cellRect = element.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const preferredLeft =
      cellRect.left >= TOOLTIP_WIDTH + TOOLTIP_SAFETY_MARGIN
        ? cellRect.left - TOOLTIP_WIDTH - TOOLTIP_EDGE_GAP
        : cellRect.right + TOOLTIP_EDGE_GAP;
    const maxLeft = Math.max(
      TOOLTIP_SAFETY_MARGIN,
      viewportWidth - TOOLTIP_WIDTH - TOOLTIP_SAFETY_MARGIN
    );
    const left = Math.min(Math.max(preferredLeft, TOOLTIP_SAFETY_MARGIN), maxLeft);
    const bodyMaxHeight = Math.max(
      TOOLTIP_MIN_BODY_HEIGHT,
      Math.min(
        TOOLTIP_MAX_BODY_HEIGHT,
        viewportHeight - TOOLTIP_SAFETY_MARGIN * 2 - TOOLTIP_FIXED_CHROME_HEIGHT
      )
    );
    const estimatedHeight = bodyMaxHeight + TOOLTIP_FIXED_CHROME_HEIGHT;
    const centerY = cellRect.top + cellRect.height / 2;
    const top = Math.min(
      Math.max(centerY, TOOLTIP_SAFETY_MARGIN + estimatedHeight / 2),
      viewportHeight - TOOLTIP_SAFETY_MARGIN - estimatedHeight / 2
    );

    return { cellKey, left, top, bodyMaxHeight };
  }

  function getCoverageKeysFromShift(shift: ShiftWithChatter): string[] {
    if (!COVERAGE_STATUSES.has(shift.status)) return [];

    return getShiftAssignments(shift)
      .map((assignment) => {
        const resolvedModelId =
          assignment.model_id ?? modelIdByName.get(assignment.model.trim().toLowerCase()) ?? null;
        if (!resolvedModelId) return null;
        return makeCoverageKey(resolvedModelId, assignment.platform);
      })
      .filter((key): key is string => Boolean(key));
  }

  function getBlockBackground(status: Shift['status']) {
    if (status === 'active') return 'bg-blue-900/35';
    if (status === 'completed') return 'bg-green-900/30';
    if (status === 'missed') return 'bg-red-900/35';
    if (status === 'scheduled') return 'bg-gray-700/50';
    if (status === 'pending') return 'bg-yellow-900/30';
    return 'bg-red-950/30';
  }

  function getCoveredAssignments(cellShifts: ShiftWithChatter[]) {
    const covered = new Set<string>();

    for (const shift of cellShifts) {
      for (const coverageKey of getCoverageKeysFromShift(shift)) {
        covered.add(coverageKey);
      }
    }

    return covered;
  }

  function getCellCoverage(cellShifts: ShiftWithChatter[]) {
    const coveredAssignments = getCoveredAssignments(cellShifts);
    const total = models.length * platformColumns.length;
    let filled = 0;

    for (const model of models) {
      for (const platform of platformColumns) {
        if (coveredAssignments.has(makeCoverageKey(model.id, platform))) {
          filled += 1;
        }
      }
    }

    return {
      coveredAssignments,
      filled,
      total,
    };
  }

  function handleCellClick(
    date: string,
    windowKey: 'morning' | 'evening',
    element: HTMLDivElement
  ) {
    const cellKey = getCellKey(date, windowKey);
    const tooltipState = buildTooltipState(cellKey, element);

    if (isTouchDevice) {
      if (tappedTooltip?.cellKey === cellKey) {
        setTappedTooltip(null);
        onAddShift(date, windowKey);
        return;
      }

      setTappedTooltip(tooltipState);
      return;
    }

    onAddShift(date, windowKey);
  }

  // Determine if a date is today
  function isToday(dateStr: string) {
    return dateStr === new Date().toISOString().split('T')[0];
  }

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-white">{LABELS.schedule}</h2>
          <button
            onClick={handleGenerateSlots}
            disabled={generatingSlots}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            <CalendarPlus size={14} />
            {generatingSlots ? '...' : LABELS.generateNextWeekSlots}
          </button>
        </div>

        {/* Week navigation */}
        <div className="flex items-center gap-2 text-sm">
          <button
            onClick={() => onWeekChange(weekOffset - 1)}
            className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
            aria-label={LABELS.prevWeek}
          >
            <ChevronRight size={18} />
          </button>

          <button
            onClick={() => onWeekChange(0)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
              weekOffset === 0
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
            )}
          >
            {LABELS.thisWeek}
          </button>
          <span className="px-2 text-gray-300 font-medium">{formatWeekLabel()}</span>

          <button
            onClick={() => onWeekChange(weekOffset + 1)}
            className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
            aria-label={LABELS.nextWeek}
          >
            <ChevronLeft size={18} />
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto overflow-y-visible -mx-4 sm:mx-0 px-4 sm:px-0">
        <div className="grid grid-cols-8 gap-2 min-w-[980px] overflow-visible">
          <div className="text-center pb-2 border-b border-gray-700" />
          {weekDates.map((date) => (
            <div
              key={date}
              className={cn(
                'text-center pb-2 border-b',
                isToday(date) ? 'border-blue-500' : 'border-gray-700'
              )}
            >
              <p
                className={cn(
                  'text-xs font-semibold mb-1',
                  isToday(date) ? 'text-blue-400' : 'text-gray-400'
                )}
              >
                {getHebrewWeekdayLabel(date)}
              </p>
              <p
                className={cn(
                  'text-sm font-bold',
                  isToday(date) ? 'text-blue-300' : 'text-gray-300'
                )}
              >
                {formatDateNumeric(date)}
              </p>
            </div>
          ))}

          {windows.map((window) => (
            <div key={window.key} className="contents">
              <div
                className="rounded-lg bg-gray-900/80 border border-gray-800 p-3 flex flex-col justify-center"
              >
                <p className="text-sm font-bold text-white">{window.label}</p>
                <p className="text-xs text-gray-400 mt-1">{window.time}</p>
              </div>
              {weekDates.map((date) => {
                const cellShifts = shiftsByDateAndWindow[date][window.key];
                const cellKey = getCellKey(date, window.key);
                const coverage = getCellCoverage(cellShifts);
                const activeTooltip = isTouchDevice ? tappedTooltip : hoveredTooltip;
                const isTooltipVisible = activeTooltip?.cellKey === cellKey;

                return (
                  <div
                    key={`${window.key}-${date}`}
                    data-coverage-cell="true"
                    className={cn(
                      'relative min-h-[170px] rounded-lg p-2 space-y-2 cursor-pointer transition-colors group border overflow-visible',
                      isToday(date)
                        ? 'bg-blue-950/20 border-blue-900/60'
                        : 'bg-gray-800/30 border-gray-800 hover:bg-gray-800/60'
                    )}
                    onMouseEnter={(event) => {
                      if (!isTouchDevice) {
                        setHoveredTooltip(
                          buildTooltipState(cellKey, event.currentTarget as HTMLDivElement)
                        );
                      }
                    }}
                    onMouseLeave={() => {
                      if (!isTouchDevice) {
                        setHoveredTooltip((prev) => (prev?.cellKey === cellKey ? null : prev));
                      }
                    }}
                    onClick={(event) =>
                      handleCellClick(date, window.key, event.currentTarget as HTMLDivElement)
                    }
                  >
                    {(() => {
                      return groupChatterWindowBlocks(cellShifts).map((block) => {
                        const representativeShift = block.shift;
                        const assignmentGroups = getMergedShiftAssignmentGroups(block);
                        const clockedIn = formatClockTimestamp(representativeShift.clocked_in);
                        const clockedOut = formatClockTimestamp(representativeShift.clocked_out);
                        return (
                          <div
                            key={block.key}
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditShift(representativeShift);
                            }}
                            className={cn(
                              'rounded-md p-2 cursor-pointer border border-transparent hover:border-gray-500 transition-all text-right',
                              getBlockBackground(block.status)
                            )}
                            dir="rtl"
                          >
                            <div className="mb-2 flex min-w-0 flex-col items-start gap-1 overflow-hidden">
                              <p className="max-w-full whitespace-normal break-words text-xs font-bold leading-4 text-white">
                                {representativeShift.chatters?.name ?? '—'}
                              </p>
                              <div className="max-w-full overflow-hidden">
                                <StatusBadge status={block.status} />
                              </div>
                            </div>

                            <div className="mb-2 flex flex-wrap gap-1.5">
                              {assignmentGroups.length === 0 ? (
                                <span
                                  className="max-w-full rounded-full border border-gray-600/70 bg-gray-950/30 px-2 py-0.5 text-[11px] text-gray-200"
                                >
                                  ללא הקצאה
                                </span>
                              ) : (
                                assignmentGroups.map((group) => (
                                  <span
                                    key={group.key}
                                    className="max-w-full rounded-xl border border-gray-600/70 bg-gray-950/30 px-2 py-1 text-[11px] text-gray-200"
                                    dir="rtl"
                                  >
                                    <span className="block min-w-0 truncate text-center font-medium text-white">
                                      {group.model}
                                    </span>
                                    <span className="mt-1 flex flex-wrap justify-center gap-1">
                                      {group.platformLabels.map((platform) => (
                                        <span
                                          key={platform}
                                          className="rounded-full bg-gray-700/70 px-1.5 leading-4 text-gray-200"
                                        >
                                          {platform}
                                        </span>
                                      ))}
                                    </span>
                                  </span>
                                ))
                              )}
                            </div>

                            <div className="space-y-1 text-[11px] text-gray-400">
                              <p className="font-mono">
                                {formatTime(representativeShift.start_time)}–
                                {formatTime(representativeShift.end_time)}
                              </p>
                              {(clockedIn || clockedOut) && (
                                <p>
                                  {clockedIn ? `כניסה ${clockedIn}` : ''}
                                  {clockedIn && clockedOut ? ' · ' : ''}
                                  {clockedOut ? `יציאה ${clockedOut}` : ''}
                                </p>
                              )}
                              {block.status === 'pending' && onOpenApproval && (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    onOpenApproval();
                                  }}
                                  className="mt-1 min-h-[28px] rounded-md bg-green-700 px-2 text-xs font-medium text-white hover:bg-green-600"
                                >
                                  אישור
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      });
                    })()}

                    {isTooltipVisible && (
                      <div
                        className="pointer-events-none fixed z-50 -translate-y-1/2 rounded-lg border border-gray-700 bg-gray-900 p-2 shadow-xl"
                        style={{
                          left: activeTooltip.left,
                          top: activeTooltip.top,
                          width: TOOLTIP_WIDTH,
                          maxWidth: `calc(100vw - ${TOOLTIP_SAFETY_MARGIN * 2}px)`,
                        }}
                        dir="rtl"
                      >
                        <div className="grid grid-cols-3 bg-gray-950/70 px-2 py-1.5 text-[11px] text-gray-400 rounded-md">
                          <span>מודל</span>
                          <span className="text-center">טלגרם</span>
                          <span className="text-center">אונליפאנס</span>
                        </div>
                        <div
                          className="mt-1 overflow-y-auto overscroll-contain pointer-events-auto"
                          style={{ maxHeight: activeTooltip.bodyMaxHeight }}
                        >
                          {models.map((model) => (
                            <div
                              key={`${cellKey}-${model.id}`}
                              className="grid grid-cols-3 items-center border-t border-gray-800 px-2 py-1.5 text-[11px]"
                            >
                              <span className="truncate text-gray-100">{model.name}</span>
                              {platformColumns.map((platform) => {
                                const filled = coverage.coveredAssignments.has(
                                  makeCoverageKey(model.id, platform)
                                );
                                return (
                                  <span
                                    key={`${model.id}-${platform}`}
                                    className={cn(
                                      'text-center text-sm font-semibold',
                                      filled ? 'text-green-400' : 'text-red-400'
                                    )}
                                  >
                                    {filled ? '✓' : '✕'}
                                  </span>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                        <p className="mt-2 text-[11px] text-gray-300 border-t border-gray-800 pt-2">
                          {coverage.filled}/{coverage.total} שיבוצים מלאים
                        </p>
                      </div>
                    )}

                  <div className="flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity py-1">
                    <Plus size={14} className="text-gray-500" />
                  </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
