import { IsOptional, IsString, MinLength, MaxLength } from 'class-validator'

export class UpdateMeDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  displayName?: string

  @IsOptional()
  @IsString()
  @MaxLength(280)
  bio?: string
}