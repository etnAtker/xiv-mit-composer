import { useMemo } from 'react';
import { useShallow } from 'zustand/shallow';
import { useStore } from '../store';
import type { BannerOptions } from '../model/banner';

export type PushBanner = (message: string, options?: BannerOptions) => number;

export interface TopBannerControls {
  push: PushBanner;
  close: (id: number) => void;
}

export const useTopBanner = (): TopBannerControls => {
  const { pushBanner, closeBanner } = useStore(
    useShallow((state) => ({
      pushBanner: state.pushBanner,
      closeBanner: state.closeBanner,
    })),
  );

  return useMemo(
    () => ({
      push: (message: string, options?: BannerOptions) => pushBanner(message, options),
      close: closeBanner,
    }),
    [closeBanner, pushBanner],
  );
};
