import { useEffect } from 'react';
import { doc } from '@lib/api/query';
import { useDocument } from '@lib/hooks/useDocument';
import { postsCollection } from '@lib/api/collections';
import { Post } from '@components/post/post';
import type { JSX, RefObject } from 'react';

type ViewParentPostProps = {
  parentId: string;
  viewPostRef: RefObject<HTMLElement | null>;
};

export function ViewParentPost({
  parentId,
  viewPostRef
}: ViewParentPostProps): JSX.Element | null {
  const { data, loading } = useDocument(doc(postsCollection, parentId), {
    includeUser: true,
    allowNull: true
  });

  useEffect(() => {
    if (!loading) viewPostRef.current?.scrollIntoView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.id, loading]);

  if (loading) return null;
  if (!data)
    return (
      <div className='px-4 pb-2 pt-3'>
        <p
          className='rounded-2xl bg-main-sidebar-background px-1 py-3 pl-4 
                     text-light-secondary dark:text-dark-secondary'
        >
          This Post was deleted by the Post author.{' '}
          <a
            className='custom-underline text-main-accent'
            href='https://help.twitter.com/rules-and-policies/notices-on-twitter'
            target='_blank'
            rel='noreferrer'
          >
            Learn more
          </a>
        </p>
      </div>
    );

  return <Post parentPost {...data} />;
}
