import { useModal } from '@lib/hooks/useModal';
import { Button } from '@components/ui/button';
import { NextImage } from '@components/ui/next-image';
import { Modal } from '@components/modal/modal';
import { ImageModal } from '@components/modal/image-modal';
import type { ImageData } from '@lib/types/file';

import type { JSX } from 'react';

type UserHomeCoverProps = {
  coverData?: ImageData | null;
};

export function UserHomeCover({ coverData }: UserHomeCoverProps): JSX.Element {
  const { open, openModal, closeModal } = useModal();

  return (
    <div className='relative mt-0.5 aspect-[15/4] w-full'>
      <Modal open={open} closeModal={closeModal}>
        <ImageModal imageData={coverData as ImageData} previewCount={1} />
      </Modal>
      {coverData ? (
        <Button
          className='accent-tab absolute inset-0 h-full w-full rounded-none p-0 transition hover:brightness-75'
          onClick={openModal}
        >
          <NextImage
            useSkeleton
            layout='fill'
            imgClassName='object-cover'
            src={coverData.src}
            alt={coverData.alt}
            key={coverData.src}
          />
        </Button>
      ) : (
        <div className='absolute inset-0 bg-light-line-reply dark:bg-dark-line-reply' />
      )}
    </div>
  );
}
