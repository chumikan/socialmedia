import type {
  Timestamp,
  FirestoreDataConverter
} from 'firebase-admin/firestore';

export type ImageData = {
  src: string;
  alt: string;
};

export type ImagesPreview = (ImageData & {
  id: number;
})[];

export type Post = {
  text: string | null;
  images: ImagesPreview | null;
  parent: { id: string; username: string } | null;
  userLikes: string[];
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp | null;
  userReplies: number;
  userReposts: string[];
};

export const postConverter: FirestoreDataConverter<Post> = {
  toFirestore(post) {
    return { ...post };
  },
  fromFirestore(snapshot) {
    const data = snapshot.data();

    return { ...data } as Post;
  }
};
