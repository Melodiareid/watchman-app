import { useState, useEffect } from 'react'
import './App.css'
import MapView from './MapView.jsx'
import { supabase } from './supabaseClient.js'
import SightingsMap from './SightingsMap.jsx'
import WatchmanLogo from './assets/watchman-logo.png'

const SEVERITY_LEVELS = [
  { value: 'critical', label: 'Critical', icon: '🔴', color: '#e74c3c' },
  { value: 'high', label: 'High', icon: '🟠', color: '#d6d100' },
  { value: 'community', label: 'Community', icon: '🟡', color: '#f5c842' },
]

const INCIDENT_TYPES = [
  { value: 'break-in', label: 'Break-in' },
  { value: 'theft', label: 'Theft' },
  { value: 'shooting', label: 'Shooting' },
  { value: 'car-accident', label: 'Car Accident' },
  { value: 'police', label: 'Police Sighting' },
  { value: 'suspicious', label: 'Suspicious Activity' },
  { value: 'other', label: 'Other' },
]

const MAX_INCIDENT_REPORT_RADIUS_METERS = 1609 // 1 mile

const LEGEND_ITEMS = [
  { color: '#c0392b', text: '🔴 Critical — Active shooter, armed robbery in progress' },
  { color: '#d35400', text: '🟠 High — Break-in, vehicle theft, shooting reported' },
  { color: '#f39c12', text: '🟡 Community — Suspicious activity, road incident' },
  { color: '#FF7A33', border: '1px solid #FF7A33', text: '🚨 BOLO — Stolen vehicle broadcast, island-wide' },
  { color: '#00947C', text: '📍 Your current location' },
]

const HOW_TO_USE = [
  { icon: '🗺️', title: 'Map — Tap any pin', desc: 'Tap a coloured pin to see incident or BOLO details. Your location is the green dot.' },
  { icon: '➕', title: 'Report — Submit an incident or BOLO', desc: 'Tap "Report Incident" or "BOLO" at the top, or tap the 📍 button on the map to drop a pin first.' },
  { icon: '🔒', title: '100% Anonymous', desc: 'Your identity is never shown to other users — only Watchman can link a report back to you if police need to follow up.' },
]

const TOKENS_KEY = 'watchman_bolo_tokens'

function getMyTokens() {
  try {
    return JSON.parse(localStorage.getItem(TOKENS_KEY)) || {}
  } catch {
    return {}
  }
}

function saveMyToken(boloId, token) {
  const tokens = getMyTokens()
  tokens[boloId] = token
  localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens))
}

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

function TopBar({ onOpenMenu }) {
  return (
    <div style={{
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 1500,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-start',
      padding: '10px 16px 28px',
      paddingTop: 'calc(10px + env(safe-area-inset-top))',
      background: 'linear-gradient(180deg, var(--bg) 0%, rgba(17,24,35,0.75) 55%, rgba(17,24,35,0) 100%)',
      pointerEvents: 'none',
    }}>
      <div
        onClick={onOpenMenu}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          background: 'var(--chrome-fill)',
          border: '1px solid var(--border-inverse)',
          borderRadius: '18px',
          padding: '8px 20px 8px 8px',
          cursor: 'pointer',
          pointerEvents: 'auto',
        }}
      >
        <span
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-inverse)',
            fontSize: '20px',
            flexShrink: 0,
          }}
        >
          ☰
        </span>
        <img
          src={WatchmanLogo}
          alt="Watchman — Neighborhood Watch"
          style={{ height: '84px', width: 'auto', objectFit: 'contain' }}
        />
      </div>
    </div>
  )
}

