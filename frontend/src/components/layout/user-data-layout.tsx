import { useRouter } from 'next/router';
import { getProfileUsername } from '@lib/profile-route';
import { query, where, limit } from '@lib/api/query';
import { UserContextProvider } from '@lib/context/user-context';
import { useCollection } from '@lib/hooks/useCollection';
import { usersCollection } from '@lib/api/collections';
import { SEO } from '@components/common/seo';
import { MainContainer } from '@components/home/main-container';
import type { LayoutProps } from './common-layout';

import type { JSX } from 'react';

export function UserDataLayout({ children }: LayoutProps): JSX.Element {
  const {
    query: { username: usernameSegment }
  } = useRouter();
  const username = getProfileUsername(usernameSegment);

  const { data, loading } = useCollection(
    query(usersCollection, where('username', '==', username), limit(1)),
    { allowNull: true }
  );

  const user = data ? data[0] : null;
  const isBanned = user?.isBanned ?? false;

  return (
    <UserContextProvider value={{ user, loading, isBanned }}>
      {!user && !loading && <SEO title='User not found / Twitter' />}
      {user && !loading && isBanned && (
        <SEO title='Account suspended / Twitter' />
      )}
      <MainContainer>{children}</MainContainer>
    </UserContextProvider>
  );
}
