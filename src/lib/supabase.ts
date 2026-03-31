import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const SUPABASE_URL = supabaseUrl;

type EdgeFunctionPayload<T> = {
  success?: boolean;
  error?: string;
  data?: T;
} & Record<string, unknown>;

export async function callEdgeFunction<T = unknown>(
  name: string,
  options: RequestInit = {}
): Promise<{ success: boolean; data?: T; error?: string }> {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    const payload = (await res.json()) as EdgeFunctionPayload<T>;

    if (!res.ok || payload.success === false) {
      return { success: false, error: payload.error || 'שגיאה בשרת' };
    }
    return { success: true, data: (payload.data ?? (payload as T)) };
  } catch {
    return { success: false, error: 'אין חיבור לשרת. נסה שוב.' };
  }
}
