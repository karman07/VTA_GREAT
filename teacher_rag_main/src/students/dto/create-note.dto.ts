import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, Min, ValidateNested } from 'class-validator';

class NoteSelectionRectDto {
  @IsNumber()
  @Min(0)
  @Max(1)
  x!: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  y!: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  w!: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  h!: number;
}

class NoteSelectionCoordsDto {
  @IsOptional()
  @IsInt()
  version?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  pageNumber?: number;

  @IsOptional()
  @IsString()
  quote?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  startOffset?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  endOffset?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NoteSelectionRectDto)
  rects!: NoteSelectionRectDto[];
}

export class CreateNoteDto {
  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsOptional()
  @IsUUID()
  fileId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  pageNumber?: number;

  @IsOptional()
  @IsString()
  selectionText?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => NoteSelectionCoordsDto)
  selectionCoords?: NoteSelectionCoordsDto;
}