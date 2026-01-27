import { useShallow } from 'zustand/shallow';
import { useStore } from '../store';
import type { BannerItem, BannerTone } from '../model/banner';

const toneStyles: Record<
  BannerTone,
  {
    accent: string;
    icon: string;
    iconColor: string;
  }
> = {
  info: {
    accent: 'bg-accent',
    icon: 'i',
    iconColor: 'text-accent',
  },
  warning: {
    accent: 'bg-amber-500',
    icon: '!',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  error: {
    accent: 'bg-(--color-danger)',
    icon: 'x',
    iconColor: 'text-danger',
  },
};

interface BannerCardProps {
  banner: BannerItem;
  onClose: (id: number) => void;
}

const BannerCard = ({ banner, onClose }: BannerCardProps) => {
  const config = toneStyles[banner.tone];

  return (
    <div
      className={`pointer-events-auto transition-all duration-200 ${
        banner.closing ? 'opacity-0 -translate-y-2' : 'opacity-100 translate-y-0'
      }`}
      style={{ maxWidth: '92vw' }}
    >
      <div className="relative inline-flex items-center gap-3 overflow-hidden rounded-lg border border-app bg-surface-3 px-3 py-2.5 text-sm shadow-2xl backdrop-blur-xl">
        <div className={`absolute inset-y-0 left-0 w-1 ${config.accent}`} />
        <div
          className={`flex h-6 w-6 items-center justify-center font-semibold ${config.iconColor}`}
        >
          {config.icon}
        </div>
        <div className="flex-1 font-medium text-app">{banner.message}</div>
        <button
          type="button"
          onClick={() => onClose(banner.id)}
          className="rounded-md p-1 text-muted transition-colors hover:bg-black/5 hover:text-app dark:hover:bg-white/10"
          aria-label="Close"
        >
          x
        </button>
      </div>
    </div>
  );
};

export const TopBannerStack = () => {
  const { banners, closeBanner } = useStore(
    useShallow((state) => ({
      banners: state.banners,
      closeBanner: state.closeBanner,
    })),
  );

  if (!banners.length) return null;

  return (
    <div
      className="fixed top-20 left-0 right-0 z-50 flex justify-center px-4 sm:px-6 pointer-events-none"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="flex flex-col items-center gap-2 animate-[slide-in-top_0.2s_ease]">
        {banners.map((banner) => (
          <BannerCard key={banner.id} banner={banner} onClose={closeBanner} />
        ))}
      </div>
    </div>
  );
};
