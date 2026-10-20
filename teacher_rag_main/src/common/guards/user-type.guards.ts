import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

/** Teacher-side routes: rejects student tokens (students live in a separate table). */
@Injectable()
export class TeacherGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const user = ctx.switchToHttp().getRequest().user;
    if (!user || user.role === 'student') {
      throw new ForbiddenException('This action is only available to teachers');
    }
    return true;
  }
}

/** Student-side routes: rejects teacher tokens. */
@Injectable()
export class StudentGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const user = ctx.switchToHttp().getRequest().user;
    if (!user || user.role !== 'student') {
      throw new ForbiddenException('This action is only available to students');
    }
    return true;
  }
}
