import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import cn from 'clsx';
import { twemojiParse, twemojiParseWithLinks } from '@lib/twemoji';
import { useAuth } from '@lib/context/auth-context';
import { useModal } from '@lib/hooks/useModal';
import { delayScroll } from '@lib/utils';
import { Modal } from '@components/modal/modal';
import { PostReplyModal } from '@components/modal/post-reply-modal';
import { ImagePreview } from '@components/input/image-preview';
import { UserAvatar } from '@components/user/user-avatar';
import { UserTooltip } from '@components/user/user-tooltip';
import { UserName } from '@components/user/user-name';
import { UserUsername } from '@components/user/user-username';
import { PostActions } from './post-actions';
import { PostStatus } from './post-status';
import { PostStats } from './post-stats';
import { PostDate } from './post-date';
import type { Variants } from 'framer-motion';
import type { Post } from '@lib/types/post';
import type { User } from '@lib/types/user';

import type { JSX } from 'react';

export type PostProps = Post & {
  user: User;
  modal?: boolean;
  pinned?: boolean;
  profile?: User | null;
  parentPost?: boolean;
};

export const variants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.8 } },
  exit: { opacity: 0, transition: { duration: 0.2 } }
};

export function Post(post: PostProps): JSX.Element {
  const {
    id: postId,
    text,
    modal,
    images,
    parent,
    pinned,
    profile,
    userLikes,
    createdBy,
    createdAt,
    parentPost,
    userReplies,
    userReposts,
    user: postUserData
  } = post;

  const { id: ownerId, name, username, verified, photoURL } = postUserData;

  const { user } = useAuth();

  const { open, openModal, closeModal } = useModal();

  const postLink = `/@${username}/status/${postId}`;

  const userId = user?.id as string;

  const isOwner = userId === createdBy;

  const { id: parentId, username: parentUsername = username } = parent ?? {};

  const {
    id: profileId,
    name: profileName,
    username: profileUsername
  } = profile ?? {};

  const reply = !!parent;
  const postIsReposted = userReposts.includes(profileId ?? '');

  return (
    <motion.article
      {...(!modal ? { ...variants, layout: 'position' } : {})}
      animate={{
        ...variants.animate,
        ...(parentPost && { transition: { duration: 0.2 } })
      }}
    >
      <Modal
        className='flex items-start justify-center'
        modalClassName='bg-main-background rounded-2xl max-w-xl w-full my-8 overflow-hidden'
        open={open}
        closeModal={closeModal}
      >
        <PostReplyModal post={post} closeModal={closeModal} />
      </Modal>
      <Link
        href={postLink}
        scroll={!reply}
        className={cn(
          `accent-tab hover-card relative flex flex-col 
             gap-y-4 px-4 py-3 outline-none duration-200`,
          parentPost
            ? 'mt-0.5 pb-0 pt-2.5'
            : 'border-b border-light-border dark:border-dark-border'
        )}
        draggable={false}
        onClick={delayScroll(200)}
      >
        <div className='grid grid-cols-[auto,1fr] gap-x-3 gap-y-1'>
          <AnimatePresence initial={false}>
            {modal ? null : pinned ? (
              <PostStatus type='pin'>
                <p className='text-sm font-bold'>Pinned Post</p>
              </PostStatus>
            ) : (
              postIsReposted && (
                <PostStatus type='post'>
                  <Link
                    href={`/@${profileUsername as string}`}
                    className='custom-underline truncate text-sm font-bold'
                  >
                    {userId === profileId ? (
                      'You'
                    ) : (
                      <span
                        dangerouslySetInnerHTML={{
                          __html: twemojiParse(profileName as string)
                        }}
                      />
                    )}{' '}
                    Reposted
                  </Link>
                </PostStatus>
              )
            )}
          </AnimatePresence>
          <div className='flex flex-col items-center gap-2'>
            <UserTooltip avatar modal={modal} {...postUserData}>
              <UserAvatar
                src={photoURL}
                alt={name ?? username}
                username={username}
              />
            </UserTooltip>
            {parentPost && (
              <i className='hover-animation h-full w-0.5 bg-light-line-reply dark:bg-dark-line-reply' />
            )}
          </div>
          <div className='flex min-w-0 flex-col'>
            <div className='flex justify-between gap-2 text-light-secondary dark:text-dark-secondary'>
              <div className='flex gap-1 truncate xs:overflow-visible xs:whitespace-normal'>
                <UserTooltip modal={modal} {...postUserData}>
                  <UserName
                    name={name ?? username}
                    username={username}
                    verified={verified}
                    className='text-light-primary dark:text-dark-primary'
                  />
                </UserTooltip>
                <UserTooltip modal={modal} {...postUserData}>
                  <UserUsername username={username} />
                </UserTooltip>
                <PostDate postLink={postLink} createdAt={createdAt} />
              </div>
              <div className='px-4'>
                {!modal && (
                  <PostActions
                    isOwner={isOwner}
                    ownerId={ownerId}
                    postId={postId}
                    parentId={parentId}
                    parentUsername={parentUsername}
                    username={username}
                    hasImages={!!images}
                    createdBy={createdBy}
                  />
                )}
              </div>
            </div>
            {(reply || modal) && (
              <p
                className={cn(
                  'text-light-secondary dark:text-dark-secondary',
                  modal && 'order-1 my-2'
                )}
              >
                Replying to{' '}
                <Link
                  href={`/@${parentUsername}`}
                  className='custom-underline text-main-accent'
                >
                  @{parentUsername}
                </Link>
              </p>
            )}
            {text && (
              <p className='whitespace-pre-line break-words'>
                {
                  <span
                    dangerouslySetInnerHTML={{
                      __html: twemojiParseWithLinks(text)
                    }}
                  />
                }
              </p>
            )}
            <div className='mt-1 flex flex-col gap-2'>
              {images && (
                <ImagePreview
                  post
                  imagesPreview={images}
                  previewCount={images.length}
                />
              )}
              {!modal && (
                <PostStats
                  reply={reply}
                  userId={userId}
                  isOwner={isOwner}
                  postId={postId}
                  postCreatedBy={createdBy}
                  username={username}
                  userLikes={userLikes}
                  userReplies={userReplies}
                  userReposts={userReposts}
                  openModal={!parent ? openModal : undefined}
                />
              )}
            </div>
          </div>
        </div>
      </Link>
    </motion.article>
  );
}
