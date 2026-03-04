import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'

import { api } from '../../lib/api'
import type { NearbyUser } from '../../types/user'
import ChatPanel from '../chat/ChatPanel'
import { getSocket } from '../chat/socket'

function roundTo(num: number, decimals: number) {
  const p = 10 ** decimals
  return Math.round(num * p) / p
}

// Spread users slightly if they share the same rounded coords (privacy rounding)
function jitterUsers(users: NearbyUser[]) {
  const seen = new Map<string, number>()
  return users.map((u) => {
    const key = `${u.latApprox},${u.lngApprox}`
    const n = (seen.get(key) ?? 0) + 1
    seen.set(key, n)

    if (n === 1) return u

    const angle = (n * 137.5 * Math.PI) / 180
    const radius = 0.00015 * Math.sqrt(n) // ~few meters to tens of meters
    const lat = u.latApprox + radius * Math.cos(angle)
    const lng = u.lngApprox + radius * Math.sin(angle)

    return { ...u, latApprox: lat, lngApprox: lng }
  })
}

function avatarIcon(url: string | null, online: boolean, unread: number) {
  const dot = online
    ? `<span style="position:absolute;right:2px;bottom:2px;width:10px;height:10px;background:#22c55e;border:2px solid white;border-radius:999px;"></span>`
    : ''

  const badge =
    unread > 0
      ? `<span style="position:absolute;left:-6px;top:-6px;min-width:18px;height:18px;padding:0 5px;background:#ef4444;color:white;font-size:12px;line-height:18px;border-radius:999px;border:2px solid white;text-align:center;font-weight:700;">${
          unread > 99 ? '99+' : unread
        }</span>`
      : ''

  const img = url
    ? `<div style="position:relative;width:40px;height:40px;">
         <img src="${url}" style="width:40px;height:40px;border-radius:999px;border:2px solid white;box-shadow:0 2px 10px rgba(0,0,0,.25);object-fit:cover;" />
         ${dot}
         ${badge}
       </div>`
    : `<div style="position:relative;width:40px;height:40px;border-radius:999px;background:#ddd;border:2px solid white;box-shadow:0 2px 10px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;font-weight:700;">
         ?
         ${dot}
         ${badge}
       </div>`

  return L.divIcon({
    className: '',
    html: img,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  })
}

