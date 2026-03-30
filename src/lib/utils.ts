export const LABELS = {
  dashboard: 'לוח בקרה',
  schedule: 'לוח משמרות',
  chatters: 'צ׳אטרים',
  analytics: 'אנליטיקס',
  templates: 'תבניות',
  reminders: 'תזכורות',
  settings: 'הגדרות',
  clockIn: 'כניסה למשמרת',
  clockOut: 'יציאה ממשמרת',
  addShift: 'הוסף משמרת',
  editShift: 'ערוך משמרת',
  deleteShift: 'מחק משמרת',
  addChatter: 'הוסף צ׳אטר/ית',
  copyLink: 'העתק קישור',
  applyTemplates: 'החל תבניות לשבוע הבא',
  save: 'שמור',
  cancel: 'ביטול',
  login: 'התחברות',
  logout: 'התנתקות',
  scheduled: 'מתוכנן',
  active: 'פעיל',
  completed: 'הושלם',
  missed: 'לא הגיע',
  online: 'מחובר/ת',
  activeChatters: 'צ׳אטרים פעילים',
  currentlyOnShift: 'במשמרת כרגע',
  todayShifts: 'משמרות היום',
  attendanceRate: 'אחוז נוכחות',
  avgDelay: 'איחור ממוצע',
  missedRate: 'אחוז החמצה',
  days: ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'] as const,
  shiftStartsIn: 'המשמרת מתחילה בעוד',
  minutesShort: 'דק׳',
  hoursShort: 'שע׳',
  clockedInSuccess: 'נכנסת למשמרת בהצלחה!',
  clockedOutSuccess: 'יצאת מהמשמרת. תודה!',
  noUpcomingShifts: 'אין משמרות קרובות',
  availableShifts: 'משמרות פנויות',
  noAvailableShifts: 'אין משמרות פנויות כרגע',
  signUp: 'הרשמה למשמרת',
  signedUp: 'נרשמת בהצלחה!',
  shiftTaken: 'המשמרת כבר נתפסה',
  linkCopied: 'הקישור הועתק!',
  errors: 'שגיאות',
  serverError: 'שגיאה בשרת',
  noConnection: 'אין חיבור לשרת. נסה שוב.',
  reconnecting: 'מתחבר מחדש...',
  markResolved: 'סמן כטופל',
  unresolvedErrors: 'שגיאות פתוחות',
} as const;

export function formatTime(time: string): string {
  return time.slice(0, 5);
}

export function formatDate(date: string): string {
  const d = new Date(date + 'T00:00:00');
  return d.toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'numeric' });
}

export function formatDateFull(date: string): string {
  const d = new Date(date + 'T00:00:00');
  return d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'scheduled': return 'bg-blue-500/20 text-blue-400';
    case 'active': return 'bg-green-500/20 text-green-400';
    case 'completed': return 'bg-gray-500/20 text-gray-400';
    case 'missed': return 'bg-red-500/20 text-red-400';
    default: return 'bg-gray-500/20 text-gray-400';
  }
}

export function getStatusLabel(status: string): string {
  return LABELS[status as keyof typeof LABELS] as string || status;
}

export function getWeekDates(offset = 0): string[] {
  const today = new Date();
  const day = today.getDay();
  const sunday = new Date(today);
  sunday.setDate(today.getDate() - day + offset * 7);

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    return d.toISOString().split('T')[0];
  });
}

export function minutesUntil(date: string, time: string): number {
  const shiftStart = new Date(`${date}T${time}`);
  const now = new Date();
  return Math.floor((shiftStart.getTime() - now.getTime()) / 60000);
}

export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}
