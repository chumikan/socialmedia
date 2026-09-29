import type { Timestamp, DocumentConverter } from '@lib/api/query';

export type Bookmark = {
  id: string;
  createdAt: Timestamp;
};

export const bookmarkConverter: DocumentConverter<Bookmark> = {
  toDocument(bookmark) {
    return { ...bookmark };
  },
  fromDocument(snapshot, options) {
    const data = snapshot.data(options);

    return { ...data } as Bookmark;
  }
};
