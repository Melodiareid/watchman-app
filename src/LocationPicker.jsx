import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import { useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const JAMAICA_CENTER = [18.1096, -77.2975]

function LocationMarker({ position, setPosition }) {
  useMapEvents({
    click(e) {
      setPosition(e.latlng)
    },
  })
  return position ? <Marker position={position} /> : null
}

function LocationPicker({ onLocationSelect }) {
  const [position, setPosition] = useState(null)

  const handleSetPosition = (latlng) => {
    setPosition(latlng)
    onLocationSelect({ latitude: latlng.lat, longitude: latlng.lng })
  }

  return (
    <div>
      <p>{position ? 'Pin dropped ✓ Tap to move it' : 'Tap the map to drop a pin at the incident location'}</p>
      <MapContainer
        center={JAMAICA_CENTER}
        zoom={9}
        style={{ height: '300px', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <LocationMarker position={position} setPosition={handleSetPosition} />
      </MapContainer>
    </div>
  )
}

export default LocationPicker