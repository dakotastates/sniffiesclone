import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt.guard'
import { UsersService } from './users.service'
import { UpdateMeDto } from './dto/update-me.dto'

import { FileInterceptor } from '@nestjs/platform-express'
import { diskStorage } from 'multer'
import { extname } from 'path'

function randomFileName(original: string) {
  const name = Date.now() + '-' + Math.round(Math.random() * 1e9)
  return name + extname(original)
}

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

  @UseGuards(JwtAuthGuard)
  @Post('me/avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, cb) => {
          cb(null, randomFileName(file.originalname))
        },
      }),
    }),
  )
  uploadAvatar(@Req() req: any, @UploadedFile() file: Express.Multer.File) {
    const avatarUrl = `/uploads/${file.filename}`
    return this.users.updateMe(req.user.userId, { avatarUrl })
  }

  @Get(':id')
  getUser(@Param('id') id: string) {
    return this.users.getPublicProfile(id)
  }
}