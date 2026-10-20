import { IsNumber, IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class AdjustInventoryDto {
  @ApiProperty({ description: 'Inventory item ID to adjust' })
  @Type(() => Number)
  @IsNumber()
  inventoryItemId: number;

  @ApiProperty({ description: 'Positive or negative quantity change' })
  @Type(() => Number)
  @IsNumber()
  change: number;

  @ApiProperty({ description: 'Reason for adjustment' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}
