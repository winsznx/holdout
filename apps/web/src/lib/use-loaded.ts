'use client';

import { useEffect, useState } from 'react';
import type { DataResult } from './data-result';

export type Loaded<T> = { status: 'loading' } | DataResult<T>;

/** `load` must be a stable function (module level or useCallback). Remount with a key to reload. */
export function useLoaded<T>(load: () => Promise<DataResult<T>>): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>({ status: 'loading' });
  useEffect(() => {
    let current = true;
    void load().then((result) => {
      if (current) setState(result);
    });
    return () => {
      current = false;
    };
  }, [load]);
  return state;
}
