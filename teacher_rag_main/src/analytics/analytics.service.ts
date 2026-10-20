// analytics.service.ts
import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) { }

  // ─── Log a query ────────────────────────────────────────────────────────────
  async logQuery(
    userId: string, // Can be teacherId or studentId
    question: string,
    answer: string,
    fileId?: string | null,
    askedBy: 'teacher' | 'student' = 'teacher',
    responseMs?: number,
    chunkCount?: number,
    studentIdOverride?: string | null,
    subjectId?: string | null,
    topic?: string | null,
  ) {
    let teacherId = askedBy === 'teacher' ? userId : '';
    let studentId = askedBy === 'student' ? userId : (studentIdOverride ?? null);

    // If student is asking, we need to find the teacherId from the subject
    if (askedBy === 'student' && subjectId && !teacherId) {
      const subject = await this.prisma.subject.findUnique({
        where: { id: subjectId },
        select: { teacherId: true }
      });
      if (subject) teacherId = subject.teacherId;
    }

    // Never write orphan rows: without a resolvable teacher the log cannot be attributed to any course.
    if (!teacherId) {
      return null;
    }

    return this.prisma.queryLog.create({
      data: {
        teacherId,
        question,
        answer,
        fileId: fileId ?? null,
        askedBy,
        responseMs,
        chunkCount,
        studentId: studentId ?? null,
        subjectId: subjectId ?? null,
        topic: topic ?? null,
      },
    });
  }

  // ─── Summary stats ──────────────────────────────────────────────────────────
  async getSummary(teacherId: string, subjectId?: string) {
    const now = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(now.getDate() - 7);
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(now.getDate() - 14);

    const where = { teacherId, ...(subjectId ? { subjectId } : {}) };
    const currentPeriodWhere = { ...where, createdAt: { gte: sevenDaysAgo } };
    const previousPeriodWhere = { ...where, createdAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo } };

    const [
      totalQueries,
      currentQueries,
      previousQueries,
      currentAvgResponse,
      previousAvgResponse,
      last7Days,
      topFiles,
      engagement,
      pageViews,
      totalTimeData
    ] = await Promise.all([
      this.prisma.queryLog.count({ where }),
      this.prisma.queryLog.count({ where: currentPeriodWhere }),
      this.prisma.queryLog.count({ where: previousPeriodWhere }),
      this.prisma.queryLog.aggregate({
        where: { ...currentPeriodWhere, responseMs: { not: null } },
        _avg: { responseMs: true },
      }),
      this.prisma.queryLog.aggregate({
        where: { ...previousPeriodWhere, responseMs: { not: null } },
        _avg: { responseMs: true },
      }),
      this.getLast7DaysActivity(teacherId, subjectId),
      this.getTopQueriedFiles(teacherId, 5, subjectId),
      this.getStudentEngagement(teacherId, subjectId),
      this.prisma.activityLog.count({
        where: {
          subject: { teacherId },
          type: 'page_view',
          ...(subjectId ? { subjectId } : {})
        }
      }),
      this.prisma.enrollment.aggregate({
        where: {
          subject: { teacherId },
          ...(subjectId ? { subjectId } : {})
        },
        _sum: { totalTimeSpent: true }
      })
    ]);

    const calculateTrend = (curr: number, prev: number) => {
      if (prev === 0) return curr > 0 ? 100 : 0;
      return Math.round(((curr - prev) / prev) * 100);
    };

    return {
      totalQueries,
      trends: {
        queries: calculateTrend(currentQueries, previousQueries),
        avgResponse: calculateTrend(
          currentAvgResponse._avg.responseMs ?? 0,
          previousAvgResponse._avg.responseMs ?? 0
        ),
      },
      teacherQueries: await this.prisma.queryLog.count({ where: { ...where, askedBy: 'teacher' } }),
      studentQueries: await this.prisma.queryLog.count({ where: { ...where, askedBy: 'student' } }),
      avgResponseMs: Math.round(currentAvgResponse._avg.responseMs ?? 0),
      last7Days,
      topFiles,
      engagement: {
        ...engagement,
        pageViews,
        totalTimeSpent: totalTimeData._sum.totalTimeSpent ?? 0
      },
    };
  }

  // ─── Top questions ──────────────────────────────────────────────────────────
  async getTopQuestions(teacherId: string, limit = 10, subjectId?: string) {
    const logs = await this.prisma.queryLog.findMany({
      where: { teacherId, ...(subjectId ? { subjectId } : {}) },
      select: { question: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    // Count occurrences
    const counts = new Map<string, { count: number; lastSeen: Date }>();
    for (const log of logs) {
      const key = log.question.toLowerCase().trim().slice(0, 120);
      const existing = counts.get(key);
      if (existing) {
        existing.count++;
        if (log.createdAt > existing.lastSeen) existing.lastSeen = log.createdAt;
      } else {
        counts.set(key, { count: 1, lastSeen: log.createdAt });
      }
    }

    return [...counts.entries()]
      .map(([question, data]) => ({ question, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  // ─── Daily activity (last 7 days) ───────────────────────────────────────────
  private async getLast7DaysActivity(teacherId: string, subjectId?: string) {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const logs = await this.prisma.queryLog.findMany({
      where: {
        teacherId,
        createdAt: { gte: sevenDaysAgo },
        ...(subjectId ? { subjectId } : {})
      },
      select: { askedBy: true, createdAt: true },
    });

    // Bucket by day in memory
    const days: { day: string; queries: number; teacherQ: number; studentQ: number }[] = [];

    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const dayLogs = logs.filter(
        (l) => l.createdAt >= date && l.createdAt < nextDate,
      );

      days.push({
        day: date.toLocaleDateString('en-US', { weekday: 'short' }),
        queries: dayLogs.length,
        teacherQ: dayLogs.filter((l) => l.askedBy === 'teacher').length,
        studentQ: dayLogs.filter((l) => l.askedBy === 'student').length,
      });
    }

    return days;
  }

  // ─── Top queried files ───────────────────────────────────────────────────────
  private async getTopQueriedFiles(teacherId: string, limit = 5, subjectId?: string) {
    const grouped = await this.prisma.queryLog.groupBy({
      by: ['fileId'],
      where: {
        teacherId,
        fileId: { not: null },
        ...(subjectId ? { subjectId } : {})
      },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: limit,
    });

    // Enrich with file names
    const fileIds = grouped.map((g) => g.fileId).filter(Boolean) as string[];
    const files = await this.prisma.knowledgeFile.findMany({
      where: { id: { in: fileIds } },
      select: { id: true, originalName: true, displayName: true },
    });

    const fileMap = new Map(files.map((f) => [f.id, f]));

    return grouped.map((g) => ({
      fileId: g.fileId,
      count: g._count.id,
      fileName: fileMap.get(g.fileId!)?.displayName || fileMap.get(g.fileId!)?.originalName || 'Unknown',
    }));
  }

  // ─── Popular topics ──────────────────────────────────────────────────────────
  async getTopicDistribution(teacherId: string, subjectId?: string) {
    const grouped = await this.prisma.queryLog.groupBy({
      by: ['topic'],
      where: {
        teacherId,
        topic: { not: null },
        ...(subjectId ? { subjectId } : {})
      },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    });
    return grouped.map(g => ({ topic: g.topic, count: g._count.id }));
  }

  // ─── Student Engagement ──────────────────────────────────────────────────────
  async getStudentEngagement(teacherId: string, subjectId?: string) {
    const [totalStudents, activeStudents] = await Promise.all([
      subjectId
        ? this.prisma.enrollment.count({ where: { subjectId } })
        : this.prisma.enrollment.count({ where: { subject: { teacherId } } }),

      this.prisma.queryLog.groupBy({
        by: ['studentId'],
        where: {
          teacherId,
          askedBy: 'student',
          studentId: { not: null },
          ...(subjectId ? { subjectId } : {})
        },
        _count: { id: true }
      })
    ]);

    return {
      joined: totalStudents,
      active: activeStudents.length, // students who asked at least 1 question
      queriesPerStudent: activeStudents.length > 0
        ? activeStudents.reduce((acc, curr) => acc + curr._count.id, 0) / activeStudents.length
        : 0
    };
  }

  // ─── Subject specific stats ──────────────────────────────────────────────────
  async getSubjectAnalytics(teacherId: string, subjectId: string) {
    const [topics, engagement, topQuestions] = await Promise.all([
      this.getTopicDistribution(teacherId, subjectId),
      this.getStudentEngagement(teacherId, subjectId),
      this.getTopQuestionsForSubject(teacherId, subjectId)
    ]);

    return { topics, engagement, topQuestions };
  }

  private async getTopQuestionsForSubject(teacherId: string, subjectId: string, limit = 5) {
    const logs = await this.prisma.queryLog.findMany({
      where: { teacherId, subjectId },
      select: { question: true },
      take: 200,
    });

    const counts = new Map<string, number>();
    for (const log of logs) {
      const q = log.question.trim().toLowerCase();
      counts.set(q, (counts.get(q) || 0) + 1);
    }

    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([question, count]) => ({ question, count }));
  }

  // ─── Log student activity (views/time) ──────────────────────────────────────
  async logActivity(studentId: string, type: string, subjectId?: string, metadata?: any) {
    if (type === 'time_spent' && subjectId && metadata?.duration) {
      // Update the total time spent in Enrollment
      await this.prisma.enrollment.update({
        where: { studentId_subjectId: { studentId, subjectId } },
        data: {
          totalTimeSpent: { increment: metadata.duration },
          lastActiveAt: new Date()
        }
      }).catch(() => null); // ignore if enrollment not found
    }

    return this.prisma.activityLog.create({
      data: {
        studentId,
        type,
        subjectId: subjectId ?? null,
        metadata: metadata ?? {},
      }
    });
  }

  // ─── Get students joined for a subject ──────────────────────────────────────
  async getSubjectStudents(teacherId: string, subjectId: string) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { subjectId, subject: { teacherId } },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            createdAt: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const studentIds = enrollments.map(e => e.studentId);
    const queryCounts = await this.prisma.queryLog.groupBy({
      by: ['studentId'],
      where: {
        subjectId,
        studentId: { in: studentIds },
        askedBy: 'student'
      },
      _count: { id: true }
    });

    const countMap = new Map(queryCounts.map(q => [q.studentId, q._count.id]));

    return enrollments.map(e => ({
      ...e,
      questionsCount: countMap.get(e.studentId) || 0,
    }));
  }

  async getAllTeacherStudents(teacherId: string) {
    // Get all subjects for this teacher
    const subjects = await this.prisma.subject.findMany({
      where: { teacherId },
      select: { id: true }
    });
    const subjectIds = subjects.map(s => s.id);

    // Get unique students from these subjects
    const enrollments = await this.prisma.enrollment.findMany({
      where: { subjectId: { in: subjectIds } },
      include: {
        student: true,
        subject: { select: { name: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Group by student to aggregate stats
    const studentMap = new Map<string, any>();

    // Fetch all query counts for these students in these subjects
    const studentIds = [...new Set(enrollments.map(e => e.studentId))];
    const queryCounts = await this.prisma.queryLog.groupBy({
      by: ['studentId'],
      where: {
        subjectId: { in: subjectIds },
        studentId: { in: studentIds },
        askedBy: 'student'
      },
      _count: { id: true }
    });
    const countMap = new Map(queryCounts.map(q => [q.studentId, q._count.id]));

    enrollments.forEach(e => {
      const existing = studentMap.get(e.studentId);
      if (!existing) {
        studentMap.set(e.studentId, {
          student: e.student,
          totalTimeSpent: e.totalTimeSpent,
          questionsCount: countMap.get(e.studentId) || 0,
          joinedSubjects: [e.subject.name],
          lastActiveAt: e.lastActiveAt,
          firstJoinedAt: e.createdAt
        });
      } else {
        existing.totalTimeSpent += e.totalTimeSpent;
        existing.joinedSubjects.push(e.subject.name);
        if (new Date(e.lastActiveAt) > new Date(existing.lastActiveAt)) {
          existing.lastActiveAt = e.lastActiveAt;
        }
        if (new Date(e.createdAt) < new Date(existing.firstJoinedAt)) {
          existing.firstJoinedAt = e.createdAt;
        }
      }
    });

    return [...studentMap.values()];
  }

  // ─── Query log list (for the teacher to review) ─────────────────────────────
  async getRecentQueries(teacherId: string, limit = 20, subjectId?: string) {
    return this.prisma.queryLog.findMany({
      where: { teacherId, ...(subjectId ? { subjectId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        question: true,
        askedBy: true,
        responseMs: true,
        chunkCount: true,
        createdAt: true,
        topic: true,
        subject: { select: { name: true } },
        file: { select: { originalName: true, displayName: true } },
        student: { select: { name: true } },
      },
    });
  }

  async assertTeacherSeesStudent(teacherId: string, studentId: string) {
    const link = await this.prisma.enrollment.findFirst({
      where: { studentId, subject: { teacherId } },
      select: { studentId: true },
    });
    if (!link) throw new ForbiddenException('Student is not enrolled in any of your subjects');
  }

  // ─── Student Personal Analytics ─────────────────────────────────────────────
  async getStudentPersonalAnalytics(studentId: string, timeframe: '7d' | '30d' | 'all') {
    const now = new Date();
    let startDate = new Date();

    if (timeframe === '7d') startDate.setDate(now.getDate() - 7);
    else if (timeframe === '30d') startDate.setDate(now.getDate() - 30);
    else startDate.setFullYear(now.getFullYear() - 1); // 1 year

    const [logs, student, timeSpentData, pageViews, activities] = await Promise.all([
      this.prisma.queryLog.findMany({
        where: { studentId, createdAt: { gte: startDate } },
        include: {
          subject: { select: { name: true } },
          file: { select: { displayName: true, originalName: true } }
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.student.findUnique({
        where: { id: studentId },
        select: { name: true, email: true, avatarUrl: true, createdAt: true }
      }),
      this.prisma.enrollment.aggregate({
        where: { studentId },
        _sum: { totalTimeSpent: true }
      }),
      this.prisma.activityLog.count({
        where: { studentId, type: 'page_view', createdAt: { gte: startDate } }
      }),
      this.prisma.activityLog.findMany({
        where: { studentId },
        take: 10,
        orderBy: { createdAt: 'desc' }
      })
    ]);

    // 1. Activity by Bucket
    const activityMap = new Map<string, number>();

    // Initialize buckets
    if (timeframe === '7d') {
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(now.getDate() - i);
            activityMap.set(this.formatDateBucket(d, timeframe), 0);
        }
    } else if (timeframe === '30d') {
        for (let i = 29; i >= 0; i--) {
            const d = new Date();
            d.setDate(now.getDate() - i);
            activityMap.set(this.formatDateBucket(d, timeframe), 0);
        }
    } else {
        // For 'all', we want daily data for the past 365 days
        for (let i = 364; i >= 0; i--) {
            const d = new Date();
            d.setDate(now.getDate() - i);
            activityMap.set(this.formatDateBucket(d, timeframe), 0);
        }
    }

    logs.forEach(log => {
      const key = this.formatDateBucket(log.createdAt, timeframe);
      if (activityMap.has(key)) {
        activityMap.set(key, (activityMap.get(key) || 0) + 1);
      }
    });

    // 2. Topic Insights & Weak Area Detection
    const topicMap = new Map<string, { count: number, questions: string[], lastAskedAt: Date, struggleScore: number, confusionCount: number }>();
    const CONFUSION_KEYWORDS = ["don't understand", 'confused', 'explain', 'meaning', 'help', 'not clear', 'stuck', 'why'];

    logs.forEach(log => {
      // Use granular file-based topic if available
      let topicName = log.topic || 'General';
      if (log.file) {
        topicName = log.file.displayName || log.file.originalName || topicName;
      }

      const existing = topicMap.get(topicName) || { count: 0, questions: [], lastAskedAt: new Date(0), struggleScore: 0, confusionCount: 0 };
      existing.count++;
      if (existing.questions.length < 3) existing.questions.push(log.question);

      // Struggle Score logic
      const qLower = log.question.toLowerCase();
      let hasConfusion = false;
      if (CONFUSION_KEYWORDS.some(kw => qLower.includes(kw))) {
        existing.struggleScore += 2;
        existing.confusionCount++;
        hasConfusion = true;
      }

      // Time density: if asked within 5 minutes of the last question on this topic
      if (existing.lastAskedAt.getTime() > 0) {
        const timeDiffMins = (log.createdAt.getTime() - existing.lastAskedAt.getTime()) / (1000 * 60);
        if (timeDiffMins < 5) {
          existing.struggleScore += 1;
        }
      }

      existing.lastAskedAt = log.createdAt;
      topicMap.set(topicName, existing);
    });

    const topicInsights = [...topicMap.entries()].map(([topic, data]) => ({
      topic,
      count: data.count,
      percentage: Math.round((data.count / logs.length) * 100) || 0,
      questions: data.questions,
      struggleScore: data.struggleScore,
      confusionCount: data.confusionCount
    })).sort((a, b) => b.count - a.count);

    // 3. Subject Breakdown with Dynamic Colors
    const subjectMap = new Map<string, number>();
    logs.forEach(log => {
      const name = log.subject?.name || 'Unknown';
      subjectMap.set(name, (subjectMap.get(name) || 0) + 1);
    });

    const COLOR_PALETTE = ['#2563eb', '#7c3aed', '#0d9488', '#d97706', '#dc2626', '#0284c7', '#ea580c'];

    const subjectBreakdown = [...subjectMap.entries()].map(([subject, count], idx) => ({
      subject,
      count,
      color: COLOR_PALETTE[idx % COLOR_PALETTE.length]
    })).sort((a, b) => b.count - a.count);

    // Weak Areas: based on struggle score, defaulting to high counts if no explicit struggle
    const weakAreas = topicInsights
      .filter(t => t.struggleScore > 0 || t.count >= 3)
      .sort((a, b) => (b.struggleScore * 2 + b.count) - (a.struggleScore * 2 + a.count))
      .slice(0, 3)
      .map(t => {
        let reason = 'Revisited multiple times';
        if (t.confusionCount > 0) {
          reason = `Expressed confusion in ${t.confusionCount} query/queries`;
        } else if (t.struggleScore > 0) {
          reason = 'High density of questions in a short time';
        } else if (t.count >= 5) {
          reason = 'Needs focus - highly queried area';
        }

        return {
          topic: t.topic,
          repetitions: t.count,
          reason,
          questions: t.questions
        };
      });

    return {
      student,
      totalQuestions: logs.length,
      totalTimeSpent: Math.floor((timeSpentData._sum.totalTimeSpent || 0) / 60), // Convert seconds to minutes
      totalPageViews: pageViews,
      recentActivities: activities,
      activity: [...activityMap.entries()].map(([day, count]) => ({ day, count })),
      topics: topicInsights,
      subjects: subjectBreakdown,
      weakAreas,
      recentLogs: logs.slice(-5).reverse().map(l => ({
        question: l.question,
        createdAt: l.createdAt,
        topic: l.topic
      }))
    };
  }

  private formatDateBucket(date: Date, timeframe: string): string {
    if (timeframe === '7d') {
      return date.toLocaleDateString('en-US', { weekday: 'short' });
    }
    // Return YYYY-MM-DD for consistent sorting and filtering
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
