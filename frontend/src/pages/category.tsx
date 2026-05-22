import { useParams } from 'react-router-dom';

import { PlaceholderPage } from '@/components/placeholder-page';

export default function CategoryPage(): JSX.Element {
  const { slug } = useParams<{ slug: string }>();
  return (
    <PlaceholderPage
      name={slug ? `Category — ${slug}` : 'Category'}
      subphase={5}
      description="Category index pages with filtered article lists arrive with the public reader experience in Subphase 5."
    />
  );
}
