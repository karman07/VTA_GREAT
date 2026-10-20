import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ItemStatus } from './create-inventory-item.dto';

export class UpdateInventoryStatusDto {
  @ApiProperty({ enum: ItemStatus })
  @IsEnum(ItemStatus)
  status: ItemStatus;
}
