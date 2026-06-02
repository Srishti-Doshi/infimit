import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, Save } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';

import { CategorySelect } from '@/components/category-select';
import { CoverImagePicker, type CoverImageRef } from '@/components/cover-image-picker';
import { TiptapEditor } from '@/components/editor/tiptap-editor';
import { TagsInput } from '@/components/tags-input';
import { Button, Card, CardBody, Container, Input, toast } from '@/components/ui';
import { createDraft } from '@/lib/articles-api';
import { createDraftSchema, type CreateDraftInput } from '@/lib/articles-schema';
import { toastError } from '@/lib/error-messages';
import type { ApiError } from '@/types/api';

/**
 * New-draft composer. Title + category + tags are RHF-controlled; the body
 * (Tiptap HTML + plain text) lives in local state because Tiptap manages its
 * own internal document — we only sync OUT on changes, never reset IN.
 *
 * Auto-save lands Day 6; for now Save is an explicit click that hits
 * `POST /v1/articles` and routes to the edit page on success.
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
    formState: { errors },
  } = useForm<CreateDraftInput>({
    resolver: zodResolver(createDraftSchema),
    defaultValues: {
      title: '',
      category: 'campus_news',
      tags: [],
      location: '',
    },
  });

  const createMutation = useMutation({
    mutationFn: createDraft,
    onSuccess: (article) => {
      toast.success('Draft saved');
      navigate(`/dashboard/author/drafts/${article.id}`, { replace: true });
    },
    onError: (error: ApiError['error']) => toastError(error),
  });

  function onSubmit(values: CreateDraftInput): void {
    createMutation.mutate({
      ...values,
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
      <h1 className="mt-4 font-display text-display-md font-semibold text-ink-primary">
        New draft
      </h1>
      <p className="mt-2 text-body-base text-ink-secondary">
        Get the structure down — you can keep editing after saving.
      </p>

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
