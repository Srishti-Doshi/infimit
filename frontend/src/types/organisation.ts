/**
 * Organisation domain type. Mirrors the backend `Organisation` schema
 * (docs/04-database-design.md §4.2.2). Optional fields match the validator —
 * everything except identity is editable.
 */
export type OrganisationCategory = 'college' | 'ngo' | 'research_lab' | 'other';

export interface Organisation {
  id: string;
  name: string;
  slug: string;
  category: OrganisationCategory;
  description?: string | null;
  website?: string | null;
  logoUrl?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  verified: boolean;
  createdAt?: string;
  updatedAt?: string;
}
