import { AnimatePresence } from 'framer-motion';
import { doc, query, where, orderBy } from '@lib/api/query';
import { useCollection } from '@lib/hooks/useCollection';
import { useDocument } from '@lib/hooks/useDocument';
import { postsCollection } from '@lib/api/collections';
import { useUser } from '@lib/context/user-context';
import { UserLayout, ProtectedLayout } from '@components/layout/common-layout';
import { MainLayout } from '@components/layout/main-layout';
import { SEO } from '@components/common/seo';
import { UserDataLayout } from '@components/layout/user-data-layout';
import { UserHomeLayout } from '@components/layout/user-home-layout';
import { Post } from '@components/post/post';
import { Loading } from '@components/ui/loading';
import { StatsEmpty } from '@components/post/stats-empty';
import { PostWithParent } from '@components/post/post-with-parent';
import type { ReactElement, ReactNode, JSX } from 'react';

export default function UserWithReplies(): JSX.Element {
  const { user } = useUser();

  const { id, name, username, pinnedPost } = user ?? {};

  const { data: pinnedData } = useDocument(
    doc(postsCollection, pinnedPost ?? 'null'),
    {
      disabled: !pinnedPost,
      allowNull: true,
      includeUser: true
    }
  );

  const { data, loading } = useCollection(
    query(
      postsCollection,
      where('createdBy', '==', id),
      orderBy('createdAt', 'desc')
    ),
    { includeUser: true, allowNull: true }
  );

  return (
    <section>
      <SEO
        title={`Posts with replies by ${(name ?? username) as string} (@${
          username as string
        }) / Twitter`}
      />
      {loading ? (
        <Loading className='mt-5' />
      ) : !data ? (
        <StatsEmpty
          title={`@${username as string} hasn't posted`}
          description='When they do, their Posts will show up here.'
        />
      ) : (
        <AnimatePresence mode='popLayout'>
          {pinnedData && (
            <Post pinned {...pinnedData} key={`pinned-${pinnedData.id}`} />
          )}
          <PostWithParent data={data} />
        </AnimatePresence>
      )}
    </section>
  );
}

UserWithReplies.getLayout = (page: ReactElement<unknown>): ReactNode => (
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
