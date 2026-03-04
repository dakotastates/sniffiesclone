import { ForbiddenException, Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  async startOrGetOneToOne(myUserId: string, otherUserId: string) {
    if (myUserId === otherUserId) {
      throw new BadRequestException("Can't start a conversation with yourself")
    }

    // Find conversations that contain BOTH users
    const candidates = await this.prisma.conversation.findMany({
      where: {
        users: { some: { userId: myUserId } },
      },
      select: {
        id: true,
        users: { select: { userId: true } },
      },
      take: 50,
    })

    const existing = candidates.find((c) => {
      const ids = c.users.map((u) => u.userId).sort()
      const target = [myUserId, otherUserId].sort()
      return ids.length === 2 && ids[0] === target[0] && ids[1] === target[1]
    })

    if (existing) return { id: existing.id }

    // Create conversation first
    const convo = await this.prisma.conversation.create({
      data: {},
      select: { id: true },
    })

    // Add both participants safely (skipDuplicates prevents the unique crash)
    await this.prisma.conversationUser.createMany({
      data: [
        { conversationId: convo.id, userId: myUserId },
        { conversationId: convo.id, userId: otherUserId },
      ],
      skipDuplicates: true,
    })

    return convo
  }

  async listMyConversations(myUserId: string) {
    return this.prisma.conversation.findMany({
      where: { users: { some: { userId: myUserId } } },
      select: {
        id: true,
        createdAt: true,
        users: {
          select: {
            user: { select: { id: true, displayName: true, avatarUrl: true } },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { text: true, createdAt: true, senderId: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  async getMessages(myUserId: string, conversationId: string) {
    const member = await this.prisma.conversationUser.findUnique({
      where: { conversationId_userId: { conversationId, userId: myUserId } },
    })
    if (!member) throw new ForbiddenException('Not a participant')

    return this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: 200,
      select: { id: true, text: true, createdAt: true, senderId: true },
    })
  }

  async sendMessage(myUserId: string, conversationId: string, text: string) {
    const member = await this.prisma.conversationUser.findUnique({
      where: { conversationId_userId: { conversationId, userId: myUserId } },
    })
    if (!member) throw new ForbiddenException('Not a participant')

    return this.prisma.message.create({
      data: { conversationId, senderId: myUserId, text },
      select: { id: true, text: true, createdAt: true, senderId: true },
    })
  }
}