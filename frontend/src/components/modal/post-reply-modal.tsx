import { Input } from '@components/input/input';
import { Post } from '@components/post/post';
import type { PostProps } from '@components/post/post';

import type { JSX } from 'react';

type PostReplyModalProps = {
  post: PostProps;
  closeModal: () => void;
};

export function PostReplyModal({
  post,
  closeModal
}: PostReplyModalProps): JSX.Element {
  return (
    <Input
      modal
      replyModal
      parent={{ id: post.id, username: post.user.username }}
      closeModal={closeModal}
    >
      <Post modal parentPost {...post} />
    </Input>
  );
}
