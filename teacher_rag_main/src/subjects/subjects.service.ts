import { Injectable, ConflictException, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { LIMITS } from '../common/limits';
import { KnowledgeBaseService } from '../knowledge-base/knowledge-base.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSubjectDto, UpdateSubjectDto } from './dto/subject.dto';

@Injectable()
export class SubjectsService {
  constructor(
    private prisma: PrismaService,
    private knowledgeBase: KnowledgeBaseService,
  ) {}

  async create(teacherId: string, dto: CreateSubjectDto) {
    const owned = await this.prisma.subject.count({ where: { teacherId } });
    if (owned >= LIMITS.teacherMaxSubjects) {
      throw new ForbiddenException({
        code: 'SUBJECT_LIMIT_REACHED',
        message: `You can create up to ${LIMITS.teacherMaxSubjects} subjects. Delete a subject to add a new one.`,
      });
    }
    const existing = await this.prisma.subject.findUnique({
      where: { teacherId_name: { teacherId, name: dto.name } },
    });
    if (existing) throw new ConflictException('Subject already exists');

    return this.prisma.subject.create({
      data: {
        name: dto.name,
        teacherId,
        classCode: await this.uniqueClassCode(),
        metadata: dto.metadata,
      },
      include: { _count: { select: { files: true } } },
    });
  }

  private generateClassCode(): string {
    // Unambiguous alphabet (no 0/O/1/I) so codes are easy to read aloud and type.
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
    return code;
  }

  private async uniqueClassCode(): Promise<string> {
    for (let i = 0; i < 10; i++) {
      const code = this.generateClassCode();
      if (!(await this.prisma.subject.findUnique({ where: { classCode: code } }))) return code;
    }
    throw new ConflictException('Could not allocate a class code, please retry');
  }

  async findAll(teacherId: string) {
    return this.prisma.subject.findMany({
      where: { teacherId },
      include: { 
        _count: { 
          select: { files: true, enrollments: true } 
        } 
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(teacherId: string, id: string) {
    const subject = await this.prisma.subject.findFirst({ 
      where: { id, teacherId } 
    });
    if (!subject) throw new NotFoundException('Subject not found');
    return subject;
  }

  /** Students enrolled in a subject, with usage and activity, for the teacher's class list. */
  async listStudents(teacherId: string, subjectId: string) {
    await this.findOne(teacherId, subjectId);
    const enrollments = await this.prisma.enrollment.findMany({
      where: { subjectId },
      orderBy: { createdAt: 'desc' },
      include: { student: { select: { id: true, name: true, email: true, createdAt: true } } },
    });
    const sessions = await this.prisma.chatSession.groupBy({
      by: ['studentId'],
      where: { subjectId },
      _count: { id: true },
      _max: { updatedAt: true },
    });
    const byStudent = new Map(sessions.map((s) => [s.studentId, s]));
    return enrollments.map((e) => ({
      studentId: e.studentId,
      name: e.student.name,
      email: e.student.email,
      joinedAt: e.createdAt,
      questionsUsed: e.questionsUsed,
      conversations: byStudent.get(e.studentId)?._count.id ?? 0,
      lastActiveAt: byStudent.get(e.studentId)?._max.updatedAt ?? null,
    }));
  }

  /** Everything the teacher may see about one enrolled student in this subject, incl. full conversations. */
  async studentDetail(teacherId: string, subjectId: string, studentId: string) {
    const subject = await this.findOne(teacherId, subjectId);
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { studentId_subjectId: { studentId, subjectId } },
      include: { student: { select: { id: true, name: true, email: true, createdAt: true } } },
    });
    if (!enrollment) throw new NotFoundException('This student is not enrolled in this subject');

    const sessions = await this.prisma.chatSession.findMany({
      where: { studentId, subjectId },
      orderBy: { updatedAt: 'desc' },
      include: { messages: { orderBy: { createdAt: 'asc' }, select: { id: true, role: true, content: true, sources: true, createdAt: true } } },
    });
    const questions = sessions.reduce((n, s) => n + s.messages.filter((m) => m.role === 'user').length, 0);
    return {
      subject: { id: subject.id, name: subject.name },
      student: enrollment.student,
      joinedAt: enrollment.createdAt,
      questionsUsed: enrollment.questionsUsed,
      questionsAsked: questions,
      lastActiveAt: sessions[0]?.updatedAt ?? null,
      sessions: sessions.map((s) => ({ id: s.id, title: s.title, createdAt: s.createdAt, updatedAt: s.updatedAt, messages: s.messages })),
    };
  }

  async update(teacherId: string, id: string, name: string) {
    await this.findOne(teacherId, id);
    name = (name ?? '').trim();
    if (!name) throw new BadRequestException('Name is required');
    return this.prisma.subject.update({
      where: { id },
      data: { name },
    });
  }

  async remove(teacherId: string, id: string) {
    await this.findOne(teacherId, id);
    // Remove stored files and their indexed chunks first, so nothing outlives the subject.
    const files = await this.prisma.knowledgeFile.findMany({ where: { subjectId: id }, select: { id: true } });
    for (const f of files) {
      await this.knowledgeBase.deleteFile(teacherId, f.id).catch(() => undefined);
    }
    return this.prisma.subject.delete({ where: { id } });
  }
}
