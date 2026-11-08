import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl text-[12px] font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-brand/20 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-brand text-white hover:bg-brand-strong',
        destructive: 'bg-danger text-white hover:bg-danger/90',
        outline:
          'border border-line-strong bg-app text-ink-soft hover:border-brand/40 hover:text-ink',
        secondary: 'bg-surface-soft text-ink hover:bg-line',
        ghost: 'text-ink-soft hover:bg-surface-soft hover:text-ink',
        link: 'text-brand underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-3.5',
        sm: 'h-8 rounded-lg px-2.5 text-[11px]',
        lg: 'h-11 px-5',
        icon: 'size-8',
        'icon-sm': 'size-7 rounded-lg [&_svg:not([class*=size-])]:size-3.5',
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
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : 'button';

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
