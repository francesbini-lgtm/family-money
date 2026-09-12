import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store/useStore'
import { netAmt } from '../data/compensation'
import { fmtIT } from '../utils/format'

// ── Mappa mondo delle spese per location (richiesta utente 2026-09-12) ──────────
// Le transazioni hanno solo il NOME città (nessuna coordinata), e l'app non ha una
// libreria mappe: qui carichiamo Leaflet + tiles OSM da CDN a runtime (nessuna nuova
// dipendenza npm) e geocodifichiamo le città via Nominatim, con cache persistente in
// appPrefs.cityCoords così ogni città si risolve una sola volta. Filtri: tutti gli
// anni, L12M (ultimi 12 mesi) o un anno specifico. Marker proporzionali alla spesa.
// Se Leaflet o le tiles non caricano, si mostra comunque la lista città come fallback.

const LEAFLET_JS  = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js'
const LEAFLET_CSS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css'

function loadLeaflet() {
  return new Promise((resolve, reject) => {
    if (window.L) return resolve(window.L)
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'; link.href = LEAFLET_CSS
      document.head.appendChild(link)
    }
    let s = document.querySelector(`script[src="${LEAFLET_JS}"]`)
    if (s) {
      s.addEventListener('load', () => resolve(window.L))
      s.addEventListener('error', reject)
      if (window.L) resolve(window.L)
      return
    }
    s = document.createElement('script')
    s.src = LEAFLET_JS
    s.onload = () => resolve(window.L)
    s.onerror = reject
    document.head.appendChild(s)
  })
}

const norm = c => (c || '').trim().toLowerCase()

