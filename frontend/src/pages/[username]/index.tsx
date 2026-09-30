import { AnimatePresence } from 'framer-motion';
import { doc, query, where } from '@lib/api/query';
import { useUser } from '@lib/context/user-context';
import { useCollection } from '@lib/hooks/useCollection';
import { useDocument } from '@lib/hooks/useDocument';
import { postsCollection } from '@lib/api/collections';
import { mergeData } from '@lib/merge';
import { UserLayout, ProtectedLayout } from '@components/layout/common-layout';
import { MainLayout } from '@components/layout/main-layout';
import { UserDataLayout } from '@components/layout/user-data-layout';
import { UserHomeLayout } from '@components/layout/user-home-layout';
import { StatsEmpty } from '@components/post/stats-empty';
import { Loading } from '@components/ui/loading';
import { Post } from '@components/post/post';
import type { ReactElement, ReactNode, JSX } from 'react';

export default function UserPosts(): JSX.Element {
  const { user } = useUser();

  const { id, username, pinnedPost } = user ?? {};

  const { data: pinnedData } = useDocument(
    doc(postsCollection, pinnedPost ?? 'null'),
    {
      disabled: !pinnedPost,
      allowNull: true,
      includeUser: true
    }
  );

  const { data: ownerPosts, loading: ownerLoading } = useCollection(
    query(
      postsCollection,
      where('createdBy', '==', id),
      where('parent', '==', null)
    ),
    { includeUser: true, allowNull: true }
  );

  const { data: peoplePosts, loading: peopleLoading } = useCollection(
    query(
      postsCollection,
      where('createdBy', '!=', id),
      where('userReposts', 'array-contains', id)
    ),
    { includeUser: true, allowNull: true }
  );

  const mergedPosts = mergeData(true, ownerPosts, peoplePosts);

  return (
    <section>
      {ownerLoading || peopleLoading ? (
        <Loading className='mt-5' />
      ) : !mergedPosts ? (
        <StatsEmpty
          title={`@${username as string} hasn't posted`}
          description='When they do, their Posts will show up here.'
        />
      ) : (
        <AnimatePresence mode='popLayout'>
          {pinnedData && (
            <Post pinned {...pinnedData} key={`pinned-${pinnedData.id}`} />
          )}
          {mergedPosts
            .filter((post) => !pinnedData || post.id !== pinnedData.id)
            .map((post) => (
              <Post {...post} profile={user} key={post.id} />
            ))}
        </AnimatePresence>
      )}
    </section>
  );
}

UserPosts.getLayout = (page: ReactElement<unknown>): ReactNode => (
  <ProtectedLayout>
    <MainLayout>
      <UserLayout>
        <UserDataLayout>
          <UserHomeLayout>{page}</UserHomeLayout>
        </UserDataLayout>
      </UserLayout>
    </MainLayout>
  </ProtectedLayout>
);

export { getProfilePageProps as getServerSideProps } from '@lib/profile-route';
