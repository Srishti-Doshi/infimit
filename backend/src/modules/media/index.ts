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
