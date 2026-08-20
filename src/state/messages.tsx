import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ChatLine, THREAD_MESSAGES } from '@/data/chat';
import { loadJson, saveJson } from '@/lib/storage';

const STORAGE_KEY = 'xleague.messages.v1';

type MessagesContextValue = {
  ready: boolean;
  linesFor: (threadId: string) => ChatLine[];
  send: (threadId: string, text: string, initials?: string) => void;
};

const MessagesContext = createContext<MessagesContextValue | null>(null);

export function MessagesProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [threads, setThreads] = useState<Record<string, ChatLine[]>>(THREAD_MESSAGES);

  useEffect(() => {
    loadJson<Record<string, ChatLine[]>>(STORAGE_KEY, THREAD_MESSAGES).then((loaded) => {
      setThreads(loaded);
      setReady(true);
    });
  }, []);

  const persist = useCallback(async (next: Record<string, ChatLine[]>) => {
    setThreads(next);
    await saveJson(STORAGE_KEY, next);
  }, []);

  const linesFor = useCallback((threadId: string) => threads[threadId] ?? [], [threads]);

  const send = useCallback(
    (threadId: string, text: string, initials = 'BE') => {
      const line: ChatLine = {
        id: String(Date.now()),
        from: 'you',
        initials,
        text,
        at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      persist({ ...threads, [threadId]: [...(threads[threadId] ?? []), line] });
    },
    [persist, threads],
  );

  const value = useMemo(() => ({ ready, linesFor, send }), [ready, linesFor, send]);

  return <MessagesContext.Provider value={value}>{children}</MessagesContext.Provider>;
}

export function useMessages() {
  const ctx = useContext(MessagesContext);
  if (!ctx) throw new Error('useMessages must be used inside MessagesProvider');
  return ctx;
}
