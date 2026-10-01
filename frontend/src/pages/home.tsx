import { AnimatePresence } from 'framer-motion';
import { where, orderBy, collection } from '@lib/api/query';
import { useInfiniteScroll } from '@lib/hooks/useInfiniteScroll';
import { HomeLayout, ProtectedLayout } from '@components/layout/common-layout';
import { MainLayout } from '@components/layout/main-layout';
import { SEO } from '@components/common/seo';
import { MainContainer } from '@components/home/main-container';
import { UpdateUsername } from '@components/home/update-username';
import { MainHeader } from '@components/home/main-header';
import { Post } from '@components/post/post';
import { Loading } from '@components/ui/loading';
import type { Post as PostData } from '@lib/types/post';
import type { ReactElement, ReactNode, JSX } from 'react';

export default function Home(): JSX.Element {
  const { data, loading, LoadMore } = useInfiniteScroll(
    collection<PostData>('feed'),
    [where('parent', '==', null), orderBy('createdAt', 'desc')],
    { includeUser: true, allowNull: true, preserve: true }
  );

  return (
    <MainContainer>
      <SEO title='Home / Twitter' />
      <MainHeader
        useMobileSidebar
        title='Home'
        className='flex items-center justify-between'
      >
        <UpdateUsername />
      </MainHeader>
      <section className='mt-0.5 xs:mt-0'>
        {loading ? (
          <Loading className='mt-5' />
        ) : !data?.length ? (
          <p className='p-8 text-center text-light-secondary'>
            Follow people or write your first post to start your feed.
          </p>
        ) : (
          <>
            <AnimatePresence mode='popLayout'>
              {data
                .filter((post) => !post.user?.isBanned)
                .map((post) => (
                  <Post {...post} key={post.id} />
                ))}
            </AnimatePresence>
            <LoadMore />
          </>
        )}
      </section>
    </MainContainer>
  );
}

Home.getLayout = (page: ReactElement<unknown>): ReactNode => (
  <ProtectedLayout>
    <MainLayout>
      <HomeLayout>{page}</HomeLayout>
    </MainLayout>
  </ProtectedLayout>
);
