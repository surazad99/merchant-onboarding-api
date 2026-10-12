import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../common/auth-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums';
import { toApplicationResponse } from './application.mapper';
import { ApplicationsService } from './applications.service';
import { AssignReviewerDto } from './dto/assign-reviewer.dto';
import { CreateApplicationDto } from './dto/create-application.dto';
import { ListApplicationsQuery } from './dto/list-applications.query';
import { ReviewDecisionDto } from './dto/review-decision.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';

const ALL_ROLES = [Role.ADMIN, Role.REVIEWER, Role.SALES];

@ApiTags('applications')
@ApiBearerAuth()
@Controller('applications')
export class ApplicationsController {
  constructor(private readonly service: ApplicationsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.SALES)
  @ApiOperation({ summary: 'Create a merchant application (DRAFT)' })
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateApplicationDto) {
    return toApplicationResponse(await this.service.create(user, dto));
  }

  @Get()
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'List applications visible to the caller (filter by status/riskStatus, paginated)' })
  async list(@CurrentUser() user: AuthUser, @Query() query: ListApplicationsQuery) {
    const { items, ...meta } = await this.service.list(user, query);
    return { items: items.map(toApplicationResponse), ...meta };
  }

  @Get(':id')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Get one application (404 if the caller may not see it)' })
  async get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return toApplicationResponse(await this.service.getVisible(user, id));
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.SALES)
  @ApiOperation({ summary: 'Update an application while it is DRAFT or INFO_REQUESTED' })
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateApplicationDto,
  ) {
    return toApplicationResponse(await this.service.update(user, id, dto));
  }

  @Post(':id/submit')
  @HttpCode(202)
  @Roles(Role.ADMIN, Role.SALES)
  @ApiOperation({ summary: 'Submit for review; enqueues the asynchronous risk review (202 Accepted)' })
  async submit(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return toApplicationResponse(await this.service.submit(user, id));
  }

  @Post(':id/assign')
  @HttpCode(200)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Assign an application to a reviewer (ADMIN only)' })
  async assign(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignReviewerDto,
  ) {
    return toApplicationResponse(await this.service.assignReviewer(user, id, dto));
  }

  @Post(':id/decision')
  @HttpCode(200)
  @Roles(Role.REVIEWER)
  @ApiOperation({ summary: 'Approve / reject / request info (assigned REVIEWER only, status UNDER_REVIEW)' })
  async decide(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewDecisionDto,
  ) {
    return toApplicationResponse(await this.service.decide(user, id, dto));
  }

  @Get(':id/risk-reviews')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Risk review results for each submission of this application' })
  riskReviews(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.listRiskReviews(user, id);
  }

  @Get(':id/audit')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Audit trail for this application (ADMIN only)' })
  audit(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getAuditTrail(id);
  }

  @Post(':id/risk-review/enqueue')
  @HttpCode(202)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Re-enqueue a pending risk review (idempotent reconciliation, ADMIN only)' })
  async requeue(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.service.requeueRiskReview(user, id);
    return { queued: true };
  }
}
