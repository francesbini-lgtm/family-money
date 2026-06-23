import { useState } from 'react'

// ── Hardcoded git log (updated with each push) ────────────
const DEVLOG = [
  { date:'2026-06-23', desc:'Uscite + Dashboard: fix bonifici fondo Satispay (_satiLinked) — sempre esplosi nelle splits per categoria; rimosso toggle "Senza accantonamenti" da Uscite; Dashboard usa expTotal() per coerenza' },
  { date:'2026-06-23', desc:'Uscite: fix esclusione commissioni — erano escluse dal calcolo dati (bug), ora incluse come tutte le altre spese; isComm rimane solo filtro visivo in Transazioni/Satispay/PayPal' },
  { date:'2026-06-23', desc:'Transazioni: click su importo rettificato (*) apre popup con importo originale, compensato Satispay e netto' },
  { date:'2026-06-23', desc:'Uscite: sfondo bianco pannello dettaglio; toggle "Separa non ricorrenti" — numeri netti in tabella, riga "Spese non ricorrenti" + nuovo "Totale uscite"; tipografia: header/totali grassetto, numeri tabella normali, L2 corsivo; ordine categorie fisso (Casa→Spesa→Veicoli→Salute→Figli→Subtotale→resto)' },
  { date:'2026-06-23', desc:'Satispay spese da compensare: stato colonna basato su residual reale — ✅ compensata (residual=0), ≈ parziale (residual>0), ⏳ da confermare solo se non già compensato' },
  { date:'2026-06-23', desc:'Satispay: chart spese non compensate mostra sempre tutti i 12 mesi (rimosso filter b.total>0)' },
  { date:'2026-06-23', desc:'Satispay: fix colonna Importo compensato — re-idrata compensatedAmt da income tx per match storici con valore 0; fallback lookup diretto in table render' },
  { date:'2026-06-23', desc:'Flag _nonRecurring per transazione: toggle ⚡ in modal Satispay, Uscite e pulsante in riga Transazioni; Satispay istogramma → barre verticali standard; Uscite: filtri spostati sopra tabella, riga "di cui non ricorrenti" italica sotto il totale, toggle "mostra non ricorrenti"' },
  { date:'2026-06-23', desc:'Satispay: fix spese compensate scomparse; mostra flag Compensato e importo; istogramma spese non compensate per mese (ultimi 12m); Uscite: filtro periodo per scegliere quali 6 mesi; VehReconModal: cash mode mostra prelievi ATM reali; aggiunti pagina Sviluppo' },
  { date:'2026-06-22', desc:'Contanti: colonna Carta mostra *last4 digit, Utente usa card→nickname; VehReconModal cash mostra ATM prelievi (cat Contanti); colonna Descrizione rinominata Carta' },
  { date:'2026-06-22', desc:'Toggle "Da rivedere" aggiunto a tutti i modal di dettaglio (Dashboard, PayPal, Uscite, Satispay)' },
  { date:'2026-06-22', desc:'Popup Salva: auto-chiudi dopo 1s in PayPal, Uscite, Satispay, Dashboard; Contanti: colonna Utente con resolveUserByCard' },
  { date:'2026-06-22', desc:'Satispay migration: de-escludi TUTTE le spese con _compensatedBy; rinomina income da Accantonamento → Accredito Satispay' },
  { date:'2026-06-22', desc:'Satispay: spesa mai più esclusa dopo abbinamento (solo compensata); income rinominato "Accredito Satispay"; migrazione storico' },
  { date:'2026-06-22', desc:'Satispay: click su riga "Spese da Compensare" apre popup dettaglio con modifica categoria' },
  { date:'2026-06-22', desc:'ForecastPage: WhatIf panel chiarisce calcolo "totale 12 mesi / 12"' },
  { date:'2026-06-22', desc:'Satispay: fix isAltroSatiVarie case-insensitive check in altreSpeseTxs, accantonamentiNonAbbinati, NonAbbinateModal' },
  { date:'2026-06-22', desc:'ForecastPage: fix entrate totale/12, storico 3 anni in tabella proiezione, rinomina label' },
  { date:'2026-06-22', desc:'ForecastPage: rename "Ultimi 12 mesi", clickable Entrate/Spese popup, chart storico coerente (mesi vs anni)' },
  { date:'2026-06-22', desc:'RisparmioPage: totale+media/mese in KPI boxes, totals row in tabella; ForecastPage: swap TAEG/Anticipo order' },
  { date:'2026-06-22', desc:'Satispay: auto-advance to next pending after approve/reject + contatore X/Y' },
  { date:'2026-06-22', desc:'Satispay: excluded accrediti + descAI Accantonamento + migrazione storico + notifica eccedenza' },
  { date:'2026-06-22', desc:'Multi-page update: Risparmio, Forecast, CategoryPage, Carburante, Contanti, Transactions compensati' },
  { date:'2026-06-22', desc:'Transactions: selection count+sum chip in QuickFilters bar' },
  { date:'2026-06-22', desc:'Satispay: chart forecast+dots+months, category configurator, abbina+commissioni in modals' },
  { date:'2026-06-22', desc:'Satispay chart: sottrai release cumulative per mese (net patrimonio)' },
  { date:'2026-06-22', desc:'Satispay: last12 in SatiOverviewTab, per-pot Patrimonio netto, AltreSpesePot commissioni+search+detail' },
  { date:'2026-06-22', desc:'Satispay: sostituisce pulsante "Non abbinate" con due overlay stile PayPal (Accrediti + Accantonamenti)' },
  { date:'2026-06-22', desc:'6 migliorie: PayPal L2 validation, Forecast deselectable months + mortgage widths, Patrimonio sati netto, Satispay override + chart per fund' },
  { date:'2026-06-22', desc:'Satispay: redesign sezione compensazione con auto-matching + pending approval + Abbina button' },
  { date:'2026-06-22', desc:'PayPal: fuzzy matching + pending approval + Abbina button + custom categories fix' },
  { date:'2026-06-22', desc:'PayPal: dedup import (badge + auto-deselect), safety filter in handleImport' },
  { date:'2026-06-22', desc:'PayPal: fix pdfjs worker con Vite ?url static import (no CDN)' },
  { date:'2026-06-22', desc:'PayPal: OpenAI chiama direttamente senza proxy (PDF e vision)' },
  { date:'2026-06-22', desc:'PayPal: PDF chunking testo, max_tokens 8192, maxDuration 60s' },
]