function OverlayHeader({ title, onBack, onWhite }) {
  const backBg = onWhite ? 'var(--bg2)' : 'var(--chrome-fill)'
  const borderColor = onWhite ? 'var(--border)' : 'var(--border-inverse)'
  const textColor = onWhite ? 'var(--text)' : 'var(--text-inverse)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
      <span
        onClick={onBack}
        style={{
          padding: '6px 14px',
          borderRadius: '20px',
          background: backBg,
          border: `1px solid ${borderColor}`,
          fontSize: '13px',
          cursor: 'pointer',
          color: textColor,
        }}
      >
        ‹ Back
      </span>
      <span style={{ color: textColor, fontWeight: 700, fontSize: '15px' }}>{title}</span>
    </div>
  )
}

function MenuOverlay({ onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 3000,
        display: 'flex',
        alignItems: 'flex-end',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--card)',
          width: '100%',
          maxHeight: '80vh',
          overflowY: 'auto',
          borderTopLeftRadius: '20px',
          borderTopRightRadius: '20px',
          padding: '20px',
        }}
      >
        <OverlayHeader title="Menu" onBack={onClose} onWhite />
        <MapLegend />
        <div style={{ height: '16px' }} />
        <HowToUse />
      </div>
    </div>
  )
}

function Toast({ toast }) {
  if (!toast) return null
  return (
    <div style={{
      position: 'fixed',
      bottom: '24px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 4000,
      background: 'rgba(0,148,124,0.97)',
      color: '#fff',
      padding: '12px 20px',
      borderRadius: '999px',
      fontSize: '14px',
      fontWeight: 600,
      boxShadow: '0 8px 24px rgba(18,36,29,0.25)',
      maxWidth: '90%',
      textAlign: 'center',
    }}>
      {toast.icon} {toast.text}
    </div>
  )
}

function MapLegend() {
  return (
    <div className="feature-card">
      <div className="panel-section-title">Map Legend</div>
      {LEGEND_ITEMS.map((item) => (
        <div className="legend-item" key={item.text}>
          <div className="legend-dot" style={{ background: item.color, border: item.border }} />
          <div className="legend-text">{item.text}</div>
        </div>
      ))}
    </div>
  )
}

