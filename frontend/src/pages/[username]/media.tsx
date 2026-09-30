import { AnimatePresence } from 'framer-motion';
import { query, where } from '@lib/api/query';
import { useCollection } from '@lib/hooks/useCollection';
import { postsCollection } from '@lib/api/collections';
import { useUser } from '@lib/context/user-context';
import { mergeData } from '@lib/merge';
import { UserLayout, ProtectedLayout } from '@components/layout/common-layout';
import { MainLayout } from '@components/layout/main-layout';
import { SEO } from '@components/common/seo';
import { UserDataLayout } from '@components/layout/user-data-layout';
import { UserHomeLayout } from '@components/layout/user-home-layout';
import { Post } from '@components/post/post';
import { Loading } from '@components/ui/loading';
import { StatsEmpty } from '@components/post/stats-empty';
import type { ReactElement, ReactNode, JSX } from 'react';

export default function UserMedia(): JSX.Element {
  const { user } = useUser();

  const { id, name, username } = user ?? {};

  const { data, loading } = useCollection(
    query(
      postsCollection,
      where('createdBy', '==', id),
      where('images', '!=', null)
    ),
    { includeUser: true, allowNull: true }
  );

  const sortedPosts = mergeData(true, data);

  return (
    <section>
      <SEO
        title={`Media Posts by ${(name ?? username) as string} (@${
          username as string
        }) / Twitter`}
      />
      {loading ? (
        <Loading className='mt-5' />
      ) : !sortedPosts ? (
        <StatsEmpty
          title={`@${username as string} hasn't posted media`}
          description='Once they do, those Posts will show up here.'
          imageData={{ src: '/assets/no-media.png', alt: 'No media' }}
        />
      ) : (
        <AnimatePresence mode='popLayout'>
          {sortedPosts.map((post) => (
            <Post {...post} key={post.id} />
          ))}
        </AnimatePresence>
      )}
    </section>
  );
}

UserMedia.getLayout = (page: ReactElement<unknown>): ReactNode => (
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
