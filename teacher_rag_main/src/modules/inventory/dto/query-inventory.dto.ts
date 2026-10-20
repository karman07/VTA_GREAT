import { IsOptional, IsEnum, IsNumber } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ItemStatus, ItemLocation } from './create-inventory-item.dto';

export class QueryInventoryDto {
  @ApiPropertyOptional({ description: 'Filter by product ID' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  productId?: number;

  @ApiPropertyOptional({ enum: ItemStatus })
  @IsOptional()
  @IsEnum(ItemStatus)
  status?: ItemStatus;

  @ApiPropertyOptional({ enum: ItemLocation })
  @IsOptional()
  @IsEnum(ItemLocation)
  location?: ItemLocation;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number = 20;
}
