import { Equals, IsEmail, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { normEmail, trim } from '../../auth/dto/auth.dto';
import { Transform } from 'class-transformer';
import { LIMITS } from '../../common/limits';

export class StudentRegisterDto {
  @Transform(normEmail)
  @IsEmail()
  email: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsString()
  @MinLength(LIMITS.minPasswordLength)
  @MaxLength(128)
  password: string;

  @Equals(true, { message: 'You must accept the Terms of Service and Privacy Policy' })
  acceptTerms: boolean;
}

export class StudentLoginDto {
  @Transform(normEmail)
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}

export class AskDto {
  @Transform(trim)
  @IsString()
  @MinLength(3, { message: 'Question is too short' })
  @MaxLength(LIMITS.maxQuestionChars, { message: `Question must be at most ${LIMITS.maxQuestionChars} characters` })
  question: string;

  @IsOptional()
  @IsUUID()
  sessionId?: string;

  /** Optional: only answer from this document. */
  @IsOptional()
  @IsUUID()
  fileId?: string;
}
