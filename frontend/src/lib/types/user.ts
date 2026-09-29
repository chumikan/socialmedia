import type { UserDTO } from '@lib/api/contracts';
import type { Theme, Accent } from './theme';
import type { Timestamp, DocumentConverter } from '@lib/api/query';

export type User = Omit<
  UserDTO,
  'createdAt' | 'updatedAt' | 'theme' | 'accent'
> & {
  createdAt: Timestamp;
  updatedAt: Timestamp | null;
  theme: Theme | null;
  accent: Accent | null;
};

export type EditableData = Extract<
  keyof User,
  'bio' | 'name' | 'website' | 'photoURL' | 'location' | 'coverPhotoURL'
>;

export type EditableUserData = Pick<User, EditableData>;

export const userConverter: DocumentConverter<User> = {
  toDocument(user) {
    return { ...user };
  },
  fromDocument(snapshot, options) {
    const data = snapshot.data(options);
    return { ...data } as User;
  }
};
