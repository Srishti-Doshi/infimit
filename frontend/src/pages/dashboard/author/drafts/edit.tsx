import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Check, Loader2, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { ArticleStatusBadge } from '@/components/article-status-badge';
import { CategorySelect } from '@/components/category-select';
import { CoverImagePicker, type CoverImageRef } from '@/components/cover-image-picker';
import { DraftValidationHints } from '@/components/draft-validation-hints';
import { TiptapEditor } from '@/components/editor/tiptap-editor';
import { TagsInput } from '@/components/tags-input';
import { Button, Card, CardBody, Container, Input, Skeleton, toast } from '@/components/ui';
import { getArticle, submitForReview, updateDraft } from '@/lib/articles-api';
import { submitReadiness } from '@/lib/articles-schema';
import { toastError } from '@/lib/error-messages';
import { useAutoSave, type AutoSaveStatus } from '@/lib/use-auto-save';
import type { ApiError } from '@/types/api';
import type { Article, ArticleCategory } from '@/types/article';

/**
 * Edit a draft — loads the article, mounts the composer pre-filled, and
 * auto-saves on every change after a 1.5 s pause. Optimistic-concurrency
 * conflicts (HTTP 409 with `details.currentVersion`) raise a banner offering
 * a reload — we don't silently overwrite anyone's work.
 *
 * The inner `<EditForm>` is keyed on `article.version` so a successful reload
 * remounts it with the freshest defaults (RHF + Tiptap both pick up new
 * initial values only on mount).
 */
export default function EditDraftPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const {
    data: article,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['articles', id],
    queryFn: () => getArticle(id!),
    enabled: Boolean(id),
  });

  if (isLoading || !id) return <LoadingShell />;
  if (isError || !article) return <NotFoundShell />;
  return <EditForm key={article.version} article={article} />;
}

// ─── Inner form ───────────────────────────────────────────────────────────

interface EditFormValues {
  title: string;
  category: ArticleCategory;
  tags: string[];
}

