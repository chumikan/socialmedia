import type { Timestamp, DocumentConverter } from '@lib/api/query';

export type Stats = {
  likes: string[];
  posts: string[];
  updatedAt: Timestamp | null;
};

export const statsConverter: DocumentConverter<Stats> = {
  toDocument(stats) {
    return { ...stats };
  },
  fromDocument(snapshot, options) {
    const data = snapshot.data(options);

    return { ...data } as Stats;
  }
};
