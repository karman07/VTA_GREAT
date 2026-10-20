import { Injectable, BadRequestException } from '@nestjs/common';
import { YoutubeTranscript } from 'youtube-transcript';

@Injectable()
export class YoutubeService {
  private extractVideoId(input: string): string {
    const patterns = [
      /[?&]v=([a-zA-Z0-9_-]{11})/,       // youtube.com/watch?v=
      /youtu\.be\/([a-zA-Z0-9_-]{11})/,   // youtu.be/
      /embed\/([a-zA-Z0-9_-]{11})/,        // youtube.com/embed/
      /shorts\/([a-zA-Z0-9_-]{11})/,       // youtube.com/shorts/
    ];

    for (const re of patterns) {
      const m = input.match(re);
      if (m) return m[1];
    }

    // Plain 11-char video ID passed directly
    if (/^[a-zA-Z0-9_-]{11}$/.test(input.trim())) return input.trim();

    throw new BadRequestException('Could not extract a valid YouTube video ID from the provided value.');
  }

  async getTranscript(urlOrId: string) {
    const videoId = this.extractVideoId(urlOrId);

    let segments: { text: string; duration: number; offset: number }[];
    try {
      segments = await YoutubeTranscript.fetchTranscript(videoId);
    } catch (err: any) {
      throw new BadRequestException(
        err?.message ?? 'Failed to fetch transcript. The video may have no captions or be private.',
      );
    }

    const fullText = segments.map((s) => s.text).join(' ');

    return {
      videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      segmentCount: segments.length,
      fullText,
      segments,
    };
  }
}
