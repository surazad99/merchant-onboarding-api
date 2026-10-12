import { Role } from './enums';

/** The authenticated principal attached to every request (loaded fresh from the DB). */
export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}
