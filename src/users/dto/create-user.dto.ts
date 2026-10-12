import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsString, Length, MaxLength, MinLength } from 'class-validator';
import { Role } from '../../common/enums';
import { lowerTrim, trim } from '../../common/transforms';

export class CreateUserDto {
  @ApiProperty({ example: 'jane.sales@example.test' })
  @Transform(lowerTrim)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  // bcrypt only uses the first 72 bytes, so cap the length instead of silently truncating.
  @ApiProperty({ minLength: 12, maxLength: 72 })
  @IsString()
  @MinLength(12)
  @MaxLength(72)
  password!: string;

  @ApiProperty()
  @Transform(trim)
  @IsString()
  @Length(2, 120)
  fullName!: string;

  @ApiProperty({ enum: Role })
  @IsEnum(Role)
  role!: Role;
}
