import { toast } from 'react-hot-toast';
import { api, changes } from './client';

/** UI date value. Transport timestamps are RFC3339 strings, never SDK objects. */
export class Timestamp {
  constructor(private value: string) {}
  toDate(): Date {
    return new Date(this.value);
  }
  toMillis(): number {
    return this.toDate().getTime();
  }
  toJSON(): string {
    return this.value;
  }
}
export function hydrate<T>(data: unknown): T {
  if (Array.isArray(data)) return data.map((v: unknown) => hydrate(v)) as T;
  if (data && typeof data === 'object')
    return Object.fromEntries(
      Object.entries(data).map(([k, v]) => [
        k,
        (k === 'createdAt' || k === 'updatedAt') && typeof v === 'string'
          ? new Timestamp(v)
          : hydrate(v)
      ])
    ) as T;
  return data as T;
}
export type DocumentConverter<T> = {
  toDocument(value: T): unknown;
  fromDocument(
    snapshot: { id: string; data(options?: unknown): Record<string, unknown> },
    options?: unknown
  ): T;
};
export type WithFieldValue<T> = T;
export type QueryConstraint = {
  kind: string;
  field?: string;
  op?: string;
  value?: unknown;
};
export type Query<T> = {
  collection: string;
  constraints: QueryConstraint[];
  readonly model?: T;
  kind: 'query';
};
export type CollectionReference<T> = Query<T> & {
  withConverter<U>(converter: DocumentConverter<U>): CollectionReference<U>;
};
export type DocumentReference<T> = {
  collection: string;
  id: string;
  readonly model?: T;
  kind: 'document';
};
export function collection<T = Record<string, unknown>>(
  path: string
): CollectionReference<T> {
  return {
    collection: path,
    constraints: [],
    kind: 'query',
    withConverter<U>(): CollectionReference<U> {
      return collection<U>(path);
    }
  };
}
export function doc<T>(ref: Query<T>, id: string): DocumentReference<T> {
  return { collection: ref.collection, id, kind: 'document' };
}
export function query<T>(
  ref: Query<T>,
  ...constraints: QueryConstraint[]
): Query<T> {
  return { ...ref, constraints: [...ref.constraints, ...constraints] };
}
export const where = (
  field: string,
  op: string,
  value: unknown
): QueryConstraint => ({ kind: 'where', field, op, value });
export const orderBy = (field: string, op = 'asc'): QueryConstraint => ({
  kind: 'order',
  field,
  op
});
export const limit = (value: number): QueryConstraint => ({
  kind: 'limit',
  value
});
export const startAt = (value: unknown): QueryConstraint => ({
  kind: 'start',
  value
});
export const endAt = (value: unknown): QueryConstraint => ({
  kind: 'end',
  value
});
export const documentId = (): string => 'id';
export const queryEqual = <T>(a: Query<T>, b: Query<T>): boolean =>
  JSON.stringify(a) === JSON.stringify(b);
export const refEqual = <T>(
  a: DocumentReference<T>,
  b: DocumentReference<T>
): boolean => JSON.stringify(a) === JSON.stringify(b);
export type DocumentSnapshot<T> = {
  id: string;
  ref: DocumentReference<T>;
  exists(): boolean;
  data(options?: unknown): T;
};
export type QuerySnapshot<T> = {
  docs: DocumentSnapshot<T>[];
  empty: boolean;
  size: number;
  forEach(fn: (doc: DocumentSnapshot<T>) => void): void;
};
function snapshot<T>(
  ref: DocumentReference<T>,
  value?: T
): DocumentSnapshot<T> {
  return {
    id: ref.id,
    ref,
    exists: () => value !== undefined,
    data: () => value as T
  };
}
export async function getPage<T>(
  ref: Query<T>,
  cursor = '',
  pageSize = 50
): Promise<{ items: T[]; nextCursor: string }> {
  const result = await api<{ items: unknown[]; nextCursor: string }>(
    '/query',
    'POST',
    {
      collection: ref.collection,
      constraints: ref.constraints.filter((c) => c.kind !== 'limit'),
      limit: pageSize,
      cursor
    }
  );
  return { items: hydrate<T[]>(result.items), nextCursor: result.nextCursor };
}
export async function getDocs<T>(ref: Query<T>): Promise<QuerySnapshot<T>> {
  const max = Number(
    ref.constraints.find((c) => c.kind === 'limit')?.value ??
      Number.POSITIVE_INFINITY
  );
  let cursor = '';
  const items: T[] = [];
  do {
    const page = await getPage(ref, cursor, Math.min(100, max - items.length));
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor && items.length < max);
  const docs = items.map((v) =>
    snapshot(doc(ref, (v as { id: string }).id), v)
  );
  return {
    docs,
    empty: !docs.length,
    size: docs.length,
    forEach: (fn) => docs.forEach(fn)
  };
}
export async function getDoc<T>(
  ref: DocumentReference<T>
): Promise<DocumentSnapshot<T>> {
  const result = await getPage(
    query(collection<T>(ref.collection), where('id', '==', ref.id)),
    '',
    1
  );
  return snapshot(ref, result.items[0]);
}
export async function getCountFromServer<T>(
  ref: Query<T>
): Promise<{ data(): { count: number } }> {
  const result = await api<{ count: number }>('/query', 'POST', {
    collection: ref.collection,
    constraints: ref.constraints.filter((c) => c.kind !== 'limit'),
    count: true,
    limit: 1
  });
  return { data: () => result };
}
export function onSnapshot<T>(
  ref: DocumentReference<T>,
  callback: (snapshot: DocumentSnapshot<T>) => void
): () => void;
export function onSnapshot<T>(
  ref: Query<T>,
  callback: (snapshot: QuerySnapshot<T>) => void
): () => void;
export function onSnapshot<T>(
  ref: Query<T> | DocumentReference<T>,
  callback:
    | ((snapshot: DocumentSnapshot<T>) => void)
    | ((snapshot: QuerySnapshot<T>) => void)
): () => void {
  let active = true;
  let running = false;
  let dirty = false;
  const refresh = async (): Promise<void> => {
    if (running) {
      dirty = true;
      return;
    }
    running = true;
    try {
      const result =
        ref.kind === 'document' ? await getDoc(ref) : await getDocs(ref);
      if (active) (callback as (value: typeof result) => void)(result);
    } catch (error) {
      if (active) {
        toast.error((error as Error).message, { id: 'api-read-error' });
        if (ref.kind === 'document')
          (callback as (value: DocumentSnapshot<T>) => void)(snapshot(ref));
        else
          (callback as (value: QuerySnapshot<T>) => void)({
            docs: [],
            empty: true,
            size: 0,
            forEach: () => undefined
          });
      }
    } finally {
      running = false;
      if (active && dirty) {
        dirty = false;
        void refresh();
      }
    }
  };
  const listener = (): void => {
    void refresh();
  };
  listener();
  const timer = setInterval(listener, 5000);
  changes.addEventListener('change', listener);
  return () => {
    active = false;
    clearInterval(timer);
    changes.removeEventListener('change', listener);
  };
}
export async function updateDoc<T>(
  ref: DocumentReference<T>,
  value: Partial<T>
): Promise<void> {
  if (ref.collection !== 'notifications')
    throw new Error('Use a typed mutation API');
  await api(`/notifications/${encodeURIComponent(ref.id)}`, 'PATCH', value);
}
