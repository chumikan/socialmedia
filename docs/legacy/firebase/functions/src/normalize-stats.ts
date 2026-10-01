import { functions, firestore, regionalFunctions } from './lib/utils';
import { postConverter } from './types';
import type { Post } from './types';

export const normalizeStats = regionalFunctions.firestore
  .document('posts/{postId}')
  .onDelete(async (snapshot): Promise<void> => {
    const postId = snapshot.id;
    const postData = snapshot.data() as Post;

    functions.logger.info(`Normalizing stats from post ${postId}`);

    const { userReposts, userLikes } = postData;

    const usersStatsToDelete = new Set([...userReposts, ...userLikes]);

    const batch = firestore().batch();

    usersStatsToDelete.forEach((userId) => {
      functions.logger.info(`Deleting stats from ${userId}`);

      const userStatsRef = firestore()
        .doc(`users/${userId}/stats/stats`)
        .withConverter(postConverter);

      batch.update(userStatsRef, {
        posts: firestore.FieldValue.arrayRemove(postId),
        likes: firestore.FieldValue.arrayRemove(postId)
      });
    });

    await batch.commit();

    functions.logger.info(`Normalizing stats for post ${postId} is done`);
  });
