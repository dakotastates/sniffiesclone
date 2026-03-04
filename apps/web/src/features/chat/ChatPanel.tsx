import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { getSocket } from './socket'
import { getMessages, startConversation } from './chatApi'

type Msg = {
  id: string
  text: string
  createdAt: string
  senderId: string
  conversationId?: string
  clientMessageId?: string | null
}

export default function ChatPanel({
  otherUserId,
  myUserId,
}: {
  otherUserId: string
  myUserId: string
}) {
  const socket = useMemo(() => getSocket(), [])

  const [conversationId, setConversationId] = useState<string | null>(null)
  const conversationIdRef = useRef<string | null>(null)

  const [messages, setMessages] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  // typing indicator
  const [otherTyping, setOtherTyping] = useState(false)
  const typingTimeoutRef = useRef<number | null>(null)

  // scrolling
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const stickToBottomRef = useRef(true)

  // keep ref in sync for event handlers
  useEffect(() => {
    conversationIdRef.current = conversationId
  }, [conversationId])

  // Track whether user is near bottom (so we don't yank scroll when reading history)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const onScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
      stickToBottomRef.current = distanceFromBottom < 40
    }

    el.addEventListener('scroll', onScroll)
    onScroll()

    return () => {
      el.removeEventListener('scroll', onScroll)
    }
  }, [])

  // Auto-scroll AFTER DOM paints new message bubbles
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (!stickToBottomRef.current) return
    el.scrollTop = el.scrollHeight
  }, [messages.length])

  // Initialize conversation: connect socket, start/get convo, load messages, join room
  useEffect(() => {
    let cancelled = false

    async function init() {
      setError(null)
      setReady(false)
      setConversationId(null)
      setMessages([])
      setOtherTyping(false)

      try {
        if (!socket.connected) {
          await new Promise<void>((resolve) => {
            socket.once('connect', () => resolve())
            socket.connect()
          })
        }

        const convo = await startConversation(otherUserId)
        if (cancelled) return

        setConversationId(convo.id)

        const msgs = await getMessages(convo.id)
        if (cancelled) return
        setMessages(msgs)

        const ack = await socket.emitWithAck('conversation:join', { conversationId: convo.id })
        if (cancelled) return

        if (!ack?.ok) {
          setError('Failed to join conversation')
          return
        }

        setReady(true)

        // After initial load, stick to bottom
        requestAnimationFrame(() => {
          const el = scrollRef.current
          if (el) el.scrollTop = el.scrollHeight
        })
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Chat init failed')
      }
    }

    init()

    return () => {
      cancelled = true
    }
  }, [otherUserId, socket])

  // Realtime messages
  useEffect(() => {
    function onNewMessage(m: Msg) {
      const cid = conversationIdRef.current
      if (m.conversationId && cid && m.conversationId !== cid) return

      setMessages((prev) => {
        // replace optimistic by clientMessageId
        if (m.clientMessageId) {
          const idx = prev.findIndex((p) => p.clientMessageId === m.clientMessageId)
          if (idx !== -1) {
            const copy = [...prev]
            copy[idx] = m
            return copy
          }
        }

        // de-dupe by server id
        if (prev.some((p) => p.id === m.id)) return prev
        return [...prev, m]
      })
    }

    socket.on('message:new', onNewMessage)
    return () => {
      socket.off('message:new', onNewMessage)
    }
  }, [socket])

  // Typing indicator
  useEffect(() => {
    function onTyping(e: any) {
      const cid = conversationIdRef.current
      if (!cid) return
      if (e.conversationId !== cid) return
      if (e.userId === myUserId) return
      setOtherTyping(!!e.isTyping)
    }

    socket.on('typing', onTyping)
    return () => {
      socket.off('typing', onTyping)
    }
  }, [socket, myUserId])

  async function onSend() {
    const cid = conversationIdRef.current
    if (!cid) return
    const trimmed = text.trim()
    if (!trimmed) return

    setError(null)
    setText('')

    const clientMessageId = crypto.randomUUID()

    const optimistic: Msg = {
      id: clientMessageId, // temporary
      text: trimmed,
      createdAt: new Date().toISOString(),
      senderId: myUserId,
      conversationId: cid,
      clientMessageId,
    }

    // assume we're sending latest message -> stick to bottom
    stickToBottomRef.current = true
    setMessages((prev) => [...prev, optimistic])

    try {
      const ack = await socket.emitWithAck('message:send', {
        conversationId: cid,
        text: trimmed,
        clientMessageId,
      })

      if (!ack?.ok) throw new Error('Send failed')

      const real = ack.message as Msg

      setMessages((prev) =>
        prev.map((m) => (m.clientMessageId === clientMessageId ? real : m)),
      )
    } catch (e: any) {
      setMessages((prev) => prev.filter((m) => m.clientMessageId !== clientMessageId))
      setError(e?.message ?? 'Failed to send')
    }
  }

  function onChangeText(v: string) {
    setText(v)

    const cid = conversationIdRef.current
    if (!cid) return

    socket.emit('typing:start', { conversationId: cid })

    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = window.setTimeout(() => {
      socket.emit('typing:stop', { conversationId: cid })
    }, 800)
  }

  return (
    <div style={{ marginTop: 10 }}>
      {error && <div style={{ color: 'crimson', marginBottom: 8 }}>{error}</div>}

      <div
        ref={scrollRef}
        style={{
          maxHeight: 220,
          overflow: 'auto',
          border: '1px solid #eee',
          padding: 8,
          borderRadius: 8,
          background: '#fff',
        }}
      >
        {!ready ? (
          <div style={{ opacity: 0.7 }}>Loading chat…</div>
        ) : messages.length === 0 ? (
          <div style={{ opacity: 0.6 }}>No messages yet.</div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              style={{
                marginBottom: 6,
                textAlign: m.senderId === myUserId ? 'right' : 'left',
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  padding: '6px 10px',
                  borderRadius: 12,
                  background: m.senderId === myUserId ? '#e8f0ff' : '#f3f3f3',
                  maxWidth: 240,
                  wordBreak: 'break-word',
                }}
              >
                {m.text}
              </span>
            </div>
          ))
        )}
      </div>

      {otherTyping && (
        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
          Typing…
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input
          style={{ flex: 1 }}
          value={text}
          onChange={(e) => onChangeText(e.target.value)}
          placeholder={ready ? 'Message…' : 'Connecting…'}
          disabled={!ready}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSend()
          }}
        />
        <button onClick={onSend} disabled={!ready}>
          Send
        </button>
      </div>
    </div>
  )
}