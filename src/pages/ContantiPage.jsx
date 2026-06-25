import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore'
import { CATS, CAT_NAMES, getMergedCats } from '../data/categories'
import { getYM, ymLabel } from '../hooks/useFinancials'
import Modal, { ModalFooter, FormRow, Input } from '../components/Modal'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Plus, Trash2, Wallet, Link2, User } from 'lucide-react'
import './ContantiPage.css'
import { fmtIT } from '../utils/format'

// ── ATM Meta storage (Firestore via appPrefs) ─────────────
function getAtmMeta() { return useStore.getState()?.appPrefs?.atmMeta || {} }
function saveAtmMeta(d) { useStore.getState()?.setAppPref?.('atmMeta', d) }

// Get all family members
function getAllMembers() {
  try {
    const appPrefs  = useStore.getState()?.appPrefs || {}
    const ownerNick = appPrefs.ownerNickname || 'Admin'
    const family    = appPrefs.family || []
    const members   = [{ name: ownerNick, nick: ownerNick }]
    family.forEach(m => { if (m.name) members.push({ name: m.name, nick: m.nickname||m.name.split(' ')[0] }) })
    return members
  } catch { return [] }
}

// Get auto-links from nanny/colf reconciliation
function getAutoLinks(txId) {
  const links = []
  try {
    const appPrefs   = useStore.getState()?.appPrefs || {}
    const nannyRecon = appPrefs.nannyRecon || {}
    const nannyName  = appPrefs.nannyName || 'Nanny'
    Object.entries(nannyRecon).forEach(([,r]) => {
      if (r.txId === txId) {
        links.push({ id:'nanny-'+r.txId, cat1:'Famiglia', cat2:nannyName, amount:r.nannyAmt, note:nannyName, source:'nanny', readonly:true })
        if (r.split && r.contantiAmt>0) links.push({ id:'nanny-split-'+r.txId, cat1:'Contanti', cat2:'', amount:r.contantiAmt, note:'Residuo contanti', source:'nanny-split', readonly:true })
      }
    })
    const colfRecon = appPrefs.colfRecon || {}
    const colfName  = appPrefs.colfName || 'Colf'
    Object.entries(colfRecon).forEach(([,r]) => {
      if (r.txId === txId) {
        links.push({ id:'colf-'+r.txId, cat1:'Famiglia', cat2:colfName, amount:r.nannyAmt, note:colfName, source:'colf', readonly:true })
        if (r.split && r.contantiAmt>0) links.push({ id:'colf-split-'+r.txId, cat1:'Contanti', cat2:'', amount:r.contantiAmt, note:'Residuo contanti', source:'colf-split', readonly:true })
      }
    })
  } catch {}
  return links
}

