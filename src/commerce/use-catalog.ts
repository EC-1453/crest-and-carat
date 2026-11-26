import { useEffect, useState } from 'react';
import { loadCatalog, type Catalog } from './api';

type CatalogState = { status: 'loading' } | { status: 'failed' } | { status: 'ready'; catalog: Catalog };

export function useCatalog(enabled = true) {
  const [state, setState] = useState<CatalogState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void loadCatalog(controller.signal).then((catalog) => {
      if (!controller.signal.aborted) setState({ status: 'ready', catalog });
    }).catch(() => {
      if (!controller.signal.aborted) setState({ status: 'failed' });
    });
    return () => controller.abort();
  }, [attempt, enabled]);

  function reload() {
    setState({ status: 'loading' });
    setAttempt((value) => value + 1);
  }

  return { state, reload };
}
