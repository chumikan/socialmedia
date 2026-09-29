import type { Timestamp, DocumentConverter } from '@lib/api/query';

export type Message = {
  id: string;
  conversationId: string;
  text: string;
  userId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp | null;
};

export const messageConverter: DocumentConverter<Message> = {
  toDocument(message) {
    return { ...message };
  },
  fromDocument(snapshot, options) {
    const { id } = snapshot;
    const data = snapshot.data(options);

    return { id, ...data } as Message;
  }
};
