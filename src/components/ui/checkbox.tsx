import * as React from 'react'
import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import { Check, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

type CheckboxProps = {
  checked: boolean | 'indeterminate'
  onChange: (checked: boolean) => void
  disabled?: boolean
  className?: string
  ariaLabel?: string
}

export function Checkbox({ checked, onChange, disabled, className, ariaLabel }: CheckboxProps) {
  return (
    <CheckboxPrimitive.Root
      checked={checked}
      disabled={disabled}
      aria-label={ariaLabel}
      onCheckedChange={(value) => {
        if (value === 'indeterminate') return
        onChange(value === true)
      }}
      onClick={(event) => event.stopPropagation()}
      className={cn(
        'inline-flex h-4 w-4 items-center justify-center border border-border bg-background outline-none transition-colors',
        'data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=checked]:text-primary-foreground',
        'data-[state=indeterminate]:bg-primary data-[state=indeterminate]:border-primary data-[state=indeterminate]:text-primary-foreground',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:pointer-events-none disabled:opacity-40',
        className
      )}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center">
        {checked === 'indeterminate' ? <Minus className="h-3 w-3" /> : <Check className="h-3 w-3" />}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}
