export { default as mediaRoutes } from './routes';

// Model — types + the Mongoose model for downstream cross-module consumers.
export {
  Media,
  MEDIA_PURPOSES,
  type MediaDocument,
  type MediaModel,
  type MediaPurpose,
  type MediaDimensions,
} from './model';

// Repository — needed by articles for refCount accounting on cover/embed
// references. Exported as a namespace per the canonical pattern.
export * as mediaRepo from './repository';
export { type CreateMediaInput } from './repository';

// Caps — exposed so other modules can introspect (e.g. surface size limits in
// UI hints). Keep MEDIA_CAPS read-only — mutations belong in caps.ts.
export { MEDIA_CAPS, checkMediaCap, type CapViolation, type MediaCap } from './caps';
