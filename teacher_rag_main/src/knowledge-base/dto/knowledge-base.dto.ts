import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FileSource } from '@prisma/client';

export class UploadGoogleDriveDto {
  @ApiProperty({ description: 'Google OAuth2 access token from frontend Picker' })
  @IsString()
  accessToken: string;

  @ApiProperty({ description: 'Google Drive file ID selected by user' })
  @IsString()
  fileId: string;

  @ApiProperty({ description: 'Human-readable file name' })
  @IsString()
  fileName: string;

  @ApiPropertyOptional({ description: 'MIME type of the file' })
  @IsOptional()
  @IsString()
  mimeType?: string;

  @ApiPropertyOptional({ description: 'ID of the subject to associate with' })
  @IsOptional()
  @IsString()
  subjectId?: string;
}

export class UploadDropboxDto {
  @ApiProperty({ description: 'Dropbox file download link (from Chooser callback)' })
  @IsString()
  link: string;

  @ApiProperty({ description: 'File name' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'File size in bytes' })
  @IsOptional()
  sizeBytes?: number;

  @ApiPropertyOptional({ description: 'ID of the subject to associate with' })
  @IsOptional()
  @IsString()
  subjectId?: string;
}

export class UploadS3Dto {
  @ApiProperty({ description: 'S3 Bucket name' })
  @IsString()
  bucket: string;

  @ApiProperty({ description: 'AWS Region' })
  @IsString()
  region: string;

  @ApiProperty({ description: 'AWS Access Key ID' })
  @IsString()
  accessKeyId: string;

  @ApiProperty({ description: 'AWS Secret Access Key' })
  @IsString()
  secretAccessKey: string;

  @ApiProperty({ description: 'S3 Object Key (path to file)' })
  @IsString()
  key: string;

  @ApiPropertyOptional({ description: 'ID of the subject to associate with' })
  @IsOptional()
  @IsString()
  subjectId?: string;
}

export class UploadYoutubeDto {
  @ApiProperty({ description: 'YouTube video URL' })
  @IsString()
  url: string;

  @ApiPropertyOptional({ description: 'ID of the subject to associate with' })
  @IsOptional()
  @IsString()
  subjectId?: string;
}

export class FileListQueryDto {
  @ApiPropertyOptional({ enum: FileSource, description: 'Filter by file source' })
  @IsOptional()
  @IsEnum(FileSource)
  source?: FileSource;

  @ApiPropertyOptional({ description: 'Filter by subject ID' })
  @IsOptional()
  @IsString()
  subjectId?: string;
}

export class FileResponseDto {
  id: string;
  name: string;
  originalName: string;
  mimeType: string;
  sizeBytes: bigint | number;
  source: FileSource;
  status: string;
  chunkCount: number;
  cloudFileId?: string | null;
  createdAt: Date;
}

export class KnowledgeBaseStatsDto {
  totalFiles: number;
  totalSizeBytes: bigint | number;
  readyFiles: number;
  processingFiles: number;
  errorFiles: number;
  collectionName: string;
}
