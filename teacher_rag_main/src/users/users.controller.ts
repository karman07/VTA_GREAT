import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto, UserResponseDto } from './dto/user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ─── Admin only: full CRUD ──────────────────────────────────────────────────

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[Admin] Create a new user (any role)' })
  @ApiResponse({ status: 201, type: UserResponseDto })
  create(@Body() dto: CreateUserDto) {
    return this.usersService.createUser(dto);
  }

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[Admin] List all users' })
  @ApiResponse({ status: 200, type: [UserResponseDto] })
  findAll() {
    return this.usersService.findAll();
  }

  @Get('teachers/list')
  @Roles(Role.ADMIN, Role.TEACHER)
  @ApiOperation({ summary: '[Admin/Teacher] List all teachers' })
  listTeachers() {
    return this.usersService.findByRole(Role.TEACHER);
  }

  @Get(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[Admin] Get user by ID' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[Admin] Update user' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Patch(':id/role')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[Admin] Change user role' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  changeRole(@Param('id', ParseUUIDPipe) id: string, @Body('role') role: Role) {
    return this.usersService.changeRole(id, role);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Delete user' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.remove(id);
  }
}