function EditForm({ article }: { article: Article }): JSX.Element {
  const queryClient = useQueryClient();
  const [body, setBody] = useState(article.body ?? '');
  const [plainText, setPlainText] = useState(article.plainText ?? '');
  const [cover, setCover] = useState<CoverImageRef | null>(
    article.coverImageMediaId && article.coverImageUrl
      ? { id: article.coverImageMediaId, url: article.coverImageUrl }
      : null,
  );
  const [version, setVersion] = useState(article.version);
  const [conflict, setConflict] = useState(false);

  const { register, control, watch } = useForm<EditFormValues>({
    defaultValues: {
      title: article.title,
      category: article.category,
      tags: article.tags ?? [],
    },
  });

  // `watch()` (vs `useWatch`) respects defaultValues from the very first
  // render — useWatch returns undefined for untouched fields until the user
  // interacts, which would make autosave POST blank fields.
  const formValues = watch();

  const { status, lastSavedAt } = useAutoSave({
    // `version` is intentionally NOT in the trigger — it's what we SEND on
    // every save, not a user-driven change that should cause one. Including
    // it would make every successful save (which bumps `version`) re-trigger
    // a save → another bump → infinite loop. The `save` callback below reads
    // `version` from the latest closure, so the freshest token is sent.
    trigger: JSON.stringify({
      ...formValues,
      body,
      plainText,
      coverId: cover?.id ?? null,
    }),
    enabled: !conflict,
    save: async () => {
      try {
        const updated = await updateDraft(article.id, {
          title: formValues.title,
          category: formValues.category,
          tags: formValues.tags,
          body: body || undefined,
          plainText: plainText || undefined,
          coverImageMediaId: cover?.id ?? null,
          version,
        });
        setVersion(updated.version);
        // Intentionally NOT calling queryClient.setQueryData here. The parent
        // useQuery's `key={article.version}` would remount the form, and
        // Tiptap's mount-time onUpdate can normalize body HTML differently
        // from the server's sanitizer, dirty the form, and trigger another
        // save — a self-sustaining loop. Local `version` state is enough for
        // the next PATCH; the cache refreshes on reload or focus.
      } catch (err) {
        const apiErr = err as ApiError['error'];
        if (apiErr.code === 'VERSION_CONFLICT') {
          setConflict(true);
        } else {
          toastError(apiErr);
        }
        throw err;
      }
    },
  });

  function reload(): void {
    void queryClient.invalidateQueries({ queryKey: ['articles', article.id] });
  }

  const navigate = useNavigate();

  // Submit-for-review mutation. Backend re-runs the full submission checklist
  // server-side; a 422 here means the local readiness preview was stale (e.g.
  // an in-flight autosave reduced the body length below 300). Surface the
  // offending field as a toast and leave the user on the page to fix it.
  const submitMutation = useMutation({
    mutationFn: () => submitForReview(article.id),
    onSuccess: (updated) => {
      queryClient.setQueryData(['articles', article.id], updated);
      toast.success('Submitted for review');
      navigate('/dashboard/author/submissions');
    },
    onError: (err: ApiError['error']) => {
      if (err.code === 'VALIDATION_ERROR') {
        toast.error(messageForSubmitField(err));
      } else if (err.code === 'INVALID_STATE') {
        toast.error('This draft has already been submitted.');
      } else {
        toastError(err);
      }
    },
  });

  // Light mutation just for the "Save now" button — bypasses debounce.
  const flushMutation = useMutation({
    mutationFn: () =>
      updateDraft(article.id, {
        title: formValues.title,
        category: formValues.category,
        tags: formValues.tags,
        body: body || undefined,
        plainText: plainText || undefined,
        coverImageMediaId: cover?.id ?? null,
        version,
      }),
    onSuccess: (updated) => {
      setVersion(updated.version);
      // Same reason as the autosave path: don't sync into queryCache or
      // we'd unmount/remount Tiptap and risk a normalize-emit loop.
    },
    onError: (err: ApiError['error']) => {
      if (err.code === 'VERSION_CONFLICT') setConflict(true);
      else toastError(err);
    },
  });

  return (
    <Container width="default" className="py-12">
      <Link
        to="/dashboard/author/drafts"
        className="inline-flex items-center gap-1.5 text-body-sm text-ink-secondary hover:text-ink-primary"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to drafts
      </Link>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-display-md font-semibold text-ink-primary">
            Edit draft
          </h1>
          <ArticleStatusBadge status={article.status} />
        </div>
        <SaveIndicator status={status} lastSavedAt={lastSavedAt} />
      </div>

      {conflict ? <ConflictBanner onReload={reload} /> : null}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
        <form className="flex min-w-0 flex-col gap-6" noValidate>
          <Card>
            <CardBody className="flex flex-col gap-5">
              <Input
                label="Title"
                placeholder="Headline for your article"
                autoComplete="off"
                maxLength={200}
                {...register('title')}
              />

              <Controller
                control={control}
                name="category"
                render={({ field }) => (
                  <CategorySelect
                    value={field.value}
                    onChange={field.onChange}
                    label="Category"
                    required
                  />
                )}
              />

              <Controller
                control={control}
                name="tags"
                render={({ field }) => (
                  <TagsInput
                    value={field.value}
                    onChange={field.onChange}
                    label="Tags"
                    helperText="Up to 10 tags. Press Enter or comma to add."
                  />
                )}
              />

              <CoverImagePicker value={cover} onChange={setCover} />
            </CardBody>
          </Card>

          <Card>
            <CardBody className="flex flex-col gap-3">
              <p className="text-body-sm font-medium text-ink-primary">Body</p>
              <TiptapEditor
                value={article.body ?? ''}
                placeholder="Tell the story…"
                onChange={({ body: nextBody, plainText: nextPlain }) => {
                  setBody(nextBody);
                  setPlainText(nextPlain);
                }}
              />
            </CardBody>
          </Card>

          <div className="flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={conflict}
              loading={flushMutation.isPending}
              onClick={() => flushMutation.mutate()}
            >
              Save now
            </Button>
          </div>
        </form>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
          <DraftValidationHints
            draft={{
              title: formValues.title,
              plainText,
              category: formValues.category,
              coverImageMediaId: cover?.id ?? null,
              tags: formValues.tags ?? [],
            }}
          />
          <Button
            type="button"
            variant="primary"
            size="lg"
            loading={submitMutation.isPending}
            disabled={
              conflict ||
              !submitReadiness({
                title: formValues.title,
                plainText,
                category: formValues.category,
                coverImageMediaId: cover?.id ?? null,
                tags: formValues.tags ?? [],
              }).ready
            }
            onClick={() => submitMutation.mutate()}
          >
            Submit for review
          </Button>
        </aside>
      </div>
    </Container>
  );
}

