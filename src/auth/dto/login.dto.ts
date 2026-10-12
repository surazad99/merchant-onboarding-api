import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength } from 'class-validator';
import { lowerTrim } from '../../common/transforms';

export class LoginDto {
  @ApiProperty({ example: 'admin@example.test' })
  @Transform(lowerTrim)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(72)
  password!: string;
}
