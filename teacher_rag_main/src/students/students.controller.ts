import { Controller, Post, Body, Get, UseGuards, Request, Param, Response, Res, StreamableFile, NotFoundException, Patch, Delete, Query } from '@nestjs/common';
import { StudentsService } from './students.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import * as fs from 'fs';
import type { Response as ExpressResponse } from 'express';
import { StudentGuard } from '../common/guards/user-type.guards';
import { StudentRegisterDto, StudentLoginDto, AskDto } from './dto/student-auth.dto';
import { CreateNoteDto } from './dto/create-note.dto';
import { UpdateNoteDto } from './dto/update-note.dto';

@ApiTags('Students')
@Controller('students')
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new student' })
  register(@Body() dto: StudentRegisterDto) {
    return this.studentsService.register(dto);
  }

  @Post('login')
  @ApiOperation({ summary: 'Login as a student' })
  login(@Body() dto: StudentLoginDto) {
    return this.studentsService.login(dto);
  }

  @Post('auth/google')
  @ApiOperation({ summary: 'Login as a student with Google' })
  googleAuth(@Body() dto: { firebaseIdToken: string }) {
    return this.studentsService.googleAuth(dto);
  }

  @UseGuards(JwtAuthGuard, StudentGuard)
  @Post('join')
  @ApiOperation({ summary: 'Join a classroom using a class code' })
  join(@Request() req: any, @Body('code') code: string) {
    return this.studentsService.joinClass(req.user.id, code);
  }

  // ─── Magic Link: preview class before joining ─────────────────────────────
  @Get('class-preview/:code')
  @ApiOperation({ summary: 'Preview class info from code (public)' })
  previewClass(@Param('code') code: string) {
    return this.studentsService.previewClass(code);
  }

  // ─── Magic Link: auto-enroll after sign-in ────────────────────────────────
  @UseGuards(JwtAuthGuard, StudentGuard)
  @Post('join-magic')
  @ApiOperation({ summary: 'Auto-enroll via invite link after sign-in' })
  joinMagic(@Request() req: any, @Body('code') code: string) {
    return this.studentsService.joinClass(req.user.id, code);
  }

  @UseGuards(JwtAuthGuard, StudentGuard)
  @Get('classes')
  @ApiOperation({ summary: 'Get all enrolled classes' })
  getClasses(@Request() req: any) {
    return this.studentsService.getMyClasses(req.user.id);
  }

  @UseGuards(JwtAuthGuard, StudentGuard)
  @Get('classes/:id')
  @ApiOperation({ summary: 'Get details of a specific class including files' })
  getClassDetails(@Request() req: any, @Param('id') id: string) {
    return this.studentsService.getClassDetails(req.user.id, id);
  }

  @UseGuards(JwtAuthGuard, StudentGuard)
  @Get('files/:fileId')
  @ApiOperation({ summary: 'Get a file for viewing' })
  async getFile(@Request() req: any, @Param('fileId') fileId: string, @Response({ passthrough: true }) res: any) {
    const file = await this.studentsService.getFileStream(req.user.id, fileId);
    
    // Check if file exists on disk
    if (!fs.existsSync(file.path)) {
      throw new NotFoundException('File not found on server');
    }

    const stream = fs.createReadStream(file.path);
    res.set({
      'Content-Type': file.mimeType,
      'Content-Disposition': `inline; filename="${file.originalName}"`,
    });
    return new StreamableFile(stream);
  }

  /** Ask a question. Enforces the per-subject quota, streams NDJSON events, saves history. */
  @UseGuards(JwtAuthGuard, StudentGuard)
  @Post('classes/:id/ask')
  @ApiOperation({ summary: 'Ask a question in a class (quota-enforced, streamed as NDJSON)' })
  async ask(@Request() req: any, @Param('id') id: string, @Body() dto: AskDto, @Res() res: ExpressResponse) {
    await this.studentsService.askStream(req.user.id, id, dto, res);
  }

  @UseGuards(JwtAuthGuard, StudentGuard)
  @Get('files/:fileId/text')
  @ApiOperation({ summary: 'Stored text passages of a class document (in-app viewer)' })
  getFileText(@Request() req: any, @Param('fileId') fileId: string) {
    return this.studentsService.getFileText(req.user.id, fileId);
  }

  @UseGuards(JwtAuthGuard, StudentGuard)
  @Get('classes/:id/notes')
  @ApiOperation({ summary: 'Get all notes for a specific class' })
  getNotes(@Request() req: any, @Param('id') id: string) {
    return this.studentsService.getNotes(req.user.id, id);
  }

  @UseGuards(JwtAuthGuard, StudentGuard)
  @Post('classes/:id/notes')
  @ApiOperation({ summary: 'Create a new note for a class' })
  createNote(@Request() req: any, @Param('id') id: string, @Body() dto: CreateNoteDto) {
    return this.studentsService.createNote(req.user.id, id, dto);
  }

  @UseGuards(JwtAuthGuard, StudentGuard)
  @Patch('notes/:noteId')
  @ApiOperation({ summary: 'Update an existing note' })
  updateNote(@Request() req: any, @Param('noteId') noteId: string, @Body() dto: UpdateNoteDto) {
    return this.studentsService.updateNote(req.user.id, noteId, dto);
  }

  @UseGuards(JwtAuthGuard, StudentGuard)
  @Delete('notes/:noteId')
  @ApiOperation({ summary: 'Delete a note' })
  deleteNote(@Request() req: any, @Param('noteId') noteId: string) {
    return this.studentsService.deleteNote(req.user.id, noteId);
  }

  // ─── Chat History ────────────────────────────────────────────────────────────

  /** List all chat sessions for a subject */
  @UseGuards(JwtAuthGuard, StudentGuard)
  @Get('classes/:id/chat-sessions')
  @ApiOperation({ summary: 'List chat sessions for a class' })
  getChatSessions(@Request() req: any, @Param('id') id: string) {
    return this.studentsService.getChatSessions(req.user.id, id);
  }

  /** Create a new chat session */
  @UseGuards(JwtAuthGuard, StudentGuard)
  @Post('classes/:id/chat-sessions')
  @ApiOperation({ summary: 'Create a new chat session' })
  createChatSession(@Request() req: any, @Param('id') id: string, @Body() dto: { title?: string }) {
    return this.studentsService.createChatSession(req.user.id, id, dto.title);
  }

  /** Get all messages in a session */
  @UseGuards(JwtAuthGuard, StudentGuard)
  @Get('chat-sessions/:sessionId/messages')
  @ApiOperation({ summary: 'Get messages in a chat session' })
  getChatMessages(@Request() req: any, @Param('sessionId') sessionId: string) {
    return this.studentsService.getChatMessages(req.user.id, sessionId);
  }

  /** Append a message to a session */
  @UseGuards(JwtAuthGuard, StudentGuard)
  @Post('chat-sessions/:sessionId/messages')
  @ApiOperation({ summary: 'Append a message to a chat session' })
  appendChatMessage(
    @Request() req: any,
    @Param('sessionId') sessionId: string,
    @Body() dto: { role: string; content: string; sources?: any[] },
  ) {
    return this.studentsService.appendChatMessage(req.user.id, sessionId, dto);
  }

  /** Delete a chat session */
  @UseGuards(JwtAuthGuard, StudentGuard)
  @Delete('chat-sessions/:sessionId')
  @ApiOperation({ summary: 'Delete a chat session' })
  deleteChatSession(@Request() req: any, @Param('sessionId') sessionId: string) {
    return this.studentsService.deleteChatSession(req.user.id, sessionId);
  }
}
