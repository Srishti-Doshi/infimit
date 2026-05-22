import { Toaster as SonnerToaster, toast } from 'sonner';

/**
 * Toaster — global toast notifications.
 *
 * Mounted once inside `AppLayout`. Call `toast.success()`, `toast.error()`,
 * `toast.info()`, or just `toast()` from anywhere. For the "Thank You"
 * pattern from the Figma frames, use `toast.success('Thank you for ...')`.
 *
 * Styles use `richColors` so the success/error/warning variants pick up
 * our brand-aligned palette automatically.
 */
export function Toaster(): JSX.Element {
  return (
    <SonnerToaster
      position="bottom-right"
      richColors
      closeButton
      duration={4000}
      toastOptions={{
        classNames: {
          toast: 'font-sans !rounded-md !shadow-elev-2',
          title: 'font-medium text-body-sm',
          description: 'text-body-xs',
        },
      }}
    />
  );
}

export { toast };
