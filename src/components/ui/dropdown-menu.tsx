import * as React from 'react'
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import { cn } from '@/lib/utils'

export type DropdownMenuItem = {
  label: string
  onClick: () => void
  icon?: React.ReactNode
  variant?: 'default' | 'destructive'
  disabled?: boolean
}

export type DropdownMenuProps = {
  trigger: React.ReactNode
  items: DropdownMenuItem[]
  align?: 'start' | 'end' | 'center'
  side?: 'top' | 'right' | 'bottom' | 'left'
}

export function DropdownMenu({ trigger, items, align = 'end', side = 'bottom' }: DropdownMenuProps) {
  return (
    <DropdownMenuPrimitive.Root>
      <DropdownMenuPrimitive.Trigger asChild>{trigger}</DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          align={align}
          side={side}
          sideOffset={4}
          collisionPadding={8}
          avoidCollisions
          className={cn(
            'z-[200] min-w-[180px] border border-border bg-secondary shadow-lg outline-none',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95'
          )}
        >
          <ul className="py-1">
            {items.map((item, index) => (
              <DropdownMenuPrimitive.Item
                key={index}
                disabled={item.disabled}
                onSelect={(event) => {
                  event.preventDefault()
                  item.onClick()
                }}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors outline-none',
                  item.variant === 'destructive'
                    ? 'text-destructive focus:bg-destructive/10 data-[highlighted]:bg-destructive/10'
                    : 'focus:bg-accent focus:text-accent-foreground data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground',
                  item.disabled && 'pointer-events-none opacity-40'
                )}
              >
                {item.icon}
                {item.label}
              </DropdownMenuPrimitive.Item>
            ))}
          </ul>
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  )
}
