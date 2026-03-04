import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, displayName: true, bio: true, avatarUrl: true, createdAt: true },
    })
  }

  async updateMe(
    userId: string,
    data: { displayName?: string; bio?: string; avatarUrl?: string },
  ) {
    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: { id: true, email: true, displayName: true, bio: true, avatarUrl: true, createdAt: true },
    })
  }

  async getPublicProfile(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, displayName: true, bio: true, avatarUrl: true, createdAt: true },
    })
    if (!user) throw new NotFoundException('User not found')
    return user
  }

  
}