import { collection } from '@lib/api/query';
import { userConverter } from '@lib/types/user';
import { postConverter } from '@lib/types/post';
import { bookmarkConverter } from '@lib/types/bookmark';
import { notificationConverter } from '@lib/types/notification';
import { statsConverter } from '@lib/types/stats';
import { trendConverter } from '@lib/types/trend';
import type { CollectionReference } from '@lib/api/query';
import type { Bookmark } from '@lib/types/bookmark';
import type { Stats } from '@lib/types/stats';

export const usersCollection = collection('users').withConverter(userConverter);

export const postsCollection = collection('posts').withConverter(postConverter);

export const trendsCollection =
  collection('trends').withConverter(trendConverter);

export const notificationsCollection = collection(
  'notifications'
).withConverter(notificationConverter);

export function userBookmarksCollection(
  id: string
): CollectionReference<Bookmark> {
  return collection(`users/${id}/bookmarks`).withConverter(bookmarkConverter);
}

export function userStatsCollection(id: string): CollectionReference<Stats> {
  return collection(`users/${id}/stats`).withConverter(statsConverter);
}
