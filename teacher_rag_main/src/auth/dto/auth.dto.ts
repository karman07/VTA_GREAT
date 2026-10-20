import { Transform } from 'class-transformer';
import {
  Equals,
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const normEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class RegisterDto {
  @ApiProperty({ example: 'john@example.com' })
  @Transform(normEmail)
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'John Doe' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'StrongP@ss1', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @ApiProperty({ description: 'Must be true: user accepted the Terms of Service and Privacy Policy' })
  @Equals(true, { message: 'You must accept the Terms of Service and Privacy Policy' })
  acceptTerms: boolean;
}

export class LoginDto {
  @ApiProperty({ example: 'john@example.com' })
  @Transform(normEmail)
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'StrongP@ss1' })
  @IsString()
  @IsNotEmpty()
  password: string;
}

export { normEmail, trim };

export class GoogleAuthDto {
  @ApiProperty({
    description: 'Firebase ID token obtained from Google Sign-In on the client',
  })
  @IsString()
  @IsNotEmpty()
  firebaseIdToken: string;
}

export class AuthResponseDto {
  @ApiProperty({ description: 'JWT access token' })
  accessToken: string;

  @ApiProperty({ description: 'Authenticated user object' })
  user: {
    id: string;
    email: string;
    name: string | null;
    role: string;
    avatarUrl: string | null;
  };
}
