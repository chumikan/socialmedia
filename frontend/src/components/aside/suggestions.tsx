import Link from 'next/link';
import { motion } from 'framer-motion';
import { limit, query, where, orderBy, documentId } from '@lib/api/query';
import { useAuth } from '@lib/context/auth-context';
import { useCollection } from '@lib/hooks/useCollection';
import { usersCollection } from '@lib/api/collections';
import { UserCard } from '@components/user/user-card';
import { Loading } from '@components/ui/loading';
import { Error } from '@components/ui/error';
import { variants } from './aside-trends';

import type { JSX } from 'react';

export function Suggestions(): JSX.Element {
  const { user } = useAuth();

  const { data: suggestionsData, loading: suggestionsLoading } = useCollection(
    query(
      usersCollection,
      where('id', '!=', user?.id),
      orderBy(documentId()),
      limit(2)
    ),
    { allowNull: true }
  );

  return (
    <section className='hover-animation z-1 rounded-2xl bg-main-sidebar-background'>
      {suggestionsLoading ? (
        <Loading className='flex h-52 items-center justify-center p-4' />
      ) : suggestionsData ? (
        <motion.div className='inner:px-4 inner:py-3' {...variants}>
          <h2 className='text-xl font-bold'>Who to follow</h2>
          {suggestionsData?.map((userData) => (
            <UserCard {...userData} key={userData.id} />
          ))}
          <Link
            href='/explore'
            className='custom-button accent-tab hover-card block w-full rounded-2xl
                         rounded-t-none text-main-accent'
          >
            {<span className='hover:underline'>Show more</span>}
          </Link>
        </motion.div>
      ) : (
        <Error />
      )}
    </section>
  );
}