export default function LocationMapModal({ transactions, cityOverrides = {}, locationExclusions = [], onClose }) {
  const appPrefs   = useStore(s => s.appPrefs)
  const setAppPref = useStore(s => s.setAppPref)
  const cityCoords = appPrefs?.cityCoords || {}

  const [period, setPeriod] = useState('all')   // 'all' | 'L12M' | 'YYYY'
  const [status, setStatus] = useState('')       // messaggio geocoding
  const [mapErr, setMapErr] = useState(false)
  const [geoVer, setGeoVer] = useState(0)        // bump quando arrivano nuove coord
  const mapDivRef = useRef(null)
  const mapRef = useRef(null)
  const layerRef = useRef(null)

  const years = useMemo(() => {
    const ys = new Set()
    transactions.forEach(t => { if (t.date) ys.add((t._effDate || t.date).slice(0, 4)) })
    return [...ys].sort((a, b) => b - a)
  }, [transactions])

  const l12mCutoff = useMemo(() => { const d = new Date(); d.setMonth(d.getMonth() - 12); return d.toISOString().slice(0, 10) }, [])

  const isExcluded = (t) => {
    if (!locationExclusions.length) return false
    const name = (t.merchant || t.descAI || t.description || '').toLowerCase()
    return locationExclusions.some(ex => name.includes(ex.toLowerCase()))
  }
  const resolveCity = (t) => {
    const merchant = t.merchant || t.descAI
    if (merchant && cityOverrides[merchant]) return cityOverrides[merchant]
    return t.city || null
  }

  // Aggregazione spesa per città nel periodo scelto
  const cities = useMemo(() => {
    const map = {}
    transactions.forEach(t => {
      if (t.excluded || t.amount >= 0) return
      const d = t._effDate || t.date || ''
      if (period === 'L12M') { if (d < l12mCutoff) return }
      else if (period !== 'all') { if (!d.startsWith(period)) return }
      if (isExcluded(t)) return
      const city = resolveCity(t)
      if (!city) return
      if (!map[city]) map[city] = { city, total: 0, count: 0 }
      map[city].total += Math.abs(netAmt(t))
      map[city].count++
    })
    return Object.values(map).sort((a, b) => b.total - a.total)
  }, [transactions, period, cityOverrides, locationExclusions, l12mCutoff])

  // Geocoding delle città mancanti (una alla volta, rispettando Nominatim ~1 req/s)
  useEffect(() => {
    let cancelled = false
    const todo = cities.filter(c => cityCoords[norm(c.city)] === undefined)
    if (!todo.length) { setStatus(''); return }
    ;(async () => {
      const acc = {}
      for (let i = 0; i < todo.length; i++) {
        if (cancelled) return
        const c = todo[i]
        setStatus(`Geocodifico ${i + 1}/${todo.length}: ${c.city}…`)
        try {
          const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(c.city)}`,
            { headers: { 'Accept-Language': 'it' } })
          const j = await r.json()
          acc[norm(c.city)] = (j && j[0]) ? { lat: +j[0].lat, lng: +j[0].lon } : null
        } catch { acc[norm(c.city)] = null }
        // salva incrementale così non si riparte da zero se si chiude
        setAppPref('cityCoords', { ...(useStore.getState().appPrefs?.cityCoords || {}), ...acc })
        await new Promise(res => setTimeout(res, 1100))
      }
      if (!cancelled) { setStatus(''); setGeoVer(v => v + 1) }
    })()
    return () => { cancelled = true }
  }, [cities])   // eslint-disable-line react-hooks/exhaustive-deps

  // Init mappa Leaflet
  useEffect(() => {
    let cancelled = false
    loadLeaflet().then(L => {
      if (cancelled || !mapDivRef.current) return
      if (!mapRef.current) {
        mapRef.current = L.map(mapDivRef.current, { worldCopyJump: true, minZoom: 1 }).setView([30, 10], 2)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap', maxZoom: 18,
        }).addTo(mapRef.current)
      }
    }).catch(() => setMapErr(true))
    return () => { cancelled = true }
  }, [])

  // Ridisegna i marker quando cambiano città/coord. Marker TUTTI della stessa
  // dimensione (richiesta utente 2026-09-12: "non voglio cerchi più grandi/piccoli")
  // e TRASCINABILI: se una città è geocodificata male (es. "Como" finita nel lago) la
  // si trascina al punto giusto e la posizione corretta viene salvata in cityCoords.
  useEffect(() => {
    const L = window.L
    const map = mapRef.current
    if (!L || !map) return
    if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null }
    const group = L.layerGroup().addTo(map)
    layerRef.current = group
    const icon = L.divIcon({
      className: '',
      html: '<div style="width:16px;height:16px;border-radius:50%;background:#e8905f;border:2px solid #c8622a;box-shadow:0 1px 3px rgba(0,0,0,.3)"></div>',
      iconSize: [16, 16], iconAnchor: [8, 8],
    })
    const pts = []
    cities.forEach(c => {
      const co = cityCoords[norm(c.city)]
      if (!co || co.lat == null) return
      const m = L.marker([co.lat, co.lng], { icon, draggable: true })
      m.bindPopup(
        `<strong>${c.city}</strong><br>€ ${fmtIT(Math.round(c.total), 0)} · ${c.count} spese` +
        `<br><button class="redo-geo" style="margin-top:6px;font-size:11px;padding:3px 8px;border:1px solid #c8622a;background:#fff;color:#c8622a;border-radius:6px;cursor:pointer">📍 Posizione sbagliata? Rifai ricerca</button>` +
        `<br><span style="color:#888;font-size:11px">…oppure trascina il marker per spostarlo a mano</span>`
      )
      m.on('popupopen', e => {
        const btn = e.popup.getElement()?.querySelector('.redo-geo')
        if (btn) btn.onclick = () => { m.closePopup(); reGeocode(c.city) }
      })
      m.on('dragend', e => {
        const ll = e.target.getLatLng()
        setAppPref('cityCoords', { ...(useStore.getState().appPrefs?.cityCoords || {}), [norm(c.city)]: { lat: ll.lat, lng: ll.lng } })
      })
      m.addTo(group)
      pts.push([co.lat, co.lng])
    })
    if (pts.length) { try { map.fitBounds(pts, { padding: [40, 40], maxZoom: 6 }) } catch {} }
  }, [cities, geoVer])   // eslint-disable-line react-hooks/exhaustive-deps

  // Rifai la geocodifica di una città (popup "posizione sbagliata"): l'utente può
  // dare un nome più preciso (es. "Agios Nikolaos, Creta, Grecia") — richiesta utente
  // 2026-09-12. Salva la nuova coordinata e ridisegna i marker.
  async function reGeocode(city) {
    const q = window.prompt(`Posizione sbagliata per "${city}".\nScrivi un nome più preciso (es. "${city}, Grecia"):`, city)
    if (!q || !q.trim()) return
    setStatus(`Ricerco "${q.trim()}"…`)
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q.trim())}`,
        { headers: { 'Accept-Language': 'it' } })
      const j = await r.json()
      if (j && j[0]) {
        setAppPref('cityCoords', { ...(useStore.getState().appPrefs?.cityCoords || {}), [norm(city)]: { lat: +j[0].lat, lng: +j[0].lon } })
        setGeoVer(v => v + 1)
        setStatus('')
      } else { setStatus('Nessun risultato — prova un nome diverso o trascina il marker'); setTimeout(() => setStatus(''), 4000) }
    } catch { setStatus('Errore nella ricerca'); setTimeout(() => setStatus(''), 3000) }
  }

  const placed = cities.filter(c => { const co = cityCoords[norm(c.city)]; return co && co.lat != null }).length

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 3000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)',
        width: 'min(1100px, 96vw)', height: 'min(760px, 92vh)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>🌍 Spese sul planisfero</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginLeft: 4 }}>
            {[['all', 'Tutti'], ['L12M', 'L12M']].concat(years.map(y => [y, y])).map(([v, l]) => (
              <button key={v} onClick={() => setPeriod(v)} style={{
                padding: '4px 12px', borderRadius: 16, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: `1px solid ${period === v ? 'var(--accent)' : 'var(--border)'}`,
                background: period === v ? 'var(--accent-l)' : 'var(--surface)',
                color: period === v ? 'var(--accent)' : 'var(--text3)', fontFamily: 'var(--font-sans)',
              }}>{l}</button>
            ))}
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 11, color: 'var(--text3)' }}>
            {status || `${placed}/${cities.length} città sulla mappa`}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text3)' }}>✕</button>
        </div>
        {/* Body */}
        <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
          {mapErr ? (
            <div style={{ padding: 24, overflow: 'auto', height: '100%' }}>
              <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>
                Impossibile caricare la mappa (rete/CDN). Ecco le spese per città:
              </div>
              {cities.map(c => (
                <div key={c.city} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                  <span>{c.city}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>€ {fmtIT(Math.round(c.total), 0)} · {c.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <div ref={mapDivRef} style={{ position: 'absolute', inset: 0 }} />
          )}
        </div>
      </div>
    </div>
  )
}
