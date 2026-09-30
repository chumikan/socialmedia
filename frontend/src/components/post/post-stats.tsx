/* eslint-disable react-hooks/exhaustive-deps */

import Link from 'next/link';
import { useState, useEffect, useMemo, type JSX } from 'react';
import cn from 'clsx';
import { toast } from 'react-hot-toast';
import { useAuth } from '@lib/context/auth-context';
import { manageRepost, manageLike, manageBookmark } from '@lib/api/utils';
import { preventBubbling } from '@lib/utils';
import { ViewPostStats } from '@components/view/view-post-stats';
import { HeroIcon } from '@components/ui/hero-icon';
import { ToolTip } from '@components/ui/tooltip';
import { PostOption } from '@components/post/post-option';
import { PostShare } from '@components/post/post-share';
import type { Post } from '@lib/types/post';

type PostStatsProps = Pick<
  Post,
  'userLikes' | 'userReposts' | 'userReplies'
> & {
  reply?: boolean;
  userId: string;
  isOwner: boolean;
  postId: string;
  postCreatedBy: string;
  username: string;
  viewPost?: boolean;
  openModal?: () => void;
};

export function PostStats({
  reply,
  userId,
  postId,
  postCreatedBy,
  username,
  userLikes,
  viewPost,
  userReposts,
  userReplies: totalReplies,
  openModal
}: PostStatsProps): JSX.Element {
  const { userBookmarks } = useAuth();

  const totalLikes = userLikes.length;
  const totalPosts = userReposts.length;

  const [{ currentReplies, currentPosts, currentLikes }, setCurrentStats] =
    useState({
      currentReplies: totalReplies,
      currentLikes: totalLikes,
      currentPosts: totalPosts
    });

  useEffect(() => {
    setCurrentStats({
      currentReplies: totalReplies,
      currentLikes: totalLikes,
      currentPosts: totalPosts
    });
  }, [totalReplies, totalLikes, totalPosts]);

  const replyMove = useMemo(
    () => (totalReplies > currentReplies ? -25 : 25),
    [totalReplies]
  );

  const likeMove = useMemo(
    () => (totalLikes > currentLikes ? -25 : 25),
    [totalLikes]
  );

  const postMove = useMemo(
    () => (totalPosts > currentPosts ? -25 : 25),
    [totalPosts]
  );

  const handleBookmark =
    (...args: Parameters<typeof manageBookmark>) =>
    async (): Promise<void> => {
      const [type] = args;

      await manageBookmark(...args);

      toast.success(
        type === 'bookmark'
          ? (): JSX.Element => (
              <span className='flex gap-2'>
                Post added to your bookmarks
                <Link href='/bookmarks'>
                  <span className='custom-underline font-bold'>View</span>
                </Link>
              </span>
            )
          : 'Post removed from your bookmarks'
      );
    };

  const postIsBookmarked = !!userBookmarks?.some(({ id }) => id === postId);

  const postIsLiked = userLikes.includes(userId);
  const postIsReposted = userReposts.includes(userId);

  const isStatsVisible = !!(totalReplies || totalPosts || totalLikes);

  return (
    <>
      {viewPost && (
        <ViewPostStats
          likeMove={likeMove}
          userLikes={userLikes}
          postMove={postMove}
          replyMove={replyMove}
          userReposts={userReposts}
          currentLikes={currentLikes}
          currentPosts={currentPosts}
          currentReplies={currentReplies}
          isStatsVisible={isStatsVisible}
        />
      )}
      <div
        className={cn(
          'flex text-light-secondary inner:outline-none dark:text-dark-secondary',
          viewPost ? 'justify-around py-2' : 'max-w-md justify-between'
        )}
      >
        <PostOption
          className='hover:text-accent-blue focus-visible:text-accent-blue'
          iconClassName='group-hover:bg-accent-blue/10 group-active:bg-accent-blue/20 
                         group-focus-visible:bg-accent-blue/10 group-focus-visible:ring-accent-blue/80'
          tip='Reply'
          move={replyMove}
          stats={currentReplies}
          iconName='ChatBubbleOvalLeftIcon'
          viewPost={viewPost}
          onClick={openModal}
          disabled={reply}
        />
        <PostOption
          className={cn(
            'hover:text-accent-green focus-visible:text-accent-green',
            postIsReposted && 'text-accent-green [&>i>svg]:[stroke-width:2px]'
          )}
          iconClassName='group-hover:bg-accent-green/10 group-active:bg-accent-green/20
                         group-focus-visible:bg-accent-green/10 group-focus-visible:ring-accent-green/80'
          tip={postIsReposted ? 'Undo Repost' : 'Repost'}
          move={postMove}
          stats={currentPosts}
          iconName='ArrowPathRoundedSquareIcon'
          viewPost={viewPost}
          onClick={manageRepost(
            postIsReposted ? 'unrepost' : 'repost',
            userId,
            postId
          )}
        />
        <PostOption
          className={cn(
            'hover:text-accent-pink focus-visible:text-accent-pink',
            postIsLiked && 'text-accent-pink [&>i>svg]:fill-accent-pink'
          )}
          iconClassName='group-hover:bg-accent-pink/10 group-active:bg-accent-pink/20
                         group-focus-visible:bg-accent-pink/10 group-focus-visible:ring-accent-pink/80'
          tip={postIsLiked ? 'Unlike' : 'Like'}
          move={likeMove}
          stats={currentLikes}
          iconName='HeartIcon'
          viewPost={viewPost}
          onClick={manageLike(postIsLiked ? 'unlike' : 'like', userId, {
            id: postId,
            createdBy: postCreatedBy
          } as Post)}
        />
        <div className='relative'>
          <button
            aria-label={postIsBookmarked ? 'Unbookmark' : 'Bookmark'}
            className='group relative flex items-center gap-1 p-0 outline-none 
                       transition-none hover:text-accent-blue focus-visible:text-accent-blue'
            onClick={preventBubbling(
              handleBookmark(
                !postIsBookmarked ? 'bookmark' : 'unbookmark',
                userId,
                postId
              )
            )}
          >
            <i className='relative rounded-full p-2 not-italic duration-200 group-hover:bg-accent-blue/10  group-focus-visible:bg-accent-blue/10 group-focus-visible:ring-2  group-focus-visible:ring-accent-blue/80 group-active:bg-accent-blue/20'>
              <HeroIcon
                iconName='BookmarkIcon'
                className={
                  !postIsBookmarked ? 'h-5 w-auto' : 'h-5 w-auto fill-current'
                }
              />
            </i>
            <ToolTip
              tip={!postIsBookmarked ? 'Bookmark' : 'Unbookmark'}
              className='bottom-0'
            />
          </button>
        </div>
        <PostShare username={username} postId={postId} viewPost={viewPost} />
      </div>
    </>
  );
}
