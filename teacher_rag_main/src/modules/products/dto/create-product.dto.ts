import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsNumber,
  Min,
  IsNotEmpty,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum Gender {
  MEN = 'men',
  WOMEN = 'women',
  UNISEX = 'unisex',
}

export enum Occasion {
  WEDDING = 'wedding',
  DAILY = 'daily',
  PARTY = 'party',
  FESTIVAL = 'festival',
  OFFICE = 'office',
  OTHER = 'other',
}

export enum ProductStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export enum MetalType {
  GOLD = 'gold',
  SILVER = 'silver',
  PLATINUM = 'platinum',
}

export enum Purity {
  K18 = 'K18',
  K22 = 'K22',
  K24 = 'K24',
}

export enum MetalColor {
  YELLOW = 'yellow',
  WHITE = 'white',
  ROSE = 'rose',
}

export enum MakingChargeType {
  PER_GRAM = 'per_gram',
  FIXED = 'fixed',
}

export class CreateProductDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Unique SKU for the product design' })
  @IsString()
  @IsNotEmpty()
  sku: string;

  @ApiProperty({ description: 'Category ID (integer)' })
  @Type(() => Number)
  @IsNumber()
  categoryId: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  designCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  collectionName?: string;

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ enum: Occasion })
  @IsOptional()
  @IsEnum(Occasion)
  occasion?: Occasion;

  @ApiPropertyOptional({ enum: ProductStatus, default: ProductStatus.ACTIVE })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  // Identification
  @ApiProperty({ description: 'Unique barcode for this product design' })
  @IsString()
  @IsNotEmpty()
  barcode: string;

  // Metal Details
  @ApiPropertyOptional({ enum: MetalType })
  @IsOptional()
  @IsEnum(MetalType)
  metalType?: MetalType;

  @ApiPropertyOptional({ enum: Purity })
  @IsOptional()
  @IsEnum(Purity)
  purity?: Purity;

  @ApiPropertyOptional({ enum: MetalColor })
  @IsOptional()
  @IsEnum(MetalColor)
  metalColor?: MetalColor;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  hallmarkNumber?: string;

  // Weight Template
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

  @ApiPropertyOptional({ description: 'Wastage percentage (0–100)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  wastagePercentage?: number;

  // Stone Info
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  hasStones?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  stoneType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  stonePrice?: number;

  // Dimensions
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  length?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  width?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  height?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  thickness?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ringSize?: string;

  // Pricing Configuration
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
  wastageChargePercentage?: number;

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

  @ApiPropertyOptional({ description: 'Override calculated price' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  priceOverride?: number;

  // Media
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  thumbnailUrl?: string;
}
