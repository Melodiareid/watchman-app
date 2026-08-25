import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet'
import L from 'leaflet'

function createSightingIcon(index, total) {
  const isLatest = index === total - 1
  return L.divIcon({
    className: '',
    html: `<div style="
      width: ${isLatest ? 30 : 22}px;
      height: ${isLatest ? 30 : 22}px;
      border-radius: 50%;
      background: ${isLatest ? '#2980b9' : '#5a7a9e'};
      border: 2px solid rgba(255,255,255,0.7);
      box-shadow: 0 3px 8px rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 11px;
      font-weight: 600;
    ">${index + 1}</div>`,
    iconSize: [isLatest ? 30 : 22, isLatest ? 30 : 22],
    iconAnchor: [isLatest ? 15 : 11, isLatest ? 15 : 11],
  })
}

function SightingsMap({ sightings }) {
  const located = sightings
    .filter((s) => s.latitude != null && s.longitude != null)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

  if (located.length === 0) {
    return <p className="feature-desc">No sighting locations yet.</p>
  }

  const center = [located[located.length - 1].latitude, located[located.length - 1].longitude]
  const trail = located.map((s) => [s.latitude, s.longitude])

  return (
    <div style={{ height: '260px', width: '100%', borderRadius: '12px', overflow: 'hidden' }}>
      <MapContainer center={center} zoom={12} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/attributions">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />

        {trail.length > 1 && (
          <Polyline positions={trail} pathOptions={{ color: '#2980b9', weight: 3, opacity: 0.6 }} />
        )}

        {located.map((sighting, index) => (
          <Marker
            key={sighting.id}
            position={[sighting.latitude, sighting.longitude]}
            icon={createSightingIcon(index, located.length)}
          >
            <Popup>
              Sighting #{index + 1}
              <br />
              {new Date(sighting.created_at).toLocaleString()}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}

export default SightingsMap