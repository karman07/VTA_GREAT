import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { YoutubeService } from './youtube.service';

@ApiTags('YouTube')
@Controller('youtube')
export class YoutubeController {
  constructor(private readonly youtubeService: YoutubeService) {}

  @Get('transcript')
  @ApiOperation({
    summary: 'Fetch YouTube transcript',
    description:
      'Pass a YouTube URL (any format) or a plain 11-character video ID. Returns the full transcript text and per-segment data with timestamps.',
  })
  @ApiQuery({
    name: 'url',
    required: true,
    description: 'YouTube video URL or video ID (e.g. https://youtu.be/dQw4w9WgXcQ or dQw4w9WgXcQ)',
    example: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  })
  async getTranscript(@Query('url') url: string) {
    if (!url?.trim()) throw new BadRequestException('Query parameter "url" is required.');
    return this.youtubeService.getTranscript(url);
  }
}
