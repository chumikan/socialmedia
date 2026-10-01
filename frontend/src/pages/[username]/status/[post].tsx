import { useRef } from 'react';
import { useRouter } from 'next/router';
import { AnimatePresence } from 'framer-motion';
import { doc, query, where, orderBy } from '@lib/api/query';
import { postsCollection } from '@lib/api/collections';
import { useCollection } from '@lib/hooks/useCollection';
import { useDocument } from '@lib/hooks/useDocument';
import { isPlural } from '@lib/utils';
import { HomeLayout, ProtectedLayout } from '@components/layout/common-layout';
import { MainLayout } from '@components/layout/main-layout';
import { MainContainer } from '@components/home/main-container';
import { Post } from '@components/post/post';
import { ViewPost } from '@components/view/view-post';
import { SEO } from '@components/common/seo';
import { Loading } from '@components/ui/loading';
import { Error } from '@components/ui/error';
import { ViewParentPost } from '@components/view/view-parent-post';
import type { JSX, ReactElement, ReactNode } from 'react';

export default function PostId(): JSX.Element {
  const {
    query: { post }
  } = useRouter();

  const { data: postData, loading: postLoading } = useDocument(
    doc(postsCollection, post as string),
    { includeUser: true, allowNull: true }
  );

  const viewPostRef = useRef<HTMLElement>(null);

  const { data: repliesData, loading: repliesLoading } = useCollection(
    query(
      postsCollection,
      where('parent.id', '==', post),
      orderBy('createdAt', 'desc')
    ),
    { includeUser: true, allowNull: true }
  );

  const { text, images } = postData ?? {};

  const imagesLength = images?.length ?? 0;
  const parentId = postData?.parent?.id;

  const pageTitle = postData
    ? `${postData.user.name ?? postData.user.username} on Twitter: "${
        text ?? ''
      }${
        images ? ` (${imagesLength} image${isPlural(imagesLength)})` : ''
      }" / Twitter`
    : null;

  return (
    <MainContainer className='!pb-[1280px]'>
      <section>
        {postLoading ? (
          <Loading className='mt-5' />
        ) : !postData ? (
          <>
            <SEO title='Post not found / Twitter' />
            <Error message='Post not found' />
          </>
        ) : (
          <>
            {pageTitle && <SEO title={pageTitle} />}
            {parentId && (
              <ViewParentPost parentId={parentId} viewPostRef={viewPostRef} />
            )}
            <ViewPost viewPostRef={viewPostRef} {...postData} />
            {postData &&
              (repliesLoading ? (
                <Loading className='mt-5' />
              ) : (
                <AnimatePresence mode='popLayout'>
                  {repliesData?.map((post) => (
                    <Post {...post} key={post.id} />
                  ))}
                </AnimatePresence>
              ))}
          </>
        )}
      </section>
    </MainContainer>
  );
}

PostId.getLayout = (page: ReactElement<unknown>): ReactNode => (
  <ProtectedLayout>
    <MainLayout>
      <HomeLayout>{page}</HomeLayout>
    </MainLayout>
  </ProtectedLayout>
);

export { getProfilePageProps as getServerSideProps } from '@lib/profile-route';
