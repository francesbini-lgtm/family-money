import { useState, useMemo, useRef, useEffect } from 'react'
import AiRulesTab from '../components/AiRulesTab'
import { useStore } from '../store/useStore'
import { DEFAULT_AI_PROMPTS, getAIPrompts, saveAIPrompts } from '../data/aiPrompts'
import { useAuth } from '../auth/AuthContext'
import Modal, { ModalFooter, FormRow, Input, Select } from '../components/Modal'
import { CATS, CAT_NAMES, getMergedCats } from '../data/categories'
import { createInvite } from '../services/invite'
import { exportTransactionsCSV, exportSummaryCSV, exportVacanzeBackupJSON } from '../services/export'
import { Plus, Trash2, LogOut, Download, Copy, UserPlus, Check, Pencil } from 'lucide-react'
import { fmtIT, fmtDate } from '../utils/format'
import { generateSecret, validateToken, qrCodeUrl, formatSecret } from '../services/totp'
import { saveTotpSecret, deleteTotpSecret } from '../services/firestore'
import { ForcedBalanceModal } from './TransactionsPage'
import DevlogPage from './DevlogPage'

function Tabs({ tabs, active, onChange }) {
  return (
    <div style={{display:"flex",gap:4,borderBottom:"1px solid var(--border)",marginBottom:24}}>
      {tabs.map(t=>(
        <button key={t.id} onClick={()=>onChange(t.id)} style={{
          padding:"10px 18px",border:"none",background:"none",
          fontFamily:"var(--font-sans)",fontSize:13,fontWeight:600,
          cursor:"pointer",color:active===t.id?"var(--accent)":"var(--text3)",
          borderBottom:active===t.id?"2px solid var(--accent)":"2px solid transparent",
          transition:"all .12s",
        }}>{t.icon} {t.label}</button>
      ))}
    </div>
  )
}


const PIN = '182218'
const DEMO_PIN = '000000'

function DeleteAllTransactionsButton() {
  const { transactions, deleteAllTransactions } = useStore()
  const [step,    setStep]    = useState(0) // 0=idle, 1=first pin, 2=second pin, 3=done
  const [pin1,    setPin1]    = useState('')
  const [pin2,    setPin2]    = useState('')
  const [error,   setError]   = useState(null)
  const [deleting,setDeleting]= useState(false)

  function handleFirst() {
    if (pin1 !== PIN && pin1 !== DEMO_PIN) { setError('PIN errato'); setPin1(''); return }
    setError(null); setPin1(''); setStep(2)
  }

  async function handleSecond() {
    if (pin2 !== PIN && pin2 !== DEMO_PIN) { setError('PIN errato'); setPin2(''); return }
    setError(null); setDeleting(true)
    try {
      // Delete from local store AND Firestore (same path as Danger Zone tab),
      // otherwise the next sync restores everything
      await deleteAllTransactions()
      setStep(3)
    } catch(e) {
      useStore.setState({ transactions: [] })
      setStep(3)
    } finally {
      setDeleting(false)
    }
  }

  if (step === 3) return (
    <div style={{padding:'10px 14px',background:'var(--green-l)',borderRadius:'var(--radius-sm)',fontSize:13,color:'var(--green)',fontWeight:600}}>
      ✓ Tutte le transazioni sono state eliminate.
    </div>
  )

  if (step === 0) return (
    <div style={{display:'flex',alignItems:'center',gap:10}}>
      <button className="btn btn-ghost" style={{color:'var(--red)',border:'1px solid var(--red)',fontSize:12}}
        onClick={()=>setStep(1)}>
        🗑 Cancella tutte le transazioni ({transactions.length})
      </button>
    </div>
  )

  return (
    <div style={{display:'flex',flexDirection:'column',gap:8}}>
      <div style={{fontSize:12,fontWeight:700,color:'var(--red)'}}>
        {step===1 ? '🔐 Inserisci il PIN (1a conferma)' : '🔐 Inserisci il PIN di nuovo (2a conferma)'}
      </div>
      <div style={{display:'flex',gap:8,alignItems:'center'}}>
        <input
          type="password"
          inputMode="numeric"
          maxLength={6}
          value={step===1?pin1:pin2}
          onChange={e=>step===1?setPin1(e.target.value):setPin2(e.target.value)}
          placeholder="PIN a 6 cifre"
          style={{padding:'7px 12px',border:'1px solid var(--red)',borderRadius:'var(--radius-sm)',fontSize:13,width:140,background:'var(--surface)',color:'var(--text)',outline:'none',fontFamily:'var(--font-mono)'}}
          onKeyDown={e=>e.key==='Enter'&&(step===1?handleFirst():handleSecond())}
          autoFocus
        />
        <button className="btn btn-ghost" style={{color:'var(--red)',border:'1px solid var(--red)',fontSize:12}}
          onClick={step===1?handleFirst:handleSecond} disabled={deleting}>
          {deleting?'Eliminazione…':'Conferma'}
        </button>
        <button className="btn btn-ghost" style={{fontSize:12}} onClick={()=>{setStep(0);setPin1('');setPin2('');setError(null)}}>
          Annulla
        </button>
      </div>
      {error && <div style={{fontSize:12,color:'var(--red)',fontWeight:600}}>{error}</div>}
      {step===2 && <div style={{fontSize:11,color:'var(--text3)'}}>⚠️ Questa è l'ultima conferma — l'operazione è irreversibile.</div>}
    </div>
  )
}


// ── Family members section ────────────────────────────────
function FamilyMemberRow({ member, isOwner, onRemove, onGenerateInvite, onMarkRegistered }) {
  const [inviteLink,    setInviteLink]    = useState("")
  const [inviteLoading, setInviteLoading] = useState(false)
  const [copied,        setCopied]        = useState(false)

  async function handleInvite() {
    setInviteLoading(true)
    try {
      const link = await onGenerateInvite(member.name, member.email)
      setInviteLink(link)
    } catch(e) {
      alert("Errore: "+e.message)
    } finally {
      setInviteLoading(false)
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(inviteLink)
    setCopied(true)
    setTimeout(()=>setCopied(false), 2000)
  }

  const statusColor = member.status==="active"?"var(--green)":member.status==="invited"?"var(--gold)":"var(--text3)"
  const statusLabel = member.status==="active"?"Registrato":member.status==="invited"?"Invitato":"In attesa"

  return (
    <div className="card" style={{padding:"14px 18px",marginBottom:10}}>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        {/* Avatar */}
        {member.photoURL
          ? <img src={member.photoURL} style={{width:40,height:40,borderRadius:"50%",flexShrink:0}} alt=""/>
          : <div style={{width:40,height:40,borderRadius:"50%",background:"var(--surface2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>
              {member.name?member.name[0].toUpperCase():"?"}
            </div>}

        {/* Info */}
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:14,fontWeight:700}}>{member.name||"—"}</div>
          <div style={{fontSize:12,color:"var(--text3)"}}>{member.email||"Nessuna email"}</div>
        </div>

        {/* Status badge */}
        <span style={{fontSize:11,padding:"3px 10px",borderRadius:12,fontWeight:700,background:statusColor+"18",color:statusColor,border:"1px solid "+statusColor+"30",flexShrink:0}}>
          {isOwner?"Admin":statusLabel}
        </span>

        {/* Card chips */}
        {(member.cards||[]).length > 0 && (
          <div style={{display:"flex",gap:4,flexWrap:"wrap",flexShrink:0}}>
            {(member.cards||[]).map(card=>(
              <span key={card} style={{fontSize:10,padding:"2px 7px",borderRadius:10,background:"var(--surface2)",border:"1px solid var(--border)",fontFamily:"var(--font-mono)",color:"var(--text3)",fontWeight:700}}>
                *{card}
              </span>
            ))}
          </div>
        )}

        {/* Actions */}
        {!isOwner && (
          <div style={{display:"flex",gap:6,flexShrink:0}}>
            {member.status==="invited" && (
              <button className="btn btn-ghost" style={{fontSize:12,color:'var(--green)',border:'1px solid var(--green)'}} onClick={()=>onMarkRegistered(member.id)}>
                <Check size={12}/> Registrato
              </button>
            )}
            {member.status!=="active" && (
              <button className="btn btn-secondary" style={{fontSize:12}} onClick={handleInvite} disabled={inviteLoading}>
                <UserPlus size={12}/> {inviteLoading?"…":"Invita"}
              </button>
            )}
            <button className="btn btn-ghost" style={{color:"var(--red)"}} onClick={()=>onRemove(member.id)}>
              <Trash2 size={12}/>
            </button>
          </div>
        )}
      </div>

      {/* Invite link (shown after generating) */}
      {inviteLink && (
        <div style={{marginTop:12,padding:"10px 12px",background:"var(--surface2)",borderRadius:"var(--radius-sm)"}}>
          <div style={{fontSize:11,color:"var(--text3)",marginBottom:6}}>
            🔗 Link di invito per <strong>{member.name}</strong> · valido 7 giorni
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <input readOnly value={inviteLink} style={{flex:1,padding:"6px 10px",border:"1px solid var(--border)",borderRadius:"var(--radius-sm)",fontSize:11,background:"var(--surface)",color:"var(--text2)",fontFamily:"var(--font-mono)"}}/>
            <button className="btn btn-primary" style={{fontSize:12,flexShrink:0}} onClick={copyLink}>
              {copied?<><Check size={12}/> Copiato!</>:<><Copy size={12}/> Copia</>}
            </button>
          </div>
          <button className="btn btn-ghost" style={{fontSize:11,marginTop:6}} onClick={()=>setInviteLink("")}>Chiudi</button>
        </div>
      )}
    </div>
  )
}

function FamilySection({ user }) {
  const appPrefs    = useStore(s => s.appPrefs)
  const setAppPref  = useStore(s => s.setAppPref)
  const [members, setMembers] = useState(() => appPrefs.family || [])
  // Resync when appPrefs.family arrives/changes (Firestore load) — otherwise
  // a save writes the stale initial snapshot and loses members
  useEffect(() => { setMembers(appPrefs.family || []) }, [appPrefs.family])
  const [showAdd, setShowAdd]   = useState(false)
  const [newName,     setNewName]     = useState("")
  const [newEmail,    setNewEmail]    = useState("")
  const [newNickname, setNewNickname] = useState("")

  function saveMembers(updated) {
    setMembers(updated)
    setAppPref('family', updated)
  }

  function addMember() {
    if (!newName.trim()) return
saveMembers([...members, {
      id:       Date.now(),
      name:     newName.trim(),
      nickname: newNickname.trim() || newName.trim().split(' ')[0],
      email:    newEmail.trim(),
      status:   "pending",
      photoURL: null,
    }])
    setNewName(""); setNewEmail(""); setNewNickname(""); setShowAdd(false)
  }

  function removeMember(id) {
    if (!confirm("Rimuovere questo membro?")) return
    saveMembers(members.filter(m=>m.id!==id))
  }

  function markAsRegistered(id) {
    saveMembers(members.map(m => m.id===id ? {...m, status:'active'} : m))
  }

  async function generateInviteForMember(name, email) {
    const { createInvite } = await import("../services/invite")
    const link = await createInvite(user?.displayName||"", user?.email||"")
    // Mark as invited
    saveMembers(members.map(m=>m.name===name?{...m,status:"invited"}:m))
    return link
  }

  // Owner (logged in user) as first member
  const ownerNickname = appPrefs.ownerNickname || user?.displayName?.split(' ')[0] || 'Admin'
  const ownerMember = {
    id:       "owner",
    name:     user?.displayName || user?.email,
    nickname: ownerNickname,
    email:    user?.email,
    photoURL: user?.photoURL,
    status:   "active",
  }

  return (
    <div style={{marginBottom:28}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
        <div style={{fontSize:14,fontWeight:700}}>👨‍👩‍👧 Famiglia</div>
        <button className="btn btn-secondary" style={{fontSize:12}} onClick={()=>setShowAdd(v=>!v)}>
          <Plus size={12}/> Aggiungi membro
        </button>
      </div>

      {/* Owner row */}
      <FamilyMemberRow member={ownerMember} isOwner={true} onRemove={()=>{}} onGenerateInvite={generateInviteForMember}/>

      {/* Other members */}
      {members.map(m=>(
        <FamilyMemberRow key={m.id} member={m} isOwner={false}
          onRemove={removeMember}
          onGenerateInvite={generateInviteForMember}
          onMarkRegistered={markAsRegistered}/>
      ))}

      {/* Add member form */}
      {showAdd && (
        <div className="card" style={{padding:"14px 18px",marginTop:8,border:"1px dashed var(--border)"}}>
          <div style={{fontSize:13,fontWeight:600,marginBottom:10}}>+ Nuovo membro</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
            <div>
              <label style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",color:"var(--text3)",display:"block",marginBottom:4}}>Nome</label>
              <input value={newName} onChange={e=>setNewName(e.target.value)}
                placeholder="es. Sofia"
                style={{width:"100%",padding:"8px 10px",border:"1px solid var(--border)",borderRadius:"var(--radius-sm)",fontSize:13,background:"var(--surface)",color:"var(--text)",outline:"none",fontFamily:"var(--font-sans)"}}
                onKeyDown={e=>e.key==="Enter"&&addMember()}
                autoFocus/>
            </div>
            <div>
              <label style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",color:"var(--text3)",display:"block",marginBottom:4}}>Soprannome</label>
              <input value={newNickname} onChange={e=>setNewNickname(e.target.value)}
                placeholder="es. Fra, Sofi, Ceci"
                style={{width:"100%",padding:"8px 10px",border:"1px solid var(--border)",borderRadius:"var(--radius-sm)",fontSize:13,background:"var(--surface)",color:"var(--text)",outline:"none",fontFamily:"var(--font-sans)"}}
                onKeyDown={e=>e.key==="Enter"&&addMember()}/>
            </div>
            <div>
              <label style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",color:"var(--text3)",display:"block",marginBottom:4}}>Email (opz.)</label>
              <input value={newEmail} onChange={e=>setNewEmail(e.target.value)}
                placeholder="es. sofia@gmail.com"
                style={{width:"100%",padding:"8px 10px",border:"1px solid var(--border)",borderRadius:"var(--radius-sm)",fontSize:13,background:"var(--surface)",color:"var(--text)",outline:"none",fontFamily:"var(--font-sans)"}}/>
            </div>

          </div>
          <div style={{display:"flex",gap:8}}>
            <button className="btn btn-primary" style={{fontSize:12}} onClick={addMember}>Aggiungi</button>
            <button className="btn btn-ghost" style={{fontSize:12}} onClick={()=>{setShowAdd(false);setNewName("");setNewEmail("")}}>Annulla</button>
          </div>
          <div style={{fontSize:11,color:"var(--text3)",marginTop:8,lineHeight:1.4}}>
            💡 Dopo aver aggiunto il membro, clicca "Invita" per generare il link di accesso.
          </div>
        </div>
      )}
    </div>
  )
}



function GeminiKeyField() {
  const { appPrefs, setAppPref } = useStore()
  const [key,     setKey]     = useState(() => appPrefs?.geminiKey || localStorage.getItem('fm-gemini-key') || '')
  const [saved,   setSaved]   = useState(false)
  const [visible, setVisible] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testOk,  setTestOk]  = useState(null)
  const [testMsg, setTestMsg] = useState('')

  function save() {
    const k = key.trim()
    setAppPref('geminiKey', k)          // Firestore — sync su tutti i device
    localStorage.setItem('fm-gemini-key', k)  // fallback locale
    setSaved(true); setTestOk(null)
    setTimeout(() => setSaved(false), 2000)
  }

  async function test() {
    setTesting(true); setTestOk(null); setTestMsg('')
    try {
      const k = key.trim()
      const res = await fetch('http://localhost:3001/gemini', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ prompt: 'Reply only with the word: ok', key: k })
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
      if (text) {
        setTestOk(true)
        setAppPref('geminiKey', k)
        localStorage.setItem('fm-gemini-key', k)
      } else throw new Error('empty response')
    } catch(e) {
      console.error('Gemini test error:', e)
      setTestOk(false)
      if (e.message.includes('fetch') || e.message.includes('Failed')) {
        setTestMsg('Proxy non avviato — lancia: node proxy-server.cjs nel terminale')
      }
    } finally {
      setTesting(false)
    }
  }

  return (
    <div>
      <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',marginTop:6}}>
        <input
          type={visible ? 'text' : 'password'}
          value={key}
          onChange={e=>{setKey(e.target.value);setSaved(false);setTestOk(null)}}
          placeholder="AIzaSy..."
          style={{flex:1,minWidth:200,padding:'8px 10px',border:'1px solid var(--border)',
            borderRadius:'var(--radius-sm)',fontSize:12,background:'var(--surface)',
            color:'var(--text)',outline:'none',fontFamily:'var(--font-mono)'}}
        />
        <button className="btn btn-ghost" style={{fontSize:12}} onClick={()=>setVisible(v=>!v)}>
          {visible?'🙈':'👁'}
        </button>
        <button className="btn btn-primary" style={{fontSize:12}} onClick={save} disabled={!key.trim()}>
          {saved?'✓ Salvata':'Salva'}
        </button>
        <button className="btn btn-secondary" style={{fontSize:12}} onClick={test} disabled={!key.trim()||testing}>
          {testing?'⏳ Test…':'🧪 Testa'}
        </button>
      </div>
      {testOk === true  && <div style={{fontSize:12,color:'var(--green)',marginTop:6}}>✓ Connessione riuscita — Gemini funziona!</div>}
      {testOk === false && <div style={{fontSize:12,color:'var(--red)',marginTop:6}}>
      {testMsg || '✗ Errore — controlla che il proxy sia avviato (node proxy-server.js)'}
    </div>}
      <div style={{fontSize:11,color:'var(--text3)',marginTop:6}}>
        Chiave gratuita su <a href="https://aistudio.google.com/app/apikey" target="_blank" style={{color:'var(--accent)'}}>aistudio.google.com</a>. 
        Viene salvata solo nel browser locale.
      </div>
    </div>
  )
}

