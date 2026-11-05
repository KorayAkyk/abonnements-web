import { useCallback, useEffect, useState } from 'react';

/** Charge des données au montage et expose un rechargement. loader doit être stable : fonction de module ou useCallback. */
export function useAsync(loader) {
  const [state, setState] = useState({ data: null, error: null, isLoading: true });

  const reload = useCallback(async () => {
    try {
      const data = await loader();
      setState({ data, error: null, isLoading: false });
    } catch (error) {
      setState({ data: null, error, isLoading: false });
    }
  }, [loader]);

  useEffect(() => {
    let isCurrent = true;
    loader()
      .then((data) => isCurrent && setState({ data, error: null, isLoading: false }))
      .catch((error) => isCurrent && setState({ data: null, error, isLoading: false }));
    return () => {
      isCurrent = false;
    };
  }, [loader]);

  return { ...state, reload };
}
