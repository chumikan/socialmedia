import type { Timestamp, DocumentConverter } from '@lib/api/query';
import type { User } from './user';

export type Conversation = {
  id: string;
  userId: string;
  targetUserId: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp | null;
};

export type ConversationWithUser = Conversation & { user: User };

export const conversationConverter: DocumentConverter<Conversation> = {
  toDocument(conversation) {
    return { ...conversation };
  },
  fromDocument(snapshot, options) {
    const { id } = snapshot;
    const data = snapshot.data(options);

    return { id, ...data } as Conversation;
  }
};
