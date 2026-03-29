export interface Chatter {
  id: string;
  name: string;
  phone: string;
  token: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Shift {
  id: string;
  chatter_id: string;
  date: string;
  start_time: string;
  end_time: string;
  model: string | null;
  status: 'scheduled' | 'active' | 'completed' | 'missed';
  clocked_in: string | null;
  clocked_out: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShiftTemplate {
  id: string;
  chatter_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  model: string | null;
  active: boolean;
  created_at: string;
}

export interface ReminderLog {
  id: string;
  shift_id: string;
  reminder_type: '60min' | '15min';
  sent_at: string;
  delivery_status: string;
  twilio_sid: string | null;
}

export interface ActivityLog {
  id: string;
  shift_id: string;
  chatter_id: string;
  action: 'clock_in' | 'clock_out' | 'auto_missed' | 'manual_override';
  timestamp: string;
  metadata: Record<string, any>;
}

export interface ErrorLog {
  id: string;
  workflow_name: string;
  node_name: string | null;
  error_message: string;
  error_stack: string | null;
  input_data: Record<string, any>;
  retry_count: number;
  max_retries: number;
  resolved: boolean;
  created_at: string;
  resolved_at: string | null;
}

export interface ShiftWithChatter extends Shift {
  chatters?: { name: string; phone: string };
}

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
}
