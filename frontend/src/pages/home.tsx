import { useState } from 'react';
import cn from 'clsx';
import { AnimatePresence } from 'framer-motion';
import { useAuth } from '@lib/context/auth-context';
import { where, orderBy, collection } from '@lib/api/query';
import { useInfiniteScroll } from '@lib/hooks/useInfiniteScroll';
import { HomeLayout, ProtectedLayout } from '@components/layout/common-layout';
import { MainLayout } from '@components/layout/main-layout';
import { SEO } from '@components/common/seo';
import { MainContainer } from '@components/home/main-container';
import { Post } from '@components/post/post';
import { Loading } from '@components/ui/loading';
import type { Post as PostData } from '@lib/types/post';
import type { ReactElement, ReactNode, JSX } from 'react';

type FeedTab = 'Timeline' | 'Following';

export default function Home(): JSX.Element {
  const [activeTab, setActiveTab] = useState<FeedTab>('Timeline');

  return (
    <MainContainer>
      <SEO title='Home / Twitter' />
      <nav
        aria-label='Home feeds'
        className='flex border-b border-light-border dark:border-dark-border'
      >
        {(['Timeline', 'Following'] as const).map((tab) => (
          <button
            key={tab}
            type='button'
            aria-pressed={activeTab === tab}
            aria-controls='home-feed'
            onClick={(): void => setActiveTab(tab)}
            className={cn(
              'main-tab flex flex-1 justify-center hover:bg-light-primary/10 dark:hover:bg-dark-primary/10',
              activeTab === tab
                ? 'text-light-primary dark:text-dark-primary'
                : 'text-light-secondary dark:text-dark-secondary'
            )}
          >
            <span className='flex flex-col gap-3 pt-4 font-bold'>
              {tab}
              <span
                className={cn(
                  'h-1 rounded-full',
                  activeTab === tab ? 'bg-main-accent' : 'bg-transparent'
                )}
              />
            </span>
          </button>
        ))}
      </nav>
      <HomeFeed key={activeTab} tab={activeTab} />
    </MainContainer>
  );
}

function HomeFeed({ tab }: { tab: FeedTab }): JSX.Element {
  const { user } = useAuth();
  const { data, loading, LoadMore } = useInfiniteScroll(
    collection<PostData>('feed'),
    [
      where('parent', '==', null),
      ...(tab === 'Following' ? [where('createdBy', '!=', user?.id)] : []),
      orderBy('createdAt', 'desc')
    ],
    { includeUser: true, allowNull: true, preserve: true }
  );

  return (
    <section id='home-feed' aria-label={tab} className='mt-0.5 xs:mt-0'>
      {loading ? (
        <Loading className='mt-5' />
      ) : !data?.length ? (
        <p className='p-8 text-center text-light-secondary'>
          {tab === 'Following'
            ? 'Posts from people you follow will appear here.'
            : 'Follow people or write your first post to start your feed.'}
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
  );
}

Home.getLayout = (page: ReactElement<unknown>): ReactNode => (
  <ProtectedLayout>
    <MainLayout>
      <HomeLayout>{page}</HomeLayout>
    </MainLayout>
  </ProtectedLayout>
);
