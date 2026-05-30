/**
 * Organisation model — docs/04-database-design.md §4.2.2.
 *
 * Owns an author's institutional affiliation (college / NGO / research lab / other).
 * Verification is admin-only — authors register against an existing org slug,
 * but the org itself is admin-created.
 */
import { type HydratedDocument, model, Schema } from 'mongoose';

export type OrganisationCategory = 'college' | 'ngo' | 'research_lab' | 'other';
export const ORGANISATION_CATEGORIES: readonly OrganisationCategory[] = [
  'college',
  'ngo',
  'research_lab',
  'other',
];

export interface OrganisationDocument {
  name: string;
  slug: string;
  logoUrl: string | null;
  description: string | null;
  website: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  category: OrganisationCategory;
  verified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const OrganisationSchema = new Schema<OrganisationDocument>(
  {
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 255 },
    slug: { type: String, required: true, lowercase: true, trim: true },
    logoUrl: { type: String, default: null },
    description: { type: String, default: null, maxlength: 2000 },
    website: { type: String, default: null },
    contactEmail: { type: String, default: null, lowercase: true, trim: true },
    contactPhone: { type: String, default: null, trim: true },
    category: {
      type: String,
      enum: ORGANISATION_CATEGORIES,
      required: true,
    },
    verified: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        const r = ret as Record<string, unknown>;
        // FE-facing canonical id field — replaces Mongo's `_id`. Mirrors the
        // User model transform; retires the FE's `normalizeId` shim.
        r.id = r._id;
        delete r._id;
        return r;
      },
    },
  },
);

OrganisationSchema.index({ slug: 1 }, { unique: true });
// Text index for the (future) search-by-organisation feature.
OrganisationSchema.index({ name: 'text' });

export const Organisation = model<OrganisationDocument>('Organisation', OrganisationSchema);
export type OrganisationModel = HydratedDocument<OrganisationDocument>;
