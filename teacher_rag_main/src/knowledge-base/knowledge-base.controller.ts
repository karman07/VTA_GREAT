import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Request,
  ParseFilePipe,
  MaxFileSizeValidator,
  HttpCode,
  HttpStatus,
  Res,
  StreamableFile,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { TeacherGuard } from '../common/guards/user-type.guards';
import { LIMITS } from '../common/limits';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { KnowledgeBaseService } from './knowledge-base.service';
import {
  UploadGoogleDriveDto,
  UploadDropboxDto,
  UploadS3Dto,
  FileListQueryDto,
  UploadYoutubeDto,
} from './dto/knowledge-base.dto';

const MAX_FILE_SIZE = LIMITS.maxFileBytes;

@ApiTags('knowledge-base')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TeacherGuard)
@Controller('knowledge-base')
export class KnowledgeBaseController {
  constructor(private readonly knowledgeBaseService: KnowledgeBaseService) {}

  // ─── Stats ────────────────────────────────────────────────────────────────

  @Get('stats')
  @ApiOperation({ summary: 'Get knowledge base stats for the authenticated teacher' })
  getStats(@Request() req: any) {
    return this.knowledgeBaseService.getStats(req.user.id);
  }

  // ─── List files ──────────────────────────────────────────────────────────

  @Get('files')
  @ApiOperation({ summary: 'List all files in teacher\'s knowledge base' })
  listFiles(@Request() req: any, @Query() query: FileListQueryDto) {
    return this.knowledgeBaseService.listFiles(req.user.id, query.source, query.subjectId);
  }

  // ─── Direct upload ────────────────────────────────────────────────────────

  @Post('upload')
  @ApiOperation({ summary: 'Upload a file directly (multipart/form-data)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req: any, _file, cb) => {
          const teacherId = req.user?.id ?? 'unknown';
          const dir = path.join(process.cwd(), 'uploads', teacherId);
          fs.mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          const ext = path.extname(file.originalname).toLowerCase();
          cb(null, `${uuidv4()}${ext}`);
        },
      }),
      limits: { fileSize: MAX_FILE_SIZE },
    }),
  )
  uploadFile(
    @Request() req: any,
    @Body() body: { subjectId?: string },
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: MAX_FILE_SIZE })],
        fileIsRequired: true,
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.knowledgeBaseService.handleDirectUpload(req.user.id, file, body.subjectId);
  }

  // ─── Google Drive ─────────────────────────────────────────────────────────

  @Post('google-drive')
  @ApiOperation({ summary: 'Import a file from Google Drive using user OAuth2 token' })
  importFromGoogleDrive(
    @Request() req: any,
    @Body() dto: UploadGoogleDriveDto,
  ) {
    return this.knowledgeBaseService.handleGoogleDriveImport(req.user.id, dto);
  }

  // ─── Dropbox ──────────────────────────────────────────────────────────────

  @Post('dropbox')
  @ApiOperation({ summary: 'Import a file from Dropbox using Chooser link' })
  importFromDropbox(@Request() req: any, @Body() dto: UploadDropboxDto) {
    return this.knowledgeBaseService.handleDropboxImport(req.user.id, dto);
  }

  // ─── S3 ───────────────────────────────────────────────────────────────────

  @Post('s3')
  @ApiOperation({ summary: 'Import a file from an S3 bucket' })
  importFromS3(@Request() req: any, @Body() dto: UploadS3Dto) {
    return this.knowledgeBaseService.handleS3Import(req.user.id, dto);
  }

  // ─── YouTube ──────────────────────────────────────────────────────────────

  @Post('youtube')
  @ApiOperation({ summary: 'Import transcript from a YouTube video' })
  importFromYoutube(@Request() req: any, @Body() dto: UploadYoutubeDto) {
    return this.knowledgeBaseService.handleYoutubeImport(req.user.id, dto);
  }


  // ─── View a file inside the app ───────────────────────────────────────────

  @Get('files/:id/content')
  @ApiOperation({ summary: 'Stream a file the teacher owns (inline viewing)' })
  async fileContent(@Request() req: any, @Param('id') id: string, @Res({ passthrough: true }) res: any) {
    const file = await this.knowledgeBaseService.getOwnedFile(req.user.id, id);
    if (!fs.existsSync(file.storagePath)) throw new NotFoundException('File not found on server');
    res.set({
      'Content-Type': file.mimeType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(file.originalName)}"`,
    });
    return new StreamableFile(fs.createReadStream(file.storagePath));
  }

  @Get('files/:id/text')
  @ApiOperation({ summary: 'Stored text passages of a file (in-app viewer)' })
  fileText(@Request() req: any, @Param('id') id: string) {
    return this.knowledgeBaseService.getFileText(req.user.id, id);
  }

  // ─── Delete file ─────────────────────────────────────────────────────────

  @Delete('files/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a file from knowledge base' })
  deleteFile(@Request() req: any, @Param('id') id: string) {
    return this.knowledgeBaseService.deleteFile(req.user.id, id);
  }

  // ─── Update file metadata (display name / tags) ──────────────────────────

  @Patch('files/:id')
  @ApiOperation({ summary: 'Update file metadata (display name, tags, subject)' })
  updateFile(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { displayName?: string; tags?: string[]; subjectId?: string | null; isAssignment?: boolean },
  ) {
    return this.knowledgeBaseService.updateFileMeta(req.user.id, id, body);
  }

  @Post('files/batch-delete')
  @ApiOperation({ summary: 'Delete multiple files from knowledge base' })
  batchDelete(@Request() req: any, @Body() body: { ids: string[] }) {
    return this.knowledgeBaseService.handleBatchDelete(req.user.id, body.ids);
  }
}
