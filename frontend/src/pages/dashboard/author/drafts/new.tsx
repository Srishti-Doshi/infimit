import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Check, Loader2, Save } from 'lucide-react';
import { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';

import { CategorySelect } from '@/components/category-select';
import { CoverImagePicker, type CoverImageRef } from '@/components/cover-image-picker';
import { TiptapEditor } from '@/components/editor/tiptap-editor';
import { TagsInput } from '@/components/tags-input';
import { Button, Card, CardBody, Container, Input, toast } from '@/components/ui';
import { createDraft, updateDraft } from '@/lib/articles-api';
import { createDraftSchema, type CreateDraftInput } from '@/lib/articles-schema';
import { toastError } from '@/lib/error-messages';
import { useAutoSave, type AutoSaveStatus } from '@/lib/use-auto-save';
import type { ApiError } from '@/types/api';
import type { ArticleCategory } from '@/types/article';

/**
 * New-draft composer.
 *
 * Title + category + tags are RHF-controlled; the body (Tiptap HTML + plain
 * text) lives in local state because Tiptap manages its own internal
 * document — we only sync OUT on changes, never reset IN.
 *
 * Two save paths (pins #101 — was previously explicit-save-only):
 *
 *   1. **Autosave.** Once the title is non-empty (the BE's minimum required
 *      field), the first 1500ms-debounced change fires `POST /v1/articles` to
 *      create the draft. The returned id is captured locally and the URL is
 *      silently swapped to `/dashboard/author/drafts/<id>` via
 *      `history.replaceState` — refreshing now lands on the edit page with
 *      the draft pre-loaded instead of starting over. Subsequent changes
 *      autosave as partial-diff PATCHes (same shape as the edit-draft page).
 *
 *   2. **Explicit "Save draft" button.** Still validates the full Zod
 *      schema and navigates to `/dashboard/author/drafts/<id>` on success.
 *      If autosave has already created the draft, the button just navigates
 *      (no extra round-trip); otherwise it does the create.
 *
 * Autosave is bypassed entirely when the title is empty so an idle visit to
 * `/drafts/new` doesn't POST a junk draft.
 */
export default function NewDraftPage(): JSX.Element {
  const navigate = useNavigate();
  const [body, setBody] = useState('');
  const [plainText, setPlainText] = useState('');
  const [cover, setCover] = useState<CoverImageRef | null>(null);

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = useForm<CreateDraftInput>({
    resolver: zodResolver(createDraftSchema),
    defaultValues: {
      title: '',
      subtitle: '',
      category: 'campus_news',
      tags: [],
      location: '',
    },
  });

  const formValues = watch();

  // Autosave state. `articleId` flips from null → string after the first
  // successful POST; from then on saves are PATCHes against the captured id.
  // `lastSavedRef` tracks the wire snapshot for partial-diff PATCHes,
  // mirroring the edit-draft page's #100 fix.
  const [articleId, setArticleId] = useState<string | null>(null);
  const [version, setVersion] = useState<number>(0);
  const lastSavedRef = useRef<SavedWireState | null>(null);

  function buildWireState(): SavedWireState {
    return {
      title: formValues.title ?? '',
      subtitle: formValues.subtitle?.trim() ? formValues.subtitle.trim() : undefined,
      category: (formValues.category ?? 'campus_news') as ArticleCategory,
      tags: formValues.tags ?? [],
      body: body || undefined,
      plainText: plainText || undefined,
      coverImageMediaId: cover?.id ?? null,
    };
  }

  // Pre-create save: full POST body. Returns the freshly-created article id
  // (caller stashes it). Bypasses Zod — the BE accepts permissive partial
  // drafts; the FE Zod resolver gates only the explicit "Save draft" path.
  async function createFromCurrent(
    state: SavedWireState,
  ): Promise<{ id: string; version: number }> {
    const created = await createDraft({
      title: state.title,
      subtitle: state.subtitle,
      category: state.category,
      tags: state.tags,
      body: state.body,
      plainText: state.plainText,
      coverImageMediaId: state.coverImageMediaId,
    });
    return { id: created.id, version: created.version };
  }

  // Post-create save: partial-diff PATCH. Same logic as the edit-draft
  // page (#100), inlined here to avoid coupling the two surfaces' module
  // structure. The diff helper handles `tags` array equality via JSON.
  async function patchFromCurrent(
    id: string,
    state: SavedWireState,
    last: SavedWireState,
    ver: number,
  ): Promise<{ version: number } | null> {
    const patch = diffWireState(state, last);
    if (Object.keys(patch).length === 0) return null;
    const updated = await updateDraft(id, { ...patch, version: ver });
    return { version: updated.version };
  }

  const { status, lastSavedAt } = useAutoSave({
    trigger: JSON.stringify({
      ...formValues,
      body,
      plainText,
      coverId: cover?.id ?? null,
    }),
    // Always-enabled so the hook's `firstRun` baseline fires on actual
    // mount, not on the first time content becomes "save-worthy". Save
    // gating happens inside the callback below: bail before any network
    // when title is still empty, so an idle visit doesn't POST a junk
    // draft.
    enabled: true,
    save: async () => {
      const current = buildWireState();
      // Idle / pre-title-input: nothing meaningful to persist yet.
      if (!current.title.trim()) return;
      try {
        if (articleId === null) {
          // First save → create.
          const { id, version: ver } = await createFromCurrent(current);
          setArticleId(id);
          setVersion(ver);
          lastSavedRef.current = current;
          // Silent URL swap so a tab close + reopen lands on the edit
          // page with this draft pre-loaded. We deliberately don't
          // `navigate()` — that would remount the form and lose typing
          // momentum.
          window.history.replaceState(null, '', `/dashboard/author/drafts/${id}`);
        } else if (lastSavedRef.current) {
          // Subsequent saves → partial-diff PATCH.
          const result = await patchFromCurrent(articleId, current, lastSavedRef.current, version);
          if (result) {
            setVersion(result.version);
            lastSavedRef.current = current;
          }
        }
      } catch (err) {
        // Surface the error but don't crash the composer — the user
        // can keep typing and the next debounce will retry.
        toastError(err as ApiError['error']);
        throw err;
      }
    },
  });

  // Explicit "Save draft" button still validates Zod + navigates. If
  // autosave has already created the draft (articleId set), skip the
  // network and just navigate — the in-memory state is already persisted.
  const createMutation = useMutation({
    mutationFn: createDraft,
    onSuccess: (article) => {
      toast.success('Draft saved');
      navigate(`/dashboard/author/drafts/${article.id}`, { replace: true });
    },
    onError: (error: ApiError['error']) => toastError(error),
  });

  function onSubmit(values: CreateDraftInput): void {
    if (articleId !== null) {
      // Autosave already covered the persistence; just navigate over.
      navigate(`/dashboard/author/drafts/${articleId}`, { replace: true });
      return;
    }
    createMutation.mutate({
      ...values,
      subtitle: values.subtitle?.trim() ? values.subtitle.trim() : undefined,
      body: body || undefined,
      plainText: plainText || undefined,
      coverImageMediaId: cover?.id ?? null,
    });
  }

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
        <div>
          <h1 className="font-display text-display-md font-semibold text-ink-primary">New draft</h1>
          <p className="mt-2 text-body-base text-ink-secondary">
            Get the structure down — you can keep editing after saving.
          </p>
        </div>
        <SaveIndicator status={status} lastSavedAt={lastSavedAt} />
      </div>

      <form className="mt-8 flex flex-col gap-6" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Card>
          <CardBody className="flex flex-col gap-5">
            <Input
              label="Title"
              placeholder="Headline for your article"
              autoComplete="off"
              errorText={errors.title?.message}
              {...register('title')}
            />

            <Input
              label="Subtitle"
              placeholder="Optional one-line summary that sits below the title"
              autoComplete="off"
              helperText="Up to 500 characters. Often the first hook readers see in feeds."
              errorText={errors.subtitle?.message}
              {...register('subtitle')}
            />

            <Controller
              control={control}
              name="category"
              render={({ field, fieldState }) => (
                <CategorySelect
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  label="Category"
                  required
                  errorText={fieldState.error?.message}
                />
              )}
            />

            <Controller
              control={control}
              name="tags"
              render={({ field, fieldState }) => (
                <TagsInput
                  value={field.value ?? []}
                  onChange={field.onChange}
                  label="Tags"
                  helperText="Up to 10 tags. Press Enter or comma to add."
                  errorText={fieldState.error?.message}
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
              value={body}
              placeholder="Tell the story…"
              onChange={({ body: nextBody, plainText: nextPlain }) => {
                setBody(nextBody);
                setPlainText(nextPlain);
              }}
            />
          </CardBody>
        </Card>

        <div className="flex items-center justify-end gap-3">
          <Link to="/dashboard/author/drafts">
            <Button type="button" variant="ghost">
              Cancel
            </Button>
          </Link>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={createMutation.isPending}
            iconLeft={<Save className="h-4 w-4" aria-hidden="true" />}
          >
            Save draft
          </Button>
        </div>
      </form>
    </Container>
  );
}

// ─── Wire shape + diff helpers (mirrors edit.tsx #100) ─────────────────────

interface SavedWireState {
  title: string;
  subtitle: string | undefined;
  category: ArticleCategory;
  tags: string[];
  body: string | undefined;
  plainText: string | undefined;
  coverImageMediaId: string | null;
}

function diffWireState(current: SavedWireState, last: SavedWireState): Partial<SavedWireState> {
  const patch: Partial<SavedWireState> = {};
  if (current.title !== last.title) patch.title = current.title;
  if (current.subtitle !== last.subtitle) patch.subtitle = current.subtitle;
  if (current.category !== last.category) patch.category = current.category;
  if (JSON.stringify(current.tags) !== JSON.stringify(last.tags)) patch.tags = current.tags;
  if (current.body !== last.body) patch.body = current.body;
  // NOTE: plainText is intentionally NOT diffed/sent — the backend derives it
  // from the body and ignores the client value. Sending a plainText-only diff
  // PATCHes a body the validator strips → empty update → 422. See edit.tsx.
  if (current.coverImageMediaId !== last.coverImageMediaId) {
    patch.coverImageMediaId = current.coverImageMediaId;
  }
  return patch;
}

// ─── SaveIndicator (mirrors edit.tsx) ─────────────────────────────────────

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
