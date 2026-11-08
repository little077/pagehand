import type * as React from 'react';
import { cn } from '@/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-10 w-full min-w-0 rounded-xl border border-line-strong bg-app px-3 text-[12px] text-ink outline-none transition placeholder:text-ink-faint focus-visible:border-brand/50 focus-visible:ring-2 focus-visible:ring-brand/10 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger aria-invalid:ring-danger/15',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
