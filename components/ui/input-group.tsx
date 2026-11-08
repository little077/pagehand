import type * as React from 'react';
import { cn } from '@/lib/utils';
import { Button } from './button';

function InputGroup({ className, ...props }: React.ComponentProps<'fieldset'>) {
  return (
    <fieldset
      data-slot="input-group"
      className={cn(
        'm-0 flex h-10 min-w-0 w-full items-center rounded-xl border border-line-strong bg-app p-0 transition focus-within:border-brand/50 focus-within:ring-2 focus-within:ring-brand/10 has-[[aria-invalid=true]]:border-danger has-[[aria-invalid=true]]:ring-danger/15',
        className,
      )}
      {...props}
    />
  );
}

function InputGroupInput({ className, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      data-slot="input-group-control"
      className={cn(
        'h-full w-full min-w-0 flex-1 rounded-xl bg-transparent px-3 text-[12px] text-ink outline-none placeholder:text-ink-faint disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

function InputGroupAddon({
  className,
  align = 'inline-end',
  ...props
}: React.ComponentProps<'div'> & {
  align?: 'inline-start' | 'inline-end';
}) {
  return (
    <div
      data-slot="input-group-addon"
      className={cn(
        'flex shrink-0 items-center gap-0.5 px-1.5',
        align === 'inline-start' && 'order-first pl-1.5 pr-0',
        className,
      )}
      {...props}
    />
  );
}

function InputGroupButton({
  className,
  type = 'button',
  variant = 'ghost',
  size = 'sm',
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      type={type}
      variant={variant}
      size={size}
      className={cn('h-7 gap-1 rounded-lg px-2 text-[10.5px]', className)}
      {...props}
    />
  );
}

export { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput };
