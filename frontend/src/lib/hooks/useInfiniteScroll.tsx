import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'react-hot-toast';
import { query, getPage, getDoc, doc } from '@lib/api/query';
import { changes } from '@lib/api/client';
import { usersCollection } from '@lib/api/collections';
import type { JSX } from 'react';
import type { Query, QueryConstraint } from '@lib/api/query';
import type { UseCollectionOptions } from './useCollection';
import type { User } from '@lib/types/user';
type Result<T> = {
  data: T[] | null;
  loading: boolean;
  LoadMore: () => JSX.Element;
};
export function useInfiniteScroll<T>(
  collection: Query<T>,
  constraints: QueryConstraint[],
  fetchOptions: UseCollectionOptions & { includeUser: true },
  options?: { initialSize?: number; stepSize?: number; marginBottom?: number }
): Result<T & { user: User }>;
export function useInfiniteScroll<T>(
  collection: Query<T>,
  constraints: QueryConstraint[],
  fetchOptions?: UseCollectionOptions,
  options?: { initialSize?: number; stepSize?: number; marginBottom?: number }
): Result<T>;
export function useInfiniteScroll<T>(
  collection: Query<T>,
  constraints: QueryConstraint[],
  fetchOptions?: UseCollectionOptions,
  options?: { initialSize?: number; stepSize?: number; marginBottom?: number }
): Result<T> {
  const [data, setData] = useState<T[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState('');
  const key = JSON.stringify(query(collection, ...constraints));
  const generation = useRef(0);
  const busy = useRef(false);
  const moreLoaded = useRef(false);
  const load = useCallback(
    async (next = '', refresh = false): Promise<void> => {
      if (busy.current && !refresh) return;
      busy.current = true;
      if (next) moreLoaded.current = true;
      const current = generation.current;
      try {
        const page = await getPage<T>(
          JSON.parse(key) as Query<T>,
          next,
          options?.stepSize ?? 20
        );
        const items = await Promise.all(
          page.items.map(async (item) => {
            if (!fetchOptions?.includeUser) return item;
            const field =
              typeof fetchOptions.includeUser === 'string'
                ? fetchOptions.includeUser
                : 'createdBy';
            const user = (
              await getDoc(
                doc(usersCollection, (item as Record<string, string>)[field])
              )
            ).data();
            return { ...item, user };
          })
        );
        if (current !== generation.current) return;
        setData((old) =>
          next
            ? Array.from(
                new Map(
                  [...(old ?? []), ...items].map((v) => [
                    (v as { id: string }).id,
                    v
                  ])
                ).values()
              )
            : items
        );
        setCursor(page.nextCursor);
      } catch (error) {
        if (current === generation.current)
          toast.error((error as Error).message, { id: 'feed-error' });
      } finally {
        if (current === generation.current) {
          setLoading(false);
          busy.current = false;
        }
      }
    },
    [key, fetchOptions?.includeUser, options?.stepSize]
  );
  useEffect(() => {
    generation.current++;
    busy.current = false;
    setLoading(true);
    setData(null);
    setCursor('');
    void load();
    const invalidate = (): void => {
      generation.current++;
    };
    const refresh = (): void => {
      moreLoaded.current = false;
      invalidate();
      busy.current = false;
      void load('', true);
    };
    changes.addEventListener('change', refresh);
    const timer = setInterval(() => {
      if (!moreLoaded.current) void load();
    }, 10000);
    return () => {
      invalidate();
      clearInterval(timer);
      changes.removeEventListener('change', refresh);
    };
  }, [load]);
  const LoadMore = useCallback(
    (): JSX.Element =>
      cursor ? (
        <button
          className='w-full p-4 text-main-accent'
          onClick={(): void => {
            void load(cursor);
          }}
        >
          Load more
        </button>
      ) : (
        <></>
      ),
    [cursor, load]
  );
  return { data, loading, LoadMore };
}
