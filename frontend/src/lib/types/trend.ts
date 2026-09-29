import type { Timestamp, DocumentConverter } from '@lib/api/query';
import type { User } from './user';

export type Trend = {
  id: string;
  text: string | null;
  parent: { id: string; username: string } | null;
  counter: number;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp | null;
};

export type TrendWithUser = Trend & { user: User };

export const trendConverter: DocumentConverter<Trend> = {
  toDocument(trend) {
    return { ...trend };
  },
  fromDocument(snapshot, options) {
    const { id } = snapshot;
    const data = snapshot.data(options);

    return { id, ...data } as Trend;
  }
};
