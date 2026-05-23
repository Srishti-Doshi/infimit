export { default as authRoutes } from './routes';

// Session repository — durable record of active refresh tokens.
export {
  createSession,
  findSessionByTokenId,
  isSessionActive,
  revokeSession,
  revokeAllSessionsForUser,
  listActiveSessionsForUser,
  type CreateSessionInput,
} from './repository';

// Redis jti blocklist — hot-path revocation check.
export { blocklistJti, isJtiBlocklisted } from './blocklist';

// Session model — exported for downstream modules that need its types.
export { Session, type SessionDocument, type SessionModel } from './model';

// Validators — reusable Zod primitives (password / email policy is global).
export { emailSchema, passwordSchema } from './validator';

// Email stubs — exposed so cross-module callers (e.g. admin creates editor)
// can trigger transactional sends without reaching past the barrel.
export { sendEditorWelcomeEmail, sendPasswordResetEmail, sendVerifyEmail } from './email';
