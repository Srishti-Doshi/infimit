/**
 * `/legal/terms` — static Terms of Service (Sub-PR 5-fe-2). Plain-language
 * MVP terms. Not legal advice — flag for counsel review before commercial
 * launch.
 */
import { StaticPage } from '@/components/static-page';

export default function TermsPage(): JSX.Element {
  return (
    <StaticPage
      eyebrow="Legal"
      title="Terms of Service"
      description="The rules of the road for reading, commenting, and publishing on The Infimit. Last updated June 2026."
    >
      <h2>Using the platform</h2>
      <p>
        The Infimit is free to read. Creating an account lets you bookmark stories and join the
        conversation in comments. You are responsible for keeping your credentials private and for
        the activity on your account.
      </p>
      <h2>Comments</h2>
      <p>
        Comments are moderated. Be civil; no harassment, hate speech, spam, or impersonation.
        Comments that break these rules may be rejected or removed, and repeat offenders may lose
        commenting privileges.
      </p>
      <h2>Content and copyright</h2>
      <p>
        Articles, e-paper editions, and downloadable PDFs are the property of The Infimit and its
        contributing authors and partner organisations. You may share links and the
        newspaper-clipping PDFs for personal, non-commercial use with attribution. Republishing full
        articles requires written permission.
      </p>
      <h2>Authors and partner organisations</h2>
      <p>
        Contributors retain authorship of their work and grant The Infimit a licence to publish,
        distribute, and archive it across our editions. Editorial review applies to every
        submission; publication is at the discretion of the editors.
      </p>
      <h2>Liability</h2>
      <p>
        Content is provided in good faith for general information. We do our best to be accurate and
        to correct errors quickly, but the platform is provided &ldquo;as is&rdquo; without
        warranties of any kind.
      </p>
    </StaticPage>
  );
}
