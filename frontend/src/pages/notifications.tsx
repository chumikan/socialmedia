import {
  TrendsLayout,
  ProtectedLayout
} from '@components/layout/common-layout';
import { MainLayout } from '@components/layout/main-layout';
import { SEO } from '@components/common/seo';
import { MainContainer } from '@components/home/main-container';
import { AsideNotifications } from '@components/aside/aside-notifications';
import type { ReactElement, ReactNode, JSX } from 'react';

export default function Notifications(): JSX.Element {
  return (
    <MainContainer>
      <SEO title='Notifications / Twitter' />

      <AsideNotifications inNotificationsPage />
    </MainContainer>
  );
}

Notifications.getLayout = (page: ReactElement<unknown>): ReactNode => (
  <ProtectedLayout>
    <MainLayout>
      <TrendsLayout>{page}</TrendsLayout>
    </MainLayout>
  </ProtectedLayout>
);
