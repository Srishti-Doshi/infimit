import { useEffect, useRef, useState } from 'react';

import {
  Button,
  Modal,
  ModalBody,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/components/ui';
import { rejectArticleSchema, type RejectArticleInput } from '@/lib/articles-schema';

interface RejectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Title of the article being rejected — surfaced in the modal header for context. */
  articleTitle: string;
  /** Fires with the validated payload; parent owns the mutation + close-on-success. */
  onSubmit: (body: RejectArticleInput) => void;
  /** Whether the parent mutation is in flight — disables submit + cancel. */
  isSubmitting?: boolean;
}

const MAX = 500;
const MIN = 10;

/**
 * `<RejectModal>` — non-dismissable-on-success rejection dialog.
 *
 * Required `rejectionReason` (10–500 chars) flows to the author as a
 * notification. Validation mirrors the backend `rejectArticleBodySchema` so
 * the user never sees a 422 round-trip for length issues.
 *
 * The modal stays open while the parent mutation is in flight (Approve /
 * Reject buttons disabled); on success the parent toggles `open=false`.
 * On error, the parent toasts; modal stays open so the user can retry.
 */
export function RejectModal({
  open,
  onOpenChange,
  articleTitle,
  onSubmit,
  isSubmitting,
}: RejectModalProps): JSX.Element {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus the textarea on open. Replaces the disallowed `autoFocus` prop
  // (jsx-a11y/no-autofocus) with explicit focus management — accessibility
  // is preserved because the focus shift is opt-in via the `open` state.
  useEffect(() => {
    if (open) {
      // setTimeout(0) lets Radix Dialog finish its own focus-trap setup
      // before we steal focus to our preferred target.
      const t = setTimeout(() => textareaRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [open]);

  const trimmed = reason.trim();
  const result = rejectArticleSchema.safeParse({ rejectionReason: trimmed });
  const isValid = result.success;
  const errorMessage =
    !result.success && touched ? (result.error.issues[0]?.message ?? 'Invalid reason') : null;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    setTouched(true);
    if (!result.success) return;
    onSubmit(result.data);
  }

  function handleOpenChange(next: boolean): void {
    // Reset local state when closing — next open starts blank.
    if (!next) {
      setReason('');
      setTouched(false);
    }
    onOpenChange(next);
  }

  return (
    <Modal open={open} onOpenChange={handleOpenChange} size="md">
      <form onSubmit={handleSubmit}>
        <ModalHeader>
          <ModalTitle>Reject submission</ModalTitle>
          <ModalDescription>
            The author of <span className="font-medium text-ink-primary">{articleTitle}</span>{' '}
            will see this reason. Be specific — they&rsquo;ll act on it when revising.
          </ModalDescription>
        </ModalHeader>
        <ModalBody>
          <label htmlFor="rejection-reason" className="block">
            <span className="text-body-sm font-medium text-ink-primary">Reason</span>
            <textarea
              id="rejection-reason"
              ref={textareaRef}
              name="rejectionReason"
              required
              minLength={MIN}
              maxLength={MAX}
              rows={5}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              onBlur={() => setTouched(true)}
              aria-invalid={errorMessage ? true : undefined}
              aria-describedby={errorMessage ? 'rejection-reason-error' : 'rejection-reason-help'}
              className="mt-1.5 w-full resize-y rounded-md border border-line bg-surface px-3 py-2 text-body-base text-ink-primary outline-none transition-colors focus:border-brand-red-500 focus:ring-2 focus:ring-brand-red-500/20"
              placeholder="What needs to change before this can be approved?"
            />
          </label>
          <p
            id="rejection-reason-help"
            className="mt-1.5 flex items-center justify-between text-body-xs text-ink-tertiary"
          >
            <span>
              {MIN}–{MAX} characters.
            </span>
            <span aria-live="polite">
              {trimmed.length} / {MAX}
            </span>
          </p>
          {errorMessage ? (
            <p
              id="rejection-reason-error"
              role="alert"
              className="mt-1.5 text-body-xs text-status-error"
            >
              {errorMessage}
            </p>
          ) : null}
        </ModalBody>
        <ModalFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => handleOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!isValid || isSubmitting}>
            {isSubmitting ? 'Rejecting…' : 'Reject submission'}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
