import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsISO4217CurrencyCode,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
} from 'class-validator';
import { BusinessType } from '../../common/enums';
import { trim } from '../../common/transforms';

export class CreateApplicationDto {
  @ApiProperty({ example: 'Himal Coffee' })
  @Transform(trim)
  @IsString()
  @Length(2, 120)
  businessName!: string;

  @ApiProperty({ example: 'Himal Coffee Roasters Pvt. Ltd.' })
  @Transform(trim)
  @IsString()
  @Length(2, 160)
  legalBusinessName!: string;

  @ApiProperty({ enum: BusinessType })
  @IsEnum(BusinessType)
  businessType!: BusinessType;

  @ApiProperty()
  @Transform(trim)
  @IsString()
  @Length(2, 120)
  ownerName!: string;

  @ApiProperty()
  @Transform(trim)
  @IsEmail()
  @MaxLength(254)
  ownerEmail!: string;

  @ApiProperty({ example: '+9779800000000', description: 'E.164 format' })
  @Matches(/^\+[1-9]\d{6,14}$/, { message: 'ownerPhone must be in E.164 format' })
  ownerPhone!: string;

  @ApiPropertyOptional({ description: 'Encrypted at rest; returned masked. Use test values only.' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9\- ]{5,32}$/, { message: 'ownerTaxId has an invalid format' })
  ownerTaxId?: string;

  @ApiProperty({ example: 25000, description: 'Expected monthly processing volume' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(100_000_000)
  monthlyVolume!: number;

  @ApiProperty({ example: 40 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(1_000_000)
  averageTicketSize!: number;

  @ApiProperty({ example: 'USD' })
  @IsISO4217CurrencyCode()
  currency!: string;
}