function HowToUse() {
  return (
    <div className="feature-card">
      <div className="panel-section-title">How to Use Watchman</div>
      {HOW_TO_USE.map((item) => (
        <div className="feature-item" key={item.title}>
          <span className="feature-icon">{item.icon}</span>
          <div>
            <div className="feature-title">{item.title}</div>
            <div className="feature-desc">{item.desc}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

function SeverityPicker({ value, onChange }) {
  return (
    <div className="severity-picker">
      {SEVERITY_LEVELS.map((level) => (
        <div
          key={level.value}
          className={`severity-opt${value === level.value ? ' selected' : ''}`}
          style={value === level.value ? { borderColor: level.color, background: `${level.color}22` } : undefined}
          onClick={() => onChange(level.value)}
        >
          <span className="sev-icon">{level.icon}</span>
          <span className="sev-label">{level.label}</span>
        </div>
      ))}
    </div>
  )
}

function LocationPrompt({ draftPin, onDropPin }) {
  return (
    <div className="form-group">
      <label className="form-label">Location</label>
      {draftPin ? (
        <p className="feature-desc">📍 Pin placed on map ✓</p>
      ) : (
        <button
          type="button"
          onClick={onDropPin}
          style={{
            padding: '10px 14px',
            borderRadius: '10px',
            border: '1px solid var(--border)',
            background: 'rgba(0,148,124,0.06)',
            color: 'var(--text)',
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          📍 Tap map to set location
        </button>
      )}
    </div>
  )
}

function IncidentForm({ draftPin, onDropPin, onSuccess }) {
  const [severity, setSeverity] = useState('')
  const [description, setDescription] = useState('')
  const [incidentDate, setIncidentDate] = useState('')
  const [incidentTimeOfDay, setIncidentTimeOfDay] = useState('')
  const [address, setAddress] = useState('')
  const [status, setStatus] = useState(null)
  const [incidentType, setIncidentType] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!draftPin) {
      setStatus('error')
      return
    }

    setStatus('submitting')

    const { error } = await supabase.from('reports').insert({
      incident_type: incidentType,
      severity,
      description,
      incident_time: incidentDate && incidentTimeOfDay
        ? `${incidentDate}T${incidentTimeOfDay}`
        : null,
      address,
      latitude: draftPin.latitude,
      longitude: draftPin.longitude,
    })

    if (error) {
      console.error(error)
      setStatus('error')
      return
    }

    setSeverity('')
    setIncidentType('')
    setDescription('')
    setIncidentDate('')
    setIncidentTimeOfDay('')
    setAddress('')
    setStatus(null)
    if (onSuccess) onSuccess()
  }

  return (
    <form onSubmit={handleSubmit}>
      <LocationPrompt draftPin={draftPin} onDropPin={onDropPin} />

      <div className="form-group">
        <label className="form-label">Incident Type</label>
        <select
          className="form-input"
          value={incidentType}
          onChange={(e) => setIncidentType(e.target.value)}
        >
          <option value="">Select type</option>
          {INCIDENT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label className="form-label">Severity</label>
        <SeverityPicker value={severity} onChange={setSeverity} />
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="description">Description</label>
        <textarea
          id="description"
          className="form-textarea"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="form-group">
        <label className="form-label">When did it happen?</label>
        <div className="date-time-row">
          <input
            id="incidentDate"
            className="form-input"
            type="date"
            value={incidentDate}
            onChange={(e) => setIncidentDate(e.target.value)}
          />
          <input
            id="incidentTimeOfDay"
            className="form-input"
            type="time"
            value={incidentTimeOfDay}
            onChange={(e) => setIncidentTimeOfDay(e.target.value)}
          />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="address">Address (optional)</label>
        <input
          id="address"
          className="form-input"
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="e.g. business name, house address — for clarity"
        />
      </div>

      <button type="submit" className="submit-btn" disabled={status === 'submitting'}>
        {status === 'submitting' ? 'Submitting…' : 'Submit Report'}
      </button>

      {status === 'error' && !draftPin && <p className="form-status error">Please drop a pin on the map to mark the location.</p>}
      {status === 'error' && draftPin && <p className="form-status error">Something went wrong. Try again.</p>}
    </form>
  )
}

function BoloForm({ draftPin, onDropPin, onSuccess }) {
  const [plate, setPlate] = useState('')
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [year, setYear] = useState('')
  const [color, setColor] = useState('')
  const [lastSeenArea, setLastSeenArea] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState(null)
  const [photoFile, setPhotoFile] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!draftPin) {
      setStatus('error')
      return
    }

    setStatus('submitting')

    const token = crypto.randomUUID()

    let photoUrl = null

    if (photoFile) {
      const fileExt = photoFile.name.split('.').pop()
      const fileName = `${crypto.randomUUID()}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from('bolo-photos')
        .upload(fileName, photoFile)

      if (uploadError) {
        console.error(uploadError)
        setStatus('error')
        return
      }

      const { data: urlData } = supabase.storage
        .from('bolo-photos')
        .getPublicUrl(fileName)

      photoUrl = urlData.publicUrl
    }

    const { data, error } = await supabase
      .from('bolos')
      .insert({
        plate,
        make,
        model,
        year,
        color,
        last_seen_area: lastSeenArea,
        description,
        creator_token: token,
        latitude: draftPin.latitude,
        longitude: draftPin.longitude,
        photo_url: photoUrl,
      })
      .select()
      .single()

    if (error) {
      console.error(error)
      setStatus('error')
      return
    }

    saveMyToken(data.id, token)

    setPlate('')
    setMake('')
    setModel('')
    setYear('')
    setColor('')
    setLastSeenArea('')
    setDescription('')
    setPhotoFile(null)
    setStatus(null)
    if (onSuccess) onSuccess()
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-group">
        <label className="form-label">Last Seen Location</label>
        {draftPin ? (
          <p className="feature-desc">📍 Pin placed on map ✓</p>
        ) : (
          <button
            type="button"
            onClick={onDropPin}
            style={{
              padding: '10px 14px',
              borderRadius: '10px',
              border: '1px solid var(--border)',
              background: 'rgba(0,148,124,0.06)',
              color: 'var(--text)',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            📍 Tap map to set location
          </button>
        )}
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="plate">License Plate</label>
        <input
          id="plate"
          className="form-input"
          type="text"
          value={plate}
          onChange={(e) => setPlate(e.target.value)}
          placeholder="e.g. PA 4521"
          required
        />
      </div>

      <div className="vehicle-grid">
        <div className="form-group">
          <label className="form-label" htmlFor="make">Make</label>
          <input
            id="make"
            className="form-input"
            type="text"
            value={make}
            onChange={(e) => setMake(e.target.value)}
            placeholder="Toyota"
          />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="model">Model</label>
          <input
            id="model"
            className="form-input"
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="Corolla"
          />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="year">Year</label>
          <input
            id="year"
            className="form-input"
            type="text"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            placeholder="2018"
          />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="color">Color</label>
          <input
            id="color"
            className="form-input"
            type="text"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            placeholder="Silver"
          />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="lastSeenArea">Last Seen Area (name)</label>
        <input
          id="lastSeenArea"
          className="form-input"
          type="text"
          value={lastSeenArea}
          onChange={(e) => setLastSeenArea(e.target.value)}
          placeholder="e.g. Half Way Tree, Kingston"
          required
        />
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="boloDescription">Additional Details</label>
        <textarea
          id="boloDescription"
          className="form-textarea"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="photo">Photo (optional)</label>
        <input
          id="photo"
          className="form-input"
          type="file"
          accept="image/*"
          onChange={(e) => setPhotoFile(e.target.files[0] || null)}
        />
        {photoFile && (
          <p className="feature-desc" style={{ marginTop: '4px' }}>
            Selected: {photoFile.name}
          </p>
        )}
      </div>

      <button type="submit" className="submit-btn gold" disabled={status === 'submitting'}>
        {status === 'submitting' ? 'Broadcasting…' : 'Broadcast BOLO'}
      </button>

      {status === 'error' && !draftPin && <p className="form-status error">Please drop a pin on the map to mark the last seen location.</p>}
      {status === 'error' && draftPin && <p className="form-status error">Something went wrong. Try again.</p>}
    </form>
  )
}

function AddSightingForm({ boloId, onAdded }) {
  const [area, setArea] = useState('')
  const [notes, setNotes] = useState('')
  const [status, setStatus] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setStatus('submitting')

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { error } = await supabase.from('sightings').insert({
          bolo_id: boloId,
          area,
          notes,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        })

        if (error) {
          console.error(error)
          setStatus('error')
          return
        }

        setStatus('success')
        setArea('')
        setNotes('')
        if (onAdded) onAdded()
      },
      async (err) => {
        console.warn('Location error:', err.message)
        const { error } = await supabase.from('sightings').insert({
          bolo_id: boloId,
          area,
          notes,
        })

        if (error) {
          console.error(error)
          setStatus('error')
          return
        }

        setStatus('success')
        setArea('')
        setNotes('')
        if (onAdded) onAdded()
      }
    )
  }

  return (
    <form onSubmit={handleSubmit} className="sighting-form">
      <div className="form-group">
        <label className="form-label" htmlFor="sightingArea">Where did you see it?</label>
        <input
          id="sightingArea"
          className="form-input"
          type="text"
          value={area}
          onChange={(e) => setArea(e.target.value)}
          placeholder="e.g. Constant Spring Rd"
          required
        />
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="sightingNotes">Notes (optional)</label>
        <textarea
          id="sightingNotes"
          className="form-textarea"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <button type="submit" className="submit-btn gold" disabled={status === 'submitting'}>
        {status === 'submitting' ? 'Reporting…' : 'Report Sighting'}
      </button>
      {status === 'error' && <p className="form-status error">Something went wrong. Try again.</p>}
    </form>
  )
}

function BoloDetail({ bolo, onBack }) {
  const [sightings, setSightings] = useState([])
  const [sightingLocations, setSightingLocations] = useState([])
  const myToken = getMyTokens()[bolo.id]
  const isMine = myToken !== undefined

  const handleResolve = async () => {
    const { error } = await supabase
      .from('bolos')
      .update({ status: 'resolved' })
      .eq('id', bolo.id)

    if (error) {
      console.error(error)
      return
    }

    if (onBack) onBack()
  }

  const fetchSightings = async () => {
    const { data } = await supabase
      .from('public_sightings')
      .select('*')
      .eq('bolo_id', bolo.id)
      .order('created_at', { ascending: false })

    if (data) setSightings(data)
  }

  const fetchSightingLocations = async () => {
    if (!isMine) return

    const { data, error } = await supabase.functions.invoke('get-sighting-locations', {
      body: { bolo_id: bolo.id, creator_token: myToken },
    })

    if (error) {
      console.error(error)
      return
    }

    if (data?.sightings) setSightingLocations(data.sightings)
  }

  useEffect(() => {
    let isActive = true

    fetchSightings()
    fetchSightingLocations()

    const channel = supabase
      .channel(`sighting-pings-${bolo.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sighting_pings', filter: `bolo_id=eq.${bolo.id}` },
        () => {
          if (!isActive) return
          fetchSightings()
          fetchSightingLocations()
        }
      )
      .subscribe()

    return () => {
      isActive = false
      supabase.removeChannel(channel)
    }
  }, [bolo.id])

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <span
          onClick={onBack}
          style={{
            padding: '6px 14px',
            borderRadius: '20px',
            background: 'rgba(255,255,255,0.9)',
            border: '1px solid var(--border)',
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          ‹ Back
        </span>
        {isMine && <span className="mine-badge">Your BOLO</span>}
      </div>

      {isMine && bolo.status !== 'resolved' && (
        <button
          onClick={handleResolve}
          style={{
            marginBottom: '16px',
            padding: '8px 16px',
            borderRadius: '8px',
            border: 'none',
            background: '#00947C',
            color: '#fff',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            width: '100%',
          }}
        >
          ✓ Mark as Resolved
        </button>
      )}

      <div className="bolo-plate">{bolo.plate}</div>
      <div className="bolo-desc">
        {[bolo.year, bolo.color, bolo.make, bolo.model].filter(Boolean).join(' ')}
      </div>
      <div className="bolo-desc">Last seen: {bolo.last_seen_area}</div>
      {bolo.description && <p className="bolo-desc">{bolo.description}</p>}

      {isMine && (
        <>
          <div className="panel-section-title" style={{ marginTop: 20 }}>
            Sighting Trail (only visible to you)
          </div>
          <SightingsMap sightings={sightingLocations} />
        </>
      )}

      <div className="panel-section-title" style={{ marginTop: 20 }}>
        Sightings ({sightings.length})
      </div>

      {sightings.length === 0 && <p className="feature-desc">No sightings reported yet.</p>}

      {sightings.map((s) => (
        <div className="sighting-item" key={s.id}>
          <div className="feature-title">{s.area}</div>
          {s.notes && <div className="feature-desc">{s.notes}</div>}
          <div className="feature-desc" style={{ marginTop: 2 }}>
            {new Date(s.created_at).toLocaleString()}
          </div>
        </div>
      ))}

      <div className="panel-section-title" style={{ marginTop: 20 }}>
        Report a Sighting
      </div>
      <AddSightingForm boloId={bolo.id} />
    </div>
  )
}

function BolosList({ onSelect }) {
  const [bolos, setBolos] = useState([])
  const myTokens = getMyTokens()

  useEffect(() => {
    supabase
      .from('public_bolos')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setBolos(data)
      })

    const channel = supabase
      .channel('bolos-list')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bolos' },
        (payload) => {
          setBolos((current) => {
            if (current.some((b) => b.id === payload.new.id)) return current
            return [payload.new, ...current]
          })
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
      supabase.removeChannel(channel)
    }
  }, [])

  return (
    <div>
      {bolos.length === 0 && <p className="feature-desc">No BOLOs broadcast yet.</p>}
      {bolos.map((b) => (
        <div className="bolo-list-item" key={b.id} onClick={() => onSelect(b)}>
          <div className="feature-title">
            {b.plate} {myTokens[b.id] && <span className="mine-badge">Yours</span>}
          </div>
          <div className="feature-desc">
            {[b.year, b.color, b.make, b.model].filter(Boolean).join(' ')} · {b.last_seen_area}
          </div>
        </div>
      ))}
    </div>
  )
}

function AlertBanner({ alert, onDismiss, onView }) {
  if (!alert) return null
  return (
    <div
      className="alert-banner"
      onClick={() => {
        if (onView) onView(alert)
        onDismiss()
      }}
      style={{
        position: 'absolute',
        top: 'calc(120px + env(safe-area-inset-top))',
        left: '16px',
        right: '16px',
        zIndex: 1400,
      }}
    >
      <span className="alert-icon">{alert.icon}</span>
      <span className="alert-text">{alert.text}</span>
    </div>
  )
}

function App() {
  const [screen, setScreen] = useState('map') // 'map' | 'incident' | 'bolo'
  const [showMenu, setShowMenu] = useState(false)
  const [boloView, setBoloView] = useState('submit')
  const [selectedBolo, setSelectedBolo] = useState(null)
  const [alert, setAlert] = useState(null)
  const [toast, setToast] = useState(null)
  const [myLocation, setMyLocation] = useState(null)
  const [reportingMode, setReportingMode] = useState(false)
  const [draftPin, setDraftPin] = useState(null)
  const [pinTarget, setPinTarget] = useState('incident')

  const armPinDrop = (target) => {
    setPinTarget(target)
    setScreen('map')
    setReportingMode(true)
  }

  const handleMapClick = (latlng) => {
    if (!reportingMode) return

    if (pinTarget === 'incident') {
      if (!myLocation) {
        setAlert({
          icon: '⚠️',
          text: 'We need your location to verify you\'re nearby before you can report an incident.',
        })
        setReportingMode(false)
        return
      }

      const distance = getDistanceInMeters(
        myLocation.lat,
        myLocation.lng,
        latlng.lat,
        latlng.lng
      )

      if (distance > MAX_INCIDENT_REPORT_RADIUS_METERS) {
        setAlert({
          icon: '⚠️',
          text: 'That location is too far from you. Incidents can only be reported within 1 mile of your current location.',
        })
        setReportingMode(false)
        return
      }
    }

    setDraftPin({ latitude: latlng.lat, longitude: latlng.lng })
    setReportingMode(false)
    setScreen(pinTarget)
  }

  const handleFormSuccess = (message) => {
    setDraftPin(null)
    setPinTarget('incident')
    setScreen('map')
    setToast({ icon: '✅', text: message })
  }

  const viewBoloFromAlert = (bolo) => {
    setScreen('bolo')
    setBoloView('list')
    setSelectedBolo(bolo)
  }

  useEffect(() => {
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setMyLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        })
      },
      (err) => {
        console.warn('Location error:', err.code, err.message)
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    )

    return () => navigator.geolocation.clearWatch(watchId)
  }, [])

  useEffect(() => {
    if (!myLocation) return

    const channel = supabase
      .channel('new-reports')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'reports' },
        (payload) => {
          const report = payload.new
          if (report.latitude == null || report.longitude == null) return

          const distance = getDistanceInMeters(
            myLocation.lat,
            myLocation.lng,
            report.latitude,
            report.longitude
          )

          if (distance <= 2000) {
            setAlert({
              icon: '🚨',
              text: `${report.incident_type} reported ${Math.round(distance)}m away on ${report.address}. Stay Alert!`,
            })
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [myLocation])

  useEffect(() => {
    const channel = supabase
      .channel('new-bolos-alert')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bolos' },
        (payload) => {
          const bolo = payload.new
          setAlert({
            icon: '🚨',
            text: `BOLO: ${bolo.plate} — ${[bolo.year, bolo.color, bolo.make, bolo.model].filter(Boolean).join(' ')} last seen ${bolo.last_seen_area}`,
            bolo,
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  useEffect(() => {
    if (!alert) return
    const timer = setTimeout(() => setAlert(null), 8000)
    return () => clearTimeout(timer)
  }, [alert])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(timer)
  }, [toast])

  return (
    <div style={{ height: '100vh', position: 'relative', overflow: 'hidden', background: 'var(--bg)' }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        <MapView
          myLocation={myLocation}
          reportingMode={reportingMode}
          draftPin={draftPin}
          onMapClick={handleMapClick}
          onToggleReportMode={() => setReportingMode((r) => !r)}
          onSelectBolo={viewBoloFromAlert}
          onOpenIncident={() => { setPinTarget('incident'); setScreen('incident') }}
          onOpenBolo={() => { setPinTarget('bolo'); setScreen('bolo') }}
        />
      </div>

      <TopBar onOpenMenu={() => setShowMenu(true)} />
      <AlertBanner
        alert={alert}
        onDismiss={() => setAlert(null)}
        onView={(a) => { if (a.bolo) viewBoloFromAlert(a.bolo) }}
      />

      {showMenu && <MenuOverlay onClose={() => setShowMenu(false)} />}

      {screen === 'incident' && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'var(--bg)',
          zIndex: 2500,
          overflowY: 'auto',
          padding: '20px',
          paddingTop: 'calc(20px + env(safe-area-inset-top))',
        }}>
          <OverlayHeader title="Report an Incident" onBack={() => setScreen('map')} />
          <div className="form-card">
            <p className="anonymity-note">
              🔒 Your report is anonymous — other users never see who submitted it.
            </p>
            <IncidentForm
              draftPin={draftPin}
              onDropPin={() => armPinDrop('incident')}
              onSuccess={() => handleFormSuccess('Report submitted anonymously.')}
            />
          </div>
        </div>
      )}

      {screen === 'bolo' && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'var(--bg)',
          zIndex: 2500,
          overflowY: 'auto',
          padding: '20px',
          paddingTop: 'calc(20px + env(safe-area-inset-top))',
        }}>
          <OverlayHeader title="BOLO" onBack={() => { setScreen('map'); setSelectedBolo(null) }} />

          <div className="bolo-subtabs">
            <div
              className={`bolo-subtab${boloView === 'submit' ? ' active' : ''}`}
              onClick={() => { setBoloView('submit'); setSelectedBolo(null) }}
            >
              Submit BOLO
            </div>
            <div
              className={`bolo-subtab${boloView === 'list' ? ' active' : ''}`}
              onClick={() => { setBoloView('list'); setSelectedBolo(null) }}
            >
              View Active BOLOs
            </div>
          </div>

          <div className="form-card">
            {boloView === 'submit' && (
              <>
                <p className="anonymity-note">
                  🔒 Your BOLO is anonymous — other users never see who submitted it.
                </p>
                <BoloForm
                  draftPin={draftPin}
                  onDropPin={() => armPinDrop('bolo')}
                  onSuccess={() => handleFormSuccess('BOLO broadcast island-wide.')}
                />
              </>
            )}

            {boloView === 'list' && (
              selectedBolo ? (
                <BoloDetail bolo={selectedBolo} onBack={() => setSelectedBolo(null)} />
              ) : (
                <BolosList onSelect={setSelectedBolo} />
              )
            )}
          </div>
        </div>
      )}

      <Toast toast={toast} />
    </div>
  )
}

export default App