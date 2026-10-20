import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
  IsNotEmpty,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum ItemStatus {
  AVAILABLE = 'available',
  SOLD = 'sold',
  RESERVED = 'reserved',
  DAMAGED = 'damaged',
  RETURNED = 'returned',
}

export enum ItemLocation {
  STORE = 'store',
  WAREHOUSE = 'warehouse',
}

export class CreateInventoryItemDto {
  @ApiProperty({ description: 'Product ID (integer)' })
  @Type(() => Number)
  @IsNumber()
  productId: number;

  @ApiPropertyOptional({ description: 'Override auto-generated item code' })
  @IsOptional()
  @IsString()
  uniqueItemCode?: string;

  @ApiPropertyOptional({ description: 'Override auto-generated barcode' })
  @IsOptional()
  @IsString()
  barcode?: string;

  @ApiPropertyOptional({ enum: ItemLocation, default: ItemLocation.STORE })
  @IsOptional()
  @IsEnum(ItemLocation)
  location?: ItemLocation;

  // Actual Weights
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  grossWeight?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  netWeight?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  stoneWeight?: number;

  // Pricing Snapshot
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  purchasePrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sellingPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  goldRateAtPurchase?: number;

  // Supplier Info
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  supplierId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  purchaseDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  invoiceNumber?: string;
}
