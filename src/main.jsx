import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>)

// ── Service worker cleanup ──────────────────────
// L'app NON usa (e non deve usare) un service worker: non c'è alcun public/sw.js
// versionato nel repo, e la vecchia riga `register('/sw.js')` qui sotto era un
// residuo — quel file non esiste in nessuna build reale, quindi la register()
// falliva silenziosamente ad ogni avvio (catch(console.warn), mai visto perché
// non c'è console su mobile). Il problema vero: se in una build MOLTO più
// vecchia un service worker fosse mai stato realmente installato sul telefono
// di un utente, resterebbe attivo per sempre (i service worker sopravvivono
// ai deploy successivi finché non vengono esplicitamente disinstallati) e
// potrebbe intercettare in silenzio le richieste di rete della pagina —
// inclusi gli upload verso Firebase Storage, che si bloccano a 0% senza
// nessun errore visibile. Diagnosticato 2026-07-27 dopo aver escluso rete
// (5G e fibra si comportano identiche), VPN/DNS di sistema e ad-blocker.
// Fix: invece di registrare, disinstalliamo attivamente qualsiasi service
// worker già presente per questo dominio + svuotiamo la Cache Storage, ad
// ogni avvio dell'app.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then(regs => regs.forEach(reg => reg.unregister()))
    .catch(() => {})
}
if ('caches' in window) {
  caches.keys()
    .then(keys => Promise.all(keys.map(k => caches.delete(k))))
    .catch(() => {})
}
