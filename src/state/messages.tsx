import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ChatLine, THREAD_MESSAGES, THREADS, Thread, ThreadKind } from '@/data/chat';
import { loadJson, saveJson } from '@/lib/storage';

const STORAGE_KEY = 'xleague.messages.v2';

type Store = {
  threads: Thread[];
  lines: Record<string, ChatLine[]>;
};

const DEFAULT: Store = {
  threads: THREADS,
  lines: THREAD_MESSAGES,
};

type MessagesContextValue = {
  ready: boolean;
  threads: Thread[];
  unreadTotal: number;
  linesFor: (threadId: string) => ChatLine[];
  threadById: (threadId: string) => Thread | undefined;
  send: (threadId: string, text: string, initials?: string) => void;
  markRead: (threadId: string) => void;
  ensureMatchThread: (opts: { id: string; title: string; preview?: string }) => void;
};

const MessagesContext = createContext<MessagesContextValue | null>(null);

function clockNow() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function MessagesProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [store, setStore] = useState<Store>(DEFAULT);

  useEffect(() => {
    loadJson<Store>(STORAGE_KEY, DEFAULT).then((loaded) => {
      const ids = new Set(loaded.threads.map((t) => t.id));
      const threads = [...loaded.threads, ...THREADS.filter((t) => !ids.has(t.id))];
      const lines = { ...THREAD_MESSAGES, ...loaded.lines };
      setStore({ threads, lines });
      setReady(true);
    });
  }, []);

  const commit = useCallback((updater: (prev: Store) => Store) => {
    setStore((prev) => {
      const next = updater(prev);
      void saveJson(STORAGE_KEY, next);
      return next;
    });
  }, []);

  const linesFor = useCallback((threadId: string) => store.lines[threadId] ?? [], [store.lines]);

  const threadById = useCallback(
    (threadId: string) => store.threads.find((t) => t.id === threadId),
    [store.threads],
  );

  const markRead = useCallback(
    (threadId: string) => {
      commit((prev) => ({
        ...prev,
        threads: prev.threads.map((t) => (t.id === threadId ? { ...t, unread: 0 } : t)),
      }));
    },
    [commit],
  );

  const send = useCallback(
    (threadId: string, text: string, initials = 'BE') => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const at = clockNow();
      const line: ChatLine = {
        id: `m-${Date.now()}`,
        from: 'you',
        initials,
        text: trimmed,
        at,
      };
      commit((prev) => {
        const lines = {
          ...prev.lines,
          [threadId]: [...(prev.lines[threadId] ?? []), line],
        };
        const has = prev.threads.some((t) => t.id === threadId);
        const threads = has
          ? prev.threads.map((t) =>
              t.id === threadId ? { ...t, preview: trimmed, when: at, unread: 0 } : t,
            )
          : [
              {
                id: threadId,
                title: threadId,
                kind: 'match' as ThreadKind,
                preview: trimmed,
                when: at,
                unread: 0,
              },
              ...prev.threads,
            ];
        return { threads, lines };
      });
    },
    [commit],
  );

  const ensureMatchThread = useCallback(
    (opts: { id: string; title: string; preview?: string }) => {
      commit((prev) => {
        if (prev.threads.some((t) => t.id === opts.id)) return prev;
        const at = clockNow();
        const thread: Thread = {
          id: opts.id,
          title: opts.title,
          kind: 'match',
          preview: opts.preview ?? 'Match lobby open',
          when: at,
          unread: 0,
        };
        const seed: ChatLine[] = [
          {
            id: `seed-${opts.id}`,
            from: 'them',
            initials: 'XL',
            text: opts.preview ?? 'Lobby is open. Confirm arrival and cash at the gate.',
            at,
          },
        ];
        return {
          threads: [thread, ...prev.threads],
          lines: { ...prev.lines, [opts.id]: prev.lines[opts.id] ?? seed },
        };
      });
    },
    [commit],
  );

  const unreadTotal = useMemo(
    () => store.threads.reduce((sum, t) => sum + (t.unread || 0), 0),
    [store.threads],
  );

  const value = useMemo(
    () => ({
      ready,
      threads: store.threads,
      unreadTotal,
      linesFor,
      threadById,
      send,
      markRead,
      ensureMatchThread,
    }),
    [ready, store.threads, unreadTotal, linesFor, threadById, send, markRead, ensureMatchThread],
  );

  return <MessagesContext.Provider value={value}>{children}</MessagesContext.Provider>;
}

export function useMessages() {
  const ctx = useContext(MessagesContext);
  if (!ctx) throw new Error('useMessages must be used inside MessagesProvider');
  return ctx;
}