function OwnerNicknameField() {
  const appPrefs   = useStore(s => s.appPrefs)
  const setAppPref = useStore(s => s.setAppPref)
  const [nick,  setNick]  = useState(() => appPrefs.ownerNickname || '')
  const [saved, setSaved] = useState(false)

  function save() {
    setAppPref('ownerNickname', nick.trim())
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div style={{display:'flex',alignItems:'center',gap:8,marginTop:6}}>
      <span style={{fontSize:12,color:'var(--text3)',flexShrink:0}}>Soprannome:</span>
      <input
        value={nick}
        onChange={e=>{setNick(e.target.value);setSaved(false)}}
        onKeyDown={e=>e.key==='Enter'&&save()}
        placeholder="es. Fra"
        style={{width:100,padding:'4px 8px',border:'1px solid var(--border)',
          borderRadius:'var(--radius-sm)',fontSize:13,background:'var(--surface)',
          color:'var(--text)',outline:'none',fontFamily:'var(--font-sans)'}}
      />
      <button className="btn btn-ghost" style={{fontSize:11,padding:'3px 8px'}} onClick={save}>
        {saved ? '✓' : 'Salva'}
      </button>
    </div>
  )
}

// ── Home Locations box ───────────────────────────────────
function HomeLocationsBox() {
  const appPrefs   = useStore(s => s.appPrefs)
  const setAppPref = useStore(s => s.setAppPref)
  const homeCity   = appPrefs.homeCity   ?? 'Como'
  const homeRadius = appPrefs.homeRadius ?? 300
  const [cityInput,   setCityInput]   = useState(homeCity)
  const [radiusInput, setRadiusInput] = useState(homeRadius)

  function save() {
    const city = cityInput.trim()
    const r    = parseInt(radiusInput, 10)
    if (city)    setAppPref('homeCity',   city)
    if (!isNaN(r) && r > 0) setAppPref('homeRadius', r)
  }

  // Preset radii for quick pick
  const presets = [100, 200, 300, 500, 1000]

  return (
    <div className="card" style={{padding:'18px 20px',marginBottom:20}}>
      <div style={{fontSize:14,fontWeight:700,marginBottom:4}}>📍 Zona di Casa</div>
      <div style={{fontSize:12,color:'var(--text3)',marginBottom:14,lineHeight:1.5}}>
        Transazioni effettuate a più di <strong>{homeRadius}km</strong> da <strong>{homeCity}</strong> vengono
        automaticamente categorizzate come <strong>Weekend e Vacanze</strong> durante l'AI enrichment.
      </div>

      <div style={{display:'flex',gap:12,alignItems:'flex-end',flexWrap:'wrap',marginBottom:12}}>
        <div style={{display:'flex',flexDirection:'column',gap:4}}>
          <label style={{fontSize:11,color:'var(--text3)',fontWeight:600}}>CITTÀ DI RIFERIMENTO</label>
          <input
            value={cityInput}
            onChange={e=>setCityInput(e.target.value)}
            onBlur={save}
            onKeyDown={e=>e.key==='Enter'&&save()}
            placeholder="es. Como"
            style={{width:140,padding:'7px 12px',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',
              fontSize:13,background:'var(--surface)',color:'var(--text)',outline:'none',fontFamily:'var(--font-sans)'}}
          />
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:4}}>
          <label style={{fontSize:11,color:'var(--text3)',fontWeight:600}}>RAGGIO (KM)</label>
          <input
            type="number"
            value={radiusInput}
            onChange={e=>setRadiusInput(e.target.value)}
            onBlur={save}
            onKeyDown={e=>e.key==='Enter'&&save()}
            min={50} max={3000} step={50}
            style={{width:90,padding:'7px 12px',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',
              fontSize:13,background:'var(--surface)',color:'var(--text)',outline:'none',fontFamily:'var(--font-sans)'}}
          />
        </div>
        <button className="btn btn-primary" onClick={save} style={{fontSize:12,padding:'7px 16px',marginBottom:1}}>
          Salva
        </button>
      </div>

      {/* Quick presets */}
      <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
        <span style={{fontSize:11,color:'var(--text3)',alignSelf:'center',marginRight:2}}>Preset:</span>
        {presets.map(r => (
          <button key={r} onClick={()=>{setRadiusInput(r);setAppPref('homeRadius',r)}}
            style={{padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:600,cursor:'pointer',
              border:'1px solid var(--accent)33',
              background: homeRadius===r ? 'var(--accent)' : 'var(--accent-l)',
              color: homeRadius===r ? '#fff' : 'var(--accent)'}}>
            {r}km
          </button>
        ))}
      </div>

      <div style={{marginTop:12,fontSize:11,color:'var(--text3)',fontStyle:'italic'}}>
        Con {homeRadius}km da {homeCity} sono coperti: {homeRadius<=200?'Lombardia, Ticino, parte del Piemonte':homeRadius<=300?'tutto il nord Italia, Svizzera, Ticino':homeRadius<=500?'Italia centro-nord, Francia sud, Austria':'quasi tutta Europa centrale'}
      </div>
    </div>
  )
}

