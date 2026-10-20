import { Controller, Get, Post, Body, Param, Delete, UseGuards, Request, Patch } from '@nestjs/common';
import { SubjectsService } from './subjects.service';
import { CreateSubjectDto } from './dto/subject.dto';
import { TeacherGuard } from '../common/guards/user-type.guards';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('subjects')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TeacherGuard)
@Controller('subjects')
export class SubjectsController {
  constructor(private readonly subjectsService: SubjectsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new subject' })
  create(@Request() req: any, @Body() dto: CreateSubjectDto) {
    return this.subjectsService.create(req.user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all subjects for the authenticated teacher' })
  findAll(@Request() req: any) {
    return this.subjectsService.findAll(req.user.id);
  }

  @Get(':id/students')
  @ApiOperation({ summary: 'List students enrolled in a subject, with usage and activity' })
  students(@Request() req: any, @Param('id') id: string) {
    return this.subjectsService.listStudents(req.user.id, id);
  }

  @Get(':id/students/:studentId')
  @ApiOperation({ summary: 'Full profile and conversations of one enrolled student' })
  studentDetail(@Request() req: any, @Param('id') id: string, @Param('studentId') studentId: string) {
    return this.subjectsService.studentDetail(req.user.id, id, studentId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get details of a specific subject' })
  findOne(@Request() req: any, @Param('id') id: string) {
    return this.subjectsService.findOne(req.user.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a subject name' })
  update(@Request() req: any, @Param('id') id: string, @Body('name') name: string) {
    return this.subjectsService.update(req.user.id, id, name);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a subject and its file associations' })
  remove(@Request() req: any, @Param('id') id: string) {
    return this.subjectsService.remove(req.user.id, id);
  }
}
