import { useState, useMemo, useRef, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { netAmt } from '../data/compensation'
import { CATS, CAT_NAMES, getMergedCats } from '../data/categories'
import './MappaSpesePage.css'
import { fmtIT } from '../utils/format'

// ── City coordinates (lon, lat) ───────────────────────────
const CITY_COORDS = {
  'Como':['9.09','45.81'],'Tavernola':['9.12','45.78'],'Cernobbio':['9.07','45.84'],
  'Milano':['9.19','45.46'],'Roma':['12.50','41.90'],'Torino':['7.69','45.07'],
  'Venezia':['12.34','45.44'],'Firenze':['11.26','43.77'],'Napoli':['14.27','40.85'],
  'Bologna':['11.34','44.49'],'Bergamo':['9.67','45.69'],'Brescia':['10.22','45.54'],
  'Verona':['10.99','45.44'],'Genova':['8.93','44.41'],'Palermo':['13.37','38.12'],
  'Monza':['9.27','45.58'],'Lecco':['9.39','45.86'],'Varese':['8.82','45.82'],
  'Varallo':['8.25','45.82'],'Moltrasio':['9.08','45.87'],'Carate Urio':['9.09','45.88'],
  'Capiago Intim':['9.13','45.77'],'Villa Guardia':['9.01','45.77'],
  'Lentate Sul S':['9.12','45.66'],'Somma Lombard':['8.71','45.68'],
  'Cantu':['9.13','45.73'],"Cantu'":['9.13','45.73'],
  'Sestri Levant':['9.40','44.27'],'Sorsele':['17.53','65.53'],
  'Landvetter':['12.30','57.67'],'Solna':['18.00','59.37'],
  'Stockholm-Arl':['17.92','59.65'],'Maersta':['17.93','59.62'],
  'Ammarnas':['16.18','66.00'],'Chiasso':['9.03','45.84'],
  'Mendrisio':['8.98','45.87'],'Stabio':['8.93','45.85'],
  'Paris':['2.35','48.85'],'Parigi':['2.35','48.85'],
  'London':['-.13','51.51'],'Londra':['-.13','51.51'],
  'Amsterdam':['4.90','52.37'],'Schiphol':['4.76','52.31'],
  'Madrid':['-3.70','40.42'],'Barcelona':['2.17','41.39'],
  'Dublin':['-6.26','53.34'],'Dublino':['-6.26','53.34'],
  'Dublin 15':['-6.35','53.39'],
  'ARROYOMOLINOS':['-4.07','40.30'],
  'TorrejondeArd':['-3.46','40.46'],
  'BARCELONA':['2.17','41.39'],
  'AMSTERDAM':['4.90','52.37'],
  'DUBLIN':['-6.26','53.34'],
  'MADRID':['-3.70','40.42'],
  'LANDVETTER':['12.30','57.67'],
  'SORSELE':['17.53','65.53'],
  'Orio Al Serio':['9.70','45.67'],
  'ORIO AL SERIO':['9.70','45.67'],
  'Milano Linate':['9.28','45.45'],
  'COMO':['9.09','45.81'],'TAVERNOLA':['9.12','45.78'],
}

function mapProject(lon, lat) {
  const x = (parseFloat(lon) + 180) / 360 * 1000
  const latRad = parseFloat(lat) * Math.PI / 180
  const mercN  = Math.log(Math.tan(Math.PI/4 + latRad/2))
  const y      = (1 - mercN / Math.PI) / 2 * 500
  return [x, y]
}

function getCoords(location) {
  if (!location) return null
  const key = location.trim()
  if (CITY_COORDS[key]) return CITY_COORDS[key]
  const city = key.split(',')[0].trim()
  if (CITY_COORDS[city]) return CITY_COORDS[city]
  // try case-insensitive
  const lower = city.toLowerCase()
  const found = Object.keys(CITY_COORDS).find(k => k.toLowerCase() === lower)
  return found ? CITY_COORDS[found] : null
}

// ── World map SVG paths (simplified) ─────────────────────
// Geographically accurate Mercator paths (1000x500, Europe focused)
const MAP_PATHS = `<g fill="#2d5a3d" stroke="#4a8a5a" stroke-width="1.2" opacity="0.95">
  <!-- Scandinavia -->
  <path d="M530,130 L540,120 L548,112 L552,118 L548,128 L542,135 L535,140 Z"/>
  <path d="M510,128 L518,118 L525,112 L532,118 L528,130 L518,135 Z"/>
  <path d="M500,135 L508,128 L515,132 L512,142 L505,148 L498,142 Z"/>
  <!-- UK/Irlanda -->
  <path d="M494,158 L498,150 L504,148 L506,154 L502,162 L496,164 Z"/>
  <path d="M486,160 L490,155 L494,158 L492,165 L487,166 Z"/>
  <!-- Francia -->
  <path d="M498,163 L510,158 L520,160 L524,168 L522,176 L514,182 L504,180 L498,172 Z"/>
  <!-- Spagna/Portogallo -->
  <path d="M484,175 L500,172 L506,180 L504,190 L492,196 L480,192 L476,182 Z"/>
  <!-- Italia (più dettagliata) -->
  <path d="M516,168 L524,165 L530,168 L534,176 L532,184 L528,190 L522,196 L518,192 L516,184 L514,176 Z"/>
  <path d="M524,192 L528,196 L526,204 L522,200 Z"/>
  <!-- Germania/Benelux/Austria/Svizzera -->
  <path d="M510,155 L524,150 L538,150 L542,158 L538,166 L524,168 L512,166 L506,160 Z"/>
  <!-- Polonia/Rep.Ceca/Slovacchia -->
  <path d="M538,148 L558,144 L568,148 L568,158 L558,162 L542,160 L536,154 Z"/>
  <!-- Balcani/Grecia -->
  <path d="M530,168 L545,162 L556,164 L558,172 L554,180 L546,186 L536,182 L528,176 Z"/>
  <path d="M540,186 L544,190 L542,196 L537,192 Z"/>
  <!-- Russia/Est Europa -->
  <path d="M568,144 L620,130 L650,128 L660,134 L650,148 L620,154 L590,156 L568,154 Z"/>
  <!-- Turchia -->
  <path d="M555,178 L580,172 L600,174 L606,182 L596,190 L568,188 L554,184 Z"/>
  <!-- Africa nord -->
  <path d="M464,200 L540,196 L570,200 L576,218 L560,228 L520,232 L480,228 L460,216 Z"/>
</g>
<!-- Graticola sottile -->
<g stroke="#1e3a5a" stroke-width="0.4" opacity="0.35" fill="none">
  <line x1="420" y1="0" x2="420" y2="500"/><line x1="480" y1="0" x2="480" y2="500"/>
  <line x1="540" y1="0" x2="540" y2="500"/><line x1="600" y1="0" x2="600" y2="500"/>
  <line x1="660" y1="0" x2="660" y2="500"/>
  <line x1="0" y1="140" x2="1000" y2="140"/><line x1="0" y1="170" x2="1000" y2="170"/>
  <line x1="0" y1="200" x2="1000" y2="200"/>
</g>
<!-- Etichette paesi -->
<g fill="rgba(120,180,140,0.7)" font-size="7" font-family="system-ui,sans-serif" text-anchor="middle">
  <text x="516" y="180">IT</text>
  <text x="510" y="168">FR</text>
  <text x="524" y="158">DE</text>
  <text x="499" y="183">ES</text>
  <text x="500" y="156">UK</text>
  <text x="535" y="147">PL</text>
</g>`

export default function MappaSpesePage() {
  const { transactions } = useStore()
  const customCats = useStore(s => s.customCats)
  const svgRef = useRef(null)
  const containerRef = useRef(null)

  const [filterCat,    setFilterCat]    = useState('')
  const [filterPeriod, setFilterPeriod] = useState('')
  const [filterType,   setFilterType]   = useState('')
  const [filterMin,    setFilterMin]    = useState(0)
  const [selectedLoc,  setSelectedLoc]  = useState(null)
  const [zoom,         setZoom]          = useState('eu') // 'eu'=Europe, 'world'=World
  const [tooltip,      setTooltip]      = useState(null) // {x,y,group}

  // Months for period dropdown
  const periods = useMemo(() => {
    const months = new Set()
    transactions.forEach(t => { if (t.date) months.add((t._effDate||t.date).slice(0,7)) })
    return [...months].sort().reverse().slice(0, 12)
  }, [transactions])

  // Group transactions by city
  const groups = useMemo(() => {
    const filtered = transactions.filter(t => {
      if (t.excluded || !t.city) return false
      if (filterCat    && t.cat1   !== filterCat)    return false
      if (filterPeriod && !(t._effDate||(t._effDate||t.date||'')).startsWith(filterPeriod)) return false
      if (filterType   && t.type   !== filterType)   return false
      if (filterMin    && Math.abs(t.amount) < filterMin) return false
      return true
    })
    const g = {}
    filtered.forEach(t => {
      const loc = t.city
      const coords = getCoords(loc)
      if (!coords) return
      if (!g[loc]) g[loc] = { loc, coords, txs: [], total: 0, count: 0 }
      g[loc].txs.push(t)
      g[loc].total += Math.abs(netAmt(t))  // netto post-compensazione (2026-07-12)
      g[loc].count++
    })
    return Object.values(g).sort((a,b) => b.total - a.total)
  }, [transactions, filterCat, filterPeriod, filterType, filterMin])

  // KPIs
  const kpis = useMemo(() => ({
    count:  groups.reduce((s,g) => s + g.count, 0),
    total:  groups.reduce((s,g) => s + g.total, 0),
    cities: groups.length,
    avg:    groups.reduce((s,g) => s + g.count, 0) > 0
              ? groups.reduce((s,g) => s + g.total, 0) / groups.reduce((s,g) => s + g.count, 0)
              : 0,
  }), [groups])

  const maxTotal = Math.max(...groups.map(g => g.total), 1)
  const selGroup = selectedLoc ? groups.find(g => g.loc === selectedLoc) : null

  function handleMouseEnter(e, group) {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    setTooltip({ x, y, group })
  }

  return (
    <div className="mappa-page">
      {/* Header */}
      <div className="mappa-header">
        <div>
          <h1 className="mappa-title">🗺️ Mappa Spese</h1>
          <div style={{fontSize:13,color:'var(--text3)'}}>Transazioni geolocalizzate per città</div>
        </div>
        {/* Filters */}
        <div className="mappa-filters">
          <select value={filterCat} onChange={e=>setFilterCat(e.target.value)} className="mappa-select">
            <option value="">Tutte le categorie</option>
            {Object.keys(getMergedCats(customCats)).map(n=><option key={n} value={n}>{n}</option>)}
          </select>
          <select value={filterPeriod} onChange={e=>setFilterPeriod(e.target.value)} className="mappa-select">
            <option value="">Tutto il periodo</option>
            {periods.map(p=><option key={p} value={p}>{p}</option>)}
          </select>
          <select value={filterType} onChange={e=>setFilterType(e.target.value)} className="mappa-select">
            <option value="">Entrate + Spese</option>
            <option value="Expense">Solo Spese</option>
            <option value="Income">Solo Entrate</option>
          </select>
          <select value={filterMin} onChange={e=>setFilterMin(Number(e.target.value))} className="mappa-select">
            <option value={0}>Qualsiasi importo</option>
            <option value={20}>&gt; € 20</option>
            <option value={50}>&gt; € 50</option>
            <option value={100}>&gt; € 100</option>
            <option value={500}>&gt; € 500</option>
          </select>
          <button className="btn btn-ghost" style={{fontSize:12}} onClick={()=>{setFilterCat('');setFilterPeriod('');setFilterType('');setFilterMin(0);setSelectedLoc(null)}}>↺ Reset</button>
        <div style={{display:'flex',gap:3,background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:7,padding:2}}>
          <button onClick={()=>setZoom('eu')} style={{padding:'4px 10px',borderRadius:6,border:'none',
            background:zoom==='eu'?'var(--surface)':'none',
            color:zoom==='eu'?'var(--text)':'var(--text3)',
            fontSize:11,fontWeight:zoom==='eu'?700:500,cursor:'pointer',fontFamily:'var(--font-sans)'}}>🇪🇺 Europa</button>
          <button onClick={()=>setZoom('world')} style={{padding:'4px 10px',borderRadius:6,border:'none',
            background:zoom==='world'?'var(--surface)':'none',
            color:zoom==='world'?'var(--text)':'var(--text3)',
            fontSize:11,fontWeight:zoom==='world'?700:500,cursor:'pointer',fontFamily:'var(--font-sans)'}}>🌍 Mondo</button>
        </div>
        </div>
      </div>

      {/* KPI strip */}
      <div className="mappa-kpis">
        {[
          ['Transazioni Mappate', kpis.count, 'var(--text)'],
          ['Totale Spese', '€ '+fmtIT(kpis.total, 0), 'var(--red)'],
          ['Città Diverse', kpis.cities, 'var(--blue)'],
          ['Spesa Media/TX', '€ '+fmtIT(kpis.avg, 0), 'var(--text2)'],
        ].map(([l,v,c])=>(
          <div key={l} className="card mappa-kpi">
            <div style={{fontSize:11,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',color:'var(--text3)',marginBottom:6}}>{l}</div>
            <div style={{fontSize:22,fontWeight:800,fontFamily:'var(--font-serif)',color:c}}>{v}</div>
          </div>
        ))}
      </div>

      {/* Main area: map + sidebar */}
      <div className="mappa-main">
        {/* Map */}
        <div className="card mappa-map-wrap" ref={containerRef} onMouseMove={()=>{}} onMouseLeave={()=>setTooltip(null)}>
          <svg
            ref={svgRef}
            viewBox={zoom==='eu' ? "440 120 280 160" : "0 0 1000 500"}
            className="mappa-svg"
            style={{background:"#0d1b2e",transition:"all .4s ease"}}
          >
            <rect width="1000" height="500" fill="#0d1b2e"/>
            <g dangerouslySetInnerHTML={{__html: MAP_PATHS}}/>
            {groups.map((g,i) => {
              const [lon, lat] = g.coords
              const [x, y] = mapProject(lon, lat)
              const r = Math.max(zoom==='eu'?3:5, Math.min(zoom==='eu'?14:26, (zoom==='eu'?3:6) + (zoom==='eu'?11:20)*(g.total/maxTotal)))
              const isSelected = selectedLoc === g.loc
              const color = CATS[g.txs[0]?.cat1]?.color || 'var(--accent)'
              return (
                <g key={g.loc} style={{cursor:'pointer'}}
                  onClick={()=>setSelectedLoc(g.loc === selectedLoc ? null : g.loc)}
                  onMouseEnter={e=>handleMouseEnter(e,g)}
                  onMouseLeave={()=>setTooltip(null)}>
                  <circle cx={x} cy={y} r={r+5} fill={color} opacity={0.12}/>
                  <circle cx={x} cy={y} r={r} fill={color} opacity={isSelected?1:0.82}
                    stroke={isSelected?'#fff':'rgba(255,255,255,0.3)'}
                    strokeWidth={isSelected?2.5:1}/>
                  <text x={x} y={y-r-4} textAnchor="middle" fontSize={zoom==='eu'?5:9}
                    fill="rgba(255,255,255,0.85)" fontFamily="system-ui,sans-serif">
                    {g.loc.split(',')[0].slice(0,14)}
                  </text>
                </g>
              )
            })}
          </svg>

          {/* Tooltip */}
          {tooltip && (
            <div className="mappa-tooltip" style={{left:tooltip.x+14, top:tooltip.y-10}}>
              <div style={{fontWeight:700,marginBottom:3}}>{tooltip.group.loc}</div>
              <div style={{fontSize:11,color:'var(--text3)',marginBottom:4}}>{tooltip.group.count} transazion{tooltip.group.count===1?'e':'i'}</div>
              <div style={{fontWeight:700,color:CATS[tooltip.group.txs[0]?.cat1]?.color||'var(--accent)',fontSize:14}}>
                € {fmtIT(tooltip.group.total, 0)}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="mappa-sidebar">
          {/* Top locations */}
          <div className="card" style={{padding:'14px 16px',marginBottom:12}}>
            <div style={{fontWeight:700,fontSize:13,marginBottom:10}}>📍 Top Location per Spesa</div>
            <div style={{display:'flex',flexDirection:'column',gap:5}}>
              {[...groups].slice(0,8).map(g => {
                const color = CATS[g.txs[0]?.cat1]?.color || 'var(--accent)'
                const isSelected = selectedLoc === g.loc
                return (
                  <div key={g.loc} onClick={()=>setSelectedLoc(g.loc===selectedLoc?null:g.loc)}
                    style={{cursor:'pointer',padding:'6px 8px',borderRadius:7,
                      background:isSelected?'var(--accent-l)':'transparent',
                      border:`1px solid ${isSelected?'var(--accent)':'transparent'}`}}>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                      <span style={{fontSize:12,fontWeight:isSelected?700:500}}>📍 {g.loc.split(',')[0]}</span>
                      <span style={{fontSize:12,fontWeight:700,color}}>€ {fmtIT(g.total, 0)}</span>
                    </div>
                    <div style={{height:3,borderRadius:2,background:'var(--border)'}}>
                      <div style={{height:'100%',borderRadius:2,background:color,width:Math.round(g.total/maxTotal*100)+'%'}}/>
                    </div>
                    <div style={{fontSize:10,color:'var(--text3)',marginTop:2}}>{g.count} tx</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Selected transactions */}
          <div className="card" style={{padding:'14px 16px',flex:1,overflow:'hidden'}}>
            <div style={{fontWeight:700,fontSize:13,marginBottom:10}}>
              {selGroup ? `📍 ${selGroup.loc} · ${selGroup.count} TX` : 'Transazioni Selezionate'}
            </div>
            {!selGroup ? (
              <div style={{color:'var(--text3)',fontSize:12,textAlign:'center',padding:'16px 0'}}>
                Clicca un punto sulla mappa o una location per vedere le transazioni
              </div>
            ) : (
              <div style={{maxHeight:340,overflowY:'auto',display:'flex',flexDirection:'column',gap:4}}>
                {selGroup.txs.slice(0,20).map(t => {
                  const color = CATS[t.cat1]?.color || '#888'
                  return (
                    <div key={t.txId} style={{display:'flex',alignItems:'center',gap:8,padding:'5px 0',borderBottom:'1px solid var(--border)'}}>
                      <span style={{width:7,height:7,borderRadius:'50%',background:color,flexShrink:0}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:12,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontWeight:600}}>
                          {t.descAI || (t.description||'').slice(0,28)}
                        </div>
                        <div style={{fontSize:10,color:'var(--text3)'}}>{t._effDate||t.date}</div>
                      </div>
                      <span style={{fontSize:12,fontWeight:700,color:t.amount<0?'var(--red)':'var(--green)',flexShrink:0}}>
                        {t.amount<0?'-':'+'}€{Math.abs(t.amount).toLocaleString('it-IT')}
                      </span>
                    </div>
                  )
                })}
                {selGroup.txs.length > 20 && (
                  <div style={{textAlign:'center',fontSize:11,color:'var(--text3)',padding:8}}>
                    +{selGroup.txs.length-20} altre transazioni
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
