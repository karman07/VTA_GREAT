import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { Role } from '../common/enums/role.enum';
import { User } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Internal helpers ──────────────────────────────────────────────────────

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
  }

  /** Returns user WITH passwordHash (normally excluded from selects) */
  async findByEmailWithPassword(email: string): Promise<User | null> {
    return this.findByEmail(email);
  }

  async findByFirebaseUid(firebaseUid: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { firebaseUid } });
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  // ─── Create ────────────────────────────────────────────────────────────────

  async createUser(
    dto: CreateUserDto,
    firebaseUid?: string,
    terms?: { termsVersion: string; termsAcceptedAt: Date },
  ): Promise<User> {
    const existing = await this.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email already registered');

    let passwordHash: string | undefined;
    if (dto.password) {
      passwordHash = await bcrypt.hash(dto.password, 12);
    }

    return this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        passwordHash,
        role: (dto.role as Role) ?? Role.USER,
        firebaseUid,
        ...(terms ?? {}),
      },
    });
  }

  async createOrUpdateGoogleUser(params: {
    email: string;
    name: string;
    firebaseUid: string;
    avatarUrl?: string;
  }): Promise<User> {
    // Try by firebase UID first, then by email (account linking)
    let user =
      (await this.findByFirebaseUid(params.firebaseUid)) ??
      (await this.findByEmail(params.email));

    if (user) {
      return this.prisma.user.update({
        where: { id: user.id },
        data: {
          firebaseUid: params.firebaseUid,
          avatarUrl: params.avatarUrl ?? user.avatarUrl,
          name: user.name ?? params.name,
        },
      });
    }

    return this.prisma.user.create({
      data: {
        email: params.email,
        name: params.name,
        firebaseUid: params.firebaseUid,
        avatarUrl: params.avatarUrl,
        role: Role.USER,
      },
    });
  }

  // ─── Admin CRUD ────────────────────────────────────────────────────────────

  async findAll(): Promise<User[]> {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string): Promise<User> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    await this.findOne(id); // throws 404 if not found
    return this.prisma.user.update({
      where: { id },
      data: {
        name: dto.name,
        role: dto.role,
        isActive: dto.isActive,
      },
    });
  }

  async remove(id: string): Promise<{ message: string }> {
    await this.findOne(id); // throws 404 if not found
    await this.prisma.user.delete({ where: { id } });
    return { message: `User ${id} deleted successfully` };
  }

  async changeRole(id: string, role: Role): Promise<User> {
    await this.findOne(id);
    return this.prisma.user.update({ where: { id }, data: { role } });
  }

  async findByRole(role: Role): Promise<User[]> {
    return this.prisma.user.findMany({ where: { role } });
  }
}
