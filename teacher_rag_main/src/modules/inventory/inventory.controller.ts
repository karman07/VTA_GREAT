import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { UpdateInventoryStatusDto } from './dto/update-inventory-status.dto';
import { AdjustInventoryDto } from './dto/adjust-inventory.dto';
import { BulkCreateInventoryDto } from './dto/bulk-create-inventory.dto';
import { QueryInventoryDto } from './dto/query-inventory.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';

@ApiTags('Inventory')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: '[Admin/Manager] Add a single inventory item' })
  create(@Body() dto: CreateInventoryItemDto, @Req() req: any) {
    return this.inventoryService.create(dto, req.user.id);
  }

  @Post('bulk')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: '[Admin/Manager] Bulk add inventory items' })
  bulkCreate(@Body() dto: BulkCreateInventoryDto, @Req() req: any) {
    return this.inventoryService.bulkCreate(dto, req.user.id);
  }

  @Post('adjust')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: '[Admin/Manager] Adjust inventory quantity' })
  adjust(@Body() dto: AdjustInventoryDto, @Req() req: any) {
    return this.inventoryService.adjust(dto, req.user.id);
  }

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: '[Admin/Manager] List inventory items with filters' })
  findAll(@Query() query: QueryInventoryDto) {
    return this.inventoryService.findAll(query);
  }

  @Get('barcode/:code')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiParam({ name: 'code', type: String })
  @ApiOperation({ summary: '[Admin/Manager] Lookup inventory item by barcode' })
  findByBarcode(@Param('code') code: string) {
    return this.inventoryService.findByBarcode(code);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiParam({ name: 'id', type: Number })
  @ApiOperation({ summary: '[Admin/Manager] Get a single inventory item' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.inventoryService.findOne(id);
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiParam({ name: 'id', type: Number })
  @ApiOperation({ summary: '[Admin/Manager] Update inventory item status' })
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateInventoryStatusDto,
  ) {
    return this.inventoryService.updateStatus(id, dto);
  }
}
