import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards, ForbiddenException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StudyService } from './study.service';

const requireStudent = (req: any) => {
  if (req.user?.role !== 'student') throw new ForbiddenException('Students only');
  return req.user.id as string;
};

@ApiTags('Study')
@Controller('study')
@UseGuards(JwtAuthGuard)
export class StudyController {
  constructor(private readonly study: StudyService) {}

  @Get('instruments')
  @ApiOperation({ summary: 'Survey instruments and review rubric (single source of truth for the UIs)' })
  instruments() {
    return this.study.getInstruments();
  }

  // ─── Student ──────────────────────────────────────────────────────────────
  @Get('student/status')
  studentStatus(@Req() req: any, @Query('subjectId') subjectId: string) {
    return this.study.getStudentStatus(requireStudent(req), subjectId);
  }

  @Post('student/consent')
  consent(@Req() req: any, @Body() body: { subjectId: string; agreed: boolean }) {
    return this.study.recordConsent(requireStudent(req), body);
  }

  @Post('student/ratings')
  rate(@Req() req: any, @Body() body: { messageId: string; helpful: number; citationSupport?: string; comment?: string }) {
    return this.study.rateAnswer(requireStudent(req), body);
  }

  @Get('student/ratings')
  myRatings(@Req() req: any, @Query('subjectId') subjectId: string) {
    return this.study.listMyRatedMessageIds(requireStudent(req), subjectId);
  }

  @Post('student/surveys')
  survey(@Req() req: any, @Body() body: { subjectId: string; instrument: string; answers: number[] }) {
    return this.study.submitSurvey(requireStudent(req), body);
  }

  // ─── Teacher / reviewer ───────────────────────────────────────────────────
  @Get('config/:subjectId')
  getConfig(@Req() req: any, @Param('subjectId') subjectId: string) {
    return this.study.getConfig(req.user, subjectId);
  }

  @Put('config/:subjectId')
  updateConfig(@Req() req: any, @Param('subjectId') subjectId: string, @Body() body: { enabled?: boolean; consentText?: string }) {
    return this.study.updateConfig(req.user, subjectId, body);
  }

  @Post('config/:subjectId/reviewers')
  addReviewer(@Req() req: any, @Param('subjectId') subjectId: string, @Body('email') email: string) {
    return this.study.addReviewer(req.user, subjectId, email);
  }

  @Delete('config/:subjectId/reviewers/:userId')
  removeReviewer(@Req() req: any, @Param('subjectId') subjectId: string, @Param('userId') userId: string) {
    return this.study.removeReviewer(req.user, subjectId, userId);
  }

  @Get('review/subjects')
  reviewSubjects(@Req() req: any) {
    return this.study.listReviewSubjects(req.user);
  }

  @Get('review/queue')
  queue(@Req() req: any, @Query('subjectId') subjectId: string, @Query('limit') limit?: string) {
    return this.study.getReviewQueue(req.user, subjectId, limit ? parseInt(limit, 10) || 10 : 10);
  }

  @Post('review')
  review(@Req() req: any, @Body() body: any) {
    return this.study.submitReview(req.user, body);
  }

  @Get('summary/:subjectId')
  summary(@Req() req: any, @Param('subjectId') subjectId: string) {
    return this.study.getSummary(req.user, subjectId);
  }

  @Get('export/:subjectId')
  export(@Req() req: any, @Param('subjectId') subjectId: string, @Query('includeText') includeText?: string) {
    return this.study.exportData(req.user, subjectId, includeText === '1' || includeText === 'true');
  }
}
