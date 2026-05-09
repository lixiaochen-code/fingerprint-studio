import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

type DialogProps = {
  open: boolean
  onClose: () => void
  title?: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  closeOnBackdrop?: boolean
}

const sizeClass = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl'
}

export function Dialog({ open, onClose, title, description, children, footer, size = 'md', closeOnBackdrop = true }: DialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-[90] bg-background/80 backdrop-blur-sm',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0'
          )}
        />
        <DialogPrimitive.Content
          onPointerDownOutside={(event) => {
            if (!closeOnBackdrop) event.preventDefault()
          }}
          aria-describedby={description ? undefined : undefined}
          className={cn(
            'fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2',
            'w-[calc(100vw-2rem)] border border-border bg-secondary shadow-xl',
            'flex flex-col max-h-[90vh] outline-none',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
            sizeClass[size]
          )}
        >
          {(title || description) && (
            <header className="flex items-start justify-between gap-4 border-b border-border p-5">
              <div className="space-y-1">
                {title && (
                  <DialogPrimitive.Title className="font-display text-sm font-bold uppercase tracking-wider">
                    {title}
                  </DialogPrimitive.Title>
                )}
                {description && (
                  <DialogPrimitive.Description className="text-xs text-muted-foreground">
                    {description}
                  </DialogPrimitive.Description>
                )}
              </div>
              <DialogPrimitive.Close
                className="text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </DialogPrimitive.Close>
            </header>
          )}
          {!title && !description && (
            <DialogPrimitive.Title className="sr-only">Dialog</DialogPrimitive.Title>
          )}
          <div className="flex-1 overflow-y-auto p-5">{children}</div>
          {footer && (
            <footer className="border-t border-border p-4 flex justify-end gap-2">{footer}</footer>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
