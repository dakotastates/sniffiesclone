import { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'

import { api } from '../../lib/api'
import type { NearbyUser } from '../../types/user'
import ChatPanel from '../chat/ChatPanel'

function roundTo(num: number, decimals: number) {
  const p = 10 ** decimals
  return Math.round(num * p) / p
}

function jitterUsers(users: NearbyUser[]) {
  const seen = new Map<string, number>()
  return users.map((u) => {
    const key = `${u.latApprox},${u.lngApprox}`
    const n = (seen.get(key) ?? 0) + 1
    seen.set(key, n)

    if (n === 1) return u

    // small deterministic offset ~ a few meters
    const angle = (n * 137.5 * Math.PI) / 180 // golden angle
    const radius = 0.00015 * Math.sqrt(n) // ~ up to ~20m-ish
    const lat = u.latApprox + radius * Math.cos(angle)
    const lng = u.lngApprox + radius * Math.sin(angle)

    return { ...u, latApprox: lat, lngApprox: lng }
  })
}

function avatarIcon(url: string | null) {
  const img = url
    ? `<img src="${url}" style="width:40px;height:40px;border-radius:999px;border:2px solid white;box-shadow:0 2px 10px rgba(0,0,0,.25);object-fit:cover;" />`
    : `<div style="width:40px;height:40px;border-radius:999px;background:#ddd;border:2px solid white;box-shadow:0 2px 10px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;font-weight:700;">?</div>`

  return L.divIcon({
    className: '',
    html: img,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  })
}

export default function MapView() {
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null)
  const [myUserId, setMyUserId] = useState<string | null>(null)

  const [users, setUsers] = useState<NearbyUser[]>([])
  const [selected, setSelected] = useState<NearbyUser | null>(null)

  const [includeSelf, setIncludeSelf] = useState(true)
  const [tab, setTab] = useState<'profile' | 'chat'>('profile')

  const center = useMemo(() => me ?? { lat: 37.7749, lng: -122.4194 }, [me])

  async function fetchNearby(lat: number, lng: number) {
    try {
      const qs = new URLSearchParams({
        lat: String(lat),
        lng: String(lng),
        radiusKm: '10',
        includeSelf: String(includeSelf),
      })

      // const nearby = await api<NearbyUser[]>(`/location/nearby?${qs.toString()}`)
      
      // setUsers(nearby)
      const nearby = await api<NearbyUser[]>(`/location/nearby?${qs.toString()}`)
      setUsers(jitterUsers(nearby))
    } catch (e) {
      console.error('fetchNearby failed', e)
    }
  }

  useEffect(() => {
    let interval: number | undefined

    async function startPolling(lat: number, lng: number) {
      // Load my user id once (for chat bubble alignment + future features)
      try {
        const meRes = await api<{ id: string }>('/auth/me')
        setMyUserId(meRes.id)
      } catch {
        // If token is invalid, api.ts may already force logout; ignore here
      }

      // Update my location (privacy rounding is done server-side too; harmless here)
      try {
        await api('/location/me', {
          method: 'POST',
          body: JSON.stringify({ lat, lng }),
        })
      } catch (e) {
        // If this fails, we still want the map to render; log and continue
        console.error('Failed to update location', e)
      }

      // Initial fetch + polling
      await fetchNearby(lat, lng)
      interval = window.setInterval(() => fetchNearby(lat, lng), 5000)
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        setMe({ lat, lng })
        await startPolling(lat, lng)
      },
      async () => {
        // Fallback: use center (default or last-known)
        const lat = center.lat
        const lng = center.lng
        await startPolling(lat, lng)
      },
      { enableHighAccuracy: false, timeout: 8000 },
    )

    return () => {
      if (interval) window.clearInterval(interval)
    }
    // Re-run polling if includeSelf changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeSelf])

  // For better map “centering feel”: round to reduce jitter when me updates slightly
  const mapLat = roundTo(center.lat, 5)
  const mapLng = roundTo(center.lng, 5)

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
          Refreshes every 5s
        </span>
      </div>

      <MapContainer center={[mapLat, mapLng]} zoom={12} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {users.map((u) => (
          <Marker
            key={u.id}
            position={[u.latApprox, u.lngApprox]}
            icon={avatarIcon(u.avatarUrl)}
            eventHandlers={{
              click: () => {
                setSelected(u)
                setTab('profile')
              },
            }}
          />
        ))}

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
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>
                    {selected.bio ?? ''}
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
                <div style={{ marginTop: 10, opacity: 0.7, fontSize: 13 }}>
                  Loading…
                </div>
              )}
            </div>
          </Popup>
        )}
      </MapContainer>
    </div>
  )
}