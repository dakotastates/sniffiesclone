import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'
import * as jwt from 'jsonwebtoken'
import { ChatService } from './chat.service'

type JwtPayload = { sub: string }

@WebSocketGateway({
  cors: {
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server

  constructor(private readonly chat: ChatService) {}

  handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string | undefined) ||
        (client.handshake.headers.authorization?.toString().replace('Bearer ', '') ?? undefined)

      if (!token) {
        client.disconnect()
        return
      }

      const secret = process.env.JWT_SECRET
      if (!secret) {
        client.disconnect()
        return
      }

      const payload = jwt.verify(token, secret) as JwtPayload
      client.data.userId = payload.sub
    } catch {
      client.disconnect()
    }
  }

  @SubscribeMessage('conversation:join')
  async joinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId: string },
  ) {
    const userId = client.data.userId as string | undefined
    if (!userId) return { ok: false }

    // Verify membership (reusing your existing protection)
    await this.chat.getMessages(userId, body.conversationId) // throws if not a participant

    await client.join(body.conversationId)
    return { ok: true }
  }

  @SubscribeMessage('message:send')
  async sendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId: string; text: string },
  ) {
    const userId = client.data.userId as string | undefined
    if (!userId) return { ok: false }

    const msg = await this.chat.sendMessage(userId, body.conversationId, body.text)

    // Broadcast to everyone in the conversation room
    this.server.to(body.conversationId).emit('message:new', msg)

    return { ok: true, message: msg }
  }
}