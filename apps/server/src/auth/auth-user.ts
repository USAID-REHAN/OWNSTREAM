import type { Request } from 'express';

export interface AuthUser {
  id: string;
  email: string | null;
}

export type AuthenticatedRequest = Request & { user?: AuthUser };
