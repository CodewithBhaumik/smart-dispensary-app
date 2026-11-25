import { initials } from '@/lib/format';
import { cn } from '@/lib/utils';

const SIZES = {
  xs: 'size-6 text-[10px]',
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-12 text-base',
  xl: 'size-16 text-xl',
} as const;

const DOT = {
  xs: 'size-2 ring-[1.5px]',
  sm: 'size-2.5 ring-2',
  md: 'size-3 ring-2',
  lg: 'size-3.5 ring-2',
  xl: 'size-4 ring-[3px]',
} as const;

/** Initials avatar tinted with the user's colour. */
export function UserAvatar({
  user,
  size = 'md',
  online,
  className,
}: {
  user: { name: string; avatarColor?: string | null };
  size?: keyof typeof SIZES;
  online?: boolean;
  className?: string;
}) {
  const color = user.avatarColor || '#0d9488';
  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      <span
        className={cn(
          'inline-flex items-center justify-center rounded-full font-semibold tracking-wide select-none',
          SIZES[size],
        )}
        style={{
          backgroundColor: `${color}1f`,
          color,
          boxShadow: `inset 0 0 0 1px ${color}33`,
        }}
        aria-hidden
      >
        {initials(user.name)}
      </span>
      {online !== undefined && (
        <span
          className={cn(
            'absolute right-0 bottom-0 rounded-full ring-white',
            DOT[size],
            online ? 'bg-emerald-500' : 'bg-slate-300',
          )}
          aria-label={online ? 'Online' : 'Offline'}
        />
      )}
    </span>
  );
}
