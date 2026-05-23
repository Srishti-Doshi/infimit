export { default as userRoutes } from './routes';

// Model — types + the Mongoose model for downstream cross-module consumers.
export { User, USER_ROLES, type UserDocument, type UserModel, type UserRole } from './model';

// Repository — data access. Service-level error mapping is the consumer's responsibility.
export * as usersRepo from './repository';
export { type CreateUserInput } from './repository';
