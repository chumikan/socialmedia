import { AnimatePresence } from 'framer-motion';
import { query, where, orderBy } from '@lib/api/query';
import { useCollection } from '@lib/hooks/useCollection';
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
import type { ReactElement, ReactNode, JSX } from 'react';

export default function UserLikes(): JSX.Element {
  const { user } = useUser();

  const { id, name, username } = user ?? {};

  const { data, loading } = useCollection(
    query(
      postsCollection,
      where('userLikes', 'array-contains', id),
      orderBy('createdAt', 'desc')
    ),
    { includeUser: true, allowNull: true }
  );

  return (
    <section>
      <SEO
        title={`Posts liked by ${name as string} (@${
          username as string
        }) / Twitter`}
      />
      {loading ? (
        <Loading className='mt-5' />
      ) : !data ? (
        <StatsEmpty
          title={`@${username as string} hasn't liked any Posts`}
          description='When they do, those Posts will show up here.'
        />
      ) : (
        <AnimatePresence mode='popLayout'>
          {data.map((post) => (
            <Post {...post} key={post.id} />
          ))}
        </AnimatePresence>
      )}
    </section>
  );
}

UserLikes.getLayout = (page: ReactElement<unknown>): ReactNode => (
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
