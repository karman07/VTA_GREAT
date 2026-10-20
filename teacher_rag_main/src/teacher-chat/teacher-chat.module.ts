import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TeacherChatController } from './teacher-chat.controller';
import { TeacherChatService } from './teacher-chat.service';

@Module({
  imports: [PrismaModule],
  controllers: [TeacherChatController],
  providers: [TeacherChatService],
})
export class TeacherChatModule {}
