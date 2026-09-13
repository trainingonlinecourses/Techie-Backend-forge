import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext.jsx';

export function useProgress() {
  const { user, loading: authLoading } = useAuth();
  const [progress, setProgress] = useState({});
  // True once the progress state is final for the current user: immediately for
  // guests (nothing to load), after the fetch resolves/fails for signed-in
  // users. Auth hydration (a stored token being validated) also holds this off —
  // otherwise consumers would see a transient empty progress for a signed-in
  // user and mistake it for "nothing completed yet".
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (authLoading) {
      setReady(false);
      return;
    }
    if (!user) {
      setProgress({});
      setReady(true);
      return;
    }
    setReady(false); // switching accounts — the previous state no longer applies
    api
      .get('/progress')
      .then((res) => setProgress(res.data || {}))
      .catch(() => setProgress({}))
      .finally(() => setReady(true));
  }, [user?.id, authLoading]);

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

  return { progress, toggle, ready, completedCount: Object.keys(progress).length };
}
