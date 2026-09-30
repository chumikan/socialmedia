import cn from 'clsx';
import { preventBubbling } from '@lib/utils';
import { HeroIcon } from '@components/ui/hero-icon';
import { ToolTip } from '@components/ui/tooltip';
import { NumberStats } from './number-stats';
import type { IconName } from '@components/ui/hero-icon';

import type { JSX } from 'react';

type PostOption = {
  tip: string;
  move?: number;
  stats?: number;
  iconName: IconName;
  disabled?: boolean;
  className: string;
  viewPost?: boolean;
  iconClassName: string;
  onClick?: (...args: unknown[]) => unknown;
};

export function PostOption({
  tip,
  move,
  stats,
  disabled,
  iconName,
  className,
  viewPost,
  iconClassName,
  onClick
}: PostOption): JSX.Element {
  return (
    <button
      aria-label={tip}
      disabled={disabled}
      className={cn(
        `group flex items-center gap-1.5 p-0 transition-none
         disabled:cursor-not-allowed inner:transition inner:duration-200`,
        disabled && '',
        className
      )}
      onClick={preventBubbling(onClick)}
    >
      <i
        className={cn(
          'relative rounded-full p-2 not-italic group-focus-visible:ring-2',
          iconClassName
        )}
      >
        <HeroIcon
          className={viewPost ? 'h-6 w-6' : 'h-5 w-5'}
          iconName={iconName}
        />
        <ToolTip tip={tip} />
      </i>
      {!viewPost && (
        <NumberStats move={move as number} stats={stats as number} />
      )}
    </button>
  );
}
