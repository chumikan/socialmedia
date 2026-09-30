import type { Timestamp } from '@lib/api/query';

type DataWithDate<T> = T & { createdAt: Timestamp };

export function mergeData<T>(
  sortData: boolean,
  ...posts: (DataWithDate<T>[] | null)[]
): DataWithDate<T>[] | null {
  const validData = posts.filter((post) => post) as DataWithDate<T>[][];
  const mergeData = validData.reduce((acc, post) => [...acc, ...post], []);

  return mergeData.length
    ? sortData
      ? mergeData.sort((a, b) => +b.createdAt.toDate() - +a.createdAt.toDate())
      : mergeData
    : null;
}
