import type { PostDTO } from '@lib/api/contracts';
import type { Timestamp, DocumentConverter } from '@lib/api/query';
import type { ImagesPreview } from './file';
import type { User } from './user';

export type Post = Omit<PostDTO, 'createdAt' | 'updatedAt' | 'images'> & {
  createdAt: Timestamp;
  updatedAt: Timestamp | null;
  images: ImagesPreview | null;
};

export type PostWithUser = Post & { user: User };

export const postConverter: DocumentConverter<Post> = {
  toDocument(post) {
    return { ...post };
  },
  fromDocument(snapshot, options) {
    const { id } = snapshot;
    const data = snapshot.data(options);

    return { id, ...data } as Post;
  }
};
