import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { type HTMLAttributes, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Hide the built-in close button (e.g., for required dialogs or fully custom chrome). */
  hideCloseButton?: boolean;
  /** Override the default white panel — used when the inner content needs full-bleed dark surfaces (e.g., WelcomeSplash). */
  panelClassName?: string;
  /** Accessible title when no visible `<ModalTitle>` is present. Rendered as
   * a visually-hidden `Dialog.Title` (NOT an `aria-label` attribute) so
   * Radix's title requirement is genuinely met and auto-wires
   * `aria-labelledby`. Issue #26. */
  ariaLabel?: string;
  /** Accessible description when no visible `<ModalDescription>` is present.
   * Rendered visually hidden; silences Radix's missing-Description warning
   * for label-only modals. Issue #26. */
  ariaDescription?: string;
  children: ReactNode;
}

const sizeMap: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

/**
 * Modal — accessible centered dialog primitive.
 *
 * Wraps Radix Dialog with the Infimit design language: backdrop blur,
 * scale+fade in/out, brand-accent focus ring, escape-to-close, focus trap,
 * scroll-lock. Used by feature screens that overlay content (Login, OTP,
 * Calendar, Welcome). The `<Sidebar>` drawer is its own thing — different
 * pattern, not a Modal variant.
 */
export function Modal({
  open,
  onOpenChange,
  size = 'md',
  hideCloseButton,
  panelClassName,
  ariaLabel,
  ariaDescription,
  children,
}: ModalProps): JSX.Element {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink-primary/50 backdrop-blur-sm data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-lg shadow-elev-3 outline-none data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            sizeMap[size],
            panelClassName ?? 'bg-surface',
          )}
        >
          {ariaLabel ? <Dialog.Title className="sr-only">{ariaLabel}</Dialog.Title> : null}
          {ariaDescription ? (
            <Dialog.Description className="sr-only">{ariaDescription}</Dialog.Description>
          ) : null}
          {hideCloseButton ? null : (
            <Dialog.Close
              className="absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-tertiary transition-colors hover:bg-surface-subtle hover:text-ink-primary focus-visible:outline-none"
              aria-label="Close"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Dialog.Close>
          )}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface ModalSlotProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function ModalTitle({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLHeadingElement>): JSX.Element {
  return (
    <Dialog.Title
      className={cn('font-display text-display-sm font-semibold text-ink-primary', className)}
      {...props}
    >
      {children}
    </Dialog.Title>
  );
}

export function ModalDescription({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLParagraphElement>): JSX.Element {
  return (
    <Dialog.Description
      className={cn('mt-1 text-body-sm text-ink-secondary', className)}
      {...props}
    >
      {children}
    </Dialog.Description>
  );
}

export function ModalHeader({ className, children, ...props }: ModalSlotProps): JSX.Element {
  return (
    <div
      className={cn('flex flex-col gap-1 border-b border-line px-6 py-5 pr-12', className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function ModalBody({ className, children, ...props }: ModalSlotProps): JSX.Element {
  return (
    <div className={cn('px-6 py-5', className)} {...props}>
      {children}
    </div>
  );
}

export function ModalFooter({ className, children, ...props }: ModalSlotProps): JSX.Element {
  return (
    <div
      className={cn(
        'flex items-center justify-end gap-3 border-t border-line bg-surface-subtle px-6 py-4',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
