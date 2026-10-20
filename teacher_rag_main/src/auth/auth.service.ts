import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { FirebaseService } from '../firebase/firebase.service';
import { RegisterDto, LoginDto, GoogleAuthDto, AuthResponseDto } from './dto/auth.dto';
import { User } from '@prisma/client';
import { Role } from '../common/enums/role.enum';
import { TERMS_VERSION } from '../common/limits';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly firebaseService: FirebaseService,
  ) {}

  // ─── Email / Password ──────────────────────────────────────────────────────

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const user = await this.usersService.createUser(
      { email: dto.email, name: dto.name, password: dto.password, role: Role.TEACHER },
      undefined,
      { termsVersion: TERMS_VERSION, termsAcceptedAt: new Date() },
    );
    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.usersService.findByEmailWithPassword(dto.email);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.passwordHash) {
      throw new BadRequestException(
        'This account uses Google Sign-In. Please login with Google.',
      );
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    return this.buildAuthResponse(user);
  }

  // ─── Google / Firebase ─────────────────────────────────────────────────────

  /**
   * Flow:
   * 1. Client authenticates with Google via Firebase SDK → gets Firebase ID token
   * 2. Client sends that token to POST /auth/google
   * 3. We verify it with Firebase Admin SDK (server-side)
   * 4. We create/update the user in Postgres
   * 5. We issue our own JWT — no Firebase token is used after this point
   */
  async googleAuth(dto: GoogleAuthDto): Promise<AuthResponseDto> {
    let decodedToken: Awaited<ReturnType<FirebaseService['verifyIdToken']>>;

    try {
      decodedToken = await this.firebaseService.verifyIdToken(dto.firebaseIdToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired Firebase ID token');
    }

    const { uid, email, name, picture } = decodedToken;

    if (!email) {
      throw new BadRequestException('Google account must have an email address');
    }

    const user = await this.usersService.createOrUpdateGoogleUser({
      email,
      name: name ?? email.split('@')[0],
      firebaseUid: uid,
      avatarUrl: picture,
    });

    return this.buildAuthResponse(user);
  }

  // ─── JWT helpers ───────────────────────────────────────────────────────────

  private buildAuthResponse(user: User): AuthResponseDto {
    const payload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatarUrl,
      },
    };
  }

  async getProfile(userId: string) {
    return this.usersService.findOne(userId);
  }
}
