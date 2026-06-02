export { default as epaperRoutes } from './routes';

// Model — types + the Mongoose model for downstream consumers + migrate script.
export { Epaper, type EpaperDocument, type EpaperModel, type EpaperStats } from './model';

// Repository — exposed as a namespace per the canonical pattern.
export * as epaperRepo from './repository';
