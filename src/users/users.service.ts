import { ConflictException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit-actions';
import { Role } from '../common/enums';
import { CreateUserDto } from './dto/create-user.dto';
import { User } from './user.entity';

export const toUserResponse = (u: User) => ({
  id: u.id,
  email: u.email,
  fullName: u.fullName,
  role: u.role,
  isActive: u.isActive,
  createdAt: u.createdAt,
});

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly repo: Repository<User>,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateUserDto, actorId?: string): Promise<User> {
    const email = dto.email.toLowerCase();
    if (await this.repo.exist({ where: { email } })) {
      throw new ConflictException('A user with this email already exists');
    }
    const rounds = Number(this.config.get('BCRYPT_ROUNDS') ?? 12);
    const user = await this.repo.save(
      this.repo.create({
        email,
        fullName: dto.fullName,
        role: dto.role,
        passwordHash: await bcrypt.hash(dto.password, rounds),
      }),
    );
    await this.audit.record({
      actorId,
      action: AuditAction.USER_CREATED,
      entityType: 'USER',
      entityId: user.id,
      metadata: { role: user.role },
    });
    return user;
  }

  findByEmail(email: string): Promise<User | null> {
    return this.repo.findOne({ where: { email: email.toLowerCase() } });
  }

  findById(id: string): Promise<User | null> {
    return this.repo.findOne({ where: { id } });
  }

  findActiveReviewer(id: string): Promise<User | null> {
    return this.repo.findOne({ where: { id, role: Role.REVIEWER, isActive: true } });
  }

  list(role?: Role): Promise<User[]> {
    return this.repo.find({ where: role ? { role } : {}, order: { createdAt: 'ASC' } });
  }
}
