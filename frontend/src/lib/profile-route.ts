import type { GetServerSideProps } from 'next';

// [username] captures the public @username segment; API usernames omit @.
export function getProfileUsername(
  segment: string | string[] | undefined
): string | undefined {
  return typeof segment === 'string'
    ? /^@([a-zA-Z0-9_]{3,30})$/.exec(segment)?.[1]
    : undefined;
}

export const getProfilePageProps: GetServerSideProps<Record<string, never>> = ({
  params
}) =>
  Promise.resolve(
    getProfileUsername(params?.username) ? { props: {} } : { notFound: true }
  );
