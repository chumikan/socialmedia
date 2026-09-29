import type { TweetDTO } from '@lib/api/contracts';
import type { Timestamp, DocumentConverter } from '@lib/api/query';
import type { ImagesPreview } from './file';
import type { User } from './user';

export type Tweet = Omit<TweetDTO, 'createdAt' | 'updatedAt' | 'images'> & {
  createdAt: Timestamp;
  updatedAt: Timestamp | null;
  images: ImagesPreview | null;
};

export type TweetWithUser = Tweet & { user: User };

export const tweetConverter: DocumentConverter<Tweet> = {
  toDocument(tweet) {
    return { ...tweet };
  },
  fromDocument(snapshot, options) {
    const { id } = snapshot;
    const data = snapshot.data(options);

    return { id, ...data } as Tweet;
  }
};