// ─── Submit-error → field message ─────────────────────────────────────────

/**
 * Map a backend 422 from `POST /:id/submit` to a human-friendly message. The
 * client's `submitReadiness` already blocks most of these, but the server
 * re-runs the checklist and is the source of truth — surface whatever it
 * actually rejected.
 */
function messageForSubmitField(err: ApiError['error']): string {
  const field = (err.details as { field?: string } | undefined)?.field;
  switch (field) {
    case 'title':
      return 'Add a title before submitting.';
    case 'body':
      return 'Body needs at least 300 characters.';
    case 'coverImageMediaId':
      return 'Attach a cover image before submitting.';
    case 'tags':
      return 'Add 1–10 tags before submitting.';
    default:
      return err.message || 'Some fields are missing.';
  }
}

// ─── Status surface ───────────────────────────────────────────────────────

function SaveIndicator({
  status,
  lastSavedAt,
}: {
  status: AutoSaveStatus;
  lastSavedAt: Date | null;
}): JSX.Element | null {
  if (status === 'saving') {
    return (
      <span
        role="status"
        className="inline-flex items-center gap-1.5 text-body-sm text-ink-secondary"
      >
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Saving…
      </span>
    );
  }
  if (status === 'saved' && lastSavedAt) {
    return (
      <span
        role="status"
        className="inline-flex items-center gap-1.5 text-body-sm text-status-success-text"
      >
        <Check className="h-4 w-4" aria-hidden="true" />
        Saved
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span
        role="status"
        className="inline-flex items-center gap-1.5 text-body-sm text-status-error-text"
      >
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        Couldn&rsquo;t save
      </span>
    );
  }
  return null;
}

function ConflictBanner({ onReload }: { onReload: () => void }): JSX.Element {
  return (
    <div
      role="alert"
      className="mt-6 flex flex-wrap items-center gap-4 rounded-lg border border-status-warning-text/30 bg-status-warning-bg px-4 py-3"
    >
      <AlertTriangle className="h-5 w-5 shrink-0 text-status-warning-text" aria-hidden="true" />
      <div className="flex-1">
        <p className="font-medium text-status-warning-text">This draft was edited elsewhere.</p>
        <p className="text-body-sm text-status-warning-text/90">
          Your unsaved local changes will be discarded when you reload.
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        iconLeft={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
        onClick={onReload}
      >
        Reload draft
      </Button>
    </div>
  );
}

// ─── Loading / 404 shells ─────────────────────────────────────────────────

function LoadingShell(): JSX.Element {
  return (
    <Container width="default" className="py-12">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-4 h-10 w-2/3" />
      <Skeleton className="mt-2 h-4 w-1/3" />
      <Card className="mt-8">
        <CardBody className="flex flex-col gap-4">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </CardBody>
      </Card>
      <Card className="mt-6">
        <CardBody>
          <Skeleton className="h-60 w-full" />
        </CardBody>
      </Card>
    </Container>
  );
}

function NotFoundShell(): JSX.Element {
  return (
    <Container width="default" className="py-12">
      <h1 className="font-display text-display-md font-semibold text-ink-primary">
        Draft not found
      </h1>
      <p className="mt-2 text-body-base text-ink-secondary">
        It may have been deleted or you don&rsquo;t have access.
      </p>
      <Link
        to="/dashboard/author/drafts"
        className="mt-6 inline-flex items-center gap-1.5 text-body-sm font-medium text-brand-red-500 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to drafts
      </Link>
    </Container>
  );
}
