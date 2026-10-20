import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AskDto } from '../students/dto/student-auth.dto';
import { RagFailure, ragAnswer, scopeToFile } from '../common/rag-stream';

@Injectable()
export class TeacherChatService {
  private readonly logger = new Logger(TeacherChatService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async ownedSubject(teacherId: string, subjectId: string) {
    const subject = await this.prisma.subject.findFirst({
      where: { id: subjectId, teacherId },
      select: { id: true, name: true, teacherId: true, collectionName: true },
    });
    if (!subject) throw new NotFoundException('Subject not found');
    return subject;
  }

  async listSessions(teacherId: string, subjectId: string) {
    await this.ownedSubject(teacherId, subjectId);
    return this.prisma.teacherChatSession.findMany({
      where: { teacherId, subjectId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, updatedAt: true, _count: { select: { messages: true } } },
    });
  }

  async getMessages(teacherId: string, sessionId: string) {
    const session = await this.prisma.teacherChatSession.findFirst({ where: { id: sessionId, teacherId } });
    if (!session) throw new NotFoundException('Chat not found');
    return this.prisma.teacherChatMessage.findMany({ where: { sessionId }, orderBy: { createdAt: 'asc' } });
  }

  async deleteSession(teacherId: string, sessionId: string) {
    const session = await this.prisma.teacherChatSession.findFirst({ where: { id: sessionId, teacherId } });
    if (!session) throw new NotFoundException('Chat not found');
    await this.prisma.teacherChatSession.delete({ where: { id: sessionId } });
    return { message: 'Chat deleted' };
  }

  /** NDJSON stream: start → token* → done | error. Teachers have no question cap. */
  async askStream(teacherId: string, subjectId: string, dto: AskDto, res: Response) {
    const subject = await this.ownedSubject(teacherId, subjectId);

    const ready = await this.prisma.knowledgeFile.count({ where: { subjectId, status: 'ready' } });
    if (ready === 0) throw new BadRequestException('Add at least one ready document to this subject first.');
    if (dto.fileId) {
      const scoped = await this.prisma.knowledgeFile.findFirst({ where: { id: dto.fileId, subjectId, status: 'ready' } });
      if (!scoped) throw new BadRequestException('That document is not available in this subject.');
    }

    let session = dto.sessionId
      ? await this.prisma.teacherChatSession.findFirst({ where: { id: dto.sessionId, teacherId, subjectId } })
      : null;
    if (dto.sessionId && !session) throw new NotFoundException('Chat not found');

    let history: { role: string; content: string }[] = [];
    let createdSession = false;
    if (!session) {
      const title = dto.question.length > 60 ? dto.question.slice(0, 57) + '…' : dto.question;
      session = await this.prisma.teacherChatSession.create({ data: { teacherId, subjectId, title } });
      createdSession = true;
    } else {
      const prev = await this.prisma.teacherChatMessage.findMany({
        where: { sessionId: session.id },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: { role: true, content: true },
      });
      history = prev.reverse();
    }
    const userMsg = await this.prisma.teacherChatMessage.create({
      data: { sessionId: session.id, role: 'user', content: dto.question },
    });

    res.status(200);
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    const send = (o: unknown) => { if (!res.writableEnded) res.write(JSON.stringify(o) + '\n'); };
    send({ type: 'start', sessionId: session.id });

    const abort = new AbortController();
    let finished = false;
    res.on('close', () => { if (!finished) abort.abort(); });

    const rollback = async () => {
      await this.prisma.teacherChatMessage.delete({ where: { id: userMsg.id } }).catch(() => undefined);
      if (createdSession && session) await this.prisma.teacherChatSession.delete({ where: { id: session.id } }).catch(() => undefined);
    };

    try {
      let answer = '';
      let sources: any[] = [];
      for await (const ev of ragAnswer({
        teacherId,
        collectionName: subject.collectionName,
        question: scopeToFile(dto.question, dto.fileId),
        history,
        signal: abort.signal,
      })) {
        if (ev.type === 'token') send(ev);
        else { answer = ev.answer; sources = ev.sources; }
      }
      const saved = await this.prisma.teacherChatMessage.create({
        data: { sessionId: session.id, role: 'assistant', content: answer, sources: sources as any },
      });
      await this.prisma.teacherChatSession.update({ where: { id: session.id }, data: { updatedAt: new Date() } });
      finished = true;
      send({
        type: 'done',
        message: { id: saved.id, role: 'assistant', content: answer, sources, createdAt: saved.createdAt },
        userMessageId: userMsg.id,
      });
      res.end();
    } catch (err: any) {
      finished = true;
      await rollback();
      if (abort.signal.aborted) return;
      const message = err instanceof RagFailure ? err.userMessage : 'The assistant is unavailable right now. Please try again shortly.';
      this.logger.warn(`teacher ask failed: ${err.message}`);
      send({ type: 'error', message });
      res.end();
    }
  }
}
