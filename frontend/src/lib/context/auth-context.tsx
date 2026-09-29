import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import { api, ApiError, changes } from '@lib/api/client';
import { hydrate, getDocs } from '@lib/api/query';
import { userBookmarksCollection } from '@lib/api/collections';
import { getRandomId } from '@lib/random';
import type { User } from '@lib/types/user';
import type { Bookmark } from '@lib/types/bookmark';
import type { JSX, ReactNode } from 'react';
type AuthContext = {
  user: User | null;
  error: Error | null;
  loading: boolean;
  isAdmin: boolean;
  isBanned: boolean;
  randomSeed: string;
  userBookmarks: Bookmark[] | null;
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signInManual: (email: string, password: string) => Promise<void>;
};
export const AuthContext = createContext<AuthContext | null>(null);
export function AuthContextProvider({
  children
}: {
  children: ReactNode;
}): JSX.Element {
  const [user, setUser] = useState<User | null>(null);
  const [userBookmarks, setUserBookmarks] = useState<Bookmark[] | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    const refresh = async (): Promise<void> => {
      try {
        const u = hydrate<User>(await api('/auth/me'));
        if (!active) return;
        setUser(u);
        const bookmarks = await getDocs(userBookmarksCollection(u.id));
        if (active) setUserBookmarks(bookmarks.docs.map((d) => d.data()));
      } catch (e) {
        if (active)
          if (e instanceof ApiError && [401, 403].includes(e.status)) {
            setUser(null);
            setUserBookmarks(null);
          } else setError(e as Error);
      } finally {
        if (active) setLoading(false);
      }
    };
    const listener = (): void => {
      void refresh();
    };
    listener();
    changes.addEventListener('change', listener);
    const timer = setInterval(listener, 5000);
    return () => {
      active = false;
      changes.removeEventListener('change', listener);
      clearInterval(timer);
    };
  }, []);
  const authenticate = async (
    path: string,
    email: string,
    password: string
  ): Promise<void> => {
    try {
      setError(null);
      setUser(hydrate<User>(await api(path, 'POST', { email, password })));
    } catch (e) {
      setError(e as Error);
      toast.error((e as Error).message);
    }
  };
  const signOut = async (): Promise<void> => {
    await api('/auth/logout', 'POST');
    setUser(null);
    setUserBookmarks(null);
  };
  const signInWithGoogle = (): Promise<void> => {
    window.location.assign('/api/v1/auth/google');
    return Promise.resolve();
  };
  const randomSeed = useMemo(getRandomId, [user?.id]);
  return (
    <AuthContext.Provider
      value={{
        user,
        error,
        loading,
        userBookmarks,
        isAdmin: user?.isAdmin ?? false,
        isBanned: user?.isBanned ?? false,
        randomSeed,
        signOut,
        signInWithGoogle,
        signUpWithEmail: (e, p) => authenticate('/auth/register', e, p),
        signInManual: (e, p) => authenticate('/auth/login', e, p)
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth(): AuthContext {
  const context = useContext(AuthContext);
  if (!context) throw new Error('Auth provider required');
  return context;
}
