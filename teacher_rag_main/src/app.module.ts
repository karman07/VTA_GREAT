import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { FirebaseModule } from './firebase/firebase.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { KnowledgeBaseModule } from './knowledge-base/knowledge-base.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { SubjectsModule } from './subjects/subjects.module';
import { ProductsModule } from './modules/products/products.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { StudentsModule } from './students/students.module';
import { YoutubeModule } from './youtube/youtube.module';
import { StudyModule } from './study/study.module';
import { TeacherChatModule } from './teacher-chat/teacher-chat.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    PrismaModule,
    FirebaseModule,
    UsersModule,
    AuthModule,
    KnowledgeBaseModule,
    SubjectsModule,
    AnalyticsModule,
    CategoriesModule,
    ProductsModule,
    InventoryModule,
    StudentsModule,
    YoutubeModule,
    StudyModule,
    TeacherChatModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
