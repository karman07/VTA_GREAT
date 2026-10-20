import { Injectable, UnauthorizedException, ConflictException, NotFoundException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { ragAnswer, scopeToFile, fetchFileChunks, RagFailure } from '../common/rag-stream';
import type { Response } from 'express';
import { LIMITS, TERMS_VERSION } from '../common/limits';
import { StudentRegisterDto, StudentLoginDto, AskDto } from './dto/student-auth.dto';

import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { FirebaseService } from '../firebase/firebase.service';
import { CreateNoteDto } from './dto/create-note.dto';
import { UpdateNoteDto } from './dto/update-note.dto';

@Injectable()
export class StudentsService {
  private readonly logger = new Logger(StudentsService.name);

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private firebase: FirebaseService,
  ) {}

  async register(dto: StudentRegisterDto) {
    const existing = await this.prisma.student.findFirst({
      where: { email: { equals: dto.email, mode: 'insensitive' } },
    });
    if (existing) throw new ConflictException('Email already in use');

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const student = await this.prisma.student.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        name: dto.name,
        termsVersion: TERMS_VERSION,
        termsAcceptedAt: new Date(),
      }
    });

    return this.generateToken(student);
  }

  async login(dto: StudentLoginDto) {
    const student = await this.prisma.student.findFirst({
      where: { email: { equals: dto.email, mode: 'insensitive' } },
    });
    if (!student) throw new UnauthorizedException('Invalid credentials');
    if (!student.password) throw new UnauthorizedException('Please login with Google');

    const valid = await bcrypt.compare(dto.password, student.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    return this.generateToken(student);
  }

  async googleAuth(dto: { firebaseIdToken: string }) {
    let decodedToken;
    try {
      decodedToken = await this.firebase.verifyIdToken(dto.firebaseIdToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired Firebase ID token');
    }

    const { uid, email, name, picture } = decodedToken;
    if (!email) throw new UnauthorizedException('Google account must have an email');

    const student = await this.prisma.student.upsert({
      where: { email },
      update: { firebaseUid: uid, avatarUrl: picture, name: name || email.split('@')[0] },
      create: { 
        email, 
        firebaseUid: uid, 
        name: name || email.split('@')[0],
        avatarUrl: picture
      }
    });

    return this.generateToken(student);
  }

  async getMyClasses(studentId: string) {
    return this.prisma.enrollment.findMany({
      where: { studentId },
      include: {
        subject: {
          include: {
            teacher: { select: { name: true, email: true } },
            _count: { select: { files: true } }
          }
        }
      }
    });
  }

  async joinClass(studentId: string, classCode: string) {
    const subject = await this.prisma.subject.findUnique({
      where: { classCode: classCode.trim().toUpperCase() }
    });
    if (!subject) throw new NotFoundException('Invalid class code. Please check with your teacher.');

    // Check if mapping exists
    const existing = await this.prisma.enrollment.findUnique({
      where: { studentId_subjectId: { studentId, subjectId: subject.id } }
    });
    if (existing) return { message: 'You have already joined this classroom.', subject };

    const enrollment = await this.prisma.enrollment.create({
      data: { studentId, subjectId: subject.id },
      include: { subject: true }
    });

    return { message: 'Joined successfully!', subject: enrollment.subject };
  }

  async previewClass(classCode: string) {
    const subject = await this.prisma.subject.findUnique({
      where: { classCode: classCode.trim().toUpperCase() },
      include: {
        teacher: { select: { name: true, avatarUrl: true } },
        _count: { select: { files: true, enrollments: true } }
      }
    });

    if (!subject) throw new NotFoundException('Invalid class code');
    return subject;
  }

  async getClassDetails(studentId: string, subjectId: string) {
    // 1. Verify enrollment
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { studentId_subjectId: { studentId, subjectId } },
      include: {
        subject: {
          include: {
            teacher: { select: { id: true, name: true, email: true, avatarUrl: true } },
            files: {
              where: { status: 'ready' },
              select: {
                id: true,
                name: true,
                originalName: true,
                displayName: true,
                mimeType: true,
                sizeBytes: true,
                source: true,
                isAssignment: true,
                tags: true,
                createdAt: true,
              }
            }
          }
        }
      }
    });

    if (!enrollment) {
      throw new UnauthorizedException('You are not enrolled in this class');
    }

    return {
      ...enrollment.subject,
      files: enrollment.subject.files.map((file) => ({
        ...file,
        sizeBytes: Number(file.sizeBytes),
      })),
    };
  }

  async getFileStream(studentId: string, fileId: string) {
    const file = await this.prisma.knowledgeFile.findUnique({
      where: { id: fileId },
    });

    if (!file) throw new NotFoundException('File not found');

    // Verify enrollment if it belongs to a subject
    if (file.subjectId) {
      const enrollment = await this.prisma.enrollment.findUnique({
        where: { studentId_subjectId: { studentId, subjectId: file.subjectId } }
      });
      if (!enrollment) throw new UnauthorizedException('You are not enrolled in the subject this file belongs to');
    } else {
      // If it's a general file in teacher's KB, maybe students can't access it unless it's in a subject?
      // For now, let's assume students only access subject-linked files.
      throw new UnauthorizedException('Access denied to private knowledge base files');
    }

    return {
      path: file.storagePath,
      mimeType: file.mimeType,
      originalName: file.originalName,
    };
  }

  async getFileText(studentId: string, fileId: string) {
    const file = await this.prisma.knowledgeFile.findUnique({
      where: { id: fileId },
      include: { subject: { select: { collectionName: true } } },
    });
    if (!file || !file.subjectId || !file.subject) throw new NotFoundException('File not found');
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { studentId_subjectId: { studentId, subjectId: file.subjectId } },
    });
    if (!enrollment) throw new UnauthorizedException('You are not enrolled in the subject this file belongs to');
    return { name: file.displayName || file.originalName, chunks: await fetchFileChunks(file.subject.collectionName, file.id) };
  }

  // ─── Notes Operations ───────────────────────────────────────────────────────

  async getNotes(studentId: string, subjectId: string) {
    return this.prisma.note.findMany({
      where: { studentId, subjectId },
      orderBy: { createdAt: 'desc' },
      include: { file: { select: { name: true, displayName: true } } }
    });
  }

  async createNote(studentId: string, subjectId: string, dto: CreateNoteDto) {
    return this.prisma.note.create({
      data: {
        studentId,
        subjectId,
        content: dto.content,
        fileId: dto.fileId || null,
        pageNumber: dto.pageNumber || null,
        selectionText: dto.selectionText || null,
        selectionCoords: dto.selectionCoords ? (dto.selectionCoords as any) : undefined,
      }
    });
  }

  async updateNote(studentId: string, noteId: string, dto: UpdateNoteDto) {
    // Verify ownership
    const note = await this.prisma.note.findUnique({ where: { id: noteId } });
    if (!note || note.studentId !== studentId) {
      throw new UnauthorizedException('Note not found or access denied');
    }

    return this.prisma.note.update({
      where: { id: noteId },
      data: { content: dto.content }
    });
  }

  async deleteNote(studentId: string, noteId: string) {
    const note = await this.prisma.note.findUnique({ where: { id: noteId } });
    if (!note || note.studentId !== studentId) {
      throw new UnauthorizedException('Note not found or access denied');
    }

    return this.prisma.note.delete({
      where: { id: noteId }
    });
  }

  // ─── Chat History ────────────────────────────────────────────────────────────

  async getChatSessions(studentId: string, subjectId: string) {
    return this.prisma.chatSession.findMany({
      where: { studentId, subjectId },
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: {
          take: 1,
          orderBy: { createdAt: 'asc' },
          select: { content: true, createdAt: true },
        },
        _count: { select: { messages: true } },
      },
    });
  }

  async createChatSession(studentId: string, subjectId: string, title?: string) {
    // Verify enrollment
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { studentId_subjectId: { studentId, subjectId } },
    });
    if (!enrollment) throw new UnauthorizedException('Not enrolled in this class');

    return this.prisma.chatSession.create({
      data: { studentId, subjectId, title: title || null },
    });
  }

  async getChatMessages(studentId: string, sessionId: string) {
    const session = await this.prisma.chatSession.findUnique({ where: { id: sessionId } });
    if (!session || session.studentId !== studentId) throw new UnauthorizedException('Access denied');

    return this.prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async appendChatMessage(studentId: string, sessionId: string, dto: { role: string; content: string; sources?: any[] }) {
    const session = await this.prisma.chatSession.findUnique({ where: { id: sessionId } });
    if (!session || session.studentId !== studentId) throw new UnauthorizedException('Access denied');

    const message = await this.prisma.chatMessage.create({
      data: {
        sessionId,
        role: dto.role,
        content: dto.content,
        sources: dto.sources ? (dto.sources as any) : undefined,
      },
    });

    // Auto-set title from first user message
    if (!session.title && dto.role === 'user') {
      const title = dto.content.length > 60 ? dto.content.slice(0, 57) + '…' : dto.content;
      await this.prisma.chatSession.update({
        where: { id: sessionId },
        data: { title, updatedAt: new Date() },
      });
    } else {
      await this.prisma.chatSession.update({ where: { id: sessionId }, data: { updatedAt: new Date() } });
    }

    return message;
  }

  async deleteChatSession(studentId: string, sessionId: string) {
    const session = await this.prisma.chatSession.findUnique({ where: { id: sessionId } });
    if (!session || session.studentId !== studentId) throw new UnauthorizedException('Access denied');
    await this.prisma.chatSession.delete({ where: { id: sessionId } });
    return { message: 'Session deleted' };
  }

  // ─── Ask (quota-enforced RAG proxy) ─────────────────────────────────────────

  /**
   * Streams NDJSON events to the client:
   *   {type:'start', sessionId, questionsUsed, questionsRemaining}
   *   {type:'token', text}
   *   {type:'done', message, sources, questionsUsed, questionsRemaining}
   *   {type:'error', message}   (the question is NOT counted when this happens)
   * The quota slot is reserved atomically before the model is called and refunded on failure,
   * so parallel requests cannot exceed the cap and failed answers do not cost a question.
   */
  async askStream(studentId: string, subjectId: string, dto: AskDto, res: Response) {
    const max = LIMITS.studentMaxQuestionsPerSubject;

    const enrollment = await this.prisma.enrollment.findUnique({
      where: { studentId_subjectId: { studentId, subjectId } },
      include: { subject: { select: { id: true, name: true, teacherId: true, collectionName: true } } },
    });
    if (!enrollment) throw new ForbiddenException('You are not enrolled in this class');
    const subject = enrollment.subject;

    const readyFiles = await this.prisma.knowledgeFile.count({ where: { subjectId, status: 'ready' } });
    if (readyFiles === 0) {
      throw new BadRequestException('Your teacher has not added any ready study materials to this class yet.');
    }

    if (dto.fileId) {
      const scoped = await this.prisma.knowledgeFile.findFirst({ where: { id: dto.fileId, subjectId, status: 'ready' } });
      if (!scoped) throw new BadRequestException('That document is not available in this class.');
    }

    // Validate an existing session before reserving anything.
    let session = dto.sessionId ? await this.prisma.chatSession.findUnique({ where: { id: dto.sessionId } }) : null;
    if (dto.sessionId && (!session || session.studentId !== studentId || session.subjectId !== subjectId)) {
      throw new NotFoundException('Chat session not found');
    }

    // Atomic reservation: only succeeds while questionsUsed < max.
    const reserved = await this.prisma.enrollment.updateMany({
      where: { studentId, subjectId, questionsUsed: { lt: max } },
      data: { questionsUsed: { increment: 1 } },
    });
    if (reserved.count === 0) {
      throw new ForbiddenException({
        code: 'QUESTION_LIMIT_REACHED',
        message: `You have used all ${max} questions for this class.`,
      });
    }
    const refund = () =>
      this.prisma.enrollment
        .updateMany({ where: { studentId, subjectId, questionsUsed: { gt: 0 } }, data: { questionsUsed: { decrement: 1 } } })
        .catch(() => undefined);

    let createdSession = false;
    let userMessageId: string | null = null;
    let history: { role: string; content: string }[] = [];
    try {
      if (!session) {
        const title = dto.question.length > 60 ? dto.question.slice(0, 57) + '…' : dto.question;
        session = await this.prisma.chatSession.create({ data: { studentId, subjectId, title } });
        createdSession = true;
      } else {
        const prev = await this.prisma.chatMessage.findMany({
          where: { sessionId: session.id },
          orderBy: { createdAt: 'desc' },
          take: 8,
          select: { role: true, content: true },
        });
        history = prev.reverse();
      }
      const um = await this.prisma.chatMessage.create({
        data: { sessionId: session.id, role: 'user', content: dto.question },
      });
      userMessageId = um.id;
    } catch (e) {
      await refund();
      throw e;
    }

    res.status(200);
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    const send = (o: unknown) => { if (!res.writableEnded) res.write(JSON.stringify(o) + '\n'); };

    const used = enrollment.questionsUsed + 1;
    send({ type: 'start', sessionId: session.id, questionsUsed: used, questionsRemaining: Math.max(0, max - used) });

    const started = Date.now();
    const abort = new AbortController();
    let finished = false;
    res.on('close', () => { if (!finished) abort.abort(); });

    const fail = async (message: string) => {
      finished = true;
      await refund();
      if (userMessageId) await this.prisma.chatMessage.delete({ where: { id: userMessageId } }).catch(() => undefined);
      if (createdSession && session) await this.prisma.chatSession.delete({ where: { id: session.id } }).catch(() => undefined);
      const fresh = await this.prisma.enrollment.findUnique({ where: { studentId_subjectId: { studentId, subjectId } } });
      send({ type: 'error', message, questionsUsed: fresh?.questionsUsed ?? enrollment.questionsUsed, questionsRemaining: Math.max(0, max - (fresh?.questionsUsed ?? enrollment.questionsUsed)) });
      res.end();
    };

    try {
      let answer = '';
      let sources: any[] = [];
      for await (const ev of ragAnswer({
        teacherId: subject.teacherId,
        collectionName: subject.collectionName,
        question: scopeToFile(dto.question, dto.fileId),
        history,
        signal: abort.signal,
      })) {
        if (ev.type === 'token') send(ev);
        else { answer = ev.answer; sources = ev.sources; }
      }

      const saved = await this.prisma.chatMessage.create({
        data: { sessionId: session.id, role: 'assistant', content: answer, sources: sources as any },
      });
      await this.prisma.chatSession.update({ where: { id: session.id }, data: { updatedAt: new Date() } });
      await this.prisma.queryLog.create({
        data: {
          teacherId: subject.teacherId,
          question: dto.question,
          answer,
          subjectId,
          studentId,
          askedBy: 'student',
          responseMs: Date.now() - started,
          chunkCount: sources.length,
        },
      }).catch((e) => this.logger.warn(`queryLog failed: ${e.message}`));

      await this.prisma.enrollment
        .update({ where: { studentId_subjectId: { studentId, subjectId } }, data: { lastActiveAt: new Date() } })
        .catch(() => undefined);

      finished = true;
      const after = await this.prisma.enrollment.findUnique({ where: { studentId_subjectId: { studentId, subjectId } } });
      const usedNow = after?.questionsUsed ?? used;
      send({
        type: 'done',
        message: { id: saved.id, role: 'assistant', content: answer, sources, createdAt: saved.createdAt },
        userMessageId,
        questionsUsed: usedNow,
        questionsRemaining: Math.max(0, max - usedNow),
      });
      res.end();
    } catch (err: any) {
      if (abort.signal.aborted) {
        finished = true;
        await refund();
        if (userMessageId) await this.prisma.chatMessage.delete({ where: { id: userMessageId } }).catch(() => undefined);
        if (createdSession && session) await this.prisma.chatSession.delete({ where: { id: session.id } }).catch(() => undefined);
        return;
      }
      if (err instanceof RagFailure) {
        this.logger.warn(`RAG failure: ${err.message}`);
        return await fail(err.userMessage);
      }
      this.logger.error(`ask failed: ${err.message}`);
      await fail('The assistant is unavailable right now. Your question was not counted — please try again shortly.');
    }
  }

  private generateToken(student: any) {
    const payload = { sub: student.id, email: student.email, role: 'student' };
    return {
      accessToken: this.jwt.sign(payload),
      user: { 
        id: student.id, 
        email: student.email, 
        name: student.name, 
        role: 'student', 
        avatarUrl: student.avatarUrl 
      },
    };
  }
}
