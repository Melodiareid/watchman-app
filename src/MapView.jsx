import { MapContainer, TileLayer, Marker, Popup, Polyline, useMapEvents, useMap } from 'react-leaflet'
import L from 'leaflet'
import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabaseClient.js'

const pinColors = {
  critical: '#c0392b',
  high: '#d35400',
  community: '#f39c12',
  bolo: '#2980b9',
}

const typeIcons = {
  shooting: '🔫',
  'break-in': '🏠',
  'stolen-car': '🚗',
  'car-accident': '💥',
  'road-works': '🚧',
  suspicious: '👁️',
  robbery: '🔪',
  police: '👮',
  other: '⚠️',
}

const ROUTE_ALERT_TYPES = ['police', 'suspicious']
const ROUTE_ALERT_RADIUS_METERS = 500

function getDistanceInMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const toRad = (deg) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function createPinIcon(severity, type) {
  const color = pinColors[severity] || pinColors.community
  const emoji = typeIcons[type] || '❗'
  return L.divIcon({
    className: '',
    html: `<div class="pulsing-pin" style="
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: ${color};
      border: 2px solid rgba(255,255,255,0.4);
      box-shadow: 0 4px 12px rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 15px;
    ">${emoji}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  })
}

function createBoloIcon() {
  return L.divIcon({
    className: '',
    html: `<div class="pulsing-pin" style="
      width: 34px;
      height: 34px;
      border-radius: 50%;
      background: ${pinColors.bolo};
      border: 2px solid rgba(255,255,255,0.6);
      box-shadow: 0 4px 12px rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
    ">🚨</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  })
}

function createLocationIcon() {
  return L.divIcon({
    className: '',
    html: `<div style="
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: #3a9e68;
      border: 3px solid rgba(255,255,255,0.9);
      box-shadow: 0 0 0 6px rgba(58,158,104,0.25);
    "></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  })
}

function createDraftPinIcon() {
  return L.divIcon({
    className: '',
    html: `<div style="
      width: 32px;
      height: 32px;
      border-radius: 50% 50% 50% 0;
      background: #f0b84a;
      border: 2px solid rgba(255,255,255,0.6);
      transform: rotate(-45deg);
      box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    "></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
  })
}

function MapClickHandler({ reportingMode, onMapClick }) {
  useMapEvents({
    click(e) {
      if (reportingMode && onMapClick) {
        onMapClick(e.latlng)
      }
    },
  })
  return null
}

function RecenterMap({ myLocation, recenterSignal }) {
  const map = useMap()
  const hasCentered = useRef(false)

  useEffect(() => {
    if (myLocation && !hasCentered.current) {
      map.setView([myLocation.lat, myLocation.lng], 15)
      hasCentered.current = true
    }
  }, [myLocation, map])

  useEffect(() => {
    if (recenterSignal > 0 && myLocation) {
      map.flyTo([myLocation.lat, myLocation.lng], 15)
    }
  }, [recenterSignal])

  return null
}

function FlyToLocation({ target }) {
  const map = useMap()

  useEffect(() => {
    if (target) {
      map.flyTo([target.lat, target.lng], 15)
    }
  }, [target])

  return null
}

function FitToRoute({ routeCoords }) {
  const map = useMap()

  useEffect(() => {
    if (routeCoords && routeCoords.length > 0) {
      map.fitBounds(routeCoords, { padding: [40, 40] })
    }
  }, [routeCoords])

  return null
}

function FollowMode({ myLocation, active }) {
  const map = useMap()

  useEffect(() => {
    if (active && myLocation) {
      map.setView([myLocation.lat, myLocation.lng], 17)
    }
  }, [myLocation, active])

  return null
}

function MapView({ myLocation, reportingMode, draftPin, onMapClick, onToggleReportMode, onSelectBolo }) {
  const center = myLocation ? [myLocation.lat, myLocation.lng] : [17.9712, -76.7936]
  const [recenterSignal, setRecenterSignal] = useState(0)

  const [reports, setReports] = useState([])
  const [bolos, setBolos] = useState([])

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [flyToTarget, setFlyToTarget] = useState(null)

  const [directionsMode, setDirectionsMode] = useState(false)
  const [destQuery, setDestQuery] = useState('')
  const [destResults, setDestResults] = useState([])
  const [routeCoords, setRouteCoords] = useState(null)
  const [routeInfo, setRouteInfo] = useState(null)
  const [routeError, setRouteError] = useState(null)
  const [routeLoading, setRouteLoading] = useState(false)
  const [navigationMode, setNavigationMode] = useState(false)

  useEffect(() => {
    supabase
      .from('reports')
      .select('*')
      .then(({ data, error }) => {
        if (error) {
          console.error(error)
          return
        }
        setReports(data)
      })

    const reportsChannel = supabase
      .channel('map-reports')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'reports' },
        (payload) => {
          setReports((current) => [...current, payload.new])
        }
      )
      .subscribe()

    supabase
      .from('public_bolos')
      .select('*')
      .eq('status', 'active')
      .then(({ data, error }) => {
        if (error) {
          console.error(error)
          return
        }
        setBolos(data)
      })

    const bolosChannel = supabase
      .channel('map-bolos')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bolos' },
        (payload) => {
          setBolos((current) => [...current, payload.new])
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'bolos' },
        (payload) => {
          setBolos((current) => current.filter((b) => b.id !== payload.new.id))
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(reportsChannel)
      supabase.removeChannel(bolosChannel)
    }
  }, [])

  useEffect(() => {
    if (searchQuery.trim().length < 3) {
      setSearchResults([])
      return
    }

    const timeoutId = setTimeout(() => {
      fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&countrycodes=jm&limit=5`
      )
        .then((res) => res.json())
        .then((data) => setSearchResults(data))
        .catch((err) => console.error('Search error:', err))
    }, 500)

    return () => clearTimeout(timeoutId)
  }, [searchQuery])

  useEffect(() => {
    if (destQuery.trim().length < 3) {
      setDestResults([])
      return
    }

    const timeoutId = setTimeout(() => {
      fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(destQuery)}&countrycodes=jm&limit=5`
      )
        .then((res) => res.json())
        .then((data) => setDestResults(data))
        .catch((err) => console.error('Destination search error:', err))
    }, 500)

    return () => clearTimeout(timeoutId)
  }, [destQuery])

  const handleSelectResult = (result) => {
    setFlyToTarget({ lat: parseFloat(result.lat), lng: parseFloat(result.lon) })
    setSearchQuery(result.display_name)
    setSearchResults([])
  }

  const handleSelectDestination = async (result) => {
    setDestQuery(result.display_name)
    setDestResults([])
    setRouteError(null)

    if (!myLocation) {
      setRouteError('We need your location before we can calculate a route.')
      return
    }

    setRouteLoading(true)

    const destLat = parseFloat(result.lat)
    const destLng = parseFloat(result.lon)

    try {
      const res = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${myLocation.lng},${myLocation.lat};${destLng},${destLat}?overview=full&geometries=geojson`
      )
      const data = await res.json()

      if (!data.routes || data.routes.length === 0) {
        setRouteError('No route found to that location.')
        setRouteLoading(false)
        return
      }

      const route = data.routes[0]
      const coords = route.geometry.coordinates.map(([lng, lat]) => [lat, lng])

      setRouteCoords(coords)
      setRouteInfo({
        distanceMiles: (route.distance / 1609).toFixed(1),
        durationMinutes: Math.round(route.duration / 60),
      })
    } catch (err) {
      console.error('Routing error:', err)
      setRouteError('Could not calculate a route. Try again.')
    }

    setRouteLoading(false)
  }

  const clearRoute = () => {
    setRouteCoords(null)
    setRouteInfo(null)
    setRouteError(null)
    setDestQuery('')
    setDestResults([])
    setNavigationMode(false)
  }

  const routeAlerts = routeCoords
    ? reports.filter((report) => {
        if (!ROUTE_ALERT_TYPES.includes(report.incident_type)) return false
        if (report.latitude == null || report.longitude == null) return false
        return routeCoords.some(
          ([lat, lng]) =>
            getDistanceInMeters(lat, lng, report.latitude, report.longitude) <= ROUTE_ALERT_RADIUS_METERS
        )
      })
    : []

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>

      <div style={{ position: 'absolute', top: '12px', left: '16px', right: '16px', zIndex: 1000 }}>
        {!directionsMode ? (
          <>
            <div style={{
              background: 'rgba(26,42,30,0.95)',
              border: '1px solid #2a3e2e',
              borderRadius: '14px',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            }}>
              <span>🔍</span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search area or address..."
                style={{
                  background: 'none',
                  border: 'none',
                  outline: 'none',
                  color: '#e8f0ea',
                  fontSize: '14px',
                  flex: 1,
                }}
              />
            </div>

            {searchResults.length > 0 && (
              <div style={{
                marginTop: '6px',
                background: 'rgba(26,42,30,0.98)',
                border: '1px solid #2a3e2e',
                borderRadius: '12px',
                overflow: 'hidden',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              }}>
                {searchResults.map((result) => (
                  <div
                    key={result.place_id}
                    onClick={() => handleSelectResult(result)}
                    style={{
                      padding: '10px 16px',
                      fontSize: '13px',
                      color: '#e8f0ea',
                      cursor: 'pointer',
                      borderBottom: '1px solid #2a3e2e',
                    }}
                  >
                    {result.display_name}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : !routeCoords ? (
          <>
            <div style={{
              background: 'rgba(26,42,30,0.95)',
              border: '1px solid #2a3e2e',
              borderRadius: '14px',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            }}>
              <span>🚗</span>
              <input
                type="text"
                value={destQuery}
                onChange={(e) => setDestQuery(e.target.value)}
                placeholder="Where are you going?"
                style={{
                  background: 'none',
                  border: 'none',
                  outline: 'none',
                  color: '#e8f0ea',
                  fontSize: '14px',
                  flex: 1,
                }}
              />
            </div>

            {destResults.length > 0 && (
              <div style={{
                marginTop: '6px',
                background: 'rgba(26,42,30,0.98)',
                border: '1px solid #2a3e2e',
                borderRadius: '12px',
                overflow: 'hidden',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              }}>
                {destResults.map((result) => (
                  <div
                    key={result.place_id}
                    onClick={() => handleSelectDestination(result)}
                    style={{
                      padding: '10px 16px',
                      fontSize: '13px',
                      color: '#e8f0ea',
                      cursor: 'pointer',
                      borderBottom: '1px solid #2a3e2e',
                    }}
                  >
                    {result.display_name}
                  </div>
                ))}
              </div>
            )}

            {routeLoading && (
              <div style={{ marginTop: '6px', padding: '10px 16px', fontSize: '13px', color: '#e8f0ea' }}>
                Calculating route…
              </div>
            )}

            {routeError && (
              <div style={{ marginTop: '6px', padding: '10px 16px', fontSize: '13px', color: '#e74c3c' }}>
                {routeError}
              </div>
            )}
          </>
        ) : (
          <div style={{
            background: 'rgba(26,42,30,0.95)',
            border: '1px solid #2a3e2e',
            borderRadius: '14px',
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}>
            <div>
              <div style={{ color: '#e8f0ea', fontSize: '14px', fontWeight: 600 }}>
                {routeInfo.distanceMiles} mi · {routeInfo.durationMinutes} min
              </div>
              {routeAlerts.length > 0 && (
                <div style={{ color: '#f0b84a', fontSize: '11px', marginTop: '2px' }}>
                  ⚠️ {routeAlerts.length} report{routeAlerts.length > 1 ? 's' : ''} on route
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {!navigationMode ? (
                <button
                  onClick={() => setNavigationMode(true)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#3a9e68',
                    color: '#fff',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  ▶ Go
                </button>
              ) : (
                <button
                  onClick={() => setNavigationMode(false)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#c0392b',
                    color: '#fff',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  ■ End
                </button>
              )}
              <button
                onClick={clearRoute}
                style={{
                  padding: '8px 10px',
                  borderRadius: '8px',
                  border: '1px solid #2a3e2e',
                  background: 'transparent',
                  color: '#e8f0ea',
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>
          </div>
        )}
      </div>

      {reportingMode && (
        <div style={{
          position: 'absolute',
          top: '64px',
          left: '16px',
          right: '16px',
          zIndex: 1000,
          background: 'rgba(240,184,74,0.95)',
          borderRadius: '10px',
          padding: '8px 14px',
          fontSize: '13px',
          fontWeight: 600,
          color: '#1a2a1e',
          textAlign: 'center',
        }}>
          Tap the map to drop a pin at the incident location
        </div>
      )}

      <div style={{
        position: 'absolute',
        bottom: '16px',
        right: '16px',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}>
        <button
          onClick={() => {
            setDirectionsMode((d) => !d)
            clearRoute()
          }}
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            background: directionsMode ? '#2980b9' : 'rgba(26,42,30,0.95)',
            border: '1px solid #2a3e2e',
            color: '#e8f0ea',
            fontSize: '18px',
            cursor: 'pointer',
          }}
        >
          🚗
        </button>
        <button
          onClick={() => setRecenterSignal((n) => n + 1)}
          disabled={!myLocation}
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            background: 'rgba(26,42,30,0.95)',
            border: '1px solid #2a3e2e',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: myLocation ? 'pointer' : 'not-allowed',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"
              stroke={myLocation ? '#e8f0ea' : '#5a6a5e'}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="12" cy="9" r="2.5" stroke="#3a9e68" strokeWidth="1.5" />
          </svg>
        </button>
        <button
          onClick={onToggleReportMode}
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            background: reportingMode ? '#f0b84a' : 'rgba(26,42,30,0.95)',
            border: '1px solid #2a3e2e',
            color: reportingMode ? '#1a2a1e' : '#e8f0ea',
            fontSize: '18px',
            cursor: 'pointer',
          }}
        >
          📍
        </button>
      </div>

      <MapContainer
        center={center}
        zoom={13}
        style={{ height: '100%', width: '100%', borderRadius: '16px', cursor: reportingMode ? 'crosshair' : '' }}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/attributions">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />

        <MapClickHandler reportingMode={reportingMode} onMapClick={onMapClick} />
        <RecenterMap myLocation={myLocation} recenterSignal={recenterSignal} />
        <FlyToLocation target={flyToTarget} />
        <FitToRoute routeCoords={routeCoords} />
        <FollowMode myLocation={myLocation} active={navigationMode} />

        {routeCoords && (
          <Polyline positions={routeCoords} pathOptions={{ color: '#2980b9', weight: 5, opacity: 0.8 }} />
        )}

        {myLocation && (
          <Marker position={[myLocation.lat, myLocation.lng]} icon={createLocationIcon()}>
            <Popup>You are here</Popup>
          </Marker>
        )}

        {draftPin && (
          <Marker position={[draftPin.latitude, draftPin.longitude]} icon={createDraftPinIcon()}>
            <Popup>New report location</Popup>
          </Marker>
        )}

        {reports
          .filter((report) => report.latitude != null && report.longitude != null)
          .map((report) => (
            <Marker
              key={report.id}
              position={[report.latitude, report.longitude]}
              icon={createPinIcon(report.severity, report.incident_type)}
            >
              <Popup>
                <strong>{report.incident_type}</strong>
                <br />
                {report.address}
                <br />
                {report.description}
              </Popup>
            </Marker>
          ))}

        {bolos
          .filter((bolo) => bolo.latitude != null && bolo.longitude != null)
          .map((bolo) => (
            <Marker key={bolo.id} position={[bolo.latitude, bolo.longitude]} icon={createBoloIcon()}>
              <Popup>
                <strong>🚨 BOLO — {bolo.plate}</strong>
                <br />
                {[bolo.year, bolo.color, bolo.make, bolo.model].filter(Boolean).join(' ')}
                <br />
                Last seen: {bolo.last_seen_area}
                <br />
                {onSelectBolo && (
                  <button
                    onClick={() => onSelectBolo(bolo)}
                    style={{
                      marginTop: '6px',
                      padding: '6px 10px',
                      borderRadius: '6px',
                      border: 'none',
                      background: '#c9922a',
                      color: '#1a2a1e',
                      fontWeight: 600,
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    View Details
                  </button>
                )}
              </Popup>
            </Marker>
          ))}
      </MapContainer>
    </div>
  )
}

export default MapView