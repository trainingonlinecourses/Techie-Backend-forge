import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext.jsx';

export function useProgress() {
  const { user } = useAuth();
  const [progress, setProgress] = useState({});

  useEffect(() => {
    if (!user) {
      setProgress({});
      return;
    }
    api
      .get('/progress')
      .then((res) => setProgress(res.data || {}))
      .catch(() => setProgress({}));
  }, [user?.id]);

  const toggle = useCallback(
    async (lessonId, completed) => {
      if (!user) return;
      try {
        const res = completed
          ? await api.delete(`/progress/${lessonId}`)
          : await api.post(`/progress/${lessonId}`);
        setProgress(res.data || {});
      } catch {
        /* ignore */
      }
    },
    [user]
  );

  return { progress, toggle, completedCount: Object.keys(progress).length };
}