export default function MapView() {
  const socket = useMemo(() => getSocket(), [])

  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null)
  const [myUserId, setMyUserId] = useState<string | null>(null)

  const [users, setUsers] = useState<NearbyUser[]>([])
  const usersByIdRef = useRef<Map<string, NearbyUser>>(new Map())

  const [selected, setSelected] = useState<NearbyUser | null>(null)
  const [tab, setTab] = useState<'profile' | 'chat'>('profile')

  const [includeSelf, setIncludeSelf] = useState(true)

  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set())
  const [unreadByUserId, setUnreadByUserId] = useState<Record<string, number>>({})

  const fallbackCenter = { lat: 37.7749, lng: -122.4194 }
  const center = useMemo(() => me ?? fallbackCenter, [me])
  const mapLat = roundTo(center.lat, 5)
  const mapLng = roundTo(center.lng, 5)

  // Maintain a fast lookup map for updates
  useEffect(() => {
    usersByIdRef.current = new Map(users.map((u) => [u.id, u]))
  }, [users])

  // Clear unread when opening chat with a user
  useEffect(() => {
    if (selected && tab === 'chat') {
      setUnreadByUserId((prev) => ({ ...prev, [selected.id]: 0 }))
    }
  }, [selected, tab])

  // Ensure socket connected
  useEffect(() => {
    if (!socket.connected) socket.connect()
  }, [socket])

  // Presence: initial online list
  useEffect(() => {
    let cancelled = false
    async function initPresence() {
      try {
        const ack = await socket.emitWithAck('presence:list')
        if (cancelled) return
        if (ack?.ok && Array.isArray(ack.onlineUserIds)) {
          setOnlineUserIds(new Set(ack.onlineUserIds))
        }
      } catch {
        // ignore
      }
    }
    initPresence()
    return () => {
      cancelled = true
    }
  }, [socket])

  // Presence updates
  useEffect(() => {
    function onPresence(e: { userId: string; online: boolean }) {
      setOnlineUserIds((prev) => {
        const next = new Set(prev)
        if (e.online) next.add(e.userId)
        else next.delete(e.userId)
        return next
      })
    }

    socket.on('presence:update', onPresence)
    return () => {
      socket.off('presence:update', onPresence)
    }
  }, [socket])

  // Unread events
  useEffect(() => {
    function onUnread(e: { fromUserId: string }) {
      // If you're currently chatting with them, don't count unread
      if (selected?.id === e.fromUserId && tab === 'chat') return

      setUnreadByUserId((prev) => ({
        ...prev,
        [e.fromUserId]: (prev[e.fromUserId] ?? 0) + 1,
      }))
    }

    socket.on('unread:message', onUnread)
    return () => {
      socket.off('unread:message', onUnread)
    }
  }, [socket, selected?.id, tab])

  // Realtime location updates from server
  useEffect(() => {
    function onLoc(e: { userId: string; latApprox: number; lngApprox: number }) {
      setUsers((prev) => {
        const idx = prev.findIndex((u) => u.id === e.userId)
        if (idx === -1) return prev

        const copy = [...prev]
        copy[idx] = { ...copy[idx], latApprox: e.latApprox, lngApprox: e.lngApprox }
        return jitterUsers(copy)
      })

      // If the selected user moved, update popup position smoothly
      setSelected((cur) => {
        if (!cur) return cur
        if (cur.id !== e.userId) return cur
        return { ...cur, latApprox: e.latApprox, lngApprox: e.lngApprox }
      })
    }

    socket.on('location:update', onLoc)
    return () => {
      socket.off('location:update', onLoc)
    }
  }, [socket])

  // Initial load: my user id + initial nearby list
  useEffect(() => {
    let cancelled = false

    async function init() {
      const meRes = await api<{ id: string }>('/auth/me')
      if (cancelled) return
      setMyUserId(meRes.id)

      const lat = me?.lat ?? fallbackCenter.lat
      const lng = me?.lng ?? fallbackCenter.lng

      const qs = new URLSearchParams({
        lat: String(lat),
        lng: String(lng),
        radiusKm: '10',
        includeSelf: String(includeSelf),
      })
      const nearby = await api<NearbyUser[]>(`/location/nearby?${qs.toString()}`)
      if (cancelled) return
      setUsers(jitterUsers(nearby))
    }

    init().catch((e) => console.error('init map failed', e))

    return () => {
      cancelled = true
    }
    // re-init when includeSelf changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeSelf])

  // Send my location via socket using watchPosition
  useEffect(() => {
    if (!navigator.geolocation) return

    let watchId: number | null = null

    watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        setMe({ lat, lng })

        try {
          // Server will privacy-round and broadcast
          await socket.emitWithAck('location:update', { lat, lng })
        } catch (e) {
          console.error('socket location:update failed', e)
        }
      },
      (err) => {
        console.warn('geolocation error', err)
        // fall back: still have the map, just no live me updates
      },
      { enableHighAccuracy: false, maximumAge: 15000, timeout: 8000 },
    )

    return () => {
      if (watchId != null) navigator.geolocation.clearWatch(watchId)
    }
  }, [socket])

  return (
    <div style={{ height: '100vh', width: '100vw', position: 'relative' }}>
      {/* Controls overlay */}
      <div
        style={{
          position: 'absolute',
          zIndex: 1000,
          top: 70,
          left: 12,
          background: 'white',
          padding: 10,
          borderRadius: 10,
          boxShadow: '0 6px 24px rgba(0,0,0,.15)',
          display: 'flex',
          gap: 12,
          alignItems: 'center',
        }}
      >
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={includeSelf}
            onChange={(e) => setIncludeSelf(e.target.checked)}
          />
          Show me
        </label>

        <span style={{ opacity: 0.6, fontSize: 12 }}>
          Realtime updates
        </span>
      </div>

      <MapContainer center={[mapLat, mapLng]} zoom={12} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {users.map((u) => {
          const online = onlineUserIds.has(u.id)
          const unread = unreadByUserId[u.id] ?? 0

          return (
            <Marker
              key={u.id}
              position={[u.latApprox, u.lngApprox]}
              icon={avatarIcon(u.avatarUrl, online, unread)}
              eventHandlers={{
                click: () => {
                  setSelected(u)
                  setTab('profile')
                  setUnreadByUserId((prev) => ({ ...prev, [u.id]: 0 }))
                },
              }}
            />
          )
        })}

        {selected && (
          <Popup
            position={[selected.latApprox, selected.lngApprox]}
            eventHandlers={{
              remove: () => setSelected(null),
            }}
          >
            <div style={{ width: 260 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <img
                  src={selected.avatarUrl ?? ''}
                  alt=""
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 999,
                    background: '#eee',
                    objectFit: 'cover',
                  }}
                />
                <div>
                  <div style={{ fontWeight: 700 }}>{selected.displayName}</div>
                  <div style={{ fontSize: 11, opacity: 0.6 }}>
                    approx location
                    {onlineUserIds.has(selected.id) ? ' • online' : ''}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                <button style={{ flex: 1 }} onClick={() => setTab('profile')}>
                  Profile
                </button>
                <button style={{ flex: 1 }} onClick={() => setTab('chat')}>
                  Chat
                </button>
              </div>

              {tab === 'profile' ? (
                <div style={{ marginTop: 10, fontSize: 13, opacity: 0.85 }}>
                  {selected.bio ?? 'No bio yet.'}
                </div>
              ) : myUserId ? (
                <ChatPanel otherUserId={selected.id} myUserId={myUserId} />
              ) : (
                <div style={{ marginTop: 10, opacity: 0.7, fontSize: 13 }}>Loading…</div>
              )}
            </div>
          </Popup>
        )}
      </MapContainer>
    </div>
  )
}