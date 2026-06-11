/**
 * `/about` — static About page (Sub-PR 5-fe-2).
 */
import { StaticPage } from '@/components/static-page';

export default function AboutPage(): JSX.Element {
  return (
    <StaticPage
      eyebrow="Company"
      title="About The Infimit"
      description="A digital newsroom covering higher education — policy, campuses, research, and the people shaping them."
    >
      <p>
        The Infimit is a higher education news and events network. We report on the institutions,
        policies, and technologies reshaping how the world learns — from national curriculum reform
        to campus startups, research funding to student achievement.
      </p>
      <h2>What we publish</h2>
      <p>
        Our newsroom covers five desks: Education Policy, Campus News, Research &amp; Innovation,
        Student Achievements, and Tech in Education. Every story is written by a verified author,
        reviewed by an editor, and published with an AI-assisted summary so readers can scan before
        they commit.
      </p>
      <h2>The e-paper</h2>
      <p>
        Alongside the live site, we publish periodic e-paper editions — full issues you can read
        online or download as a PDF from the archive, just like the print edition.
      </p>
      <h2>Partner organisations</h2>
      <p>
        Colleges, NGOs, and research labs publish through The Infimit as verified partner
        organisations. If your institution would like to contribute, reach out via the contact page.
      </p>
    </StaticPage>
  );
}