function fmtDateTime(dateStr) {
  if (!dateStr) return '—'
  return dateStr
}

export default function DevlogPage() {
  const [search, setSearch] = useState('')

  const filtered = DEVLOG.filter(e =>
    !search.trim() ||
    e.desc.toLowerCase().includes(search.toLowerCase()) ||
    e.date.includes(search)
  )

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 16px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>🛠 Sviluppo</div>
        <div style={{ fontSize: 13, color: 'var(--text3)' }}>
          Storico delle modifiche all'app — aggiornato ad ogni push su GitHub
        </div>
      </div>

      {/* Search */}
      <div style={{ marginBottom: 20 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Cerca nel log..."
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '9px 14px', borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'var(--surface)', color: 'var(--text)',
            fontSize: 13, fontFamily: 'var(--font-sans)', outline: 'none',
          }}
        />
      </div>

      {/* Timeline */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {filtered.map((e, i) => (
          <div key={i} style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            {/* Left: date + line */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 100 }}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: 'var(--text3)',
                whiteSpace: 'nowrap', paddingTop: 14,
              }}>
                {fmtDateTime(e.date)}
              </div>
              {i < filtered.length - 1 && (
                <div style={{ width: 1, flex: 1, minHeight: 20, background: 'var(--border)', marginTop: 4 }} />
              )}
            </div>

            {/* Right: content */}
            <div style={{
              flex: 1, padding: '12px 16px', marginBottom: 12,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 10, fontSize: 13, color: 'var(--text)',
              lineHeight: 1.5,
            }}>
              {e.desc}
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)', fontSize: 13 }}>
            Nessun risultato per "{search}"
          </div>
        )}
      </div>

      <div style={{ marginTop: 24, fontSize: 11, color: 'var(--text3)', textAlign: 'center' }}>
        {DEVLOG.length} push registrati
      </div>
    </div>
  )
}
