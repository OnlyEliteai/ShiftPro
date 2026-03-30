import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Model } from '../lib/types';

export function useModels() {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchModels = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('models')
      .select('*')
      .order('name');

    if (!error && data) {
      setModels(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  const createModel = useCallback(
    async (name: string): Promise<{ error?: string }> => {
      const trimmed = name.trim();
      if (!trimmed) return { error: 'שם המודל לא יכול להיות ריק' };

      // Check duplicate
      const existing = models.find(
        (m) => m.name.toLowerCase() === trimmed.toLowerCase()
      );
      if (existing) return { error: 'מודל בשם זה כבר קיים' };

      const { error } = await supabase
        .from('models')
        .insert({ name: trimmed });

      if (error) return { error: error.message };
      await fetchModels();
      return {};
    },
    [models, fetchModels]
  );

  const toggleModelActive = useCallback(
    async (id: string, active: boolean): Promise<{ error?: string }> => {
      const { error } = await supabase
        .from('models')
        .update({ active })
        .eq('id', id);

      if (error) return { error: error.message };
      await fetchModels();
      return {};
    },
    [fetchModels]
  );

  const deleteModel = useCallback(
    async (id: string): Promise<{ error?: string }> => {
      const model = models.find((m) => m.id === id);
      if (!model) return { error: 'מודל לא נמצא' };

      // Check for future shifts referencing this model name
      const today = new Date().toISOString().split('T')[0];
      const { data: futureShifts } = await supabase
        .from('shifts')
        .select('id')
        .eq('model', model.name)
        .gte('date', today)
        .limit(1);

      if (futureShifts && futureShifts.length > 0) {
        return { error: 'יש משמרות עתידיות למודל זה' };
      }

      const { error } = await supabase.from('models').delete().eq('id', id);
      if (error) return { error: error.message };
      await fetchModels();
      return {};
    },
    [models, fetchModels]
  );

  const activeModels = models.filter((m) => m.active);

  return {
    models,
    activeModels,
    loading,
    fetchModels,
    createModel,
    toggleModelActive,
    deleteModel,
  };
}
