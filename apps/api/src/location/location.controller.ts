import { Controller, Get, Post, Body, Query, Req, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt.guard'
import { LocationService } from './location.service'
import { UpdateLocationDto } from './dto/update-location.dto'

@Controller('location')
export class LocationController {
  constructor(private readonly location: LocationService) {}

  @UseGuards(JwtAuthGuard)
  @Post('me')
  updateMe(@Req() req: any, @Body() dto: UpdateLocationDto) {
    return this.location.upsertMyLocation(req.user.userId, dto.lat, dto.lng)
  }

  @UseGuards(JwtAuthGuard)
  @Get('nearby')
  nearby(
    @Req() req: any,
    @Query('lat') lat: string,
    @Query('lng') lng: string,
    @Query('radiusKm') radiusKm: string,
  ) {
    return this.location.nearby(
      Number(lat),
      Number(lng),
      radiusKm ? Number(radiusKm) : 5,
      req.user.userId,
    )
  }
}