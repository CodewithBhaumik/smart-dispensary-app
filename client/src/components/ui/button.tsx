import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,opacity] duration-150 outline-none select-none focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-[0_1px_2px_rgb(13_148_136/0.25),inset_0_1px_0_rgb(255_255_255/0.12)] hover:bg-primary-hover',
        destructive:
          'bg-destructive text-white shadow-[0_1px_2px_rgb(225_29_72/0.25)] hover:bg-destructive/90 focus-visible:ring-destructive/25',
        outline:
          'border border-input bg-card text-foreground shadow-xs hover:bg-muted hover:text-foreground hover:border-slate-300',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-slate-200/70',
        ghost: 'text-slate-600 hover:bg-muted hover:text-foreground',
        soft: 'bg-accent text-accent-foreground hover:bg-teal-100/80',
        link: 'text-primary underline-offset-4 hover:underline px-0 h-auto',
      },
      size: {
        default: 'h-9 px-4 has-[>svg]:px-3.5',
        xs: "h-7 gap-1 rounded-md px-2.5 text-xs has-[>svg]:px-2 [&_svg:not([class*='size-'])]:size-3.5",
        sm: 'h-8 gap-1.5 rounded-md px-3 text-[13px] has-[>svg]:px-2.5',
        lg: 'h-11 rounded-lg px-6 text-[15px] has-[>svg]:px-5',
        icon: 'size-9',
        'icon-xs': "size-7 rounded-md [&_svg:not([class*='size-'])]:size-3.5",
        'icon-sm': 'size-8 rounded-md',
        'icon-lg': 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : 'button';

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
