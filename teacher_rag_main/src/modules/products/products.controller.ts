import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
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
  ApiResponse,
  ApiParam,
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import { IsNumber, IsOptional, IsEnum, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ProductsService } from './products.service';
import { PricingService } from './pricing.service';
import { CreateProductDto, MakingChargeType } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductDto } from './dto/query-product.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';

class CalculatePriceDto {
  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  netWeight: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  currentGoldRate: number;

  @ApiPropertyOptional({ enum: MakingChargeType })
  @IsOptional()
  @IsEnum(MakingChargeType)
  makingChargeType?: MakingChargeType;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  makingChargeRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fixedMakingCharge?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  stonePrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  taxPercentage?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discountPercentage?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  priceOverride?: number;
}

@ApiTags('Products')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly pricingService: PricingService,
  ) {}

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: '[Admin/Manager] Create a product design' })
  @ApiResponse({ status: 201 })
  create(@Body() dto: CreateProductDto, @Req() req: any) {
    return this.productsService.create(dto, req.user.id);
  }

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: '[Admin/Manager] List products with search & filter' })
  findAll(@Query() query: QueryProductDto) {
    return this.productsService.findAll(query);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiParam({ name: 'id', type: Number })
  @ApiOperation({ summary: '[Admin/Manager] Get a single product with inventory count' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.productsService.findOne(id);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiParam({ name: 'id', type: Number })
  @ApiOperation({ summary: '[Admin/Manager] Update a product' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProductDto,
    @Req() req: any,
  ) {
    return this.productsService.update(id, dto, req.user.id);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'id', type: Number })
  @ApiOperation({ summary: '[Admin/Manager] Soft-delete a product' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.productsService.softDelete(id);
  }

  @Post('price/calculate')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: '[Admin/Manager] Calculate price for a product' })
  calculatePrice(@Body() input: CalculatePriceDto) {
    return this.pricingService.calculate(input);
  }
}
