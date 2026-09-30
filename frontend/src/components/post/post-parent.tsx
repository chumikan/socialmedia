import { useMemo, useEffect, type JSX } from 'react';
import { doc } from '@lib/api/query';
import { useDocument } from '@lib/hooks/useDocument';
import { postsCollection } from '@lib/api/collections';
import { getRandomId } from '@lib/random';
import { Post } from './post';
import type { LoadedParents } from './post-with-parent';

type PostParentProps = {
  parentId: string;
  loadedParents: LoadedParents;
  addParentId: (parentId: string, componentId: string) => void;
};

export function PostParent({
  parentId,
  loadedParents,
  addParentId
}: PostParentProps): JSX.Element | null {
  const componentId = useMemo(getRandomId, []);

  const isParentAlreadyLoaded = loadedParents.some(
    (child) => child.childId === componentId
  );

  const { data, loading } = useDocument(doc(postsCollection, parentId), {
    includeUser: true,
    allowNull: true,
    disabled: isParentAlreadyLoaded
  });

  useEffect(() => {
    addParentId(parentId, componentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading || !isParentAlreadyLoaded || !data) return null;

  return <Post parentPost {...data} />;
}
