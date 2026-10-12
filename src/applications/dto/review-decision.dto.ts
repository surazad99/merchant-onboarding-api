import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsString, Length, ValidateIf } from 'class-validator';
import { ReviewDecision } from '../../common/enums';

export class ReviewDecisionDto {
  @ApiProperty({ enum: ReviewDecision })
  @IsEnum(ReviewDecision)
  decision!: ReviewDecision;

  @ApiPropertyOptional({ description: 'Required for REJECT and REQUEST_INFO' })
  @ValidateIf((o: ReviewDecisionDto) => o.decision !== ReviewDecision.APPROVE || o.note !== undefined)
  @IsString()
  @Length(5, 1000)
  note?: string;
}
