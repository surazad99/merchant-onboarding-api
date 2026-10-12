import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../common/auth-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQuery } from './dto/list-users.query';
import { toUserResponse, UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a user (ADMIN only)' })
  async create(@CurrentUser() actor: AuthUser, @Body() dto: CreateUserDto) {
    return toUserResponse(await this.users.create(dto, actor.id));
  }

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List users, optionally by role (ADMIN only) - e.g. to pick a reviewer' })
  async list(@Query() query: ListUsersQuery) {
    return (await this.users.list(query.role)).map(toUserResponse);
  }
}
