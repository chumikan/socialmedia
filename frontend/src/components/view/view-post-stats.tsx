import { useState, type JSX } from 'react';
import cn from 'clsx';
import { useArrayDocument } from '@lib/hooks/useArrayDocument';
import { useModal } from '@lib/hooks/useModal';
import { usersCollection } from '@lib/api/collections';
import { Modal } from '@components/modal/modal';
import { PostStatsModal } from '@components/modal/post-stats-modal';
import { NumberStats } from '@components/post/number-stats';
import { UserCards } from '@components/user/user-cards';
import type { Post } from '@lib/types/post';

type viewPostStats = Pick<Post, 'userReposts' | 'userLikes'> & {
  likeMove: number;
  postMove: number;
  replyMove: number;
  currentLikes: number;
  currentPosts: number;
  currentReplies: number;
  isStatsVisible: boolean;
};

export type StatsType = 'reposts' | 'likes';

type Stats = [string, StatsType | null, number, number];

export function ViewPostStats({
  likeMove,
  userLikes,
  postMove,
  replyMove,
  userReposts,
  currentLikes,
  currentPosts,
  currentReplies,
  isStatsVisible
}: viewPostStats): JSX.Element {
  const [statsType, setStatsType] = useState<StatsType | null>(null);

  const { open, openModal, closeModal } = useModal();

  const { data, loading } = useArrayDocument(
    statsType ? (statsType === 'likes' ? userLikes : userReposts) : [],
    usersCollection,
    { disabled: !statsType }
  );

  const handleOpen = (type: StatsType) => (): void => {
    setStatsType(type);
    openModal();
  };

  const handleClose = (): void => {
    setStatsType(null);
    closeModal();
  };

  const allStats: Readonly<Stats[]> = [
    ['Reply', null, replyMove, currentReplies],
    ['Repost', 'reposts', postMove, currentPosts],
    ['Like', 'likes', likeMove, currentLikes]
  ];

  return (
    <>
      <Modal
        modalClassName='relative bg-main-background rounded-2xl max-w-xl w-full 
                        h-[672px] overflow-hidden rounded-2xl'
        open={open}
        closeModal={handleClose}
      >
        <PostStatsModal statsType={statsType} handleClose={handleClose}>
          <UserCards
            follow
            type={statsType as StatsType}
            data={data}
            loading={loading}
          />
        </PostStatsModal>
      </Modal>
      {isStatsVisible && (
        <div
          className='flex gap-4 px-1 py-4 text-light-secondary dark:text-dark-secondary
                     [&>button>div]:font-bold [&>button>div]:text-light-primary 
                     dark:[&>button>div]:text-dark-primary'
        >
          {allStats.map(
            ([title, type, move, stats], index) =>
              !!stats && (
                <button
                  className={cn(
                    `hover-animation mb-[3px] mt-0.5 flex h-4 items-center gap-1 border-b 
                     border-b-transparent outline-none hover:border-b-light-primary 
                     focus-visible:border-b-light-primary dark:hover:border-b-dark-primary
                     dark:focus-visible:border-b-dark-primary`,
                    index === 0 && ''
                  )}
                  key={title}
                  onClick={type ? handleOpen(type) : undefined}
                >
                  <NumberStats move={move} stats={stats} />
                  <p>{`${
                    stats === 1
                      ? title
                      : stats > 1 && index === 0
                      ? `${title.slice(0, -1)}ies`
                      : `${title}s`
                  }`}</p>
                </button>
              )
          )}
        </div>
      )}
    </>
  );
}
