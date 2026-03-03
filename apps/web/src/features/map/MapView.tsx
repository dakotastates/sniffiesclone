import { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { api } from '../../lib/api'

type NearbyUser = {
  id: string
  displayName: string
  avatarUrl: string | null
  bio: string | null
  latApprox: number
  lngApprox: number
}

function AvatarIcon(url: string | null) {
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
  const [users, setUsers] = useState<NearbyUser[]>([])
  const [selected, setSelected] = useState<NearbyUser | null>(null)
  const center = useMemo(() => me ?? { lat: 37.7749, lng: -122.4194 }, [me])
  const [includeSelf, setIncludeSelf] = useState(true)

  async function fetchNearby(lat: number, lng: number) {
    const qs = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
      radiusKm: '10',
      includeSelf: String(includeSelf),
    })
    const nearby = await api<NearbyUser[]>(`/location/nearby?${qs.toString()}`)
    setUsers(nearby)
  }

  useEffect(() => {
    let interval: number | undefined

    function startPolling(lat: number, lng: number) {
      fetchNearby(lat, lng)
      interval = window.setInterval(() => fetchNearby(lat, lng), 5000)
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        setMe({ lat, lng })

        await api('/location/me', { method: 'POST', body: JSON.stringify({ lat, lng }) })
        startPolling(lat, lng)
      },
      async () => {
        const lat = center.lat
        const lng = center.lng
        startPolling(lat, lng)
      },
      { enableHighAccuracy: false, timeout: 8000 },
    )

    return () => {
      if (interval) window.clearInterval(interval)
    }
    // re-run if includeSelf changes
  }, [includeSelf])

  return (
    <div style={{ height: '100vh', width: '100vw' }}>
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
          gap: 8,
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
      </div>
      <MapContainer center={[center.lat, center.lng]} zoom={12} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {users.map((u) => (
          <Marker
            key={u.id}
            position={[u.latApprox, u.lngApprox]}
            icon={AvatarIcon(u.avatarUrl)}
            eventHandlers={{
              click: () => setSelected(u),
            }}
          />
        ))}

        {selected && (
          <Popup
            position={[selected.latApprox, selected.lngApprox]}
            eventHandlers={{ remove: () => setSelected(null) }}
          >
            <div style={{ width: 220 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <img
                  src={selected.avatarUrl ?? ''}
                  alt=""
                  style={{ width: 44, height: 44, borderRadius: 999, background: '#eee', objectFit: 'cover' }}
                />
                <div>
                  <div style={{ fontWeight: 700 }}>{selected.displayName}</div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>{selected.bio ?? ''}</div>
                </div>
              </div>

              <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                <button style={{ flex: 1 }} onClick={() => alert('Profile tab coming next')}>
                  Profile
                </button>
                <button style={{ flex: 1 }} onClick={() => alert('Chat tab coming next')}>
                  Chat
                </button>
              </div>
            </div>
          </Popup>
        )}
      </MapContainer>
    </div>
  )
}