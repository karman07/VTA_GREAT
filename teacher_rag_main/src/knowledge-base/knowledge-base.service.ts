import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LIMITS, APP_ALLOWED_EXTENSIONS } from '../common/limits';
import { fetchFileChunks } from '../common/rag-stream';
import { PrismaService } from '../prisma/prisma.service';
import { FileSource, FileStatus, User } from '@prisma/client';
import { UploadGoogleDriveDto, UploadDropboxDto, UploadS3Dto, UploadYoutubeDto } from './dto/knowledge-base.dto';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { google } from 'googleapis';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import FormData from 'form-data';
import { YoutubeTranscript } from 'youtube-transcript';

const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL ?? 'https://teacheraiai.parteekbhatia.com';

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/msword',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/tiff',
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
  'video/webm',
  'audio/mpeg',
  'audio/wav',
  'audio/aac',
  'audio/x-m4a',
  'audio/mp4',
];

const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.pptx', '.xlsx', '.txt', '.md', '.csv', '.doc', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tif', '.tiff', '.mp4', '.mov', '.avi', '.mkv', '.webm', '.mp3', '.wav', '.aac', '.m4a'];

@Injectable()
export class KnowledgeBaseService {
  private readonly logger = new Logger(KnowledgeBaseService.name);
  private readonly uploadsRoot: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.uploadsRoot = path.join(process.cwd(), 'uploads');
  }

  // ─── Ensure teacher has a KnowledgeBase row ────────────────────────────────

  async ensureKnowledgeBase(teacherId: string) {
    let kb = await this.prisma.knowledgeBase.findUnique({ where: { teacherId } });
    if (!kb) {
      kb = await this.prisma.knowledgeBase.create({
        data: { teacherId },
      });
    }
    return kb;
  }

  /**
   * Enforces: subject required + owned by the teacher, and at most N documents per subject.
   * Files that failed processing do not use a slot (the teacher can delete them anyway).
   */
  private async assertCanAddDocument(teacherId: string, subjectId?: string) {
    if (!subjectId) throw new BadRequestException('Choose a subject for this document.');
    const subject = await this.prisma.subject.findFirst({ where: { id: subjectId, teacherId } });
    if (!subject) throw new NotFoundException('Subject not found');
    const used = await this.prisma.knowledgeFile.count({
      where: { subjectId, status: { not: FileStatus.error } },
    });
    if (used >= LIMITS.teacherMaxDocsPerSubject) {
      throw new ForbiddenException({
        code: 'DOCUMENT_LIMIT_REACHED',
        message: `Each subject can hold up to ${LIMITS.teacherMaxDocsPerSubject} documents. Delete one to upload another.`,
      });
    }
  }

  // ─── Get stats ─────────────────────────────────────────────────────────────

  async getStats(teacherId: string) {
    // Use findUnique (read-only) — never create KB on a stats read
    const kb = await this.prisma.knowledgeBase.findUnique({ where: { teacherId } });

    const [total, ready, processing, error, sizeAgg, chunksAgg] = await Promise.all([
      this.prisma.knowledgeFile.count({ where: { teacherId } }),
      this.prisma.knowledgeFile.count({ where: { teacherId, status: 'ready' } }),
      this.prisma.knowledgeFile.count({ where: { teacherId, status: 'processing' } }),
      this.prisma.knowledgeFile.count({ where: { teacherId, status: 'error' } }),
      this.prisma.knowledgeFile.aggregate({
        where: { teacherId },
        _sum: { sizeBytes: true },
      }),
      this.prisma.knowledgeFile.aggregate({
        where: { teacherId },
        _sum: { chunkCount: true },
      }),
    ]);

    return {
      totalFiles: total,
      totalSizeBytes: Number(sizeAgg._sum.sizeBytes ?? 0),
      totalChunks: Number(chunksAgg._sum.chunkCount ?? 0),
      readyFiles: ready,
      processingFiles: processing,
      errorFiles: error,
      collectionName: kb?.collectionName ?? '',
    };
  }

  // ─── List files ────────────────────────────────────────────────────────────

  async listFiles(teacherId: string, source?: FileSource, subjectId?: string) {
    const files = await this.prisma.knowledgeFile.findMany({
      where: {
        teacherId,
        ...(source ? { source } : {}),
        ...(subjectId ? { subjectId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    return files.map(f => ({
      ...f,
      sizeBytes: Number(f.sizeBytes),
    }));
  }

  // ─── Direct upload (Multer) ────────────────────────────────────────────────

  async handleDirectUpload(
    teacherId: string,
    file: Express.Multer.File,
    subjectId?: string,
  ) {
    await this.ensureKnowledgeBase(teacherId);

    const ext = path.extname(file.originalname).toLowerCase();
    if (!APP_ALLOWED_EXTENSIONS.includes(ext)) {
      fs.unlink(file.path, () => undefined);
      throw new BadRequestException(
        `File type not supported. Allowed: ${APP_ALLOWED_EXTENSIONS.join(', ')}`,
      );
    }
    try {
      await this.assertCanAddDocument(teacherId, subjectId);
    } catch (e) {
      fs.unlink(file.path, () => undefined);
      throw e;
    }

    const dbFile = await this.prisma.knowledgeFile.create({
      data: {
        teacherId,
        name: `${uuidv4()}${ext}`,
        originalName: file.originalname,
        mimeType: file.mimetype || 'application/octet-stream',
        sizeBytes: BigInt(file.size),
        storagePath: file.path,
        source: FileSource.upload,
        status: FileStatus.uploading,
        subjectId,
      },
    });

    await this.updateKbStats(teacherId);
    this.logger.log(`File uploaded: ${file.originalname} for teacher ${teacherId}`);

    // Fire-and-forget RAG ingestion
    const kb = await this.ensureKnowledgeBase(teacherId);
    let collectionName = kb.collectionName;
    if (subjectId) {
      const subject = await this.prisma.subject.findUnique({ where: { id: subjectId } });
      if (subject) collectionName = subject.collectionName;
    }

    this.triggerRagIngestion(dbFile.id, teacherId, collectionName, file.path, file.originalname, dbFile.isAssignment);

    return {
      ...dbFile,
      status: FileStatus.uploading,
      sizeBytes: Number(dbFile.sizeBytes),
    };
  }

  // ─── Google Drive ──────────────────────────────────────────────────────────

  async handleGoogleDriveImport(teacherId: string, dto: UploadGoogleDriveDto) {
    await this.assertCanAddDocument(teacherId, dto.subjectId);
    await this.ensureKnowledgeBase(teacherId);

    const ext = path.extname(dto.fileName).toLowerCase() || '.pdf';
    const fileName = `${uuidv4()}${ext}`;
    const teacherDir = path.join(this.uploadsRoot, teacherId);
    fs.mkdirSync(teacherDir, { recursive: true });
    const destPath = path.join(teacherDir, fileName);

    // Use the user's OAuth2 access token to download the file
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: dto.accessToken });
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    let mimeType = dto.mimeType || 'application/pdf';
    let downloadBuffer: Buffer;

    try {
      // Handle Google Docs/Sheets/Slides → export as PDF
      if (mimeType.startsWith('application/vnd.google-apps')) {
        const exportRes = await drive.files.export(
          { fileId: dto.fileId, mimeType: 'application/pdf' },
          { responseType: 'arraybuffer' },
        );
        downloadBuffer = Buffer.from(exportRes.data as ArrayBuffer);
        mimeType = 'application/pdf';
      } else {
        const res = await drive.files.get(
          { fileId: dto.fileId, alt: 'media' },
          { responseType: 'arraybuffer' },
        );
        downloadBuffer = Buffer.from(res.data as ArrayBuffer);
      }
    } catch (err) {
      this.logger.error(`Google Drive download failed: ${String(err)}`);
      throw new BadRequestException('Failed to download file from Google Drive. Check permissions.');
    }

    fs.writeFileSync(destPath, downloadBuffer);

    const dbFile = await this.prisma.knowledgeFile.create({
      data: {
        teacherId,
        name: fileName,
        originalName: dto.fileName,
        mimeType,
        sizeBytes: BigInt(downloadBuffer.byteLength),
        storagePath: destPath,
        source: FileSource.google_drive,
        status: FileStatus.ready,
        cloudFileId: dto.fileId,
        subjectId: dto.subjectId,
      },
    });

    await this.updateKbStats(teacherId);

    // Fire-and-forget RAG ingestion
    const kb2 = await this.ensureKnowledgeBase(teacherId);
    let collectionName2 = kb2.collectionName;
    if (dto.subjectId) {
      const subject = await this.prisma.subject.findUnique({ where: { id: dto.subjectId } });
      if (subject) collectionName2 = subject.collectionName;
    }
    this.triggerRagIngestion(dbFile.id, teacherId, collectionName2, destPath, dto.fileName, dbFile.isAssignment);

    return {
      ...dbFile,
      status: FileStatus.processing,
      sizeBytes: Number(dbFile.sizeBytes),
    };
  }

  // ─── Dropbox ───────────────────────────────────────────────────────────────

  async handleDropboxImport(teacherId: string, dto: UploadDropboxDto) {
    await this.assertCanAddDocument(teacherId, dto.subjectId);
    await this.ensureKnowledgeBase(teacherId);

    const ext = path.extname(dto.name).toLowerCase() || '.pdf';
    const fileName = `${uuidv4()}${ext}`;
    const teacherDir = path.join(this.uploadsRoot, teacherId);
    fs.mkdirSync(teacherDir, { recursive: true });
    const destPath = path.join(teacherDir, fileName);

    // Dropbox Chooser provides direct download links (dl=1)
    const downloadUrl = dto.link.replace('www.dropbox.com', 'dl.dropboxusercontent.com');

    try {
      const response = await axios.get(downloadUrl, { responseType: 'arraybuffer', timeout: 60000 });
      fs.writeFileSync(destPath, Buffer.from(response.data));
    } catch (err) {
      this.logger.error(`Dropbox download failed: ${String(err)}`);
      throw new BadRequestException('Failed to download file from Dropbox.');
    }

    const sizeBytes = dto.sizeBytes ?? fs.statSync(destPath).size;
    const mimeType = this.getMimeFromExt(ext);

    const dbFile = await this.prisma.knowledgeFile.create({
      data: {
        teacherId,
        name: fileName,
        originalName: dto.name,
        mimeType,
        sizeBytes: BigInt(sizeBytes),
        storagePath: destPath,
        source: FileSource.dropbox,
        status: FileStatus.ready,
        subjectId: dto.subjectId,
      },
    });

    await this.updateKbStats(teacherId);

    // Fire-and-forget RAG ingestion
    const kb3 = await this.ensureKnowledgeBase(teacherId);
    let collectionName3 = kb3.collectionName;
    if (dto.subjectId) {
      const subject = await this.prisma.subject.findUnique({ where: { id: dto.subjectId } });
      if (subject) collectionName3 = subject.collectionName;
    }
    this.triggerRagIngestion(dbFile.id, teacherId, collectionName3, destPath, dto.name, dbFile.isAssignment);

    return {
      ...dbFile,
      status: FileStatus.processing,
      sizeBytes: Number(dbFile.sizeBytes),
    };
  }

  // ─── S3 ────────────────────────────────────────────────────────────────────

  async handleS3Import(teacherId: string, dto: UploadS3Dto) {
    await this.assertCanAddDocument(teacherId, dto.subjectId);
    await this.ensureKnowledgeBase(teacherId);

    const ext = path.extname(dto.key).toLowerCase() || '.pdf';
    const fileName = `${uuidv4()}${ext}`;
    const teacherDir = path.join(this.uploadsRoot, teacherId);
    fs.mkdirSync(teacherDir, { recursive: true });
    const destPath = path.join(teacherDir, fileName);

    const s3Client = new S3Client({
      region: dto.region,
      credentials: {
        accessKeyId: dto.accessKeyId,
        secretAccessKey: dto.secretAccessKey,
      },
    });

    try {
      const command = new GetObjectCommand({
        Bucket: dto.bucket,
        Key: dto.key,
      });
      const response = await s3Client.send(command);

      const stream = response.Body as any;
      const writeStream = fs.createWriteStream(destPath);

      await new Promise((resolve, reject) => {
        stream.pipe(writeStream);
        stream.on('end', resolve);
        stream.on('error', reject);
      });
    } catch (err) {
      this.logger.error(`S3 download failed: ${String(err)}`);
      throw new BadRequestException('Failed to download file from S3. Check credentials and permissions.');
    }

    const sizeBytes = fs.statSync(destPath).size;
    const mimeType = this.getMimeFromExt(ext);

    const dbFile = await this.prisma.knowledgeFile.create({
      data: {
        teacherId,
        name: fileName,
        originalName: path.basename(dto.key),
        mimeType,
        sizeBytes: BigInt(sizeBytes),
        storagePath: destPath,
        source: FileSource.s3,
        status: FileStatus.ready,
        cloudFileId: `${dto.bucket}/${dto.key}`,
        subjectId: dto.subjectId,
      },
    });

    await this.updateKbStats(teacherId);

    const kbS3 = await this.ensureKnowledgeBase(teacherId);
    let collectionNameS3 = kbS3.collectionName;
    if (dto.subjectId) {
      const subject = await this.prisma.subject.findUnique({ where: { id: dto.subjectId } });
      if (subject) collectionNameS3 = subject.collectionName;
    }
    this.triggerRagIngestion(dbFile.id, teacherId, collectionNameS3, destPath, path.basename(dto.key), dbFile.isAssignment);

    return {
      ...dbFile,
      status: FileStatus.processing,
      sizeBytes: Number(dbFile.sizeBytes),
    };
  }

  // ─── YouTube ──────────────────────────────────────────────────────────────

  async handleYoutubeImport(teacherId: string, dto: UploadYoutubeDto) {
    await this.assertCanAddDocument(teacherId, dto.subjectId);
    await this.ensureKnowledgeBase(teacherId);

    const teacherDir = path.join(this.uploadsRoot, teacherId);
    fs.mkdirSync(teacherDir, { recursive: true });

    // Fetch transcript on our side so the RAG service gets plain text
    let transcriptText: string;
    try {
      const segments = await YoutubeTranscript.fetchTranscript(dto.url);
      transcriptText = segments.map(s => s.text).join(' ').trim();
      if (!transcriptText) {
        throw new Error('Empty transcript returned');
      }
    } catch (err: any) {
      throw new BadRequestException(
        `Could not fetch YouTube transcript: ${err.message}. Ensure the video has captions enabled.`,
      );
    }

    // Save transcript as plain text
    const fileName = `${uuidv4()}.txt`;
    const destPath = path.join(teacherDir, fileName);
    fs.writeFileSync(destPath, transcriptText, 'utf8');

    // Fetch the video title via YouTube's free oEmbed API
    let videoTitle: string | null = null;
    try {
      const oembedRes = await axios.get(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(dto.url)}&format=json`,
        { timeout: 5000 },
      );
      videoTitle = oembedRes.data?.title || null;
    } catch {
      this.logger.warn(`Could not fetch YouTube title for ${dto.url}`);
    }

    const dbFile = await this.prisma.knowledgeFile.create({
      data: {
        teacherId,
        name: fileName,
        originalName: dto.url,
        displayName: videoTitle,
        mimeType: 'text/plain',
        sizeBytes: BigInt(Buffer.byteLength(transcriptText, 'utf8')),
        storagePath: destPath,
        source: FileSource.youtube,
        status: FileStatus.ready,
        subjectId: dto.subjectId,
      },
    });

    await this.updateKbStats(teacherId);

    const kbYt = await this.ensureKnowledgeBase(teacherId);
    let collectionNameYt = kbYt.collectionName;
    if (dto.subjectId) {
      const subject = await this.prisma.subject.findUnique({ where: { id: dto.subjectId } });
      if (subject) collectionNameYt = subject.collectionName;
    }
    this.triggerRagIngestion(dbFile.id, teacherId, collectionNameYt, destPath, videoTitle ?? dto.url, dbFile.isAssignment);

    return {
      ...dbFile,
      status: FileStatus.processing,
      sizeBytes: Number(dbFile.sizeBytes),
    };
  }

  // ─── Delete file ───────────────────────────────────────────────────────────

  async deleteFile(teacherId: string, fileId: string) {
    const file = await this.prisma.knowledgeFile.findUnique({ where: { id: fileId } });

    if (!file) throw new NotFoundException('File not found');
    if (file.teacherId !== teacherId) throw new ForbiddenException('Access denied');

    // Remove from disk (async — never block the event loop)
    try {
      await fs.promises.unlink(file.storagePath);
    } catch {
      // File already gone from disk — that's fine, proceed with DB cleanup
    }

    await this.prisma.knowledgeFile.delete({ where: { id: fileId } });
    await this.updateKbStats(teacherId);

    // Remove the indexed chunks from the collection the file was ingested into:
    // the subject's collection for subject files, otherwise the teacher's general one.
    let collectionName: string | null = null;
    if (file.subjectId) {
      const subject = await this.prisma.subject.findUnique({ where: { id: file.subjectId } });
      collectionName = subject?.collectionName ?? null;
    } else {
      collectionName = (await this.ensureKnowledgeBase(teacherId).catch(() => null))?.collectionName ?? null;
    }
    if (collectionName) {
      axios.delete(`${RAG_SERVICE_URL}/files/${fileId}`, {
        data: { collection_name: collectionName, file_id: fileId },
      }).catch((e) => this.logger.warn(`Vector cleanup failed for ${fileId}: ${e.message}`));
    }

    return { message: 'File deleted successfully' };
  }

  /** A file owned by this teacher, with its subject's collection (for reading stored text). */
  async getOwnedFile(teacherId: string, fileId: string) {
    const file = await this.prisma.knowledgeFile.findUnique({
      where: { id: fileId },
      include: { subject: { select: { collectionName: true } } },
    });
    if (!file) throw new NotFoundException('File not found');
    if (file.teacherId !== teacherId) throw new ForbiddenException('Access denied');
    return file;
  }

  async getFileText(teacherId: string, fileId: string) {
    const file = await this.getOwnedFile(teacherId, fileId);
    const collection = file.subject?.collectionName ?? (await this.ensureKnowledgeBase(teacherId)).collectionName;
    return { name: file.displayName || file.originalName, chunks: await fetchFileChunks(collection, file.id) };
  }

  // ─── Update file metadata (teacher-editable) ───────────────────────────────

  async updateFileMeta(
    teacherId: string,
    fileId: string,
    data: { displayName?: string; tags?: string[]; subjectId?: string | null; isAssignment?: boolean },
  ) {
    const file = await this.prisma.knowledgeFile.findUnique({ where: { id: fileId } });
    if (!file) throw new NotFoundException('File not found');
    if (file.teacherId !== teacherId) throw new ForbiddenException('Access denied');

    // Moving a file into another subject must respect that subject's document cap.
    if (data.subjectId !== undefined && data.subjectId !== 'all' && data.subjectId !== file.subjectId) {
      await this.assertCanAddDocument(teacherId, data.subjectId ?? undefined);
    }

    const updated = await this.prisma.knowledgeFile.update({
      where: { id: fileId },
      data: {
        ...(data.displayName !== undefined && { displayName: data.displayName }),
        ...(data.tags !== undefined && { tags: data.tags }),
        ...(data.subjectId !== undefined && { subjectId: data.subjectId === 'all' ? null : data.subjectId }),
        ...(data.isAssignment !== undefined && { isAssignment: data.isAssignment }),
      },
    });

    // If subject or assignment status changed, re-ingest into new collection
    if ((data.subjectId !== undefined && data.subjectId !== file.subjectId) || (data.isAssignment !== undefined && data.isAssignment !== file.isAssignment)) {
      // 1. Delete chunks from the OLD collection first
      let oldCollectionName = (await this.ensureKnowledgeBase(teacherId)).collectionName;
      if (file.subjectId) {
        const oldSub = await this.prisma.subject.findUnique({ where: { id: file.subjectId } });
        if (oldSub) oldCollectionName = oldSub.collectionName;
      }
      axios.delete(`${RAG_SERVICE_URL}/files/${fileId}`, {
        data: { collection_name: oldCollectionName, file_id: fileId },
      }).catch(() => { }); // Non-blocking

      // 2. Re-ingest into the NEW collection
      let collectionName = (await this.ensureKnowledgeBase(teacherId)).collectionName;
      if (data.subjectId && data.subjectId !== 'all') {
        const sub = await this.prisma.subject.findUnique({ where: { id: data.subjectId } });
        if (sub) collectionName = sub.collectionName;
      }
      this.triggerRagIngestion(updated.id, teacherId, collectionName, updated.storagePath, updated.name, updated.isAssignment);
    }

    return { ...updated, sizeBytes: Number(updated.sizeBytes) };
  }

  async handleBatchDelete(teacherId: string, ids: string[]) {
    await Promise.all(ids.map(id => this.deleteFile(teacherId, id).catch(() => null)));
    return { message: `${ids.length} files deleted` };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────


  private async updateKbStats(teacherId: string) {
    const agg = await this.prisma.knowledgeFile.aggregate({
      where: { teacherId },
      _sum: { sizeBytes: true },
      _count: { id: true },
    });

    await this.prisma.knowledgeBase.update({
      where: { teacherId },
      data: {
        totalFiles: agg._count.id,
        totalSizeBytes: agg._sum.sizeBytes ?? BigInt(0),
      },
    });
  }

  // ─── RAG ingestion (fire-and-forget) ──────────────────────────────────────

  private async triggerRagIngestion(
    fileId: string,
    teacherId: string,
    collectionName: string,
    storagePath: string,
    originalName: string,
    isAssignment: boolean,
  ) {
    try {
      // Mark as processing
      await this.prisma.knowledgeFile.update({
        where: { id: fileId },
        data: { status: FileStatus.processing },
      });

      const formData = new FormData();
      formData.append('teacher_id', teacherId);
      formData.append('collection_name', collectionName);
      formData.append('file_id', fileId);
      formData.append('file_name', originalName);
      formData.append('is_assignment', String(isAssignment));
      formData.append('file', fs.createReadStream(storagePath), { filename: originalName });

      const headers = formData.getHeaders();
      const length = await new Promise<number | null>((resolve) => {
        formData.getLength((err, len) => {
          if (err) resolve(null);
          else resolve(len);
        });
      });
      if (length) {
        headers['Content-Length'] = length;
      }

      const response = await axios.post(`${RAG_SERVICE_URL}/ingest`, formData, {
        headers,
        timeout: 600_000,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });

      // Mark ready with chunk count
      await this.prisma.knowledgeFile.update({
        where: { id: fileId },
        data: {
          status: FileStatus.ready,
          chunkCount: response.data?.chunks_added ?? 0,
        },
      });

      this.logger.log(
        `RAG ingested '${originalName}' → ${response.data?.chunks_added ?? 0} chunks`,
      );
    } catch (err: any) {
      this.logger.warn(`RAG ingestion failed for file ${fileId}: ${err.message}`);
      if (err.response?.data) {
        this.logger.warn(`AI Backend Error Details: ${JSON.stringify(err.response.data)}`);
      }
      await this.prisma.knowledgeFile.update({
        where: { id: fileId },
        data: { status: FileStatus.error },
      }).catch(() => { });

    }
  }

  private getMimeFromExt(ext: string): string {
    const map: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.doc': 'application/msword',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.csv': 'text/csv',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
      '.bmp': 'image/bmp',
      '.tif': 'image/tiff',
      '.tiff': 'image/tiff',
      '.mp4': 'video/mp4',
      '.mov': 'video/quicktime',
      '.avi': 'video/x-msvideo',
      '.mkv': 'video/x-matroska',
      '.webm': 'video/webm',
    };
    return map[ext] ?? 'application/octet-stream';
  }
}
