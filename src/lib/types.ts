export interface Chatter {
  id: string;
  name: string;
  phone: string;
  token: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export type Platform = 'telegram' | 'onlyfans';

export interface ShiftAssignment {
  id: string;
  shift_id: string;
  model_id: string | null;
  model: string;
  platform: Platform;
  shift_date: string;
  shift_start_time: string;
  assigned_at: string;
}

export interface Shift {
  id: string;
  chatter_id: string;
  date: string;
  start_time: string;
  end_time: string;
  model: string | null;
  platform: Platform | null;
  model_id: string | null;
  status: 'pending' | 'scheduled' | 'active' | 'completed' | 'missed' | 'rejected' | 'cancelled';
  clocked_in: string | null;
  clocked_out: string | null;
  created_at: string;
  updated_at: string;
  shift_assignments?: ShiftAssignment[] | null;
}

export interface ReminderLog {
  id: string;
  shift_id: string;
  reminder_type: '60min' | '15min';
  sent_at: string;
  delivery_status: string;
  message_id: string | null;
}

export interface ActivityLog {
  id: string;
  shift_id: string;
  chatter_id: string;
  action: 'clock_in' | 'clock_out' | 'auto_missed' | 'manual_override' | 'sign_up' | 'approve' | 'reject' | 'cancel';
  timestamp: string;
  metadata: Record<string, unknown>;
}

export interface ErrorLog {
  id: string;
  workflow_name: string;
  node_name: string | null;
  error_message: string;
  error_stack: string | null;
  input_data: Record<string, unknown>;
  retry_count: number;
  max_retries: number;
  resolved: boolean;
  created_at: string;
  resolved_at: string | null;
}

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  role: 'admin' | 'chatter';
  created_at: string;
}

export interface ChatterSession {
  chatterId: string;
  chatterName: string;
  token: string;
  loggedInAt: number;
}

export interface Model {
  id: string;
  name: string;
  active: boolean;
  created_at: string;
}

export interface ShiftWithChatter extends Shift {
  chatters?: { name: string; phone: string };
  shift_assignments?: ShiftAssignment[] | null;
}

export interface ShiftSlot {
  id: string;
  date: string;
  shift_type: 'morning' | 'evening';
  model: string | null;
  platform: 'telegram' | 'onlyfans' | null;
  max_chatters: number;
  status: 'open' | 'full' | 'closed';
  created_at: string;
}

export interface ShiftQueueEntry {
  id: string;
  shift_id: string;
  chatter_id: string;
  position: number;
  queued_at: string;
  status: 'waiting' | 'promoted' | 'expired';
}

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
}
