import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const SUPABASE_URL = supabaseUrl;

export async function callEdgeFunction<T = any>(
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
    const data = await res.json();

    if (!res.ok || data.success === false) {
      return { success: false, error: data.error || 'שגיאה בשרת' };
    }
    return { success: true, data: data.data ?? data };
  } catch {
    return { success: false, error: 'אין חיבור לשרת. נסה שוב.' };
  }
}
