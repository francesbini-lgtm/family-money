import { useState, useEffect } from 'react'
import { useStore } from '../store/useStore'

// ── Vacanze dichiarate nel Calendario (appPrefs.calendarVacations) ────────
// Condiviso da CalendarioPage.jsx e WeekendVacanzeV2Page.jsx — entrambi leggono/
// scrivono la stessa chiave appPrefs, quindi restano automaticamente sincronizzati
// (Zustand notifica tutti i componenti che leggono appPrefs a ogni modifica).
export function useVacations() {
  const appPrefs   = useStore(s => s.appPrefs)
  const setAppPref = useStore(s => s.setAppPref)
  const [vacations, setVacations] = useState(() => appPrefs.calendarVacations || [])
  useEffect(() => { setVacations(appPrefs.calendarVacations || []) }, [appPrefs.calendarVacations])

  function save(v) { setVacations(v); setAppPref('calendarVacations', v) }
  function add(vac) { save([...vacations, { id: Date.now(), ...vac }]) }
  // Aggiunge più periodi in un colpo solo (evita id/Date.now() duplicati e scritture concorrenti)
  function addMultiple(vacsArr) {
    const withIds = vacsArr.map((v, i) => ({ id: Date.now() + i, ...v }))
    save([...vacations, ...withIds])
  }
  function update(id, patch) { save(vacations.map(v => v.id === id ? { ...v, ...patch } : v)) }
  function remove(id) { save(vacations.filter(v => v.id !== id)) }

  return { vacations, add, addMultiple, update, remove }
}

// ── Giorni esplicitamente dichiarati NON vacanza ──────────────────────────
// (appPrefs.calendarNotVacationDates) — click su una cella blu in Calendario, o
// "elimina" su una riga nella tabella Weekend e Vacanze v2. Marcare un giorno
// applica subito flagCompetenza:true alle sue transazioni "Weekend e Vacanze"
// (non serve aspettare il prossimo giro di AI Enrichment).
export function useNotVacationDates() {
  const appPrefs          = useStore(s => s.appPrefs)
  const setAppPref        = useStore(s => s.setAppPref)
  const updateTransaction = useStore(s => s.updateTransaction)
  const transactions      = useStore(s => s.transactions)
  const notVacationDates  = appPrefs?.calendarNotVacationDates || []

  function txOnDates(dateStrs) {
    const set = new Set(dateStrs)
    return transactions.filter(t => !t.excluded && set.has(t._effDate || t.date))
  }

  function mark(dateStrs) {
    if (!dateStrs.length) return
    const next = new Set(notVacationDates)
    dateStrs.forEach(d => next.add(d))
    setAppPref('calendarNotVacationDates', [...next])
    txOnDates(dateStrs).forEach(t => {
      if (t.cat1 === 'Weekend e Vacanze' && !t.flagCompetenza) {
        updateTransaction(t.txId, { flagCompetenza: true })
      }
    })
  }

  function unmark(dateStrs) {
    if (!dateStrs.length) return
    const toRemove = new Set(dateStrs)
    setAppPref('calendarNotVacationDates', notVacationDates.filter(d => !toRemove.has(d)))
    txOnDates(dateStrs).forEach(t => {
      if (t.flagCompetenza) updateTransaction(t.txId, { flagCompetenza: false })
    })
  }

  return { notVacationDates, mark, unmark }
}
