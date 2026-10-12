import { SetMetadata } from '@nestjs/common';
import { Role } from '../enums';

export const ROLES_KEY = 'roles';
/** Roles allowed to call a route. Routes without @Roles (and not @Public) are denied. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
