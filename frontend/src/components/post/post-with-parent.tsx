import { useState, type JSX } from 'react';
import { Post } from './post';
import { PostParent } from './post-parent';
import type { PostWithUser } from '@lib/types/post';

type PostWithParentProps = {
  data: PostWithUser[];
};

export type LoadedParents = Record<'parentId' | 'childId', string>[];

export function PostWithParent({ data }: PostWithParentProps): JSX.Element {
  const [loadedParents, setLoadedParents] = useState<LoadedParents>([]);

  const addParentId = (parentId: string, targetChildId: string): void =>
    setLoadedParents((prevLoadedParents) =>
      prevLoadedParents.some((item) => item.parentId === parentId)
        ? prevLoadedParents
        : [...prevLoadedParents, { parentId, childId: targetChildId }]
    );

  const filteredData = data.filter(
    (child) => !loadedParents.some((parent) => parent.parentId === child.id)
  );

  return (
    <>
      {filteredData.map((post) => (
        <div className='[&>article:nth-child(2)]:-mt-1' key={post.id}>
          {post.parent && (
            <PostParent
              parentId={post.parent.id}
              loadedParents={loadedParents}
              addParentId={addParentId}
            />
          )}
          <Post {...post} />
        </div>
      ))}
    </>
  );
}
