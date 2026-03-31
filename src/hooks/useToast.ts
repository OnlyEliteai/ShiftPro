import { useState, useCallback, useRef, useEffect } from 'react';
import type { Toast } from '../lib/types';

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timeoutIds = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const showToast = useCallback((type: Toast['type'], message: string) => {
    const id = crypto.randomUUID();
    setToasts(prev => [...prev, { id, type, message }]);
    const tid = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
      timeoutIds.current.delete(tid);
    }, 4000);
    timeoutIds.current.add(tid);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Clear pending timeouts on unmount
  useEffect(() => {
    const activeTimeouts = timeoutIds.current;
    return () => {
      activeTimeouts.forEach(clearTimeout);
    };
  }, []);

  return { toasts, showToast, dismissToast };
}
