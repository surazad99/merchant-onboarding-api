import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MerchantApplication } from '../applications/merchant-application.entity';
import { AuditModule } from '../audit/audit.module';
import { RiskProvider } from './risk-provider';
import { RiskQueueService } from './risk-queue.service';
import { RiskReview } from './risk-review.entity';
import { RISK_QUEUE } from './risk.constants';
import { RiskProcessor } from './risk.processor';
import { SimulatedRiskProvider } from './simulated-risk.provider';

@Module({
  imports: [
    BullModule.registerQueue({ name: RISK_QUEUE }),
    TypeOrmModule.forFeature([MerchantApplication, RiskReview]),
    AuditModule,
  ],
  providers: [
    RiskQueueService,
    RiskProcessor,
    { provide: RiskProvider, useClass: SimulatedRiskProvider },
  ],
  exports: [RiskQueueService],
})
export class RiskModule {}
