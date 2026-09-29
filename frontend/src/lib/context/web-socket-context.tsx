import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '@lib/api/client';
import { useAuth } from './auth-context';
import type { JSX, ReactNode } from 'react';
type SocketContext = { onlineUsers: string[] };
export const SocketContext = createContext<SocketContext | null>(null);
export function SocketContextProvider({
  children
}: {
  children: ReactNode;
}): JSX.Element {
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const { user } = useAuth();
  const userId = user?.id;
  useEffect(() => {
    if (!userId) {
      setOnlineUsers([]);
      return;
    }
    let active = true;
    const refresh = (): void => {
      void api<string[]>('/presence')
        .then((ids) => {
          if (active) setOnlineUsers(ids);
        })
        .catch(() => {
          if (active) setOnlineUsers([]);
        });
    };
    refresh();
    const timer = setInterval(refresh, 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [userId]);
  return (
    <SocketContext.Provider value={{ onlineUsers }}>
      {children}
    </SocketContext.Provider>
  );
}
export function useSocket(): SocketContext {
  const value = useContext(SocketContext);
  if (!value) throw new Error('Socket provider required');
  return value;
}
