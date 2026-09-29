import type { Timestamp, DocumentConverter } from '@lib/api/query';
import type { User } from './user';

export type Notification = {
  id: string;
  isChecked: boolean;
  type: string;
  userId: string;
  targetUserId: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp | null;
};

export type NotificationWithUser = Notification & { user: User };

export const notificationConverter: DocumentConverter<Notification> = {
  toDocument(notification) {
    return { ...notification };
  },
  fromDocument(snapshot, options) {
    const { id } = snapshot;
    const data = snapshot.data(options);

    return { id, ...data } as Notification;
  }
};
