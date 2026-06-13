/**
 * `<DownloadPdfButton>` — article PDF download (Sub-PR 5-fe-1).
 *
 * Plain anchor at `GET /v1/articles/:id/pdf`, opened in a new tab — the BE
 * either streams the freshly-rendered PDF with Content-Disposition (first
 * call per article version) or 302s to the cached S3 copy (subsequent
 * calls). Either way the browser owns the byte stream; the SPA never
 * proxies it. Mirrors the e-paper download pattern from 5-fc.
 */
import { FileDown } from 'lucide-react';

import { apiClient } from '@/lib/api-client';

export function articlePdfUrl(articleId: string): string {
  const base = apiClient.defaults.baseURL ?? '';
  return `${base.replace(/\/+$/, '')}/articles/${articleId}/pdf`;
}

export function DownloadPdfButton({ articleId }: { articleId: string }): JSX.Element {
  return (
    <a
      href={articlePdfUrl(articleId)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-md border border-line bg-surface px-3 py-1.5 text-body-sm font-medium text-ink-primary transition-colors hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <FileDown className="h-4 w-4" aria-hidden="true" />
      <span>Download PDF</span>
    </a>
  );
}
