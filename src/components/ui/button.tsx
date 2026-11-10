import type { ComponentProps } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-md border bg-background font-medium whitespace-nowrap transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: { size: { default: 'h-9 px-3.5 text-sm', sm: 'h-8 px-3 text-[13px]' } },
    defaultVariants: { size: 'default' },
  },
)

export function Button({
  className,
  size,
  ...props
}: ComponentProps<'button'> & VariantProps<typeof buttonVariants>) {
  return <button type="button" className={cn(buttonVariants({ size }), className)} {...props} />
}
