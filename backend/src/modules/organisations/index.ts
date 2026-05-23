export { default as organisationRoutes } from './routes';

// Model — types + the Mongoose model for downstream cross-module consumers.
export {
  Organisation,
  ORGANISATION_CATEGORIES,
  type OrganisationCategory,
  type OrganisationDocument,
  type OrganisationModel,
} from './model';

// Repository — data access. Service-level error mapping is the consumer's responsibility.
export * as orgsRepo from './repository';
export { type CreateOrganisationInput } from './repository';
