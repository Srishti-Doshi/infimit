/**
 * `/legal/privacy` — static Privacy Policy (Sub-PR 5-fe-2). Plain-language
 * MVP policy reflecting what the platform actually stores: account data,
 * bookmarks/comments, and the anonymous analytics session id. Not legal
 * advice — flag for counsel review before commercial launch.
 */
import { StaticPage } from '@/components/static-page';

export default function PrivacyPage(): JSX.Element {
  return (
    <StaticPage
      eyebrow="Legal"
      title="Privacy Policy"
      description="What we collect, why we collect it, and the choices you have. Last updated June 2026."
    >
      <h2>What we collect</h2>
      <p>
        If you create an account we store your name, email address, and a securely hashed password.
        Reading activity you explicitly create — bookmarks and comments — is stored against your
        account so we can show it back to you.
      </p>
      <h2>Analytics</h2>
      <p>
        We measure how stories perform using a first-party analytics event stream (views, reading
        completion, shares, bookmarks). Signed-out readers are identified only by a random session
        identifier stored in your browser — it contains no personal information and is never joined
        to advertising profiles. Raw analytics events are deleted automatically after 90 days.
      </p>
      <h2>Cookies</h2>
      <p>
        We use one essential cookie: a secure, http-only refresh token that keeps you signed in. We
        do not use third-party advertising or tracking cookies.
      </p>
      <h2>Sharing</h2>
      <p>
        We do not sell or share personal data with third parties. Infrastructure providers that host
        our services process data on our behalf under their own security commitments.
      </p>
      <h2>Your choices</h2>
      <ul>
        <li>You can remove any bookmark or comment you have created at any time.</li>
        <li>You can sign out everywhere by changing your password, which revokes all sessions.</li>
        <li>To delete your account and its data, contact the newsroom via the contact page.</li>
      </ul>
    </StaticPage>
  );
}
