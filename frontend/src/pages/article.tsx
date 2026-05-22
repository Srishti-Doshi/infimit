import { useParams } from 'react-router-dom';

import { PlaceholderPage } from '@/components/placeholder-page';

export default function ArticlePage(): JSX.Element {
  const { slug } = useParams<{ slug: string }>();
  return (
    <PlaceholderPage
      name={slug ? `Article — ${slug}` : 'Article'}
      subphase={5}
      description="The article reader (headline, byline, hero image, body via DOMPurify, comments, related articles) lands in Subphase 5."
    />
  );
}
