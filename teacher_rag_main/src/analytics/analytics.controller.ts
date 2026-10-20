import {
  Controller, Get, Post, Body, Query, Req, UseGuards, ParseIntPipe, DefaultValuePipe, Param
} from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('summary')
  async getSummary(@Req() req: any, @Query('subjectId') subjectId?: string) {
    return this.analyticsService.getSummary(req.user.id, subjectId);
  }

  @Get('top-questions')
  async getTopQuestions(
    @Req() req: any,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('subjectId') subjectId?: string,
  ) {
    return this.analyticsService.getTopQuestions(req.user.id, limit, subjectId);
  }

  @Get('topics')
  async getTopics(@Req() req: any, @Query('subjectId') subjectId?: string) {
    return this.analyticsService.getTopicDistribution(req.user.id, subjectId);
  }

  @Get('subject/:id')
  async getSubjectStats(@Req() req: any, @Param('id') id: string) {
    return this.analyticsService.getSubjectAnalytics(req.user.id, id);
  }

  @Get('subject/:id/students')
  async getSubjectStudents(@Req() req: any, @Param('id') id: string) {
    return this.analyticsService.getSubjectStudents(req.user.id, id);
  }

  @Post('activity')
  async logActivity(
    @Req() req: any,
    @Body() body: {
      type: string;
      subjectId?: string;
      metadata?: any;
    },
  ) {
    // Note: This endpoint is used by students too. 
    // If the token is a student token, req.user.id is the student.
    return this.analyticsService.logActivity(
      req.user.id,
      body.type,
      body.subjectId,
      body.metadata,
    );
  }

  @Get('recent-queries')
  async getRecentQueries(
    @Req() req: any,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('subjectId') subjectId?: string,
  ) {
    return this.analyticsService.getRecentQueries(req.user.id, limit, subjectId);
  }

  @Post('log')
  async logQuery(
    @Req() req: any,
    @Body() body: {
      question: string;
      answer: string;
      fileId?: string;
      askedBy?: 'teacher' | 'student';
      responseMs?: number;
      chunkCount?: number;
      studentId?: string;
      subjectId?: string;
      topic?: string;
    },
  ) {
    return this.analyticsService.logQuery(
      req.user.id,
      body.question,
      body.answer,
      body.fileId,
      body.askedBy ?? 'teacher',
      body.responseMs,
      body.chunkCount,
      body.studentId,
      body.subjectId,
      body.topic,
    );
  }

  @Get('student/personal')
  async getStudentPersonalAnalytics(
    @Req() req: any,
    @Query('timeframe', new DefaultValuePipe('7d')) timeframe: '7d' | '30d' | 'all'
  ) {
    // req.user.id is the studentId if called from the student app
    return this.analyticsService.getStudentPersonalAnalytics(req.user.id, timeframe);
  }

  @Get('students')
  async getAllStudents(@Req() req: any) {
    return this.analyticsService.getAllTeacherStudents(req.user.id);
  }

  @Get('student-detail/:studentId')
  async getStudentDetail(
    @Req() req: any,
    @Param('studentId') studentId: string,
    @Query('timeframe', new DefaultValuePipe('all')) timeframe: '7d' | '30d' | 'all'
  ) {
    // A teacher may only view students enrolled in one of their own subjects.
    await this.analyticsService.assertTeacherSeesStudent(req.user.id, studentId);
    return this.analyticsService.getStudentPersonalAnalytics(studentId, timeframe);
  }
}
