import type { ComponentProps } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        outline: 'border bg-background shadow-xs hover:bg-muted',
        link: 'h-auto p-0 font-normal underline underline-offset-[3px] hover:text-zinc-600',
      },
      size: { default: 'h-9 px-3.5 text-sm', sm: 'h-8 px-3 text-[13px]' },
    },
    defaultVariants: { variant: 'outline', size: 'default' },
  },
)

export function Button({
  className,
  variant,
  size,
  ...props
}: ComponentProps<'button'> & VariantProps<typeof buttonVariants>) {
  return <button type="button" className={cn(buttonVariants({ variant, size }), className)} {...props} />
}
