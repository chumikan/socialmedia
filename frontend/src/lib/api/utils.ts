import { api } from './client';
import { getDocs, query, where, limit, getCountFromServer } from './query';
import { usersCollection } from './collections';
import type { Query } from './query';
import type { EditableUserData } from '@lib/types/user';
import type { FilesWithId, ImagesPreview } from '@lib/types/file';
import type { Tweet } from '@lib/types/tweet';
import type { Theme, Accent } from '@lib/types/theme';
export async function checkUsernameAvailability(
  username: string
): Promise<boolean> {
  if (
    !/^[a-zA-Z0-9_]{3,30}$/.test(username) ||
    [
      'home',
      'notifications',
      'messages',
      'bookmarks',
      'explore',
      'api',
      'admin',
      'login',
      'assets'
    ].includes(username.toLowerCase())
  )
    return false;
  return (
    await getDocs(
      query(usersCollection, where('username', '==', username), limit(1))
    )
  ).empty;
}
export async function getCollectionCount<T>(ref: Query<T>): Promise<number> {
  return (await getCountFromServer(ref)).data().count;
}
export async function updateUserData(
  userId: string,
  data: EditableUserData
): Promise<void> {
  await api(`/users/${userId}`, 'PATCH', data);
}
export async function updateUserTheme(
  userId: string,
  data: { theme?: Theme; accent?: Accent }
): Promise<void> {
  await api(`/users/${userId}`, 'PATCH', data);
}
export async function updateUsername(
  userId: string,
  username?: string
): Promise<void> {
  await api(`/users/${userId}`, 'PATCH', { username });
}
export async function managePinnedTweet(
  type: 'pin' | 'unpin',
  userId: string,
  tweetId: string
): Promise<void> {
  await api(`/users/${userId}`, 'PATCH', {
    pinnedTweet: type === 'pin' ? tweetId : null
  });
}
export async function manageFollow(
  type: 'follow' | 'unfollow',
  _userId: string,
  target: string
): Promise<void> {
  await api(`/users/${target}/follow`, type === 'follow' ? 'PUT' : 'DELETE');
}
export async function removeTweet(id: string): Promise<void> {
  await api(`/posts/${id}`, 'DELETE');
}
export function manageRetweet(
  type: 'retweet' | 'unretweet',
  _userId: string,
  id: string
): () => Promise<void> {
  return async () => {
    await api(`/posts/${id}/repost`, type === 'retweet' ? 'PUT' : 'DELETE');
  };
}
export function manageLike(
  type: 'like' | 'unlike',
  _userId: string,
  tweet: Tweet
): () => Promise<void> {
  return async () => {
    await api(`/posts/${tweet.id}/like`, type === 'like' ? 'PUT' : 'DELETE');
  };
}
export async function manageBookmark(
  type: 'bookmark' | 'unbookmark',
  _userId: string,
  id: string
): Promise<void> {
  await api(`/posts/${id}/bookmark`, type === 'bookmark' ? 'PUT' : 'DELETE');
}
export async function clearAllBookmarks(_userId: string): Promise<void> {
  void _userId;
  await api('/bookmarks', 'DELETE');
}
export async function uploadImages(
  _userId: string,
  files: FilesWithId
): Promise<ImagesPreview | null> {
  if (!files.length) return null;
  return Promise.all(
    files.map((file) => {
      const data = new FormData();
      data.set('file', file);
      return api<ImagesPreview[number]>('/media', 'POST', data);
    })
  );
}
