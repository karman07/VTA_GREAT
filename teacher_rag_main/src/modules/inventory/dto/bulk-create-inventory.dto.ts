import { IsArray, ValidateNested, ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { CreateInventoryItemDto } from './create-inventory-item.dto';

export class BulkCreateInventoryDto {
  @ApiProperty({ type: [CreateInventoryItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateInventoryItemDto)
  items: CreateInventoryItemDto[];
}
