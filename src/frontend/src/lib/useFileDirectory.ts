import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { api } from './api';
import { toast } from '../components/Toast';

export interface FileEntry { name: string; isDirectory: boolean; size: number; modifiedAt?: string }
export const normalizeDirectory = (value: string) => '/' + value.split('/').filter(Boolean).join('/');

// Capture only at commit time, never at request start: users may scroll while fetching.
export function captureFileScroll(element: HTMLElement | null) {
  const nodes = new Set<HTMLElement>();
  for (let node = element; node; node = node.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(node).overflowY)) nodes.add(node);
  }
  const documentScroller = document.scrollingElement || document.documentElement;
  nodes.add(documentScroller as HTMLElement);
  const positions = [...nodes].map(node => ({ node, top: node.scrollTop, left: node.scrollLeft }));
  return (reset = false) => {
    for (const { node, top, left } of positions) {
      const nextTop = reset ? 0 : Math.min(top, Math.max(0, node.scrollHeight - node.clientHeight));
      const nextLeft = reset ? 0 : Math.min(left, Math.max(0, node.scrollWidth - node.clientWidth));
      // Do not interrupt touch momentum when the DOM update did not change the offset.
      if (node.scrollTop !== nextTop) node.scrollTop = nextTop;
      if (node.scrollLeft !== nextLeft) node.scrollLeft = nextLeft;
    }
  };
}

/** Navigation owns the location. Mutation revalidation can only update that location. */
export function useFileDirectory(serverId: string, requestedPath: string, container: RefObject<HTMLDivElement>) {
  const [view, setView] = useState({ serverId, path: requestedPath, items: [] as FileEntry[], ready: false });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const active = useRef<{ serverId: string; path: string; generation: number; alive: boolean; ready: boolean; revision: number; job?: Promise<void> }>({ serverId, path: requestedPath, generation: 0, alive: false, ready: false, revision: 0 });
  const restoreScroll = useRef<((reset?: boolean) => void) | null>(null);
  const rendered = useRef(view);
  rendered.current = view;

  useLayoutEffect(() => { restoreScroll.current?.(); restoreScroll.current = null; }, [view]);

  const fetchDirectory = useCallback((state: typeof active.current) => {
    if (state.job) return state.job;
    state.job = (async () => {
      do {
        const revision = state.revision;
        try {
          const items = await api(`/api/servers/${state.serverId}/files/list?path=${encodeURIComponent(state.path)}`) as FileEntry[];
          if (!state.alive || active.current !== state) return;
          // An action finished during this fetch. Discard that snapshot and fetch once more.
          if (revision !== state.revision) continue;
          const navigated = rendered.current.serverId !== state.serverId || rendered.current.path !== state.path;
          const restore = captureFileScroll(container.current);
          restoreScroll.current = () => restore(navigated);
          state.ready = true;
          setView({ serverId: state.serverId, path: state.path, items: items || [], ready: true });
          setError('');
        } catch (failure: any) {
          if (!state.alive || active.current !== state) return;
          if (revision !== state.revision) continue;
          setError(failure.message || 'Failed to load files.');
          toast(failure.message || 'Failed to load files.', 'error');
        }
        break;
      } while (state.alive && active.current === state);
    })().finally(() => {
      state.job = undefined;
      if (state.alive && active.current === state) { setLoading(false); setRefreshing(false); }
    });
    return state.job;
  }, [container]);

  useEffect(() => {
    const previous = active.current;
    previous.alive = false;
    const state = { serverId, path: requestedPath, generation: previous.generation + 1, alive: true, ready: false, revision: 0 };
    active.current = state;
    setLoading(true);
    setRefreshing(false);
    setError('');
    void fetchDirectory(state);
    return () => { state.alive = false; };
  }, [serverId, requestedPath, fetchDirectory]);

  const refresh = useCallback((originServer = serverId, originPath = requestedPath) => {
    const state = active.current;
    if (!state.alive || state.serverId !== originServer || state.path !== originPath) return Promise.resolve();
    state.revision++;
    if (state.ready) setRefreshing(true);
    return fetchDirectory(state);
  }, [serverId, requestedPath, fetchDirectory]);

  const matches = view.serverId === serverId && view.path === requestedPath;
  return { items: view.items, currentPath: view.path, initialLoading: !view.ready && loading, navigating: !matches || loading && !active.current.ready,
    refreshing, error, refresh, ready: view.ready, active };
}