function ProfileTab() {
  const { user, logOut } = useAuth()
  const { userAccounts, setUserAccounts, transactions } = useStore()
  const appPrefs = useStore(s => s.appPrefs)
  const [showAdd, setShowAdd] = useState(false)
  const [addType, setAddType] = useState("conto")
  const [form, setForm] = useState({ name:"", bank:"", iban4:"", parentId:"", memberId:"", card4:"", circuito:"" })
  const [inviteLink, setInviteLink] = useState("")
  const [inviteLoading, setInviteLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({})

  function startEdit(a) {
    setEditingId(a.id)
    setEditForm({ name:a.name||'', bank:a.bank||'', iban4:a.iban4||'', card4:a.card4||'', parentId:a.parentId||'', memberId:a.memberId||'', circuito:a.circuito||'', type:a.type })
  }

  function saveEdit() {
    setUserAccounts(user?.uid, userAccounts.map(a => a.id===editingId ? {...a,...editForm} : a))
    setEditingId(null)
  }

  function addAccount() {
    if(!form.name) return
    const acc = {
      id:       Date.now(),
      name:     form.name,
      type:     addType,       // conto | carta_credito | carta_debito
      bank:     form.bank,
      iban4:    form.iban4,
      parentId: form.parentId || null,   // for cards: linked conto id
      memberId: form.memberId || null,   // family member id
      card4:    form.card4 || null,      // last 4 digits (auto or manual)
      circuito: form.circuito || null,   // payment network (Visa, Mastercard, etc.)
    }
    setUserAccounts(user?.uid, [...userAccounts, acc])
    setShowAdd(false); setForm({name:'',bank:'',iban4:'',parentId:'',memberId:'',card4:'',circuito:''})
  }

  function removeAccount(id) {
    if(!confirm("Rimuovere questo conto?")) return
    setUserAccounts(user?.uid, userAccounts.filter(a=>a.id!==id))
  }

  async function generateInvite() {
    setInviteLoading(true)
    try {
      const link = await createInvite(user?.displayName||"", user?.email||"")
      setInviteLink(link)
    } catch(e) {
      alert("Errore generazione invito: "+e.message)
    } finally {
      setInviteLoading(false)
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(inviteLink)
    setCopied(true)
    setTimeout(()=>setCopied(false), 2000)
  }

  return (
    <div>
      {/* User info */}
      <div className="card" style={{padding:"18px 20px",marginBottom:20,display:"flex",alignItems:"center",gap:14}}>
        {user?.photoURL && <img src={user.photoURL} style={{width:48,height:48,borderRadius:"50%"}} alt=""/>}
        <div style={{flex:1}}>
          <div style={{fontSize:16,fontWeight:700}}>{user?.displayName||user?.email}</div>
          <OwnerNicknameField/>
          <div style={{marginTop:12,fontSize:12,color:'var(--text3)'}}>
            🔑 La configurazione della chiave API e dei prompt AI si trova nel tab <strong>🤖 AI Prompt</strong>.
          </div>
          <div style={{fontSize:13,color:"var(--text3)"}}>{user?.email}</div>
        </div>
        <button className="btn btn-ghost" onClick={logOut} style={{color:"var(--red)"}}><LogOut size={14}/> Esci</button>
      </div>

      {/* Home locations */}
      <HomeLocationsBox/>

      {/* Accounts */}
      <div style={{fontSize:14,fontWeight:700,marginBottom:12}}>💳 Conti e Carte</div>
      <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>
        {userAccounts.map(a=>{
          const family = appPrefs.family || []
          const ownerNick = appPrefs.ownerNickname || 'Admin'
          const memberNick = a.memberId
            ? (a.memberId === 'owner' ? ownerNick : (family.find(m=>String(m.id)===String(a.memberId))?.nickname || family.find(m=>String(m.id)===String(a.memberId))?.name || ''))
            : ''
          return (
          <div key={a.id} className="card" style={{padding:"12px 16px",display:"flex",alignItems:"center",gap:12}}>
            <span style={{fontSize:18}}>{a.type==="carta_credito"||a.type==="carta_debito"?"💳":"🏦"}</span>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:600}}>{a.name}</div>
              <div style={{fontSize:11,color:"var(--text3)",display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
                {a.bank&&<span>{a.bank}</span>}
                {a.iban4&&<span>····{a.iban4}</span>}
                {a.card4&&<span style={{fontFamily:'var(--font-mono)'}}>*{a.card4}</span>}
                {a.parentId&&(()=>{const p=userAccounts.find(x=>x.id===a.parentId);return p?<span>→ {p.name}</span>:null})()}
                {a.circuito&&<span style={{fontSize:10,padding:'1px 7px',borderRadius:10,fontWeight:700,background:'var(--accent-l)',color:'var(--accent)',border:'1px solid var(--accent)33'}}>{a.circuito}</span>}
                {memberNick&&<span style={{fontSize:10,padding:'1px 7px',borderRadius:10,fontWeight:700,background:'var(--surface2)',color:'var(--text2)',border:'1px solid var(--border)'}}>👤 {memberNick}</span>}
              </div>
            </div>
            <span style={{fontSize:11,padding:"2px 8px",borderRadius:12,fontWeight:700,
              background:a.type==='carta_credito'?'var(--gold-l)':a.type==='carta_debito'?'var(--blue-l)':'var(--surface2)',
              color:a.type==='carta_credito'?'var(--gold)':a.type==='carta_debito'?'var(--blue)':'var(--text3)'}}>
              {a.type==='carta_credito'?'Carta Credito':a.type==='carta_debito'?'Carta Debito':'Conto'}
            </span>
            <button className="btn btn-ghost" style={{color:"var(--text3)"}} onClick={()=>startEdit(a)} title="Modifica"><Pencil size={12}/></button>
            <button className="btn btn-ghost" style={{color:"var(--red)"}} onClick={()=>removeAccount(a.id)}><Trash2 size={12}/></button>
          </div>
          )
        })}
      </div>
      <div style={{display:"flex",gap:8,marginBottom:28,flexWrap:"wrap"}}>
        <button className="btn btn-secondary" onClick={()=>{setAddType("conto");setShowAdd(true)}}><Plus size={13}/> Conto Corrente</button>
        <button className="btn btn-secondary" onClick={()=>{setAddType("carta_credito");setShowAdd(true)}}><Plus size={13}/> Carta di Credito</button>
        <button className="btn btn-secondary" onClick={()=>{setAddType("carta_debito");setShowAdd(true)}}><Plus size={13}/> Carta di Debito</button>
      </div>

      {/* Edit modal */}
      {editingId && (() => {
        const a = userAccounts.find(x=>x.id===editingId)
        if (!a) return null
        const conti = userAccounts.filter(x=>x.type==='conto')
        const family = appPrefs.family || []
        const ownerMember = { id:'owner', name: user?.displayName?.split(' ')[0]||'Admin' }
        const allMembers  = [ownerMember, ...family]
        const isCarta = a.type==='carta_credito'||a.type==='carta_debito'
        const ef = editForm
        const setEf = (k,v) => setEditForm(f=>({...f,[k]:v}))
        return (
          <Modal title={`Modifica: ${a.name}`} onClose={()=>setEditingId(null)}>
            <FormRow label="Nome">
              <Input value={ef.name} onChange={e=>setEf('name',e.target.value)} placeholder="Nome conto/carta"/>
            </FormRow>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <FormRow label="Istituto">
                <Input value={ef.bank} onChange={e=>setEf('bank',e.target.value)} placeholder="es. UniCredit"/>
              </FormRow>
              {isCarta ? (
                <FormRow label="Ultime 4 cifre carta">
                  <Input value={ef.card4} onChange={e=>setEf('card4',e.target.value.slice(-4))} placeholder="es. 6587" maxLength={4} style={{fontFamily:'var(--font-mono)'}}/>
                </FormRow>
              ) : (
                <FormRow label="Ultime 4 cifre IBAN">
                  <Input value={ef.iban4} onChange={e=>setEf('iban4',e.target.value.slice(-4))} placeholder="es. 3456" maxLength={4} style={{fontFamily:'var(--font-mono)'}}/>
                </FormRow>
              )}
            </div>
            {isCarta && (<>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <FormRow label="Conto collegato">
                  <select className="form-select" value={ef.parentId} onChange={e=>setEf('parentId',e.target.value)}>
                    <option value="">— nessuno —</option>
                    {conti.map(c=><option key={c.id} value={c.id}>{c.name}{c.iban4?` ····${c.iban4}`:''}</option>)}
                  </select>
                </FormRow>
                <FormRow label="Membro famiglia">
                  <select className="form-select" value={ef.memberId} onChange={e=>setEf('memberId',e.target.value)}>
                    <option value="">— non assegnata —</option>
                    {allMembers.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </FormRow>
              </div>
              <FormRow label="Circuito">
                <select className="form-select" value={ef.circuito} onChange={e=>setEf('circuito',e.target.value)}>
                  <option value="">— nessuno —</option>
                  {['Visa','Mastercard','Amex','Maestro','Bancomat','Prepagata','Altro'].map(c=><option key={c}>{c}</option>)}
                </select>
              </FormRow>
            </>)}
            <FormRow label="Tipo">
              <select className="form-select" value={ef.type} onChange={e=>setEf('type',e.target.value)}>
                <option value="conto">Conto Corrente</option>
                <option value="carta_credito">Carta Credito</option>
                <option value="carta_debito">Carta Debito</option>
              </select>
            </FormRow>
            <ModalFooter>
              <button className="btn btn-primary" onClick={saveEdit}>Salva</button>
              <button className="btn btn-secondary" onClick={()=>setEditingId(null)}>Annulla</button>
            </ModalFooter>
          </Modal>
        )
      })()}

      {/* ── Famiglia ── */}
      <FamilySection user={user}/>

      {/* Export */}
      <div style={{fontSize:14,fontWeight:700,marginBottom:12}}>📤 Esporta Dati</div>
      <div className="card" style={{padding:"16px 18px"}}>
        <div style={{fontSize:13,color:"var(--text3)",marginBottom:12}}>
          {transactions.length} transazioni disponibili
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <button className="btn btn-secondary" onClick={()=>exportTransactionsCSV(transactions)}>
            <Download size={13}/> Tutte le transazioni (.csv)
          </button>
          <button className="btn btn-secondary" onClick={()=>exportSummaryCSV(transactions)}>
            <Download size={13}/> Riepilogo per categoria (.csv)
          </button>
          <button className="btn btn-secondary" onClick={()=>exportVacanzeBackupJSON(appPrefs)}>
            <Download size={13}/> Backup vacanze e weekend (.json)
          </button>
        </div>
        <div style={{fontSize:11,color:"var(--text3)",marginTop:10,lineHeight:1.5}}>
          Il backup vacanze salva sul tuo computer una copia di tutte le vacanze/weekend
          dichiarati e dei giorni esclusi. Consigliato dopo grosse sessioni di modifica manuale.
        </div>
      </div>


      {/* ── Zona Pericolosa ── */}
      <div style={{fontSize:14,fontWeight:700,marginBottom:12,marginTop:8,color:'var(--red)'}}>⚠️ Zona Pericolosa</div>
      <div className="card" style={{padding:'16px 18px',border:'1px solid var(--red)',borderRadius:'var(--radius)'}}>
        <div style={{fontSize:13,color:'var(--text2)',marginBottom:4,fontWeight:600}}>Cancella tutte le transazioni</div>
        <div style={{fontSize:12,color:'var(--text3)',marginBottom:12,lineHeight:1.5}}>
          Elimina permanentemente tutte le transazioni dal database. L'operazione è irreversibile.
          Richiede la conferma del PIN due volte di seguito.
        </div>
        <DeleteAllTransactionsButton/>
      </div>

      {showAdd && (() => {
        const conti = userAccounts.filter(a=>a.type==='conto')
        const family = appPrefs.family || []
        const ownerMember = { id:'owner', name: user?.displayName?.split(' ')[0]||'Admin' }
        const allMembers  = [ownerMember, ...family]
        const isCarta = addType==='carta_credito'||addType==='carta_debito'
        const title = addType==='carta_credito'?'+ Carta di Credito':addType==='carta_debito'?'+ Carta di Debito':'+ Conto Corrente'
        return (
        <Modal title={title} onClose={()=>setShowAdd(false)}>
          <FormRow label="Nome">
            <Input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}
              placeholder={isCarta?"es. Visa Platinum, Mastercard Gold":"es. Conto Corrente UniCredit"}/>
          </FormRow>

          {isCarta ? (<>
            {/* Carta: istituto, ultimi 4 cifre, conto collegato, membro */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <FormRow label="Istituto">
                <Input value={form.bank} onChange={e=>setForm(f=>({...f,bank:e.target.value}))} placeholder="es. UniCredit"/>
              </FormRow>
              <FormRow label="Ultime 4 cifre carta">
                <Input value={form.card4} onChange={e=>setForm(f=>({...f,card4:e.target.value.slice(-4)}))} placeholder="es. 6587" maxLength={4} style={{fontFamily:'var(--font-mono)'}}/>
              </FormRow>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <FormRow label="Conto collegato">
                <select className="form-select" value={form.parentId} onChange={e=>setForm(f=>({...f,parentId:e.target.value}))}>
                  <option value="">— nessuno —</option>
                  {conti.map(c=><option key={c.id} value={c.id}>{c.name}{c.iban4?` ····${c.iban4}`:''}{c.bank?` (${c.bank})`:''}</option>)}
                </select>
              </FormRow>
              <FormRow label="Membro famiglia">
                <select className="form-select" value={form.memberId} onChange={e=>setForm(f=>({...f,memberId:e.target.value}))}>
                  <option value="">— non assegnata —</option>
                  {allMembers.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </FormRow>
            </div>
            <FormRow label="Circuito">
              <select className="form-select" value={form.circuito} onChange={e=>setForm(f=>({...f,circuito:e.target.value}))}>
                <option value="">— nessuno —</option>
                {['Visa','Mastercard','Amex','Maestro','Bancomat','Prepagata','Altro'].map(c=><option key={c}>{c}</option>)}
              </select>
            </FormRow>
          </>) : (<>
            {/* Conto: istituto + ultimi 4 IBAN */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <FormRow label="Istituto">
                <Input value={form.bank} onChange={e=>setForm(f=>({...f,bank:e.target.value}))} placeholder="es. UniCredit, Fineco"/>
              </FormRow>
              <FormRow label="Ultime 4 cifre IBAN">
                <Input value={form.iban4} onChange={e=>setForm(f=>({...f,iban4:e.target.value.slice(-4)}))} placeholder="es. 3456" maxLength={4} style={{fontFamily:'var(--font-mono)'}}/>
              </FormRow>
            </div>
          </>)}

          <ModalFooter>
            <button className="btn btn-primary" onClick={addAccount} disabled={!form.name}>Aggiungi</button>
            <button className="btn btn-secondary" onClick={()=>setShowAdd(false)}>Annulla</button>
          </ModalFooter>
        </Modal>
        )
      })()}
    </div>
  )
}

// ── Saldo Iniziale box ────────────────────────────────────
function SaldoInizialeBox() {
  const { appPrefs, setAppPref } = useStore()
  const [val, setVal] = useState(() => String(appPrefs?.saldoIniziale ?? 0))
  const [saved, setSaved] = useState(false)

  function save() {
    const n = parseFloat(val.replace(',', '.')) || 0
    setAppPref('saldoIniziale', n)
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div style={{ marginTop: 32, padding: '20px 24px', background: 'var(--surface2)', borderRadius: 12, maxWidth: 480 }}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>💰 Saldo Iniziale (Tappo)</div>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>
        Importo di partenza del conto corrente prima della prima transazione importata.
        Viene iniettato automaticamente come primo punto del grafico Andamento Saldo,
        datato 1 giorno prima della transazione più vecchia in archivio.
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: 'var(--text3)' }}>€</span>
        <input
          type="number"
          value={val}
          onChange={e => { setVal(e.target.value); setSaved(false) }}
          onKeyDown={e => e.key === 'Enter' && save()}
          style={{ width: 160, padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)',
            background: 'var(--surface)', fontSize: 14, fontFamily: 'var(--font-mono)' }}
        />
        <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={save}>
          {saved ? '✓ Salvato' : 'Salva'}
        </button>
      </div>
    </div>
  )
}

function CategoriesTab() {
  const { customCats, setCustomCats } = useStore()
  const transactions = useStore(s => s.transactions)
  const updateTransaction = useStore(s => s.updateTransaction)
  const [selCat, setSelCat] = useState(CAT_NAMES[0])
  const [showAddCat, setShowAddCat] = useState(false)
  const [showAddSub, setShowAddSub] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [newCatForm, setNewCatForm] = useState({name:'',color:'#c8622a',subs:''})
  const [newSub, setNewSub] = useState('')
  const [newSubEmoji, setNewSubEmoji] = useState('')
  const [editingEmojiFor, setEditingEmojiFor] = useState(null) // sub name being emoji-edited
  const [emojiDraft, setEmojiDraft] = useState('')

  // Merge base CATS with customCats (preserves base subs + appends custom ones)
  const allCats = getMergedCats(customCats)
  const allCatNames = [...CAT_NAMES, ...Object.keys(customCats).filter(k=>!CAT_NAMES.includes(k))]
  const cat = allCats[selCat]

  // Orphaned subcategories: transactions with cat2 not in allCats[cat1].sub
  const orphanList = useMemo(() => {
    const orphaned = {}
    transactions.filter(t => !t.excluded && t.cat1 && t.cat2).forEach(t => {
      const subs = allCats[t.cat1]?.sub || []
      if (!subs.includes(t.cat2)) {
        const key = `${t.cat1}›${t.cat2}`
        if (!orphaned[key]) orphaned[key] = { cat1: t.cat1, cat2: t.cat2, count: 0 }
        orphaned[key].count++
      }
    })
    return Object.values(orphaned)
  }, [transactions, allCats])

  function saveCustomCat() {
    if (!newCatForm.name.trim()) return
    const subs = newCatForm.subs.split(',').map(s=>s.trim()).filter(Boolean)
    const updated = {...customCats, [newCatForm.name]: {color:newCatForm.color, sub:subs, custom:true}}
    setCustomCats(updated)
    setSelCat(newCatForm.name)
    setShowAddCat(false)
    setNewCatForm({name:'',color:'#c8622a',subs:''})
  }

  function addSubToCurrent() {
    if (!newSub.trim()) return
    const existing = allCats[selCat] || {color:'#888',sub:[]}
    const existingCustom = customCats[selCat] || {}
    const subEmojis = { ...(existingCustom.subEmojis || existing.subEmojis || {}) }
    if (newSubEmoji.trim()) subEmojis[newSub.trim()] = newSubEmoji.trim()
    const updated = {
      ...customCats,
      [selCat]: { ...existing, ...existingCustom, sub:[...existing.sub, newSub.trim()], subEmojis, custom:true }
    }
    setCustomCats(updated)
    setNewSub('')
    setNewSubEmoji('')
    setShowAddSub(false)
  }

  function saveSubEmoji(sub, emoji) {
    const existing = allCats[selCat] || {color:'#888',sub:[]}
    const existingCustom = customCats[selCat] || {}
    const subEmojis = { ...(existingCustom.subEmojis || existing.subEmojis || {}), [sub]: emoji.trim() }
    if (!emoji.trim()) delete subEmojis[sub]
    setCustomCats({ ...customCats, [selCat]: { ...existing, ...existingCustom, subEmojis, custom:true } })
    setEditingEmojiFor(null)
    setEmojiDraft('')
  }

  function removeSubFromCurrent(sub) {
    const existing = allCats[selCat] || {color:'#888',sub:[]}
    const updated = {...customCats, [selCat]: {...existing, sub:existing.sub.filter(s=>s!==sub), custom:true}}
    setCustomCats(updated)
  }

  function deleteCat(name) {
    if (!customCats[name]) { alert('Non puoi eliminare le categorie di sistema'); return }
    if (!confirm(`Eliminare "${name}"? Le transazioni non vengono modificate.`)) return
    const updated = {...customCats}
    delete updated[name]
    setCustomCats(updated)
    setSelCat(CAT_NAMES[0])
  }

  function updateColor(color) {
    const existing = allCats[selCat] || {sub:[]}
    setCustomCats({...customCats, [selCat]: {...existing, color, custom:true}})
  }

  return (
    <div style={{display:"grid",gridTemplateColumns:"220px 1fr",gap:16}}>
      {/* Left: category list */}
      <div>
        <div className="card" style={{padding:"8px",marginBottom:10}}>
          {allCatNames.map(name=>(
            <button key={name} onClick={()=>setSelCat(name)} style={{
              display:"flex",alignItems:"center",gap:8,width:"100%",padding:"8px 10px",
              border:"none",background:selCat===name?"var(--accent-l)":"none",
              borderRadius:"var(--radius-sm)",cursor:"pointer",fontFamily:"var(--font-sans)",
              fontSize:13,fontWeight:selCat===name?700:500,
              color:selCat===name?"var(--accent)":"var(--text2)",textAlign:"left",
            }}>
              <span style={{width:8,height:8,borderRadius:"50%",background:allCats[name]?.color,display:"inline-block",flexShrink:0}}/>
              <span style={{flex:1}}>{name}</span>
              {customCats[name] && <span style={{fontSize:9,padding:"1px 5px",background:"var(--blue-l)",color:"var(--blue)",borderRadius:8,fontWeight:700}}>CUSTOM</span>}
            </button>
          ))}
        </div>
        <button className="btn btn-secondary" style={{width:"100%",fontSize:12,justifyContent:"center"}} onClick={()=>setShowAddCat(true)}>
          <Plus size={12}/> Nuova categoria
        </button>
      </div>

      {/* Right: category detail */}
      <div className="card" style={{padding:"18px 20px"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
          <input type="color" value={cat?.color||'#888'} onChange={e=>updateColor(e.target.value)}
            style={{width:28,height:28,borderRadius:6,border:"1px solid var(--border)",cursor:"pointer",padding:2}}/>
          <div style={{fontSize:16,fontWeight:700,flex:1}}>{selCat}</div>
          {customCats[selCat] && (
            <button className="btn btn-ghost" style={{color:"var(--red)",fontSize:12}} onClick={()=>deleteCat(selCat)}>
              <Trash2 size={12}/> Elimina
            </button>
          )}
        </div>

        <div style={{fontSize:11,fontWeight:700,letterSpacing:".07em",textTransform:"uppercase",color:"var(--text3)",marginBottom:8}}>
          Sottocategorie
        </div>

        <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12}}>
          {(cat?.sub||[]).map(s=>{
            const emoji = cat?.subEmojis?.[s] || ''
            const isEditingEmoji = editingEmojiFor === s
            return (
              <span key={s} style={{
                display:"inline-flex",alignItems:"center",gap:4,
                padding:"4px 10px",borderRadius:20,fontSize:12,fontWeight:600,
                background:`${cat.color}18`,color:"var(--text2)",border:`1px solid ${cat.color}33`
              }}>
                {isEditingEmoji ? (
                  <>
                    <input
                      autoFocus
                      value={emojiDraft}
                      onChange={e=>setEmojiDraft(e.target.value)}
                      onKeyDown={e=>{
                        if(e.key==='Enter') saveSubEmoji(s, emojiDraft)
                        if(e.key==='Escape'){setEditingEmojiFor(null);setEmojiDraft('')}
                      }}
                      placeholder="emoji"
                      style={{width:36,fontSize:16,border:'1px solid var(--accent)',borderRadius:6,
                        padding:'1px 4px',textAlign:'center',background:'var(--bg)',outline:'none'}}
                    />
                    <button onClick={()=>saveSubEmoji(s, emojiDraft)}
                      style={{background:'none',border:'none',cursor:'pointer',color:'var(--green)',fontSize:12,padding:0}}>✓</button>
                    <button onClick={()=>{setEditingEmojiFor(null);setEmojiDraft('')}}
                      style={{background:'none',border:'none',cursor:'pointer',color:'var(--text3)',fontSize:12,padding:0}}>✕</button>
                  </>
                ) : (
                  <>
                    <span
                      title="Clicca per modificare emoji"
                      onClick={()=>{setEditingEmojiFor(s);setEmojiDraft(emoji)}}
                      style={{cursor:'pointer',fontSize:14,minWidth:18,textAlign:'center',
                        opacity:emoji?1:.35, userSelect:'none'}}
                    >{emoji || '＋'}</span>
                    <span>{s}</span>
                    <button onClick={()=>removeSubFromCurrent(s)} style={{
                      background:"none",border:"none",cursor:"pointer",color:"var(--text3)",
                      fontSize:12,lineHeight:1,padding:0,display:"flex",alignItems:"center"
                    }}>×</button>
                  </>
                )}
              </span>
            )
          })}
          <button className="btn btn-ghost" style={{fontSize:11,padding:"3px 8px"}} onClick={()=>setShowAddSub(true)}>
            + Aggiungi
          </button>
        </div>

        {showAddSub && (
          <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:12}}>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,flexShrink:0}}>
                <span style={{fontSize:10,color:"var(--text3)",fontWeight:600,letterSpacing:".04em"}}>EMOJI</span>
                <input
                  autoFocus
                  value={newSubEmoji}
                  onChange={e=>setNewSubEmoji(e.target.value)}
                  placeholder="＋"
                  title="Inserisci un'emoji. Su Mac: ⌘+Ctrl+Spazio. Su Windows: Win+."
                  maxLength={2}
                  style={{width:46,fontSize:20,textAlign:'center',padding:'5px 4px',borderRadius:8,
                    border:'2px solid var(--accent)',background:'var(--bg)',cursor:'text',flexShrink:0}}
                />
              </div>
              <div style={{display:"flex",flexDirection:"column",flex:1,gap:2}}>
                <span style={{fontSize:10,color:"var(--text3)",fontWeight:600,letterSpacing:".04em"}}>NOME</span>
                <input className="form-inp" value={newSub} onChange={e=>setNewSub(e.target.value)}
                  placeholder="Nome sottocategoria"
                  onKeyDown={e=>e.key==='Enter'&&addSubToCurrent()}/>
              </div>
              <div style={{display:"flex",gap:4,alignItems:"flex-end",paddingBottom:1}}>
                <button className="btn btn-primary" style={{fontSize:12}} onClick={addSubToCurrent}>Aggiungi</button>
                <button className="btn btn-ghost" style={{fontSize:12}} onClick={()=>{setShowAddSub(false);setNewSubEmoji('');setNewSub('')}}>✕</button>
              </div>
            </div>
            <div style={{fontSize:11,color:"var(--text3)"}}>
              💡 Mac: <kbd style={{fontSize:10,padding:"1px 5px",borderRadius:4,border:"1px solid var(--border)",background:"var(--surface2)"}}>⌘ Ctrl Space</kbd>&nbsp;&nbsp;
              Windows: <kbd style={{fontSize:10,padding:"1px 5px",borderRadius:4,border:"1px solid var(--border)",background:"var(--surface2)"}}>Win .</kbd>
            </div>
          </div>
        )}

        <div style={{padding:"10px 14px",background:"var(--surface2)",borderRadius:"var(--radius-sm)",fontSize:12,color:"var(--text3)"}}>
          💡 Le modifiche alle categorie vengono applicate alle nuove categorizzazioni. Le transazioni esistenti non vengono modificate automaticamente.
        </div>
      </div>

      {showAddCat && (
        <Modal title="+ Nuova Categoria" onClose={()=>setShowAddCat(false)}>
          <FormRow label="Nome categoria">
            <Input value={newCatForm.name} onChange={e=>setNewCatForm(f=>({...f,name:e.target.value}))} placeholder="es. Istruzione"/>
          </FormRow>
          <FormRow label="Colore">
            <input type="color" value={newCatForm.color} onChange={e=>setNewCatForm(f=>({...f,color:e.target.value}))}
              style={{width:"100%",height:38,borderRadius:"var(--radius-sm)",border:"1px solid var(--border)",cursor:"pointer",padding:4}}/>
          </FormRow>
          <FormRow label="Sottocategorie (separate da virgola)">
            <Input value={newCatForm.subs} onChange={e=>setNewCatForm(f=>({...f,subs:e.target.value}))} placeholder="es. Libri, Corsi, Università"/>
          </FormRow>
          <ModalFooter>
            <button className="btn btn-primary" onClick={saveCustomCat}>Crea</button>
            <button className="btn btn-secondary" onClick={()=>setShowAddCat(false)}>Annulla</button>
          </ModalFooter>
        </Modal>
      )}

      {/* Orphaned subcategories */}
      {orphanList.length > 0 && (
        <div style={{marginTop:16,padding:'14px 16px',background:'#fff8f0',border:'1px solid #f59e0b',borderRadius:10,gridColumn:'1 / -1'}}>
          <div style={{fontSize:13,fontWeight:700,color:'#92400e',marginBottom:8}}>
            ⚠️ Sottocategorie rimosse con transazioni esistenti
          </div>
          {orphanList.map(({cat1,cat2,count})=>(
            <div key={`${cat1}-${cat2}`} style={{display:'flex',alignItems:'center',gap:8,marginBottom:6,flexWrap:'wrap'}}>
              <span style={{fontSize:12,color:'var(--text2)',fontWeight:600}}>{cat1} › {cat2}</span>
              <span style={{fontSize:11,color:'var(--text3)'}}>({count} transazioni)</span>
              <button
                onClick={()=>{
                  if(confirm(`Rimuovere la subcategoria "${cat2}" da tutte le ${count} transazioni ${cat1}?`)) {
                    // Una sola voce Undo per l'operazione di massa (fix 2026-07-12)
                    useStore.getState().beginTxUndoBatch?.()
                    transactions
                      .filter(t=>t.cat1===cat1&&t.cat2===cat2)
                      .forEach(t=>updateTransaction(t.txId,{cat2:''}))
                    useStore.getState().commitTxUndoBatch?.(`Rimozione L2 "${cat2}" da ${count} tx`)
                  }
                }}
                style={{fontSize:11,padding:'2px 10px',borderRadius:6,border:'1px solid var(--red)',
                  background:'transparent',color:'var(--red)',cursor:'pointer',fontFamily:'var(--font-sans)'}}>
                Rimuovi da tutte
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}




// ── ExcludedTab ───────────────────────────────────────────
// Formatta il timestamp ISO di esclusione (excludedAt) in "DD MMM AA, HH:MM" —
// dato mancante (esclusioni fatte prima di questo fix, 2026-07-11) mostra "—"
const _EXCL_MONTHS = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']
function fmtExcludedAt(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  const hh = String(d.getHours()).padStart(2,'0')
  const mm = String(d.getMinutes()).padStart(2,'0')
  return `${String(d.getDate()).padStart(2,'0')} ${_EXCL_MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}, ${hh}:${mm}`
}

function ExcludedTab() {
  const { transactions, updateTransaction } = useStore()
  const excluded = transactions.filter(t => t.excluded)
  return (
    <div>
      <div style={{fontSize:13,color:'var(--text3)',marginBottom:16,lineHeight:1.5}}>
        Transazioni escluse dai report e dalle spese. Clicca ↩ per ripristinare.
        {' '}<span style={{color:'var(--text3)',opacity:.7}}>Le colonne Escluso il/Da chi/Tipo sono disponibili solo per le esclusioni fatte dopo l'11 luglio 2026 — quelle precedenti mostrano "—".</span>
      </div>
      {excluded.length === 0 ? (
        <div style={{textAlign:'center',padding:'40px 24px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--radius)',color:'var(--text3)'}}>
          <div style={{fontSize:32,marginBottom:10}}>⊘</div>
          <div style={{fontWeight:700,marginBottom:6}}>Nessuna transazione esclusa</div>
        </div>
      ) : (
        <div className="card" style={{padding:0,overflow:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',minWidth:1180}}>
            <thead><tr>
              {['Data','Descrizione','Importo','Categoria','Escluso il','Da chi','Tipo',''].map(h=>(
                <th key={h} style={{padding:'9px 14px',fontSize:11,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',color:'var(--text3)',background:'var(--surface2)',borderBottom:'1px solid var(--border)',textAlign:h==='Importo'?'right':'left',whiteSpace:'nowrap',minWidth:h===''?120:undefined}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {excluded.map(t=>(
                <tr key={t.txId} style={{borderBottom:'1px solid var(--border)',opacity:.7}}>
                  <td style={{padding:'9px 14px',fontSize:12,color:'var(--text3)',whiteSpace:'nowrap'}}>{fmtDate(t._effDate||t.date)}</td>
                  <td style={{padding:'9px 14px',fontSize:13}}>{t.descAI||(t.description||'').slice(0,45)}</td>
                  <td style={{padding:'9px 14px',fontSize:13,fontFamily:'var(--font-mono)',textAlign:'right',color:'var(--text3)',whiteSpace:'nowrap'}}>€ {fmtIT(Math.abs(t.amount), 2)}</td>
                  <td style={{padding:'9px 14px',fontSize:12,color:'var(--text3)'}}>{t.cat1||'—'}</td>
                  <td style={{padding:'9px 14px',fontSize:11,color:'var(--text3)',fontFamily:'var(--font-mono)',whiteSpace:'nowrap'}}>{fmtExcludedAt(t.excludedAt)}</td>
                  <td style={{padding:'9px 14px',fontSize:12,color:'var(--text3)',whiteSpace:'nowrap'}}>{t.excludedBy || '—'}</td>
                  <td style={{padding:'9px 14px',fontSize:11,whiteSpace:'nowrap'}} title={t.excludedReason || ''}>
                    {t.excludedType === 'manual'
                      ? <span style={{padding:'2px 7px',borderRadius:4,background:'var(--accent-l)',color:'var(--accent)',fontWeight:700}}>👤 Manuale</span>
                      : t.excludedType === 'automatic'
                        ? <span style={{padding:'2px 7px',borderRadius:4,background:'var(--gold-l)',color:'var(--gold)',fontWeight:700}}>⚙️ {t.excludedReason || 'Automatica'}</span>
                        : <span style={{color:'var(--text3)'}}>—</span>}
                  </td>
                  <td style={{padding:'6px 14px',whiteSpace:'nowrap',minWidth:120}}>
                    <button className="btn btn-ghost" style={{fontSize:12,whiteSpace:'nowrap'}} title="Ripristina"
                      onClick={()=>updateTransaction(t.txId,{excluded:false})}>↩ Ripristina</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── DeletedTxTab ──────────────────────────────────────────
// Storico transazioni eliminate (richiesta utente 2026-07-15): deleteTransaction
// (useStore.js) ora salva una copia completa di ogni tx cancellata in
// appPrefs.deletedTxLog (capped alle ultime 300) prima di rimuoverla — questa
// tab la mostra con un bottone "↩ Ripristina" che richiama restoreDeletedTransaction
// (re-inserisce la tx via addTransactions e la toglie dal log). Copre solo le
// cancellazioni fatte DOPO l'introduzione di questo log (2026-07-15) — quelle
// precedenti non sono recuperabili, non essendo mai state registrate.
function DeletedTxTab() {
  const appPrefs = useStore(s => s.appPrefs)
  const restoreDeletedTransaction = useStore(s => s.restoreDeletedTransaction)
  const log = [...(appPrefs?.deletedTxLog || [])].sort((a,b)=>(b.deletedAt||'').localeCompare(a.deletedAt||''))
  return (
    <div>
      <div style={{fontSize:13,color:'var(--text3)',marginBottom:16,lineHeight:1.5}}>
        Transazioni eliminate. Clicca ↩ per ripristinarle. Copre solo le cancellazioni fatte dopo il 15 luglio 2026.
      </div>
      {log.length === 0 ? (
        <div style={{textAlign:'center',padding:'40px 24px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--radius)',color:'var(--text3)'}}>
          <div style={{fontSize:32,marginBottom:10}}>🗑</div>
          <div style={{fontWeight:700,marginBottom:6}}>Nessuna transazione eliminata di recente</div>
        </div>
      ) : (
        <div className="card" style={{padding:0,overflow:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',minWidth:1050}}>
            <thead><tr>
              {['Data','Descrizione','Importo','Categoria','Eliminata il','Da chi',''].map(h=>(
                <th key={h} style={{padding:'9px 14px',fontSize:11,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',color:'var(--text3)',background:'var(--surface2)',borderBottom:'1px solid var(--border)',textAlign:h==='Importo'?'right':'left',whiteSpace:'nowrap',minWidth:h===''?120:undefined}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {log.map(t=>(
                <tr key={t.txId} style={{borderBottom:'1px solid var(--border)',opacity:.7}}>
                  <td style={{padding:'9px 14px',fontSize:12,color:'var(--text3)',whiteSpace:'nowrap'}}>{fmtDate(t._effDate||t.date)}</td>
                  <td style={{padding:'9px 14px',fontSize:13}}>{t.descAI||(t.description||'').slice(0,45)}</td>
                  <td style={{padding:'9px 14px',fontSize:13,fontFamily:'var(--font-mono)',textAlign:'right',color:'var(--text3)',whiteSpace:'nowrap'}}>€ {fmtIT(Math.abs(t.amount), 2)}</td>
                  <td style={{padding:'9px 14px',fontSize:12,color:'var(--text3)'}}>{t.cat1||'—'}</td>
                  <td style={{padding:'9px 14px',fontSize:11,color:'var(--text3)',fontFamily:'var(--font-mono)',whiteSpace:'nowrap'}}>{fmtExcludedAt(t.deletedAt)}</td>
                  <td style={{padding:'9px 14px',fontSize:12,color:'var(--text3)',whiteSpace:'nowrap'}}>{t.deletedBy || '—'}</td>
                  <td style={{padding:'6px 14px',whiteSpace:'nowrap',minWidth:120}}>
                    <button className="btn btn-ghost" style={{fontSize:12,whiteSpace:'nowrap'}} title="Ripristina"
                      onClick={()=>restoreDeletedTransaction(t.txId)}>↩ Ripristina</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── CashCatsTab ───────────────────────────────────────────
function CashCatsTab() {
  const { customCats } = useStore()
  const appPrefs   = useStore(s => s.appPrefs)
  const setAppPref = useStore(s => s.setAppPref)
  const [cashCats, setCashCats] = useState(() => appPrefs.cashCats || ['Figli','Casa'])
  useEffect(() => { setCashCats(appPrefs.cashCats || ['Figli','Casa']) }, [appPrefs.cashCats])

  function toggle(cat) {
    const next = cashCats.includes(cat)
      ? cashCats.filter(c=>c!==cat)
      : [...cashCats, cat]
    setCashCats(next)
    setAppPref('cashCats', next)
  }

  return (
    <div>
      <div style={{fontSize:13,color:'var(--text3)',marginBottom:16,lineHeight:1.5}}>
        Seleziona le categorie che vengono pagate abitualmente in contanti.
        Queste categorie vengono usate nella riconciliazione ATM per Nanny, Colf e Veicoli.
      </div>
      <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
        {Object.keys(getMergedCats(customCats)).filter(n=>n!=='Entrate').map(cat=>{
          const color = getMergedCats(customCats)[cat]?.color||'#888'
          const active = cashCats.includes(cat)
          return (
            <button key={cat} onClick={()=>toggle(cat)} style={{
              padding:'7px 16px',borderRadius:20,cursor:'pointer',fontFamily:'var(--font-sans)',
              border:`1.5px solid ${active?color:color+'44'}`,
              background:active?color+'18':'var(--surface)',
              color:active?color:'var(--text3)',
              fontSize:13,fontWeight:600,transition:'all .12s',
              display:'flex',alignItems:'center',gap:6,
            }}>
              <span style={{width:8,height:8,borderRadius:'50%',background:color}}/>
              {cat}
              {active && <span style={{marginLeft:2,fontSize:14}}>✓</span>}
            </button>
          )
        })}
      </div>
      <div style={{marginTop:16,padding:'10px 14px',background:'var(--blue-l)',borderRadius:'var(--radius-sm)',fontSize:12,color:'var(--blue)'}}>
        ℹ️ Precompilate: <strong>Figli</strong> (Nanny), <strong>Casa</strong> (Colf). Puoi aggiungerne altre.
      </div>
    </div>
  )
}

// ── NotificationsTab ──────────────────────────────────────
function NotificationsTab() {
  const appPrefs   = useStore(s => s.appPrefs)
  const setAppPref = useStore(s => s.setAppPref)
  const [prefs, setPrefs] = useState(() => appPrefs.notifPrefs || {})
  useEffect(() => { setPrefs(appPrefs.notifPrefs || {}) }, [appPrefs.notifPrefs])

  function toggle(key) {
    const next = {...prefs, [key]: prefs[key]===false ? true : false}
    setPrefs(next)
    setAppPref('notifPrefs', next)
  }

  const isOn = key => prefs[key] !== false  // default ON

  const notifs = [
    { key:'new_merchant',    label:'Nuovo merchant rilevato',         desc:'Quando viene identificato un merchant mai visto prima' },
    { key:'recurring',       label:'Pagamento ricorrente',            desc:'Quando viene rilevato un abbonamento o pagamento ricorrente' },
    { key:'ai_cat',          label:'Auto-categorizzazione AI',        desc:'Quando l\'AI categorizza automaticamente transazioni' },
    { key:'anomalia',        label:'Spesa anomala',                   desc:'Quando una spesa supera del 50% la media della categoria' },
    { key:'scadenze_7',      label:'Scadenze entro 7 giorni',         desc:'Promemoria per pagamenti imminenti' },
    { key:'scadenze_30',     label:'Scadenze entro 30 giorni',        desc:'Avviso anticipo scadenze prossime' },
    { key:'report_mensile',  label:'Report mensile via email',        desc:'Riepilogo mensile inviato all\'email del profilo (non ancora attivo)' },
  ]

  return (
    <div>
      <div style={{fontSize:13,color:'var(--text3)',marginBottom:20,lineHeight:1.5}}>
        Gestisci le notifiche dell'app. Le notifiche in-app richiedono il permesso del browser.
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:0}}>
        {notifs.map((n,i)=>(
          <div key={n.key} style={{
            display:'flex',alignItems:'center',justifyContent:'space-between',
            padding:'14px 18px',borderBottom:i<notifs.length-1?'1px solid var(--border)':'none',
            background:'var(--surface)',
            borderRadius:i===0?'var(--radius) var(--radius) 0 0':i===notifs.length-1?'0 0 var(--radius) var(--radius)':'none',
            border:'1px solid var(--border)',
            marginTop:i===0?0:-1,
          }}>
            <div>
              <div style={{fontSize:13,fontWeight:600}}>{n.label}</div>
              <div style={{fontSize:12,color:'var(--text3)',marginTop:2}}>{n.desc}</div>
            </div>
            <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',flexShrink:0,marginLeft:16}}>
              <span style={{fontSize:12,color:isOn(n.key)?'var(--green)':'var(--text3)',fontWeight:600}}>
                {isOn(n.key)?'ON':'OFF'}
              </span>
              <div style={{
                width:44,height:24,borderRadius:12,
                background:isOn(n.key)?'var(--green)':'var(--border)',
                position:'relative',cursor:'pointer',transition:'background .2s',
              }} onClick={()=>toggle(n.key)}>
                <div style={{
                  width:18,height:18,borderRadius:'50%',background:'#fff',
                  position:'absolute',top:3,
                  left:isOn(n.key)?22:4,
                  transition:'left .2s',
                  boxShadow:'0 1px 4px rgba(0,0,0,.2)',
                }}/>
              </div>
            </label>
          </div>
        ))}
      </div>
    </div>
  )
}


// ── DangerZoneTab ─────────────────────────────────────────
function DangerZoneTab() {
  const { deleteAllTransactions, transactions, migrateTxIds } = useStore()
  const [pin,        setPin]        = useState('')
  const [step,       setStep]       = useState('idle') // idle | deleting | done
  const [deletedCount, setDeletedCount] = useState(0)
  const [error,      setError]      = useState('')
  const [migrStep,   setMigrStep]   = useState('idle') // idle | running | done
  const [migrDone,   setMigrDone]   = useState(0)
  const [migrTotal,  setMigrTotal]  = useState(0)
  const [migrResult, setMigrResult] = useState(null)
  const [cacheStep,  setCacheStep]  = useState('idle') // idle | clearing | done
  const [cacheCount, setCacheCount] = useState(0)
  const [showForceBalance, setShowForceBalance] = useState(false)
  const CONFIRM_PIN = '182218'

  // Saldo attuale — stesso calcolo di PatrimonioPage/TransactionsPage (escluse non contano,
  // tranne il tappo di saldo forzato stesso, che va sempre incluso)
  const currentSaldo  = transactions.filter(t => !t.excluded || t._forcedBalance).reduce((s,t)=>s+(t.amount||0),0)
  const forcedEntries = transactions.filter(t => t._forcedBalance)

  async function handleDelete() {
    if (pin !== CONFIRM_PIN) { setError('Codice errato.'); return }
    setError('')
    const n = transactions.length
    setStep('deleting')
    await deleteAllTransactions()
    setDeletedCount(n)
    setStep('done')
    setPin('')
  }

  async function handleClearCache() {
    setCacheStep('clearing')
    try {
      const { clearPlacesCache } = await import('../services/placesCache')
      const n = await clearPlacesCache()
      setCacheCount(n)
      setCacheStep('done')
    } catch(e) {
      setCacheStep('idle')
      alert('Errore: ' + e.message)
    }
  }

  async function handleMigrate() {
    setMigrStep('running')
    setMigrDone(0)
    setMigrTotal(0)
    try {
      const changed = await migrateTxIds((done, total) => {
        setMigrDone(done)
        setMigrTotal(total)
      })
      setMigrResult(changed)
      setMigrStep('done')
    } catch(e) {
      setMigrStep('idle')
      alert('Errore migrazione: ' + e.message)
    }
  }

  return (
    // maxWidth rimosso (richiesta utente 2026-07-19: header/tab-bar largo ma corpo
    // stretto e diverso fra tab) — riempie l'intero wrapper esterno della pagina
    // (SettingsPage.jsx, maxWidth condiviso), come già fanno Profilo/Categorie.
    <div>

      {/* ── Migrazione codici TX ── */}
      <div style={{
        border:'1px solid var(--border)',borderRadius:'var(--radius)',
        padding:'20px 24px',marginBottom:24,
      }}>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
          <span style={{fontSize:20}}>🔢</span>
          <div>
            <div style={{fontSize:15,fontWeight:700}}>Migra codici transazione</div>
            <div style={{fontSize:12,color:'var(--text3)',marginTop:2}}>
              Riassegna i codici TX (es. 26-0001 → 22-0001) usando l'anno della transazione
              e l'ordine cronologico. Operazione sicura e reversibile.
            </div>
          </div>
        </div>
        <div style={{fontSize:12,color:'var(--text3)',marginBottom:12}}>
          Transazioni nel DB: <strong>{transactions.length.toLocaleString('it-IT')}</strong>
        </div>
        {migrStep === 'done' ? (
          <div style={{padding:'10px 14px',background:'var(--green-l)',borderRadius:'var(--radius-sm)',fontSize:13,color:'var(--green)',fontWeight:600}}>
            ✓ Migrazione completata — {migrResult} codici aggiornati su {transactions.length}
          </div>
        ) : migrStep === 'running' ? (
          <div style={{padding:'10px 14px',background:'rgba(var(--accent-rgb),0.1)',borderRadius:'var(--radius-sm)',fontSize:13,color:'var(--accent)'}}>
            ⏳ Migrazione in corso… {migrDone}/{migrTotal}
          </div>
        ) : (
          <button
            onClick={handleMigrate}
            style={{background:'var(--accent)',color:'#fff',border:'none',padding:'8px 18px',borderRadius:'var(--radius-sm)',fontSize:13,fontWeight:600,cursor:'pointer'}}
          >
            🔢 Avvia migrazione codici
          </button>
        )}
      </div>

      {/* ── Cache Places ── */}
      <div style={{border:'1px solid var(--border)',borderRadius:'var(--radius)',padding:'20px 24px',marginBottom:24}}>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
          <span style={{fontSize:20}}>🗺️</span>
          <div>
            <div style={{fontSize:15,fontWeight:700}}>Pulisci cache città / merchant</div>
            <div style={{fontSize:12,color:'var(--text3)',marginTop:2}}>
              Cancella la cache Google Places (memoria + Firestore). Le città impostate manualmente
              non vengono toccate — la cache verrà ricostruita al prossimo AI enrichment.
            </div>
          </div>
        </div>
        {cacheStep === 'done' ? (
          <div style={{padding:'10px 14px',background:'var(--green-l)',borderRadius:'var(--radius-sm)',fontSize:13,color:'var(--green)',fontWeight:600}}>
            ✓ Cache svuotata — {cacheCount} voci eliminate.
          </div>
        ) : cacheStep === 'clearing' ? (
          <div style={{padding:'10px 14px',background:'rgba(var(--accent-rgb),0.1)',borderRadius:'var(--radius-sm)',fontSize:13,color:'var(--accent)'}}>
            ⏳ Pulizia in corso…
          </div>
        ) : (
          <button
            onClick={handleClearCache}
            style={{background:'var(--surface2)',color:'var(--text)',border:'1px solid var(--border)',padding:'8px 18px',borderRadius:'var(--radius-sm)',fontSize:13,fontWeight:600,cursor:'pointer'}}
          >
            🗑️ Svuota cache Places
          </button>
        )}
      </div>

      {/* ── Saldo forzato ── */}
      <div style={{border:'1px solid var(--border)',borderRadius:'var(--radius)',padding:'20px 24px',marginBottom:24}}>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
          <span style={{fontSize:20}}>⚖️</span>
          <div>
            <div style={{fontSize:15,fontWeight:700}}>Saldo forzato</div>
            <div style={{fontSize:12,color:'var(--text3)',marginTop:2}}>
              Rettifica manuale del saldo conto (una singola transazione &quot;tappo&quot;, nascosta —
              non compare mai nella lista transazioni né altrove nell'app). Gestiscila solo da qui,
              protetta da PIN.
            </div>
          </div>
        </div>

        <div style={{fontSize:12,color:'var(--text3)',marginBottom:12}}>
          Saldo conto attuale: <strong style={{color:'var(--text)'}}>€ {fmtIT(currentSaldo,2)}</strong>
        </div>

        {forcedEntries.length > 0 ? (
          <div style={{marginBottom:14,display:'flex',flexDirection:'column',gap:6}}>
            {forcedEntries.map(t => (
              <div key={t.txId} style={{display:'flex',justifyContent:'space-between',alignItems:'center',
                padding:'10px 14px',background:'var(--gold-l)',borderRadius:'var(--radius-sm)',fontSize:13}}>
                <div>
                  <div style={{fontWeight:600}}>{t.description}</div>
                  <div style={{fontSize:11,color:'var(--text3)',marginTop:2}}>{fmtDate ? fmtDate(t.date) : t.date}</div>
                </div>
                <strong style={{color:t.amount>=0?'var(--green)':'var(--red)'}}>{t.amount>=0?'+':''}{fmtIT(t.amount,2)} €</strong>
              </div>
            ))}
          </div>
        ) : (
          <div style={{fontSize:12,color:'var(--text3)',marginBottom:14}}>Nessuna rettifica attiva — il saldo riflette esattamente le transazioni reali.</div>
        )}

        <button
          onClick={()=>setShowForceBalance(true)}
          style={{background:'var(--surface2)',color:'var(--text)',border:'1px solid var(--border)',padding:'8px 18px',borderRadius:'var(--radius-sm)',fontSize:13,fontWeight:600,cursor:'pointer'}}
        >
          ⚖️ {forcedEntries.length>0 ? 'Modifica / rimuovi rettifica' : 'Imposta saldo forzato'}
        </button>
        {showForceBalance && <ForcedBalanceModal currentSaldo={currentSaldo} onClose={()=>setShowForceBalance(false)}/>}
      </div>

      <div style={{
        border:'2px solid var(--red)',borderRadius:'var(--radius)',
        padding:'20px 24px',marginBottom:24,
      }}>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
          <span style={{fontSize:22}}>⚠️</span>
          <div>
            <div style={{fontSize:15,fontWeight:700,color:'var(--red)'}}>Elimina tutte le transazioni</div>
            <div style={{fontSize:12,color:'var(--text3)',marginTop:2}}>
              Cancella permanentemente tutte le {transactions.length.toLocaleString('it-IT')} transazioni dal database. Questa azione non è reversibile.<br/>
              <span style={{color:'var(--green)',fontWeight:600}}>✓ Preservati:</span> regole AI, città/merchant, accantonamenti Satispay, scadenze, veicoli, categorie, impostazioni.
            </div>
          </div>
        </div>

        {step === 'done' ? (
          <div style={{padding:'12px 16px',background:'var(--green-l)',borderRadius:'var(--radius-sm)',fontSize:13,color:'var(--green)',fontWeight:600}}>
            ✓ Completato — {deletedCount.toLocaleString('it-IT')} transazioni eliminate da Firestore.
          </div>
        ) : step === 'deleting' ? (
          <div style={{padding:'12px 16px',background:'var(--red-l)',borderRadius:'var(--radius-sm)',fontSize:13,color:'var(--red)'}}>
            ⏳ Eliminazione in corso… attendere.
          </div>
        ) : (
          <>
            <div style={{fontSize:13,color:'var(--text2)',marginBottom:10}}>
              Inserisci il tuo codice PIN per confermare:
            </div>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <input
                type="password"
                value={pin}
                onChange={e=>{ setPin(e.target.value); setError('') }}
                onKeyDown={e=>e.key==='Enter'&&handleDelete()}
                placeholder="Codice PIN"
                maxLength={6}
                style={{
                  padding:'9px 12px',border:`1px solid ${error?'var(--red)':'var(--border)'}`,
                  borderRadius:'var(--radius-sm)',fontSize:15,letterSpacing:'4px',
                  background:'var(--surface)',color:'var(--text)',outline:'none',
                  fontFamily:'var(--font-mono)',width:140,
                }}
                autoComplete="off"
              />
              <button
                className="btn"
                style={{
                  background:'var(--red)',color:'#fff',border:'none',
                  padding:'9px 18px',borderRadius:'var(--radius-sm)',
                  fontSize:13,fontWeight:700,cursor:'pointer',
                  opacity: pin.length === 6 ? 1 : 0.5,
                }}
                disabled={pin.length !== 6}
                onClick={handleDelete}
              >
                🗑 Elimina tutto
              </button>
            </div>
            {error && <div style={{fontSize:12,color:'var(--red)',marginTop:6}}>{error}</div>}
          </>
        )}
      </div>

      <div style={{fontSize:12,color:'var(--text3)',lineHeight:1.8,padding:'12px 16px',background:'var(--surface2)',borderRadius:'var(--radius-sm)'}}>
        <strong>Cosa viene eliminato:</strong> tutte le transazioni (collection <code>transactions</code> su Firestore).<br/>
        <strong>Cosa rimane intatto:</strong><br/>
        • 🤖 Regole AI (merchant, categorie, descrizioni)<br/>
        • 🗺️ Città e merchant salvati manualmente (city_overrides)<br/>
        • 💰 Accantonamenti Satispay e fondi<br/>
        • 📅 Scadenze, veicoli, nanny/colf<br/>
        • ⚙️ Tutte le impostazioni e preferenze<br/>
        Dopo l'eliminazione reimporta il CSV — l'AI enrichment riutilizzerà subito tutte le regole salvate.
      </div>
    </div>
  )
}



// ── PromptTester ──────────────────────────────────────────
function PromptTester({ promptKey, promptLabel, promptText }) {
  const [desc,    setDesc]    = useState('')
  const [result,  setResult]  = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  // Always read latest promptText from DOM (in case user edited without saving)
  const promptRef = useRef(promptText)
  useEffect(() => { promptRef.current = promptText }, [promptText])

  async function test() {
    if (!desc.trim()) return
    setLoading(true); setResult(null); setError(null)
    try {
      const key = useStore.getState().appPrefs?.geminiKey || localStorage.getItem('fm-gemini-key') || ''
      if (!key) { setError('API key mancante — vai in cima e inserisci la chiave'); setLoading(false); return }

      // Use the latest prompt text from the sibling textarea via DOM
      const textarea = document.querySelector(`[data-prompt-key="${promptKey}"]`)
      const currentPrompt = textarea ? textarea.value : promptRef.current

      const prompt = currentPrompt + '\n\nTransaction to analyze:\n"' + desc.trim() + '"\n\nReply ONLY with a JSON object: {"result": "...extracted value or null"}'

      const res = await fetch('http://localhost:3001/gemini', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ prompt, key })
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const text = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim()
        .replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/i,'').trim()
      const parsed = JSON.parse(text)
      setResult(parsed.result)
    } catch(e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      background:'var(--surface2)',border:'1px solid var(--border)',
      borderRadius:'var(--radius-sm)',padding:'12px 14px',marginBottom:12
    }}>
      <div style={{fontSize:12,fontWeight:700,color:'var(--text3)',marginBottom:8,textTransform:'uppercase',letterSpacing:'.06em'}}>
        🧪 Testa prompt — {promptLabel}
      </div>
      <div style={{display:'flex',gap:8,alignItems:'flex-start'}}>
        <textarea
          value={desc}
          onChange={e=>setDesc(e.target.value)}
          placeholder={'es. PAGAMENTO APPLE PAY MASTERCARD NFC del 03/06/2026 CARTA *6587 DI EUR 11,50 LIDO VILLA OLMO LIDO COMO'}
          rows={2}
          style={{
            flex:1,padding:'8px 10px',border:'1px solid var(--border)',
            borderRadius:'var(--radius-sm)',fontSize:12,lineHeight:1.4,
            background:'var(--surface)',color:'var(--text)',outline:'none',
            fontFamily:'var(--font-mono)',resize:'vertical',
          }}
        />
        <button
          className="btn btn-primary"
          style={{flexShrink:0,fontSize:12,minWidth:64}}
          onClick={test}
          disabled={loading||!desc.trim()}>
          {loading ? '⏳' : '▶ Prova'}
        </button>
      </div>
      {result !== null && result !== undefined && !loading && (
        <div style={{
          marginTop:8,padding:'8px 12px',
          background: result ? 'var(--green-l)' : 'var(--surface)',
          border:`1px solid ${result ? 'var(--green)' : 'var(--border)'}`,
          borderRadius:'var(--radius-sm)',fontSize:13,
        }}>
          <span style={{fontWeight:700,color:'var(--text3)',marginRight:6}}>Risultato:</span>
          {result
            ? <span style={{fontWeight:700,color:'var(--green)'}}>{result}</span>
            : <span style={{color:'var(--text3)',fontStyle:'italic'}}>null — nessun valore trovato</span>}
        </div>
      )}
      {error && !loading && (
        <div style={{
          marginTop:8,padding:'8px 12px',
          background:'var(--red-l)',border:'1px solid var(--red)',
          borderRadius:'var(--radius-sm)',fontSize:12,color:'var(--red)',
        }}>
          ✗ {error}
        </div>
      )}
    </div>
  )
}

// ── AIPromptTab ────────────────────────────────────────────
function AIPromptTab() {
  const CONFIRM_PIN = '182218'
  const [step,    setStep]    = useState('pin1') // pin1 | pin2 | unlocked
  const [pin1,    setPin1]    = useState('')
  const [pin2,    setPin2]    = useState('')
  const [error,   setError]   = useState('')
  const [prompts, setPrompts] = useState(() => getAIPrompts())
  const [saved,   setSaved]   = useState(false)
  const { appPrefs, setAppPref, appPrefsLoaded } = useStore()
  const [apiKey,        setApiKey]        = useState(() => appPrefs?.geminiKey || localStorage.getItem('fm-gemini-key') || '')
  const [keySaved,      setKeySaved]      = useState(false)
  const [placesKey,     setPlacesKey]     = useState(() => appPrefs?.placesKey || localStorage.getItem('fm-places-key') || '')
  const [placesKeySaved,setPlacesKeySaved]= useState(false)

  // ── Fix "chiave sparita" (segnalato utente 2026-07-14) ────────────────────
  // Il campo veniva letto UNA SOLA VOLTA al mount (useState lazy init). Se
  // questo tab si apre prima che loadAllData() abbia finito di caricare
  // appPrefs da Firestore (o su un browser/device dove il fallback
  // localStorage è vuoto), il campo restava bloccato su '' per SEMPRE anche
  // dopo che appPrefs finiva di caricarsi — la chiave sembrava sparita anche
  // se in realtà era ancora salvata su Firestore. Questi due effect
  // risincronizzano il campo non appena appPrefs arriva, ma solo se
  // l'utente non ha ancora toccato manualmente il campo in questa sessione
  // (altrimenti sovrascriverebbero una modifica in corso).
  const apiKeyTouched    = useRef(false)
  const placesKeyTouched = useRef(false)
  useEffect(() => {
    if (!apiKeyTouched.current && appPrefs?.geminiKey && appPrefs.geminiKey !== apiKey) {
      setApiKey(appPrefs.geminiKey)
    }
  }, [appPrefs?.geminiKey])
  useEffect(() => {
    if (!placesKeyTouched.current && appPrefs?.placesKey && appPrefs.placesKey !== placesKey) {
      setPlacesKey(appPrefs.placesKey)
    }
  }, [appPrefs?.placesKey])

  function checkPin1() {
    if (pin1 === CONFIRM_PIN) { setStep('pin2'); setError(''); setPin1('') }
    else { setError('Codice errato'); setPin1('') }
  }
  function checkPin2() {
    if (pin2 === CONFIRM_PIN) { setStep('unlocked'); setError('') }
    else { setError('Codice errato — inserisci nuovamente'); setPin2('') }
  }

  function savePrompt(key, value) {
    const updated = { ...prompts, [key]: value }
    setPrompts(updated)
    saveAIPrompts(updated)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function resetAll() {
    if (confirm('Ripristinare tutti i prompt ai valori predefiniti?')) {
      setPrompts({ ...DEFAULT_AI_PROMPTS })
      saveAIPrompts({ ...DEFAULT_AI_PROMPTS })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  if (step === 'pin1' || step === 'pin2') {
    const pin    = step === 'pin1' ? pin1 : pin2
    const setPin = step === 'pin1' ? setPin1 : setPin2
    const check  = step === 'pin1' ? checkPin1 : checkPin2
    return (
      <div style={{maxWidth:400,margin:'40px auto',textAlign:'center'}}>
        <div style={{fontSize:32,marginBottom:12}}>🔐</div>
        <div style={{fontSize:16,fontWeight:700,marginBottom:6}}>
          {step === 'pin1' ? 'Prima conferma' : 'Seconda conferma'}
        </div>
        <div style={{fontSize:13,color:'var(--text3)',marginBottom:20}}>
          Inserisci il PIN per accedere ai prompt AI
          {step === 'pin2' && ' (inseriscilo di nuovo per confermare)'}
        </div>
        <input
          type="password"
          value={pin}
          onChange={e=>{setPin(e.target.value);setError('')}}
          onKeyDown={e=>e.key==='Enter'&&check()}
          placeholder="PIN 6 cifre"
          maxLength={6}
          autoFocus
          style={{
            width:140,padding:'10px 14px',border:`1px solid ${error?'var(--red)':'var(--border)'}`,
            borderRadius:'var(--radius-sm)',fontSize:18,letterSpacing:'6px',textAlign:'center',
            background:'var(--surface)',color:'var(--text)',outline:'none',
            fontFamily:'var(--font-mono)',display:'block',margin:'0 auto 10px',
          }}
        />
        {error && <div style={{fontSize:12,color:'var(--red)',marginBottom:10}}>{error}</div>}
        <button className="btn btn-primary" onClick={check} disabled={pin.length!==6}>
          Conferma
        </button>
      </div>
    )
  }

  const PROMPT_FIELDS = [
    { key:'merchant',    label:'🏪 Merchant', desc:'Nome negozio/esercente per pagamenti con carta (Apple Pay, NFC, etc.)' },
    { key:'counterpart', label:'🔄 Controparte', desc:'Mittente o destinatario per bonifici e trasferimenti' },
    { key:'descAI',      label:'📝 AI Descrizione', desc:'Etichetta breve leggibile (max 3 parole)' },
    { key:'city',        label:'🏙️ Città', desc:'Città del merchant o del punto vendita' },
    { key:'category',    label:'🏷️ Categoria', desc:'Categoria e sottocategoria da assegnare' },
  ]

  return (
    // maxWidth rimosso (era 860, disallineato dal wrapper condiviso — richiesta
    // utente 2026-07-19 sull'allineamento fra header e corpo dei vari tab)
    <div>
      {/* API Key section */}
      <div className="card" style={{padding:'18px 20px',marginBottom:20}}>
        <div style={{fontSize:15,fontWeight:700,marginBottom:4}}>🔑 API Key AI</div>
        <div style={{fontSize:12,color:'var(--text3)',marginBottom:10}}>
          Chiave OpenAI (<code>sk-...</code>) o Gemini. Usata per AI Enrichment.
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
          <input
            type="password"
            value={apiKey}
            onChange={e=>{apiKeyTouched.current=true;setApiKey(e.target.value);setKeySaved(false)}}
            placeholder="sk-... oppure AIzaSy..."
            style={{flex:1,minWidth:240,padding:'8px 10px',border:'1px solid var(--border)',
              borderRadius:'var(--radius-sm)',fontSize:13,background:'var(--surface)',
              color:'var(--text)',outline:'none',fontFamily:'var(--font-mono)'}}
          />
          <button className="btn btn-primary" style={{fontSize:12}} onClick={()=>{
            // Guardia (2026-07-14): setAppPref si rifiuta di scrivere se appPrefs non
            // ha ancora finito di caricare da Firestore — prima il bottone mostrava
            // comunque "✓ Salvata" anche in quel caso (falso positivo, localStorage.
            // setItem partiva comunque). Ora avvisa invece di mentire.
            if (!appPrefsLoaded) { alert('Dati non ancora caricati, riprova tra un istante.'); return }
            const k = apiKey.trim()
            apiKeyTouched.current = true
            setAppPref('geminiKey', k)
            localStorage.setItem('fm-gemini-key', k)
            setKeySaved(true); setTimeout(()=>setKeySaved(false),2000)
          }} disabled={!apiKey.trim()}>
            {keySaved?'✓ Salvata':'Salva'}
          </button>
          {apiKey && <button className="btn btn-ghost" style={{fontSize:12,color:'var(--red)'}}
            onClick={()=>{apiKeyTouched.current=true;setApiKey('');setAppPref('geminiKey','');localStorage.removeItem('fm-gemini-key')}}>Rimuovi</button>}
        </div>
      </div>

      {/* Google Places API Key */}
      <div className="card" style={{padding:'18px 20px',marginBottom:20}}>
        <div style={{fontSize:15,fontWeight:700,marginBottom:4}}>🗺️ Google Places API Key</div>
        <div style={{fontSize:12,color:'var(--text3)',marginBottom:10}}>
          Usata per rilevare automaticamente la città dal nome del merchant. Ottieni la chiave su{' '}
          <a href="https://console.cloud.google.com/apis/library/places-backend.googleapis.com" target="_blank" rel="noreferrer" style={{color:'var(--accent)'}}>Google Cloud Console</a>{' '}
          → Places API (abilita "Places API").
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
          <input
            type="password"
            value={placesKey}
            onChange={e=>{placesKeyTouched.current=true;setPlacesKey(e.target.value);setPlacesKeySaved(false)}}
            placeholder="AIzaSy..."
            style={{flex:1,minWidth:240,padding:'8px 10px',border:'1px solid var(--border)',
              borderRadius:'var(--radius-sm)',fontSize:13,background:'var(--surface)',
              color:'var(--text)',outline:'none',fontFamily:'var(--font-mono)'}}
          />
          <button className="btn btn-primary" style={{fontSize:12}} onClick={()=>{
            if (!appPrefsLoaded) { alert('Dati non ancora caricati, riprova tra un istante.'); return }
            const k = placesKey.trim()
            placesKeyTouched.current = true
            setAppPref('placesKey', k)
            localStorage.setItem('fm-places-key', k)
            setPlacesKeySaved(true); setTimeout(()=>setPlacesKeySaved(false),2000)
          }} disabled={!placesKey.trim()}>
            {placesKeySaved?'✓ Salvata':'Salva'}
          </button>
          {placesKey && <button className="btn btn-ghost" style={{fontSize:12,color:'var(--red)'}}
            onClick={()=>{placesKeyTouched.current=true;setPlacesKey('');setAppPref('placesKey','');localStorage.removeItem('fm-places-key')}}>Rimuovi</button>}
        </div>
      </div>

      {/* Prompt fields */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
        <div style={{fontSize:15,fontWeight:700}}>Prompt AI Enrichment</div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          {saved && <span style={{fontSize:12,color:'var(--green)'}}>✓ Salvato</span>}
          <button className="btn btn-ghost" style={{fontSize:12,color:'var(--text3)'}} onClick={resetAll}>↺ Ripristina default</button>
        </div>
      </div>
      <div style={{fontSize:12,color:'var(--text3)',marginBottom:16,lineHeight:1.5}}>
        Questi prompt vengono inviati ad OpenAI durante l'AI Enrichment. Modificali per personalizzare come vengono estratti i dati. Le modifiche sono immediate — la prossima chiamata AI userà i prompt aggiornati.
      </div>

      {PROMPT_FIELDS.map(({key, label, desc}) => (
        <div key={key} className="card" style={{padding:'16px 18px',marginBottom:12}}>
          <PromptTester promptKey={key} promptLabel={label} promptText={prompts[key]||''}/>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
            <div>
              <div style={{fontWeight:700,fontSize:14}}>{label}</div>
              <div style={{fontSize:11,color:'var(--text3)',marginTop:2}}>{desc}</div>
            </div>
            <div style={{display:'flex',gap:6}}>
              <button className="btn btn-primary" style={{fontSize:11}}
                onClick={()=>{
                  const ta = document.querySelector(`[data-prompt-key="${key}"]`)
                  if(ta) savePrompt(key, ta.value)
                }}>💾 Salva</button>
              <button className="btn btn-ghost" style={{fontSize:11,color:'var(--text3)'}}
                onClick={()=>savePrompt(key, DEFAULT_AI_PROMPTS[key])}>↺ Default</button>
            </div>
          </div>
          <textarea
            data-prompt-key={key}
            value={prompts[key] || ''}
            onChange={e=>setPrompts(p=>({...p,[key]:e.target.value}))}
            onBlur={e=>savePrompt(key, e.target.value)}
            rows={key==='counterpart'?14:6}
            style={{
              width:'100%',padding:'10px 12px',
              border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',
              fontSize:12,lineHeight:1.5,
              background:'var(--surface2)',color:'var(--text)',
              outline:'none',fontFamily:'var(--font-mono)',
              resize:'vertical',
            }}
          />
        </div>
      ))}

      <button className="btn btn-ghost" style={{fontSize:12,color:'var(--text3)',marginTop:4}}
        onClick={()=>setStep('pin1')}>
        🔒 Blocca sezione
      </button>
    </div>
  )
}

// ── Sezioni del Navigatore ────────────────────────────────
const TOGGLEABLE_SECTIONS = [
  { id:'entrate',         label:'💰 Entrate',              group:'Transazioni',          defaultOff:false },
  { id:'altre-entrate',   label:'💸 Altre Entrate',         group:'Transazioni',          defaultOff:false },
  { id:'casa',            label:'🏡 Casa',                  group:'Categorie Principali', defaultOff:false },
  { id:'veicoli-spese',   label:'🚗 Veicoli',              group:'Categorie Principali', defaultOff:false },
  { id:'spesa',           label:'🛒 Spesa e Alimentari',    group:'Categorie Principali', defaultOff:false },
  { id:'tempo-libero',    label:'🎭 Tempo Libero',          group:'Categorie Principali', defaultOff:true  },
  { id:'weekend-vacanze', label:'✈️ Weekend e Vacanze',     group:'Categorie Principali', defaultOff:false },
  { id:'energie',         label:'⚡ Utenze',                group:'Categorie Principali', defaultOff:false },
  { id:'scadenze',        label:'📅 Scadenze',              group:'Categorie Principali', defaultOff:false },
  { id:'cecilia',         label:'👧 Cecilia',               group:'Famiglia',             defaultOff:false },
  { id:'nanny',           label:'👩 Nanny',                 group:'Famiglia',             defaultOff:false },
  { id:'colf',            label:'🧹 Colf',                  group:'Famiglia',             defaultOff:false },
  { id:'altro',           label:'📦 Altro',                 group:'Altro',                defaultOff:false },
  { id:'shopping',        label:'🛍 Shopping',              group:'Altro',                defaultOff:true  },
  { id:'salute',          label:'💊 Salute e Cura',         group:'Altro',                defaultOff:true  },
  { id:'analytics',       label:'🔬 Analytics',             group:'Analytics',            defaultOff:false },
  { id:'calendario',      label:'🗓 Calendario',             group:'Analytics',            defaultOff:false },
  { id:'forecast',        label:'📊 Forecast',              group:'Analytics',            defaultOff:false },
  { id:'risparmio',       label:'🐷 Risparmio',             group:'Finanza',              defaultOff:false },
  { id:'patrimonio',      label:'💎 Patrimonio',            group:'Finanza',              defaultOff:false },
  { id:'prestiti',        label:'🏦 Prestiti & Mutui',      group:'Finanza',              defaultOff:false },
  { id:'investimenti',    label:'📈 Investimenti',          group:'Finanza',              defaultOff:false },
  { id:'satispay',        label:'💚 Satispay',              group:'Finanza',              defaultOff:false },
  { id:'carte',           label:'💳 Carte',                 group:'Finanza',              defaultOff:false },
  { id:'contanti',        label:'💵 Contanti',              group:'Finanza',              defaultOff:false },
  { id:'mutuo',           label:'🏠 Mutuo',                 group:'Finanza',              defaultOff:false },
  { id:'stipendio',       label:'💼 Stipendi',              group:'Finanza',              defaultOff:false },
]

function NavSectionsTab() {
  const appPrefs   = useStore(s => s.appPrefs)
  const setAppPref = useStore(s => s.setAppPref)
  const [disabled, setDisabled] = useState(() => appPrefs.disabledNav || ['salute','shopping','tempo-libero'])
  useEffect(() => { setDisabled(appPrefs.disabledNav || ['salute','shopping','tempo-libero']) }, [appPrefs.disabledNav])
  const [saved, setSaved] = useState(false)

  function toggle(id) {
    setDisabled(prev => {
      const next = prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id]
      return next
    })
    setSaved(false)
  }

  function save() {
    setAppPref('disabledNav', disabled)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div>
      <div style={{fontSize:14,fontWeight:700,marginBottom:4}}>Sezioni Attive</div>
      <div style={{fontSize:13,color:'var(--text3)',marginBottom:20}}>
        Disabilita sezioni che non usi per semplificare la navigazione. Puoi riattivarle in qualsiasi momento.
      </div>

      {/* Group sections by group name */}
      {(()=>{
        const groups = []
        const seen = new Set()
        TOGGLEABLE_SECTIONS.forEach(sec => {
          if (!seen.has(sec.group)) { seen.add(sec.group); groups.push(sec.group) }
        })
        return groups.map(grp => (
          <div key={grp} style={{marginBottom:20}}>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',
              color:'var(--text3)',marginBottom:8,paddingBottom:4,borderBottom:'1px solid var(--border)'}}>
              {grp}
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              {TOGGLEABLE_SECTIONS.filter(s=>s.group===grp).map(sec => {
                const isDisabled = disabled.includes(sec.id)
                return (
                  <div key={sec.id} style={{
                    display:'flex',alignItems:'center',justifyContent:'space-between',
                    padding:'10px 14px',borderRadius:8,border:'1px solid var(--border)',
                    background:isDisabled?'var(--surface2)':'var(--surface)',
                    opacity:isDisabled?0.55:1,transition:'opacity .15s'
                  }}>
                    <div style={{fontSize:13,fontWeight:500}}>{sec.label}</div>
                    <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',userSelect:'none'}}>
                      <span style={{fontSize:11,color:'var(--text3)',minWidth:44,textAlign:'right'}}>
                        {isDisabled?'Nascosta':'Visibile'}
                      </span>
                      <div onClick={()=>toggle(sec.id)} style={{
                        width:38,height:20,borderRadius:10,cursor:'pointer',transition:'background .2s',
                        background:isDisabled?'var(--border)':'var(--accent)',position:'relative',flexShrink:0
                      }}>
                        <div style={{
                          position:'absolute',top:2,width:16,height:16,borderRadius:'50%',
                          background:'white',transition:'left .2s',left:isDisabled?2:20
                        }}/>
                      </div>
                    </label>
                  </div>
                )
              })}
            </div>
          </div>
        ))
      })()}
      <div style={{marginBottom:24}}/>

      <button
        onClick={save}
        style={{padding:'9px 20px',background:'var(--accent)',color:'#fff',border:'none',
          borderRadius:8,fontWeight:700,cursor:'pointer',fontSize:14}}
      >
        {saved ? '✓ Salvato' : 'Salva modifiche'}
      </button>
      {saved && <span style={{fontSize:12,color:'var(--text3)',marginLeft:12}}>La barra laterale si aggiornerà automaticamente.</span>}
    </div>
  )
}

// ── Security Tab (TOTP setup/remove) ─────────────────────
function SecurityTab() {
  const { user, totpSecret, onTotpSetupDone } = useAuth()
  const [phase,     setPhase]     = useState('idle') // idle | setup | confirm | done | remove
  const [newSecret, setNewSecret] = useState(null)
  const [code,      setCode]      = useState('')
  const [error,     setError]     = useState(null)
  const [loading,   setLoading]   = useState(false)

  const isConfigured = !!totpSecret

  function startSetup() {
    const s = generateSecret()
    setNewSecret(s)
    setCode('')
    setError(null)
    setPhase('setup')
  }

  async function confirmSetup() {
    setError(null); setLoading(true)
    const ok = await validateToken(newSecret, code.trim())
    if (!ok) { setError('Codice non valido, riprova'); setCode(''); setLoading(false); return }
    await saveTotpSecret(user.uid, newSecret)
    onTotpSetupDone(newSecret)
    setPhase('done')
    setLoading(false)
  }

  async function removeTotp() {
    setLoading(true)
    await deleteTotpSecret(user.uid)
    onTotpSetupDone(null)
    setPhase('idle')
    setLoading(false)
  }

  const card = {padding:'20px 24px', background:'var(--surface2)', borderRadius:'var(--radius)', border:'1px solid var(--border)', marginBottom:16}
  const row  = {display:'flex', alignItems:'center', gap:12, marginBottom:8}

  return (
    // maxWidth rimosso (era 520 — richiesta utente 2026-07-19 sull'allineamento
    // fra header e corpo dei vari tab di Impostazioni)
    <div>
      <h2 style={{fontSize:17,fontWeight:700,marginBottom:20}}>🔐 Sicurezza</h2>

      <div style={card}>
        <div style={{...row, marginBottom:14}}>
          <span style={{fontSize:22}}>📱</span>
          <div>
            <div style={{fontWeight:600,fontSize:14}}>Authenticator App</div>
            <div style={{fontSize:12,color:'var(--text3)',marginTop:2}}>
              {isConfigured
                ? 'TOTP attivo — il login richiede un codice dall\'app'
                : 'Non configurato — il login usa solo Google + PIN'}
            </div>
          </div>
          <span style={{
            marginLeft:'auto', padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:600,
            background: isConfigured ? 'var(--green-l)' : 'var(--surface3)',
            color: isConfigured ? 'var(--green)' : 'var(--text3)',
          }}>
            {isConfigured ? '✓ Attivo' : 'Non attivo'}
          </span>
        </div>

        {phase === 'idle' && (
          <div style={{display:'flex',gap:8}}>
            {!isConfigured && (
              <button className="btn btn-primary" style={{fontSize:13}} onClick={startSetup}>
                + Configura TOTP
              </button>
            )}
            {isConfigured && (
              <>
                <button className="btn btn-ghost" style={{fontSize:13}} onClick={startSetup}>
                  🔄 Rigenera
                </button>
                <button className="btn btn-ghost" style={{fontSize:13,color:'var(--red)'}} onClick={()=>setPhase('remove')}>
                  🗑 Rimuovi
                </button>
              </>
            )}
          </div>
        )}

        {phase === 'setup' && newSecret && (
          <div>
            <p style={{fontSize:13,color:'var(--text2)',marginBottom:12}}>
              1. Scansiona il QR con <strong>Google Authenticator</strong> o <strong>Authy</strong>
            </p>
            <img
              src={qrCodeUrl(newSecret, user?.email)}
              alt="QR Code"
              style={{width:160,height:160,borderRadius:10,background:'#fff',padding:6,display:'block',marginBottom:12}}
            />
            <p style={{fontSize:11,color:'var(--text3)',marginBottom:12,fontFamily:'var(--font-mono)',letterSpacing:'0.06em'}}>
              {formatSecret(newSecret)}
            </p>
            <p style={{fontSize:13,color:'var(--text2)',marginBottom:8}}>
              2. Inserisci il codice a 6 cifre per confermare
            </p>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <input
                type="text" inputMode="numeric" maxLength={6} placeholder="000000"
                value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))}
                onKeyDown={e=>e.key==='Enter'&&code.length===6&&confirmSetup()}
                autoFocus
                style={{
                  width:120,textAlign:'center',fontSize:20,letterSpacing:'0.2em',
                  padding:'8px 12px',borderRadius:8,border:'1px solid var(--border)',
                  background:'var(--surface)',color:'var(--text1)',outline:'none',
                  fontFamily:'var(--font-mono)',
                }}
              />
              <button className="btn btn-primary" disabled={loading||code.length<6} onClick={confirmSetup} style={{fontSize:13}}>
                {loading ? '…' : 'Attiva'}
              </button>
              <button className="btn btn-ghost" onClick={()=>setPhase('idle')} style={{fontSize:13}}>Annulla</button>
            </div>
            {error && <p style={{color:'var(--red)',fontSize:12,marginTop:8}}>{error}</p>}
          </div>
        )}

        {phase === 'done' && (
          <div style={{color:'var(--green)',fontSize:13,fontWeight:600}}>
            ✓ TOTP attivato! Al prossimo login ti verrà chiesto il codice dall'app.
            <button className="btn btn-ghost" onClick={()=>setPhase('idle')} style={{marginLeft:12,fontSize:12}}>OK</button>
          </div>
        )}

        {phase === 'remove' && (
          <div>
            <p style={{fontSize:13,color:'var(--text2)',marginBottom:10}}>
              Sei sicuro? Rimuovendo il TOTP il login userà solo Google + PIN.
            </p>
            <div style={{display:'flex',gap:8}}>
              <button className="btn btn-ghost" style={{fontSize:13,color:'var(--red)'}} onClick={removeTotp} disabled={loading}>
                {loading ? '…' : 'Sì, rimuovi'}
              </button>
              <button className="btn btn-ghost" onClick={()=>setPhase('idle')} style={{fontSize:13}}>Annulla</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}


// ── AI Enrichment Settings Tab ────────────────────────────
function AIEnrichmentTab() {
  const { appPrefs, setAppPref } = useStore()
  const enabled = appPrefs?.aiEnrichEnabled !== false
  const savedCode = appPrefs?.aiEnrichCode || ''

  const [codeInput, setCodeInput]   = useState('')
  const [codeError, setCodeError]   = useState('')
  const [codeSaved, setCodeSaved]   = useState(false)
  const [newCode,   setNewCode]     = useState('')
  const [newCode2,  setNewCode2]    = useState('')
  const [toggleErr, setToggleErr]   = useState('')
  const [toggleInput, setToggleInput] = useState('')
  const [showChange, setShowChange] = useState(false)

  function checkCode(input) {
    return !savedCode || input.trim() === savedCode
  }

  function handleToggle() {
    if (!checkCode(toggleInput)) { setToggleErr('Codice errato'); return }
    setAppPref('aiEnrichEnabled', !enabled)
    setToggleInput(''); setToggleErr('')
  }

  function handleSetCode() {
    if (savedCode && !checkCode(codeInput)) { setCodeError('Codice attuale errato'); return }
    if (!newCode.trim()) { setCodeError('Inserisci un nuovo codice'); return }
    if (newCode !== newCode2) { setCodeError('I codici non coincidono'); return }
    setAppPref('aiEnrichCode', newCode.trim())
    setCodeInput(''); setNewCode(''); setNewCode2('')
    setCodeError(''); setCodeSaved(true)
    setShowChange(false)
    setTimeout(() => setCodeSaved(false), 2000)
  }

  return (
    // maxWidth rimosso (era 580 — richiesta utente 2026-07-19 sull'allineamento
    // fra header e corpo dei vari tab di Impostazioni)
    <div>
      {/* Enable/disable */}
      <div className="card" style={{padding:'18px 20px',marginBottom:16}}>
        <div style={{fontSize:15,fontWeight:700,marginBottom:4}}>✨ AI Enrichment</div>
        <div style={{fontSize:12,color:'var(--text3)',marginBottom:14}}>
          Abilita o disabilita il pulsante AI Enrichment nella pagina Transazioni.<br/>
          Quando abilitato, è protetto dal codice di conferma.
        </div>

        {/* Current status */}
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16,
          padding:'10px 14px',background:'var(--surface2)',borderRadius:8}}>
          <div style={{width:10,height:10,borderRadius:'50%',
            background:enabled?'var(--green)':'var(--text3)',flexShrink:0}}/>
          <span style={{fontSize:13,fontWeight:600}}>
            {enabled ? 'Abilitato' : 'Disabilitato'}
          </span>
        </div>

        {/* Toggle with code */}
        <div style={{display:'flex',gap:8,alignItems:'flex-end',flexWrap:'wrap'}}>
          {savedCode && (
            <div style={{flex:1,minWidth:180}}>
              <div style={{fontSize:11,color:'var(--text3)',marginBottom:4}}>Codice di conferma</div>
              <input type="password" value={toggleInput}
                onChange={e=>{setToggleInput(e.target.value);setToggleErr('')}}
                onKeyDown={e=>e.key==='Enter'&&handleToggle()}
                placeholder="Inserisci codice..."
                style={{width:'100%',boxSizing:'border-box',padding:'8px 10px',
                  border:`1px solid ${toggleErr?'var(--red)':'var(--border)'}`,borderRadius:7,
                  fontSize:13,background:'var(--surface)',color:'var(--text)',
                  fontFamily:'var(--font-mono)',outline:'none'}}/>
              {toggleErr && <div style={{fontSize:11,color:'var(--red)',marginTop:3}}>{toggleErr}</div>}
            </div>
          )}
          <button onClick={handleToggle}
            className={enabled ? 'btn btn-secondary' : 'btn btn-primary'}
            style={{fontSize:12}}>
            {enabled ? '🚫 Disabilita' : '✅ Abilita'}
          </button>
        </div>
      </div>

      {/* Code management */}
      <div className="card" style={{padding:'18px 20px'}}>
        <div style={{fontSize:15,fontWeight:700,marginBottom:4}}>🔑 Codice di conferma</div>
        <div style={{fontSize:12,color:'var(--text3)',marginBottom:14}}>
          Questo codice viene richiesto ogni volta che si avvia l'AI Enrichment in Transazioni.
          {!savedCode && ' Nessun codice impostato — al momento nessun gate attivo.'}
        </div>

        {codeSaved && (
          <div style={{padding:'8px 12px',background:'var(--green-l)',borderRadius:8,
            fontSize:12,color:'var(--green)',fontWeight:600,marginBottom:12}}>
            ✓ Codice salvato!
          </div>
        )}

        {!showChange ? (
          <button className="btn btn-secondary" style={{fontSize:12}}
            onClick={()=>setShowChange(true)}>
            {savedCode ? '🔄 Cambia codice' : '+ Imposta codice'}
          </button>
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {savedCode && (
              <div>
                <div style={{fontSize:11,color:'var(--text3)',marginBottom:4}}>Codice attuale</div>
                <input type="password" value={codeInput}
                  onChange={e=>{setCodeInput(e.target.value);setCodeError('')}}
                  placeholder="Codice attuale..."
                  style={{padding:'8px 10px',border:'1px solid var(--border)',borderRadius:7,
                    fontSize:13,background:'var(--surface)',color:'var(--text)',
                    fontFamily:'var(--font-mono)',outline:'none',width:'100%',boxSizing:'border-box'}}/>
              </div>
            )}
            <div>
              <div style={{fontSize:11,color:'var(--text3)',marginBottom:4}}>Nuovo codice</div>
              <input type="password" value={newCode}
                onChange={e=>{setNewCode(e.target.value);setCodeError('')}}
                placeholder="Nuovo codice..."
                style={{padding:'8px 10px',border:'1px solid var(--border)',borderRadius:7,
                  fontSize:13,background:'var(--surface)',color:'var(--text)',
                  fontFamily:'var(--font-mono)',outline:'none',width:'100%',boxSizing:'border-box'}}/>
            </div>
            <div>
              <div style={{fontSize:11,color:'var(--text3)',marginBottom:4}}>Ripeti nuovo codice</div>
              <input type="password" value={newCode2}
                onChange={e=>{setNewCode2(e.target.value);setCodeError('')}}
                onKeyDown={e=>e.key==='Enter'&&handleSetCode()}
                placeholder="Ripeti codice..."
                style={{padding:'8px 10px',border:'1px solid var(--border)',borderRadius:7,
                  fontSize:13,background:'var(--surface)',color:'var(--text)',
                  fontFamily:'var(--font-mono)',outline:'none',width:'100%',boxSizing:'border-box'}}/>
            </div>
            {codeError && (
              <div style={{fontSize:11,color:'var(--red)'}}>{codeError}</div>
            )}
            <div style={{display:'flex',gap:8}}>
              <button className="btn btn-secondary" style={{fontSize:12}}
                onClick={()=>{setShowChange(false);setCodeInput('');setNewCode('');setNewCode2('');setCodeError('')}}>
                Annulla
              </button>
              <button className="btn btn-primary" style={{fontSize:12}} onClick={handleSetCode}>
                Salva codice
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Discovery Skip Rules Tab ──────────────────────────────
function DiscoverySkipTab() {
  const discoverySkipRules     = useStore(s => s.discoverySkipRules) || []
  const removeDiscoverySkipRule = useStore(s => s.removeDiscoverySkipRule)

  return (
    <div>
      <h2 style={{fontFamily:'var(--font-serif)',fontSize:18,fontWeight:600,marginBottom:4}}>🚫 Discovery — Regole di esclusione</h2>
      <p style={{fontSize:13,color:'var(--text3)',marginBottom:20,lineHeight:1.5}}>
        Le transazioni con queste descrizioni AI vengono automaticamente saltate nella sezione Discovery.
        Puoi aggiungere una regola dal bottone "Salta sempre" nella schermata Discovery mobile.
      </p>
      {discoverySkipRules.length === 0 ? (
        <div style={{padding:'24px 20px',background:'var(--surface)',borderRadius:12,
          border:'1px solid var(--border)',textAlign:'center',color:'var(--text3)',fontSize:13}}>
          Nessuna regola di esclusione. Usa "Salta sempre" nella Discovery mobile per aggiungerne una.
        </div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {discoverySkipRules.map(rule => (
            <div key={rule.id} style={{display:'flex',alignItems:'center',gap:12,
              padding:'10px 14px',background:'var(--surface)',borderRadius:10,
              border:'1px solid var(--border)'}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:14,color:'var(--text1)',fontWeight:500}}>{rule.descAI || '—'}</div>
                {rule.note && <div style={{fontSize:11,color:'var(--text3)',marginTop:2}}>{rule.note}</div>}
              </div>
              {(rule.addedAt || rule.createdAt) && (
                <span style={{fontSize:11,color:'var(--text3)',flexShrink:0}}>
                  {new Date((rule.addedAt || rule.createdAt).toDate
                    ? (rule.addedAt || rule.createdAt).toDate()
                    : (rule.addedAt || rule.createdAt)
                  ).toLocaleDateString('it-IT')}
                </span>
              )}
              <button onClick={() => removeDiscoverySkipRule(rule.id)}
                style={{padding:'5px 10px',borderRadius:8,border:'1px solid var(--red)',
                  background:'rgba(220,50,50,.08)',color:'var(--red)',fontSize:12,
                  fontWeight:700,cursor:'pointer',fontFamily:'var(--font-sans)',flexShrink:0}}>
                🗑 Rimuovi
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function SettingsPage() {
  const [tab, setTab] = useState("profile")
  const TABS=[
    {id:"security",      icon:"🔐", label:"Sicurezza"},
    {id:"profile",       icon:"👤", label:"Profilo & Conti"},
    {id:"categories",    icon:"🏷",  label:"Categorie"},
    {id:"ai-rules",      icon:"🤖", label:"Regole AI"},
    {id:"excluded",      icon:"⊘",  label:"Escluse"},
    {id:"deleted-tx",    icon:"🗑",  label:"Eliminate"},
    {id:"cash-cats",     icon:"💵", label:"Contanti"},
    {id:"notifications", icon:"🔔", label:"Notifiche"},
    {id:"nav-sections",  icon:"📋", label:"Sezioni"},
    {id:"danger",        icon:"⚠️", label:"Danger Zone"},
    {id:"ai-prompt",     icon:"🤖", label:"AI Prompt"},
    {id:"ai-enrichment", icon:"✨", label:"AI Enrichment"},
    {id:"discovery-skip",icon:"🚫", label:"Discovery"},
    {id:"devlog",        icon:"🛠", label:"Sviluppo"},
  ]
  return (
    <div style={{padding:"28px 32px",maxWidth:tab==="excluded"?1300:tab==="devlog"?1100:900}}>
      <h1 style={{fontFamily:"var(--font-serif)",fontSize:26,fontWeight:600,marginBottom:24}}>⚙️ Impostazioni</h1>
      <Tabs tabs={TABS} active={tab} onChange={setTab}/>
      {tab==="security"       && <SecurityTab/>}
      {tab==="profile"        && <ProfileTab/>}
      {tab==="categories"     && <CategoriesTab/>}
      {tab==="ai-rules"       && <AiRulesTab/>}
      {tab==="excluded"       && <ExcludedTab/>}
      {tab==="deleted-tx"     && <DeletedTxTab/>}
      {tab==="cash-cats"      && <CashCatsTab/>}
      {tab==="notifications"  && <NotificationsTab/>}
      {tab==="nav-sections"   && <NavSectionsTab/>}
      {tab==="danger"         && <DangerZoneTab/>}
      {tab==="ai-prompt"      && <AIPromptTab/>}
      {tab==="ai-enrichment"  && <AIEnrichmentTab/>}
      {tab==="discovery-skip" && <DiscoverySkipTab/>}
      {tab==="devlog"         && <DevlogPage/>}
    </div>
  )
}
