import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { RiskModule } from '../risk/risk.module';
import { RiskReview } from '../risk/risk-review.entity';
import { UsersModule } from '../users/users.module';
import { ApplicationPolicy } from './application.policy';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { MerchantApplication } from './merchant-application.entity';

@Module({
  imports: [TypeOrmModule.forFeature([MerchantApplication, RiskReview]), AuditModule, RiskModule, UsersModule],
  controllers: [ApplicationsController],
  providers: [ApplicationsService, ApplicationPolicy],
})
export class ApplicationsModule {}
