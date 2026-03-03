import { Body, Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt.guard'
import { UsersService } from './users.service'
import { UpdateMeDto } from './dto/update-me.dto'

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: any) {
    return this.users.getMe(req.user.userId)
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  updateMe(@Req() req: any, @Body() dto: UpdateMeDto) {
    return this.users.updateMe(req.user.userId, dto)
  }

  @Get(':id')
  getUser(@Param('id') id: string) {
    return this.users.getPublicProfile(id)
  }
}