// ── Links Modal ───────────────────────────────────────────
function LinksModal({ tx, onClose }) {
  const txAmt = Math.abs(tx.amount)
  const meta  = getAtmMeta()[tx.txId] || {}
  const autoLinks   = getAutoLinks(tx.txId)
  const manualLinks = meta.links || []
  const allLinks    = [...autoLinks, ...manualLinks]
  const totalLinked = allLinks.reduce((s,l)=>s+l.amount,0)
  const remaining   = Math.round((txAmt - totalLinked)*100)/100

  const [newCat1, setNewCat1] = useState('Spesa e Alimentari')
  const [newCat2, setNewCat2] = useState('')
  const [newAmt,  setNewAmt]  = useState(String(Math.max(0, remaining)))
  const [newNote, setNewNote] = useState('')
  const [, forceUpdate] = useState(0)

  function addLink() {
    const amt = parseFloat(newAmt)
    if (!amt || !newCat1) return
    const meta2 = getAtmMeta()
    if (!meta2[tx.txId]) meta2[tx.txId] = {}
    if (!meta2[tx.txId].links) meta2[tx.txId].links = []
    meta2[tx.txId].links.push({ id: Date.now().toString(), cat1:newCat1, cat2:newCat2, amount:amt, note:newNote })
    saveAtmMeta(meta2)
    setNewAmt('')
    setNewNote('')
    forceUpdate(n=>n+1)
  }

  function removeLink(id) {
    const meta2 = getAtmMeta()
    if (meta2[tx.txId]?.links) {
      meta2[tx.txId].links = meta2[tx.txId].links.filter(l=>l.id!==id)
      saveAtmMeta(meta2)
      forceUpdate(n=>n+1)
    }
  }

  const updatedLinks = [...getAutoLinks(tx.txId), ...(getAtmMeta()[tx.txId]?.links||[])]
  const updatedTotal = updatedLinks.reduce((s,l)=>s+l.amount,0)
  const updatedRem   = Math.round((txAmt - updatedTotal)*100)/100
  const pct = Math.min(100, Math.round(updatedTotal/txAmt*100))

  const thSt = {padding:'7px 12px',fontSize:10,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',color:'var(--text3)',background:'var(--surface2)',borderBottom:'1px solid var(--border)'}
  const tdSt = {padding:'8px 12px',fontSize:12,borderBottom:'1px solid var(--border)'}

  return (
    <Modal title={`Collega prelievo — ${tx.txId}`} onClose={onClose} width={580}>
      {/* Amount overview */}
      <div style={{marginBottom:14,padding:'10px 14px',background:'var(--surface2)',borderRadius:'var(--radius-sm)',fontSize:13,display:'flex',gap:20,flexWrap:'wrap'}}>
        <span>Prelievo: <strong>€ {fmtIT(txAmt,2)}</strong></span>
        <span style={{color:'var(--green)'}}>Collegato: <strong>€ {fmtIT(updatedTotal,2)}</strong></span>
        <span style={{color:updatedRem>0.01?'var(--gold)':'var(--green)'}}>Non tracciato: <strong>€ {fmtIT(Math.max(0,updatedRem),2)}</strong></span>
      </div>
      <div style={{height:6,borderRadius:3,background:'var(--border)',marginBottom:16}}>
        <div style={{height:'100%',borderRadius:3,background:'var(--green)',width:pct+'%',transition:'width .3s'}}/>
      </div>

      {/* Existing links */}
      {updatedLinks.length > 0 && (
        <div style={{marginBottom:14,border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',overflow:'hidden'}}>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead><tr>
              <th style={thSt}>Categoria</th>
              <th style={thSt}>Nota</th>
              <th style={{...thSt,textAlign:'right'}}>Importo</th>
              <th style={thSt}></th>
            </tr></thead>
            <tbody>
              {updatedLinks.map(l=>{
                const color = CATS[l.cat1]?.color||'#888'
                return (
                  <tr key={l.id} style={{background:l.readonly?'var(--surface2)':''}}>
                    <td style={tdSt}>
                      <span style={{display:'inline-flex',alignItems:'center',gap:5,padding:'2px 8px',borderRadius:12,fontSize:11,fontWeight:700,background:color+'18',color,border:`1px solid ${color}33`}}>
                        <span style={{width:5,height:5,borderRadius:'50%',background:color}}/>
                        {l.cat1}{l.cat2?` › ${l.cat2}`:''}
                      </span>
                    </td>
                    <td style={{...tdSt,color:'var(--text3)'}}>{l.note||'—'}</td>
                    <td style={{...tdSt,textAlign:'right',fontFamily:'var(--font-mono)',fontWeight:700,color:'var(--blue)'}}>€ {fmtIT(l.amount,2)}</td>
                    <td style={{...tdSt,textAlign:'center'}}>
                      {l.readonly
                        ? <span style={{fontSize:10,color:'var(--text3)'}}>auto</span>
                        : <button className="btn btn-ghost" onClick={()=>removeLink(l.id)}><Trash2 size={11}/></button>
                      }
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add new link */}
      <div style={{padding:'12px 14px',background:'var(--surface2)',borderRadius:'var(--radius-sm)',marginBottom:12}}>
        <div style={{fontSize:12,fontWeight:700,marginBottom:10,color:'var(--text2)'}}>+ Aggiungi collegamento</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
          <div>
            <div style={{fontSize:11,color:'var(--text3)',marginBottom:3}}>Categoria L1</div>
            <select value={newCat1} onChange={e=>{setNewCat1(e.target.value);setNewCat2('')}} style={{width:'100%',padding:'7px 10px',borderRadius:'var(--radius-sm)',border:'1px solid var(--border)',fontSize:12,background:'var(--bg)',color:'var(--text)'}}>
              {CAT_NAMES.filter(n=>n!=='Entrate').map(n=><option key={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <div style={{fontSize:11,color:'var(--text3)',marginBottom:3}}>Sottocategoria</div>
            <select value={newCat2} onChange={e=>setNewCat2(e.target.value)} style={{width:'100%',padding:'7px 10px',borderRadius:'var(--radius-sm)',border:'1px solid var(--border)',fontSize:12,background:'var(--bg)',color:'var(--text)'}}>
              <option value="">— nessuna —</option>
              {(CATS[newCat1]?.sub||[]).map(s=><option key={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
          <div>
            <div style={{fontSize:11,color:'var(--text3)',marginBottom:3}}>Importo €</div>
            <input type="number" value={newAmt} onChange={e=>setNewAmt(e.target.value)} placeholder="0.00"
              style={{width:'100%',padding:'7px 10px',borderRadius:'var(--radius-sm)',border:'1px solid var(--border)',fontSize:12,background:'var(--bg)',color:'var(--text)'}}/>
          </div>
          <div>
            <div style={{fontSize:11,color:'var(--text3)',marginBottom:3}}>Nota</div>
            <input value={newNote} onChange={e=>setNewNote(e.target.value)} placeholder="Opzionale"
              style={{width:'100%',padding:'7px 10px',borderRadius:'var(--radius-sm)',border:'1px solid var(--border)',fontSize:12,background:'var(--bg)',color:'var(--text)'}}/>
          </div>
        </div>
        <button className="btn btn-primary" style={{marginTop:10,width:'100%'}} onClick={addLink} disabled={!newAmt||!newCat1}>
          Aggiungi
        </button>
      </div>

      <ModalFooter>
        <button className="btn btn-primary" onClick={onClose}>Chiudi</button>
      </ModalFooter>
    </Modal>
  )
}

// ── Resolve member from transaction (same logic as TransactionsPage) ──
function resolveMemberFromTx(t) {
  const appPrefs   = useStore.getState()?.appPrefs || {}
  const userAccounts = appPrefs.userAccounts || []
  const ownerNick  = appPrefs.ownerNickname || 'Admin'
  const family     = appPrefs.family || []
  // 1. Card match
  if (t.card) {
    const acc = userAccounts.find(a => a.card4 === t.card)
    if (acc?.memberId) {
      if (acc.memberId === 'owner') return ownerNick
      const member = family.find(m => String(m.id) === String(acc.memberId))
      if (member) return member.nickname || member.name?.split(' ')[0] || null
    }
  }
  // 2. Account name / nickname match
  const allMembers = [
    { nick: ownerNick, name: ownerNick },
    ...family.map(m => ({ nick: m.nickname || m.name?.split(' ')[0] || '', name: m.name || '' }))
  ]
  const acc2 = (t.account || '').toLowerCase()
  for (const m of allMembers) {
    if (m.name && acc2.includes(m.name.toLowerCase())) return m.nick
    if (m.nick && acc2.includes(m.nick.toLowerCase())) return m.nick
  }
  return null
}

// ── Member picker inline ──────────────────────────────────
function MemberCell({ txId }) {
  const meta = getAtmMeta()[txId] || {}
  const [open, setOpen] = useState(false)
  const [, forceUpdate] = useState(0)
  const members = getAllMembers()
  const current = meta.member || null

  // Auto-suggest based on account name matching family members
  const appPrefs = useStore.getState()?.appPrefs || {}
  const ownerNick = appPrefs.ownerNickname || 'Admin'
  const family = appPrefs.family || []
  const txAccount = useStore.getState()?.transactions?.find(t=>t.txId===txId)?.account || ''

  let autoSuggest = null
  if (!current) {
    const allNicks = [{name: ownerNick, nick: ownerNick}, ...family.map(m=>({name:m.name,nick:m.nickname||m.name.split(' ')[0]}))]
    for (const m of allNicks) {
      if (txAccount.toLowerCase().includes(m.name.toLowerCase()) || txAccount.toLowerCase().includes(m.nick.toLowerCase())) {
        autoSuggest = m.nick
        break
      }
    }
  }
  const displayNick = current || autoSuggest

  function pick(nick) {
    const m = getAtmMeta()
    if (!m[txId]) m[txId] = {}
    m[txId].member = nick
    saveAtmMeta(m)
    setOpen(false)
    forceUpdate(n=>n+1)
  }

  return (
    <div style={{position:'relative'}}>
      <button onClick={()=>setOpen(o=>!o)} style={{background:'none',border:'none',cursor:'pointer',padding:'3px 8px',borderRadius:12,fontSize:12,display:'flex',alignItems:'center',gap:4,color:displayNick?(current?'var(--accent)':'var(--text2)'):'var(--text3)',fontFamily:'var(--font-sans)',whiteSpace:'nowrap'}}>
        <User size={11}/>
        {displayNick||'—'}
        {!current && autoSuggest && <span style={{fontSize:9,opacity:.5,marginLeft:3}}>auto</span>}
      </button>
      {open && (
        <div style={{position:'absolute',top:'calc(100% + 2px)',left:0,zIndex:100,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',boxShadow:'0 4px 12px rgba(0,0,0,.1)',minWidth:120,overflow:'hidden'}}>
          <button onClick={()=>pick('')} style={{display:'block',width:'100%',padding:'7px 12px',border:'none',background:'none',cursor:'pointer',fontSize:12,color:'var(--text3)',textAlign:'left',fontFamily:'var(--font-sans)',fontStyle:'italic'}}>— nessuno —</button>
          {members.map(m=>(
            <button key={m.nick} onClick={()=>pick(m.nick)} style={{display:'block',width:'100%',padding:'7px 12px',border:'none',background:current===m.nick?'var(--accent-l)':'none',cursor:'pointer',fontSize:12,color:current===m.nick?'var(--accent)':'var(--text2)',textAlign:'left',fontFamily:'var(--font-sans)',fontWeight:current===m.nick?700:500}}>
              {m.nick} <span style={{fontSize:10,opacity:.6}}>{m.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Date valuta cell (read-only, shows tx.date) ───────────
function DateValutaCell({ tx }) {
  const d = tx.date || ''
  const display = d.length >= 10 ? `${d.slice(8,10)}/${d.slice(5,7)}` : d
  return <span style={{fontFamily:'var(--font-mono)',fontSize:12,color:'var(--text3)'}}>{display}</span>
}

// ── Date rettificata cell (editable, stored in atmMeta.effDate) ───
function DateRettCell({ tx }) {
  const { updateTransaction } = useStore()
  const meta = getAtmMeta()[tx.txId] || {}
  const [editing, setEditing] = useState(false)
  const stored = meta.effDate || tx._effDate || tx.date || ''
  const [val, setVal] = useState(stored.slice(0,10))
  const [, forceUpdate] = useState(0)
  const isCustom = !!meta.effDate

  function save() {
    const m = getAtmMeta()
    if (!m[tx.txId]) m[tx.txId] = {}
    if (val) {
      m[tx.txId].effDate = val
      saveAtmMeta(m)
      updateTransaction(tx.txId, { _effDate: val })
    } else {
      delete m[tx.txId].effDate
      saveAtmMeta(m)
      updateTransaction(tx.txId, { _effDate: tx.date })
    }
    setEditing(false)
    forceUpdate(n=>n+1)
  }

  if (editing) return (
    <div style={{display:'flex',gap:4,alignItems:'center'}}>
      <input type="date" value={val} onChange={e=>setVal(e.target.value)} autoFocus
        style={{width:130,padding:'3px 6px',borderRadius:6,border:'1px solid var(--accent)',
          fontSize:11,background:'var(--bg)',color:'var(--text)'}}/>
      <button className="btn btn-ghost" style={{padding:'2px 6px',fontSize:11}} onClick={save}>✓</button>
      <button className="btn btn-ghost" style={{padding:'2px 6px',fontSize:11}} onClick={()=>setEditing(false)}>✕</button>
    </div>
  )

  const displayDate = stored.length >= 10 ? `${stored.slice(8,10)}/${stored.slice(5,7)}/${stored.slice(2,4)}` : stored
  return (
    <button onClick={()=>setEditing(true)} title="Clicca per modificare data rettificata"
      style={{background:'none',border:'none',cursor:'pointer',padding:'2px 4px',
        fontFamily:'var(--font-mono)',fontSize:12,textAlign:'left',
        color:isCustom?'var(--accent)':'inherit'}}>
      {displayDate}
      {!isCustom && <span style={{fontSize:9,color:'var(--text3)',marginLeft:4}}>✏</span>}
    </button>
  )
}

// ── Link summary badge ────────────────────────────────────
function LinkBadge({ tx, onOpen }) {
  const autoLinks   = getAutoLinks(tx.txId)
  const manualLinks = (getAtmMeta()[tx.txId]?.links)||[]
  const allLinks    = [...autoLinks, ...manualLinks]
  const txAmt       = Math.abs(tx.amount)
  const totalLinked = allLinks.reduce((s,l)=>s+l.amount,0)
  const pct         = txAmt > 0 ? Math.round(totalLinked/txAmt*100) : 0

  if (allLinks.length === 0) return (
    <button onClick={onOpen} style={{display:'flex',alignItems:'center',gap:5,padding:'3px 10px',borderRadius:12,fontSize:11,fontWeight:700,border:'1px dashed var(--border)',background:'none',cursor:'pointer',color:'var(--text3)',fontFamily:'var(--font-sans)'}}>
      <Link2 size={11}/> Collega
    </button>
  )

  return (
    <button onClick={onOpen} style={{display:'flex',alignItems:'center',gap:5,padding:'3px 10px',borderRadius:12,fontSize:11,fontWeight:700,border:`1px solid ${pct>=100?'var(--green)':'var(--gold)'}`,background:`${pct>=100?'var(--green)':'var(--gold)'}18`,cursor:'pointer',color:pct>=100?'var(--green)':'var(--gold)',fontFamily:'var(--font-sans)'}}>
      <Link2 size={11}/>
      {allLinks.length}× · {pct}%
    </button>
  )
}

// ── Category picker with L1/L2 + quick picks ─────────────
function CatPicker({ cat1, cat2, onChange, quickPicks }) {
  const customCats = useStore(s => s.customCats)
  const _ccats = getMergedCats(customCats)
  const [open, setOpen] = useState(false)
  const [selL1, setSelL1] = useState(cat1 || CAT_NAMES.filter(c=>c!=='Entrate')[0])
  const color = CATS[cat1]?.color || '#888'

  function select(l1, l2) {
    onChange(l1, l2)
    setOpen(false)
  }

  return (
    <div style={{position:'relative'}}>
      {/* Quick picks */}
      {quickPicks.length > 0 && (
        <div style={{marginBottom:8}}>
          <div style={{fontSize:10,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',color:'var(--text3)',marginBottom:5}}>
            🕐 Usate di frequente
          </div>
          <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
            {quickPicks.map(q=>{
              const c = CATS[q.cat1]?.color||'#888'
              const isActive = q.cat1===cat1 && q.cat2===cat2
              return (
                <button key={q.cat1+q.cat2} onClick={()=>select(q.cat1,q.cat2)} style={{
                  padding:'4px 10px',borderRadius:16,fontSize:12,fontWeight:600,cursor:'pointer',
                  border:`1px solid ${isActive?c:c+'44'}`,
                  background:isActive?c+'22':'var(--surface)',
                  color:isActive?c:'var(--text2)',
                  fontFamily:'var(--font-sans)',transition:'all .12s',
                }}>
                  <span style={{width:6,height:6,borderRadius:'50%',background:c,display:'inline-block',marginRight:5,verticalAlign:'middle'}}/>
                  {q.cat1}{q.cat2?` › ${q.cat2}`:''}
                  <span style={{marginLeft:5,fontSize:10,opacity:.6}}>×{q.count}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Current selection */}
      <button onClick={()=>setOpen(o=>!o)} style={{
        width:'100%',padding:'9px 12px',border:'1px solid var(--border)',
        borderRadius:'var(--radius-sm)',background:'var(--surface)',
        display:'flex',alignItems:'center',gap:8,cursor:'pointer',
        fontFamily:'var(--font-sans)',fontSize:13,color:'var(--text)',
        textAlign:'left',
      }}>
        <span style={{width:10,height:10,borderRadius:'50%',background:color,flexShrink:0}}/>
        <span style={{flex:1}}>{cat1||'Scegli categoria'}{cat2?` › ${cat2}`:''}</span>
        <span style={{fontSize:10,color:'var(--text3)'}}>{open?'▲':'▼'}</span>
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position:'absolute',top:'calc(100% + 4px)',left:0,right:0,zIndex:200,
          background:'var(--surface)',border:'1px solid var(--border)',
          borderRadius:'var(--radius)',boxShadow:'0 4px 20px rgba(0,0,0,.1)',
          display:'grid',gridTemplateColumns:'1fr 1fr',
          maxHeight:320,overflow:'hidden',
        }} onClick={e=>e.stopPropagation()}>
          {/* L1 list */}
          <div style={{borderRight:'1px solid var(--border)',overflowY:'auto',maxHeight:320}}>
            {CAT_NAMES.filter(n=>n!=='Entrate').map(name=>{
              const c = CATS[name]?.color||'#888'
              return (
                <button key={name} onClick={()=>setSelL1(name)} style={{
                  display:'flex',alignItems:'center',gap:8,width:'100%',padding:'9px 12px',
                  border:'none',background:selL1===name?'var(--accent-l)':'none',
                  cursor:'pointer',fontFamily:'var(--font-sans)',fontSize:12,
                  fontWeight:selL1===name?700:500,
                  color:selL1===name?'var(--accent)':'var(--text2)',textAlign:'left',
                }}>
                  <span style={{width:8,height:8,borderRadius:'50%',background:c,flexShrink:0}}/>
                  {name}
                </button>
              )
            })}
          </div>

          {/* L2 list */}
          <div style={{overflowY:'auto',maxHeight:320,padding:4}}>
            <button onClick={()=>select(selL1,'')} style={{
              width:'100%',padding:'8px 10px',border:'none',borderRadius:'var(--radius-sm)',
              background:selL1===cat1&&!cat2?'var(--accent-l)':'none',
              cursor:'pointer',fontFamily:'var(--font-sans)',fontSize:12,
              color:selL1===cat1&&!cat2?'var(--accent)':'var(--text3)',textAlign:'left',
              fontStyle:'italic',
            }}>
              — nessuna —
            </button>
            {(_ccats[selL1]?.sub||[]).map(sub=>(
              <button key={sub} onClick={()=>select(selL1,sub)} style={{
                display:'block',width:'100%',padding:'8px 10px',
                border:'none',borderRadius:'var(--radius-sm)',
                background:selL1===cat1&&sub===cat2?'var(--accent-l)':'none',
                cursor:'pointer',fontFamily:'var(--font-sans)',fontSize:12,
                fontWeight:selL1===cat1&&sub===cat2?700:500,
                color:selL1===cat1&&sub===cat2?'var(--accent)':'var(--text2)',textAlign:'left',
              }}>
                {sub}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Helper: linked amount for one ATM tx ─────────────────
function linkedAmt(tx) {
  const autoLinks   = getAutoLinks(tx.txId)
  const manualLinks = (getAtmMeta()[tx.txId]?.links) || []
  return [...autoLinks, ...manualLinks].reduce((s,l)=>s+l.amount,0)
}

// ── Main page ─────────────────────────────────────────────
export default function ContantiPage() {
  const { cashEntries, addCashEntry, deleteCashEntry, transactions } = useStore()
  const [showAdd, setShowAdd] = useState(false)
  const [linksTx, setLinksTx] = useState(null) // tx for LinksModal
  const [atmOffset, setAtmOffset] = useState(0) // 0 = ultimi 6 mesi, 1 = 6 mesi precedenti, …
  const [form, setForm] = useState({
    date:   new Date().toISOString().slice(0,10),
    cat1:   'Spesa e Alimentari',
    cat2:   '',
    amount: '',
    note:   '',
  })
  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  const now   = new Date()
  const thisYM = getYM(now)
  const last12 = useMemo(() => {
    const n = new Date()
    return Array.from({length:12}, (_,i) => {
      const d = new Date(n.getFullYear(), n.getMonth() - (11-i), 1)
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
    })
  }, [])

  // 6-month window for ATM table
  const atmWindow = useMemo(() => {
    const n = new Date()
    return Array.from({length:6}, (_,i) => {
      const d = new Date(n.getFullYear(), n.getMonth() - (5-i) - atmOffset*6, 1)
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
    })
  }, [atmOffset])
  const atmWindowStart = atmWindow[0]
  const atmWindowEnd   = atmWindow[5]

  // ATM withdrawals from imported transactions
  const atmTxsAll = useMemo(() =>
    transactions.filter(t => !t.excluded && t.cat1 === 'Contanti' && t.amount < 0)
  , [transactions])

  const atmTxs = useMemo(() =>
    atmTxsAll.filter(t => {
      const d = (t._effDate || t.date || '').slice(0,7)
      return d >= atmWindowStart && d <= atmWindowEnd
    }).sort((a,b)=>(b._effDate||b.date||'').localeCompare(a._effDate||a.date||''))
  , [atmTxsAll, atmWindowStart, atmWindowEnd])

  const totalWithdrawn = Math.abs(atmTxsAll.reduce((s,t)=>s+t.amount,0))
  const totalSpent     = cashEntries.reduce((s,e)=>s+(e.amount||0),0)
  const cashOnHand     = totalWithdrawn - totalSpent

  const chartData = last12.map(ym=>({
    label:    ymLabel(ym),
    prelievi: Math.abs(atmTxsAll.filter(t=>(t._effDate||(t._effDate||t.date||'')).startsWith(ym)).reduce((s,t)=>s+t.amount,0)),
    speso:    cashEntries.filter(e=>(e.date||'').startsWith(ym)).reduce((s,e)=>s+(e.amount||0),0),
  }))

  // Category breakdown
  const byCat = {}
  cashEntries.forEach(e=>{
    const key = e.cat1+(e.cat2?` › ${e.cat2}`:'') || e.cat || '—'
    byCat[key] = (byCat[key]||0)+(e.amount||0)
  })
  const catList = Object.entries(byCat).sort((a,b)=>b[1]-a[1])

  // Quick picks: top 5 cat combos from history
  const quickPicks = useMemo(()=>{
    const counts = {}
    cashEntries.forEach(e=>{
      const cat1 = e.cat1 || e.cat || '—'
      const cat2 = e.cat2 || ''
      const key  = cat1+'|'+cat2
      counts[key] = (counts[key]||{cat1,cat2,count:0})
      counts[key].count++
    })
    return Object.values(counts).sort((a,b)=>b.count-a.count).slice(0,5)
  }, [cashEntries])

  const thisAtm   = Math.abs(atmTxsAll.filter(t=>(t._effDate||(t._effDate||t.date||'')).startsWith(thisYM)).reduce((s,t)=>s+t.amount,0))
  const thisSpent = cashEntries.filter(e=>(e.date||'').startsWith(thisYM)).reduce((s,e)=>s+(e.amount||0),0)

  function saveEntry() {
    if (!form.amount||!form.cat1) return
    addCashEntry({...form, amount:parseFloat(form.amount)})
    setShowAdd(false)
    setForm({date:new Date().toISOString().slice(0,10),cat1:'Spesa e Alimentari',cat2:'',amount:'',note:''})
  }

  return (
    <div className="cash-page">
      <div className="cash-header">
        <div>
          <h1 className="cash-title">💵 Contanti</h1>
          <div className="cash-sub">Prelievi ATM e tracking spese in contanti</div>
        </div>
        <button className="btn btn-primary" onClick={()=>setShowAdd(true)}>
          <Plus size={14}/> Aggiungi Spesa
        </button>
      </div>

      {/* KPIs */}
      <div className="cash-kpis">
        {[
          ['Prelievi (mese)',  `€ ${fmtIT(thisAtm, 0)}`,       'var(--text)'],
          ['Spese registrate', `€ ${fmtIT(thisSpent, 0)}`,     'var(--red)'],
          ['Saldo stimato',    `€ ${fmtIT(cashOnHand, 0)}`,    cashOnHand>=0?'var(--green)':'var(--red)'],
          ['Prelievi totali',  `€ ${fmtIT(totalWithdrawn, 0)}`, 'var(--text2)'],
        ].map(([l,v,c])=>(
          <div key={l} className="card cash-kpi">
            <div className="cash-kpi-label">{l}</div>
            <div className="cash-kpi-val" style={{color:c}}>{v}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="cash-charts">
        <div className="card cash-chart">
          <div style={{fontSize:14,fontWeight:700,marginBottom:14}}>Prelievi vs Spese registrate</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} barCategoryGap="35%">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
              <XAxis dataKey="label" tick={{fontSize:11,fill:'var(--text3)'}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fontSize:11,fill:'var(--text3)'}} axisLine={false} tickLine={false} width={45}
                tickFormatter={v=>v>=1000?`€${(v/1000).toFixed(0)}K`:`€${v}`}/>
              <Tooltip formatter={(v,n)=>[`€ ${fmtIT(v, 0)}`,n==='prelievi'?'Prelievi ATM':'Spese registrate']}
                contentStyle={{fontSize:12,border:'1px solid var(--border)',borderRadius:8}}/>
              <Bar dataKey="prelievi" name="prelievi" fill="var(--blue)"   radius={[4,4,0,0]}/>
              <Bar dataKey="speso"    name="speso"    fill="var(--accent)" radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {catList.length > 0 && (
          <div className="card cash-chart">
            <div style={{fontSize:14,fontWeight:700,marginBottom:14}}>Per categoria</div>
            {catList.slice(0,8).map(([cat,tot])=>{
              const l1 = cat.split(' › ')[0]
              const color = CATS[l1]?.color||'#888'
              return (
                <div key={cat} className="cash-cat-row">
                  <span className="cash-cat-name" style={{display:'flex',alignItems:'center',gap:5}}>
                    <span style={{width:7,height:7,borderRadius:'50%',background:color,flexShrink:0}}/>
                    {cat}
                  </span>
                  <div className="cash-cat-bar-wrap">
                    <div className="cash-cat-bar" style={{width:(tot/catList[0][1]*100)+'%',background:color}}/>
                  </div>
                  <span className="cash-cat-val">€ {fmtIT(tot, 0)}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>


      {/* ── Riconciliazione ── */}
      <div style={{fontSize:15,fontWeight:700,marginBottom:10}}>🔄 Riconciliazione Prelievi ATM</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:24}}>
        {/* Left: reconciled progress */}
        <div className="card" style={{background:'linear-gradient(135deg,var(--gold-l),var(--surface))'}}>
          <div style={{display:'flex',alignItems:'flex-start',gap:14}}>
            <div style={{fontSize:32}}>📊</div>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,fontSize:14,marginBottom:6}}>Contanti — Media Mensile</div>
              <div style={{fontFamily:'var(--font-serif)',fontSize:30,color:'var(--gold)'}}>
                € {fmtIT(cashOnHand, 0)}
              </div>
              <div style={{fontSize:12,color:'var(--text3)',marginTop:4}}>stima saldo disponibile</div>
              {totalWithdrawn > 0 && (
                <div style={{marginTop:12}}>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:12,color:'var(--text3)',marginBottom:4}}>
                    <span>Riconciliato</span>
                    <span>{Math.round(totalSpent/totalWithdrawn*100)}%</span>
                  </div>
                  <div style={{height:8,borderRadius:4,background:'var(--border)'}}>
                    <div style={{height:'100%',borderRadius:4,background:'var(--green)',width:Math.round(totalSpent/totalWithdrawn*100)+'%'}}/>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--text3)',marginTop:4}}>
                    <span style={{color:'var(--green)'}}>✓ € {fmtIT(totalSpent, 0)} registrate</span>
                    <span style={{color:'var(--gold)'}}>? € {fmtIT(cashOnHand, 0)} non tracciate</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: monthly history */}
        <div className="card">
          <div style={{fontWeight:700,fontSize:13,marginBottom:10}}>Storico mensile — Prelievi vs Registrate</div>
          {chartData.slice(-4).map(d=>(
            <div key={d.label} style={{marginBottom:8}}>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:3}}>
                <span style={{fontWeight:600}}>{d.label}</span>
                <span style={{color:'var(--text3)'}}>
                  {d.prelievi>0?`€${fmtIT(d.speso, 0)} / € ${fmtIT(d.prelievi, 0)}`:
                  <span style={{opacity:.5}}>nessun prelievo</span>}
                </span>
              </div>
              {d.prelievi>0 && (
                <div style={{height:5,borderRadius:3,background:'var(--border)'}}>
                  <div style={{height:'100%',borderRadius:3,background:'var(--accent)',
                    width:Math.min(100,Math.round(d.speso/d.prelievi*100))+'%'}}/>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ATM withdrawals */}
      {atmTxsAll.length > 0 && (
        <>
          {/* Header + period filter */}
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
            <div style={{fontSize:15,fontWeight:700}}>🏧 Prelievi ATM</div>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <button onClick={()=>setAtmOffset(o=>o+1)}
                style={{width:28,height:28,borderRadius:8,border:'1px solid var(--border)',background:'var(--surface)',cursor:'pointer',fontSize:14,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text2)'}}>‹</button>
              <span style={{fontSize:12,fontWeight:600,color:'var(--text2)',minWidth:120,textAlign:'center'}}>
                {ymLabel(atmWindowStart)} – {ymLabel(atmWindowEnd)}
              </span>
              <button onClick={()=>setAtmOffset(o=>Math.max(0,o-1))} disabled={atmOffset===0}
                style={{width:28,height:28,borderRadius:8,border:'1px solid var(--border)',background:'var(--surface)',cursor:atmOffset===0?'default':'pointer',fontSize:14,display:'flex',alignItems:'center',justifyContent:'center',color:atmOffset===0?'var(--text3)':'var(--text2)',opacity:atmOffset===0?.4:1}}>›</button>
            </div>
          </div>

          <div className="card" style={{padding:0,overflow:'hidden',marginBottom:20}}>
            {atmTxs.length === 0
              ? <div style={{padding:'24px',textAlign:'center',color:'var(--text3)',fontSize:13}}>Nessun prelievo in questo periodo</div>
              : <table style={{width:'100%',borderCollapse:'collapse'}}>
                  <thead><tr>
                    {['Data valuta','Data rettificata','Carta','Utente','Collegato a','Di cui abbinato','Importo'].map(h=>(
                      <th key={h} style={{padding:'9px 14px',fontSize:11,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',color:'var(--text3)',background:'var(--surface2)',borderBottom:'1px solid var(--border)',textAlign:['Di cui abbinato','Importo'].includes(h)?'right':'left'}}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {atmTxs.map(t=>{
                      const txAmt   = Math.abs(t.amount)
                      const linked  = Math.round(linkedAmt(t)*100)/100
                      const pct     = txAmt > 0 ? Math.round(linked/txAmt*100) : 0
                      const color   = pct >= 100 ? 'var(--green)' : pct > 0 ? 'var(--gold)' : 'var(--text3)'
                      return (
                        <tr key={t.txId} style={{borderBottom:'1px solid var(--border)'}}>
                          <td style={{padding:'9px 14px',fontSize:12,fontFamily:'var(--font-mono)'}}><DateValutaCell tx={t}/></td>
                          <td style={{padding:'9px 14px',fontSize:12}}><DateRettCell tx={t}/></td>
                          <td style={{padding:'9px 14px'}}>
                            {(t.card && t.card!=='null')
                              ? <span style={{fontSize:11,fontFamily:'var(--font-mono)',padding:'2px 6px',borderRadius:8,background:'var(--surface2)',border:'1px solid var(--border)',color:'var(--text3)',fontWeight:700}}>*{t.card}</span>
                              : <span style={{color:'var(--text3)',opacity:.3}}>—</span>}
                          </td>
                          <td style={{padding:'6px 14px'}}>
                            {(()=>{
                              const nick = resolveMemberFromTx(t)
                              return nick
                                ? <span style={{fontSize:12,fontWeight:700,color:'var(--accent)'}}>{nick}</span>
                                : <span style={{color:'var(--text3)',opacity:.4,fontSize:11}}>—</span>
                            })()}
                          </td>
                          <td style={{padding:'6px 14px'}}><LinkBadge tx={t} onOpen={()=>setLinksTx(t)}/></td>
                          <td style={{padding:'9px 14px',textAlign:'right',fontFamily:'var(--font-mono)',fontSize:12,fontWeight:700,color}}>
                            {linked > 0
                              ? <>€ {fmtIT(linked,2)} <span style={{fontSize:10,opacity:.7}}>({pct}%)</span></>
                              : <span style={{opacity:.3}}>—</span>}
                          </td>
                          <td style={{padding:'9px 14px',fontSize:13,fontWeight:700,color:'var(--blue)',textAlign:'right',fontFamily:'var(--font-mono)'}}>{fmtIT(txAmt, 2)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
            }
          </div>
        </>
      )}

      {/* Manual entries */}
      <div style={{fontSize:15,fontWeight:700,marginBottom:10}}>📝 Spese in Contanti</div>
      {cashEntries.length === 0 ? (
        <div className="cash-empty">
          <Wallet size={32} color="var(--text3)" style={{marginBottom:12}}/>
          <div style={{fontSize:15,fontWeight:700,marginBottom:6}}>Nessuna spesa registrata</div>
          <div style={{fontSize:13,color:'var(--text3)',marginBottom:16}}>Registra le spese in contanti per sapere dove vanno i prelievi ATM.</div>
          <button className="btn btn-primary" onClick={()=>setShowAdd(true)}><Plus size={14}/> Aggiungi Spesa</button>
        </div>
      ) : (
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead><tr>
              {['Data','Categoria','Nota','Importo',''].map(h=>(
                <th key={h} style={{padding:'9px 14px',fontSize:11,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',color:'var(--text3)',background:'var(--surface2)',borderBottom:'1px solid var(--border)',textAlign:h==='Importo'?'right':'left'}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {[...cashEntries].sort((a,b)=>(b._effDate||b.date||'').localeCompare(a._effDate||a.date||'')).map(e=>{
                const l1 = e.cat1||e.cat||'—'
                const l2 = e.cat2||''
                const color = CATS[l1]?.color||'#888'
                return (
                  <tr key={e.id} style={{borderBottom:'1px solid var(--border)'}}>
                    <td style={{padding:'9px 14px',fontSize:12,color:'var(--text3)',fontFamily:'var(--font-mono)'}}>{(e.date||'').slice(5).replace('-','/')}</td>
                    <td style={{padding:'9px 14px'}}>
                      <span style={{display:'inline-flex',alignItems:'center',gap:5,padding:'2px 9px',borderRadius:12,fontSize:11,fontWeight:700,background:color+'18',color,border:`1px solid ${color}33`}}>
                        <span style={{width:6,height:6,borderRadius:'50%',background:color}}/>
                        {l1}{l2?` › ${l2}`:''}
                      </span>
                    </td>
                    <td style={{padding:'9px 14px',fontSize:13,color:'var(--text2)'}}>{e.note||'—'}</td>
                    <td style={{padding:'9px 14px',fontSize:13,fontWeight:700,color:'var(--red)',textAlign:'right',fontFamily:'var(--font-mono)'}}>{fmtIT(e.amount||0, 2)}</td>
                    <td style={{padding:'6px 10px'}}><button className="btn btn-ghost" onClick={()=>deleteCashEntry(e.id)}><Trash2 size={12}/></button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Links modal */}
      {linksTx && <LinksModal tx={linksTx} onClose={()=>setLinksTx(null)}/>}

      {/* Add modal */}
      {showAdd && (
        <Modal title="+ Spesa in Contanti" onClose={()=>setShowAdd(false)}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:14}}>
            <FormRow label="Data">
              <Input type="date" value={form.date} onChange={e=>set('date',e.target.value)}/>
            </FormRow>
            <FormRow label="Importo (€)">
              <Input type="number" value={form.amount} onChange={e=>set('amount',e.target.value)} placeholder="0" autoFocus/>
            </FormRow>
          </div>

          <FormRow label="Categoria">
            <CatPicker
              cat1={form.cat1} cat2={form.cat2}
              onChange={(l1,l2)=>setForm(f=>({...f,cat1:l1,cat2:l2}))}
              quickPicks={quickPicks}
            />
          </FormRow>

          <FormRow label="Note" style={{marginTop:14}}>
            <Input value={form.note} onChange={e=>set('note',e.target.value)} placeholder="Descrizione opzionale"/>
          </FormRow>

          <ModalFooter>
            <button className="btn btn-primary" onClick={saveEntry} disabled={!form.amount||!form.cat1}>Salva</button>
            <button className="btn btn-secondary" onClick={()=>setShowAdd(false)}>Annulla</button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  )
}
