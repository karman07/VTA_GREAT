import { Body, Controller, Delete, Get, Param, Post, Request, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TeacherGuard } from '../common/guards/user-type.guards';
import { AskDto } from '../students/dto/student-auth.dto';
import { TeacherChatService } from './teacher-chat.service';

@ApiTags('teacher-chat')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TeacherGuard)
@Controller('teacher-chat')
export class TeacherChatController {
  constructor(private readonly service: TeacherChatService) {}

  @Get('subjects/:subjectId/sessions')
  @ApiOperation({ summary: 'List the teacher\'s saved chats for a subject' })
  sessions(@Request() req: any, @Param('subjectId') subjectId: string) {
    return this.service.listSessions(req.user.id, subjectId);
  }

  @Get('sessions/:sessionId/messages')
  messages(@Request() req: any, @Param('sessionId') sessionId: string) {
    return this.service.getMessages(req.user.id, sessionId);
  }

  @Delete('sessions/:sessionId')
  remove(@Request() req: any, @Param('sessionId') sessionId: string) {
    return this.service.deleteSession(req.user.id, sessionId);
  }

  @Post('subjects/:subjectId/ask')
  @ApiOperation({ summary: 'Ask the assistant about a subject\'s materials (streamed NDJSON, no question cap)' })
  async ask(@Request() req: any, @Param('subjectId') subjectId: string, @Body() dto: AskDto, @Res() res: Response) {
    await this.service.askStream(req.user.id, subjectId, dto, res);
  }
}
