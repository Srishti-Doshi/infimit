import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { MediaUploader } from '@/components/media-uploader';
import { Button, Card, CardBody, Container, toast } from '@/components/ui';
import { createEpaper } from '@/lib/epaper-api';
import { createEpaperSchema } from '@/lib/epaper-schema';
import { toastError } from '@/lib/error-messages';
import type { ApiError } from '@/types/api';
import type { Media } from '@/types/media';

/**
 * `/dashboard/admin/epapers/new` — admin upload form.
 *
 * The flow is JSON, not multipart: the PDF + cover are uploaded via the
 * three-step `<MediaUploader>` (presign → PUT → register) first, then this
 * page submits the metadata referencing the two media docs by id.
 *
 * Validation:
 *   - title 1–255 chars (client + server)
 *   - issueDate required, parses as a date
 *   - both media docs must be uploaded (the submit button is disabled
 *     until that's true)
 *
 * Server-side, the backend re-validates each media doc's `purpose` so a
 * mismatched id (e.g. an article cover passed as `pdfMediaId`) returns 422
 * — `toastError` surfaces the validation message.
 */
export default function NewEpaperPage(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [issueDate, setIssueDate] = useState(''); // YYYY-MM-DD
  const [pageCount, setPageCount] = useState('');
  const [pdfMedia, setPdfMedia] = useState<Media | null>(null);
  const [coverMedia, setCoverMedia] = useState<Media | null>(null);
  const [touched, setTouched] = useState(false);

  const draft = {
    title: title.trim(),
    issueDate,
    pdfMediaId: pdfMedia?.id ?? '',
    coverMediaId: coverMedia?.id ?? '',
    ...(pageCount.trim() ? { pageCount: Number(pageCount) } : {}),
  };
  const parse = createEpaperSchema.safeParse(draft);
  const isValid = parse.success;
  const errorMessage =
    !parse.success && touched ? (parse.error.issues[0]?.message ?? 'Invalid form') : null;

  const mutation = useMutation({
    mutationFn: () => {
      // The discriminated success above narrows draft, but we re-parse here
      // to avoid passing the unparsed form values into the API helper.
      const parsed = createEpaperSchema.parse(draft);
      return createEpaper(parsed);
    },
    onSuccess: async (epaper) => {
      await queryClient.invalidateQueries({ queryKey: ['epapers', 'list'] });
      toast.success(`Issue "${epaper.title}" published.`);
      navigate('/dashboard/admin/epapers');
    },
    onError: (error: ApiError['error']) => toastError(error),
  });

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    setTouched(true);
    if (!isValid || mutation.isPending) return;
    mutation.mutate();
  }

  return (
    <Container width="default" className="py-12">
      <Link
        to="/dashboard/admin/epapers"
        className="inline-flex items-center gap-1.5 text-body-sm text-ink-secondary transition-colors hover:text-brand-red-600"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Archive
      </Link>

      <header className="mt-4">
        <h1 className="font-display text-display-md font-semibold text-ink-primary">
          New e-paper issue
        </h1>
        <p className="mt-2 text-body-base text-ink-secondary">
          Upload the PDF + a cover image first, then fill in the metadata. The issue goes live to
          readers immediately on publish.
        </p>
      </header>

      <Card className="mt-8">
        <CardBody>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="title" className="block text-body-sm font-medium text-ink-primary">
                Title
              </label>
              <input
                id="title"
                type="text"
                required
                maxLength={255}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => setTouched(true)}
                placeholder='e.g. "Morning Edition — 3 June 2026"'
                className="mt-1.5 w-full rounded-md border border-line bg-surface px-3 py-2 text-body-base text-ink-primary outline-none transition-colors focus:border-brand-red-500 focus:ring-2 focus:ring-brand-red-500/20"
              />
            </div>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div>
                <label
                  htmlFor="issueDate"
                  className="block text-body-sm font-medium text-ink-primary"
                >
                  Issue date
                </label>
                <input
                  id="issueDate"
                  type="date"
                  required
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  onBlur={() => setTouched(true)}
                  className="mt-1.5 w-full rounded-md border border-line bg-surface px-3 py-2 text-body-base text-ink-primary outline-none transition-colors focus:border-brand-red-500 focus:ring-2 focus:ring-brand-red-500/20"
                />
                <p className="mt-1 text-body-xs text-ink-tertiary">
                  Readers browse the archive by this date. May be back-dated.
                </p>
              </div>

              <div>
                <label
                  htmlFor="pageCount"
                  className="block text-body-sm font-medium text-ink-primary"
                >
                  Page count
                  <span className="ml-1 text-body-xs font-normal text-ink-tertiary">
                    (optional)
                  </span>
                </label>
                <input
                  id="pageCount"
                  type="number"
                  min={0}
                  max={10_000}
                  value={pageCount}
                  onChange={(e) => setPageCount(e.target.value)}
                  placeholder="e.g. 16"
                  className="mt-1.5 w-full rounded-md border border-line bg-surface px-3 py-2 text-body-base text-ink-primary outline-none transition-colors focus:border-brand-red-500 focus:ring-2 focus:ring-brand-red-500/20"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <MediaUploader
                purpose="epaper_pdf"
                label="PDF file"
                helperText="PDF up to 50 MB."
                value={pdfMedia}
                onComplete={(media) => setPdfMedia(media)}
                onRemove={() => setPdfMedia(null)}
              />
              <MediaUploader
                purpose="epaper_cover"
                label="Cover image"
                helperText="JPEG or PNG up to 10 MB."
                value={coverMedia}
                onComplete={(media) => setCoverMedia(media)}
                onRemove={() => setCoverMedia(null)}
              />
            </div>

            {errorMessage ? (
              <p role="alert" className="text-body-xs text-status-error">
                {errorMessage}
              </p>
            ) : null}

            <div className="flex items-center justify-end gap-3 border-t border-line pt-6">
              <Link to="/dashboard/admin/epapers">
                <Button type="button" variant="ghost" disabled={mutation.isPending}>
                  Cancel
                </Button>
              </Link>
              <Button type="submit" variant="primary" disabled={!isValid || mutation.isPending}>
                {mutation.isPending ? 'Publishing…' : 'Publish issue'}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </Container>
  );
}
