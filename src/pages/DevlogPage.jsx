import { useState } from 'react'

// ── Hardcoded git log (updated with each push) ────────────
const DEVLOG = [
  { date:'2026-07-14 01:00', desc:"Sidebar: Casa/Veicoli/Spesa aggiunte sotto gruppo Uscite; nuova emoji Risparmio (🪙); icone Satispay/PayPal sostituite con piccoli SVG custom che ricreano i loghi reali (solo simbolo, non scritta)" },
  { date:'2026-07-14 00:32', desc:"Sidebar dinamica: drag&drop voci/sezioni, sezioni creabili/rinominabili/cancellabili, voci nascondibili — attivabile da ⚙ Personalizza menu in fondo alla sidebar; icona app v2 fedele all'immagine fornita dall'utente (anello aperto + famiglia di 4 + ingranaggio + plus); log Sviluppo riportato aggiornato (era fermo al 23/06) con data e ora" },
  { date:'2026-07-14 00:19', desc:"Nuova icona app: famiglia (2 adulti + bambino) + ingranaggio + plus, line-art bianco su nero" },
  { date:'2026-07-14 00:12', desc:"Riorganizzazione navigazione (General/Uscite/Altro, gear settings, Sviluppo in tab) + selettore mese/anno chart Spese per Categoria" },
  { date:'2026-07-14 00:00', desc:"Fix vari: riga carburante compatta, grafici veicoli, calendario, scadenze auto-rinnovo, YTD Cecilia" },
  { date:'2026-07-13 22:39', desc:"Fix fraintendimento carburante (spostato in Weekend e Vacanze), bug Forecast netAmt, Calendario vacanze" },
  { date:'2026-07-13 21:08', desc:"Grafici Registro Veicoli: media annua, parcheggio, istogramma per anno" },
  { date:'2026-07-13 20:48', desc:"Carburante: calcolo automatico costo da KM+consumo+prezzo medio benzina" },
  { date:'2026-07-13 20:36', desc:"Rimosso grafico 'Nuove destinazioni per anno' (richiesta utente)" },
  { date:'2026-07-13 20:19', desc:"Vacanze: spaziatura breakdown + KPI top4/posti nuovi/costo medio; veicoli: consumo km/l" },
  { date:'2026-07-13 20:06', desc:"Fix race condition data-loss vacanze + backup JSON" },
  { date:'2026-07-13 19:36', desc:"Spese interamente compensate escluse dalle 3 tabelle di revisione vacanze" },
  { date:'2026-07-13 19:12', desc:"Fix: 'Nuova vacanza' in Fuori periodo non assegnava la spesa" },
  { date:'2026-07-13 18:36', desc:"Breakdown candidata: descrizione originale nel pallino, niente più scroll orizzontale" },
  { date:'2026-07-13 18:30', desc:"Undo visibile dentro i modali (non solo toast in fondo alla pagina)" },
  { date:'2026-07-13 18:12', desc:"Vacanze da confermare: importo centrato + breakdown L1/L2 cliccabile" },
  { date:'2026-07-13 09:54', desc:"Docx: recupero 4 giri di modifiche non documentate" },
  { date:'2026-07-13 09:44', desc:"Import wizard: mega-step Vacanze dopo Compensazioni, scope corretto, Doppioni, back+undo" },
  { date:'2026-07-13 08:54', desc:"Import wizard: layout uniforme + step vacanze integrati" },
  { date:'2026-07-13 08:40', desc:"feat: consolidati i 3 bottoni WV2 (Da confermare/Fuori periodo/Non allocate) in un tab unico" },
  { date:'2026-07-13 02:16', desc:"fix: nascondere anche le righe L2 (sottocategoria) a zero in Uscite/Overview" },
  { date:'2026-07-13 02:11', desc:"fix: Uscite/Overview nasconde le categorie a zero in tutti i mesi" },
  { date:'2026-07-13 02:09', desc:"Docs: aggiorna sez. 9.3 con tipo Vacanze/Weekend editabile a mano e allineamento L2 in Assegna a vacanza" },
  { date:'2026-07-13 02:08', desc:"fix: Assegna a vacanza in 'Spese fuori periodo' ora allinea anche la L2" },
  { date:'2026-07-13 02:01', desc:"feat: tipo Weekend/Vacanze modificabile a mano nella tabella annuale" },
  { date:'2026-07-13 01:57', desc:"fix: pannello vacanza/weekend collegato filtrava per tipo scelto in L2" },
  { date:'2026-07-13 01:51', desc:"Docs: aggiorna sez. 9.3 con il pannello vacanza/weekend collegato nel selettore categoria" },
  { date:'2026-07-13 01:51', desc:"feat: pannello vacanza/weekend collegato nel selettore categoria (Transazioni)" },
  { date:'2026-07-13 01:45', desc:"Docs: aggiorna sez. 9.3 con selezione multipla, tasto MAI e pannello Escluse sempre in Spese non allocate" },
  { date:'2026-07-13 01:43', desc:"feat: pannello 'Escluse sempre' + tasto MAI in 'Spese non allocate'" },
  { date:'2026-07-13 01:39', desc:"feat: selezione multipla + accetta/ignora in blocco in 'Spese non allocate'" },
  { date:'2026-07-13 01:35', desc:"feat: tasto Annulla (undo) in 'Spese in giorni di vacanza non allocate'" },
  { date:'2026-07-13 01:26', desc:"fix: 'Spese in giorni di vacanza non allocate' escludeva anche la citta di casa" },
  { date:'2026-07-13 01:18', desc:"fix: cambio categoria L1 in Weekend/Vacanze faceva sparire la riga prima di poter scegliere L2" },
  { date:'2026-07-13 01:09', desc:"fix: assegna a vacanza non faceva nulla (id numerico vs stringa), aggiunta conferma undo" },
  { date:'2026-07-13 00:59', desc:"places: mostra in console il messaggio d'errore reale del proxy /api/places sui 500 (prima si vedeva solo 'HTTP 500', senza motivo)" },
  { date:'2026-07-13 00:50', desc:"AI enrichment: ridotto ENRICH_BATCH 15→6 (batch grandi/eterogenei degradano l'affidabilità del modello, confermato ripetutamente: singola=ok, batch=peggio); cleanRawDescFallback ora copre anche formati bancomat/carta esteri (Svizzera/CHF) e sequenze di token pagamento combinati" },
  { date:'2026-07-13 00:41', desc:"AI enrichBatch: fix root cause reale — descAI/counterpart esistenti (potenzialmente contaminati) venivano usati come fallback anche in force-re-enrich, impedendo qualunque autocorrezione; fix bug guardrail (merchant:null faceva risultare 'verificato' senza controllare descAI)" },
  { date:'2026-07-13 00:30', desc:"AI enrichBatch: guardrail deterministico anti-contaminazione — l'istruzione nel prompt non bastava (confermato dall'utente); ora verifica ogni risultato batch contro il testo originale e ri-arricchisce singolarmente le tx sospette (valore duplicato nel batch + assente nella propria descrizione)" },
  { date:'2026-07-13 00:12', desc:"AI enrichBatch: aggiunta istruzione anti-contaminazione nel prompt — le tx in batch con testo bancario molto simile venivano appiattite sullo stesso merchant/descAI del gruppo dominante" },
  { date:'2026-07-12 23:49', desc:"Docs: aggiorna sez. 9.3, assegnazione a vacanza sposta la competenza invece di estendere le date" },
  { date:'2026-07-12 23:47', desc:"WV2: assegnare a vacanza esistente ora sposta la competenza della spesa al primo giorno del periodo, invece di estendere le date della vacanza" },
  { date:'2026-07-12 23:26', desc:"WV2: allarga ulteriormente tabella 'non allocate' (2 colonne in più della gemella, scrollava ancora); puntino descrizione originale ora cliccabile (popover) in entrambe le tabelle" },
  { date:'2026-07-12 21:19', desc:"Fix: popup filtro colonna (Excel-style) esce dallo schermo quando si apre vicino al bordo destro (es. Importo) — clamp orizzontale" },
  { date:'2026-07-12 21:16', desc:"Docs: aggiorna sez. 6.4 con filtro colonna Importo (ricerca importo esatto)" },
  { date:'2026-07-12 21:16', desc:"Transazioni: ricerca per importo esatto — filtro Excel-style sulla colonna Importo (click sull'icona nell'header)" },
  { date:'2026-07-12 21:01', desc:"Docs: aggiorna sez. 9.2/9.3 con colonna Competenza nelle tabelle fuori periodo/non allocate" },
  { date:'2026-07-12 20:56', desc:"Weekend/Vacanze: colonna Data Competenza editabile nelle tabelle fuori periodo/non allocate; usa competenza (non _effDate cache) per determinare dentro/fuori periodo" },
  { date:'2026-07-12 20:25', desc:"Weekend/Vacanze: allarga modali (spese fuori periodo, non allocate, candidate) per evitare scroll orizzontale" },
  { date:'2026-07-12 20:12', desc:"Wizard: step Vacanze — competenza vera e collegamento vacanza per le prenotazioni Booking/Airbnb/Bravonext importate (merchant configurabili da Weekend e Vacanze)" },
  { date:'2026-07-12 20:12', desc:"Weekend e Vacanze v2: overlay Fuori periodo e To review, candidate con date editabili e solo con località, colonna Utente, tabelle anni allineate, riga tutta cliccabile; Calendario solo vacanze confermate con emoji per tipo; rimossa la sezione v1" },
  { date:'2026-07-12 19:23', desc:"Wizard: compensazioni/abbinamenti limitati alle transazioni dell'import corrente; nuova pagina riepilogo transazioni importate prima dei KPI" },
  { date:'2026-07-12 19:23', desc:"Importi netti post-compensazione in Analytics/Risparmio/Categorie/Mappa/Entrate; rimosse copie locali divergenti di netAmt (Calendario/Uscite)" },
  { date:'2026-07-12 19:23', desc:"Motore unico matching regole (ruleMatching.js): descAI/merchant/counterpart sui campi veri ovunque, King incluse, anteprima=esecuzione, condizioni vuote ignorate; catRules consolidate (13 test sintetici OK)" },
  { date:'2026-07-12 00:41', desc:"Undo batch per tutte le operazioni di massa (un solo Annulla ripristina tutto), guard input mutuo Forecast, cleanup compensazione entrate manuali" },
  { date:'2026-07-12 00:28', desc:"Card4 nel campo card (import + migrazione one-time), colonna Fonte in Altre Entrate (pagina 1280px), rimossa sezione costi condivisi" },
  { date:'2026-07-11 14:34', desc:"Filtro <1€ su importo netto (zero* nascoste); sync automatico prompt AI default in appPrefs (versionati, store sempre aggiornato)" },
  { date:'2026-07-11 14:28', desc:"AI enrichment transazioni estere: regole prompt per pagamenti in valuta (merchant/città/categoria), fallback descAI ripulito da prefissi tecnici e codici" },
  { date:'2026-07-11 14:00', desc:"Wizard importazione unificata: Importa multi-sorgente (conto/carte/PayPal), rifinitura guidata post-import, compensazioni e riepilogo finale" },
  { date:'2026-07-11 13:47', desc:"11 fix/feature UI: label istogrammi corrette (Uscite/PayPal), Da confermare PayPal+Carte, KPI rimborsi carte, sticky header, filtro Da abbinare, righe verdi rimborsi, KPI Accuracy senza nome, reset filtri Transazioni, Risparmio mesi chiusi" },
  { date:'2026-07-11 13:10', desc:"Enrichment esplicito: risultati AI non più scartati dai flag di modifica manuale; fallback descAI e regole post-AI anche in Discovery" },
  { date:'2026-07-11 11:46', desc:"Import: forza categorizzazione AI su tutte le righe, fallback descAI, nuovo step regole di sistema" },
  { date:'2026-07-11 11:29', desc:"Import: AI enrichment come ultimo step (dopo verifica saldo), schermata di progresso completa, fix errore che tornava al form" },
  { date:'2026-07-11 11:00', desc:"Allarga tabella Escluse in Impostazioni: colonna Ripristina sempre visibile" },
  { date:'2026-07-11 10:50', desc:"Riconciliazione carta: check di sicurezza automatico sul saldo (richiesta esplicita utente dopo un bug reale in cui il saldo saliva senza che l'app se ne accorgesse). Dopo import dettaglio + esclusione estratti, ricalcola il saldo conto e lo confronta con quello di prima dell'operazione: se differisce anche di un centesimo, esegue automaticamente undoLastTx() (rollback completo) e mostra un errore descrittivo con delta/mesi coinvolti invece del messaggio di successo. runAIAndSave ora ritorna un oggetto risultato (skipDoneUI per il flusso carta) invece di mostrare subito il successo, cosi' il check puo' intervenire prima. Testato con 3 scenari sintetici (riconciliazione corretta, dettaglio mancante = il bug reale, differenza di arrotondamento 1 centesimo)." },
  { date:'2026-07-11 10:33', desc:"Modale riconciliazione carta: nuova colonna 'Check Saldo' tra Estratto abbinato e Stato, spunta verde se l'importo torna esatto al centesimo indipendentemente dal segnale 'carta diversa' (richiesta utente da screenshot)." },
  { date:'2026-07-11 10:24', desc:"Audit trail esclusioni transazioni (richiesta utente): salvati automaticamente quando (excludedAt), chi (excludedBy - utente Google loggato sincronizzato in useStore.currentUser da AuthContext, o 'Sistema') e se manuale o automatica (excludedType/excludedReason) - iniettati in updateTransaction solo sulla transizione vera non-escluso->escluso, mai su riaffermazioni (es. AI Enrichment). Aggiornati anche i 2 percorsi batch delle regole AI che non passano da updateTransaction, il bottone Escludi manuale, il Saldo forzato, la riconciliazione carta e l'abbinamento Satispay. Tabella Escluse in Impostazioni arricchita con le nuove colonne Escluso il/Da chi/Tipo." },
  { date:'2026-07-11 10:02', desc:"Fix reale bug 'estratto carta escluso mai ripristinato dopo Undo': undoLastTx era async ma non aspettava MAI il completamento dei saveDocument/deleteDocument verso Firestore (fire-and-forget) - se l'utente navigava via subito dopo il click su Annulla, alcune scritture di ripristino potevano perdersi, lasciando l'estratto escluso per sempre e gonfiando il saldo dell'importo mancante. Fix: await Promise.allSettled su tutte le scritture. Bottone Annulla ora mostra 'Annullamento...' e si disabilita finche' non e' davvero completato. Aggiunto window.__fmtFixOrphanedCardExclusions() per trovare/riparare estratti gia' rimasti orfani da incidenti precedenti." },
  { date:'2026-07-11 09:54', desc:"CarteCredito: fix data senza anno nella tabella dettaglio carta (formato ora DD MMM AA, es. 05 Mag 24 - c'era un fmtDate locale duplicato senza anno). Pagina e tabella allargate (980->1280px, tabella 700->1050px minWidth) perche' la colonna Importo veniva tagliata." },
  { date:'2026-07-11 09:38', desc:"Diagnostica: window.__fmtDebugSaldo() in console per ispezionare quali transazioni sono escluse e perche', senza dover ipotizzare - necessario perche' il conteggio Transazioni resta normale (3634/4096) durante il bug del saldo crollato, quindi la causa non e' perdita dati ma qualcosa nel calcolo/flag excluded. Nessun impatto sul comportamento dell'app." },
  { date:'2026-07-11 08:35', desc:"Fix critico saldo: riconciliazione carta ora salva dettaglio+rettifiche PRIMA di escludere gli estratti (prima l'esclusione avveniva subito, il saldo restava senza rimpiazzo per tutta la durata della categorizzazione AI di centinaia di righe - bug segnalato: saldo crollato da 255.328 a 0, richiesto Undo manuale). runAIAndSave ora ritorna true/false, l'esclusione avviene solo se il salvataggio è andato a buon fine. Anche: colonna Importo nella tabella Carte di Credito allargata (nowrap+minWidth), non va piu' a capo." },
  { date:'2026-07-11 08:25', desc:"Riconciliazione carta: modale piu' largo (720->920px, 94vw) e colonne Estratto abbinato/Stato/azioni con nowrap/minWidth per evitare che importi e testo (es. 'carta diversa') vadano a capo, come segnalato dall'utente da screenshot." },
  { date:'2026-07-11 08:19', desc:"Riconciliazione carta di credito: abbinamento automatico basato solo su importo esatto al centesimo nel mese successivo, non più su parole chiave in descrizione (causava 0 abbinamenti se la banca scriveva la riga con dicitura non prevista). Numero carta in descrizione diventato controllo informativo: se diverso da quello configurato, segnala 'carta diversa' (warning) ma mantiene l'abbinamento valido. Testato con 5 scenari." },
  { date:'2026-07-11 01:44', desc:"Import CSV/XLS: verifica sul contenuto (valuta sempre <= contabile) per distinguere le due colonne data indipendentemente dalla dicitura dell'header, con auto-scambio se il guess iniziale risulta invertito. Testato con 3 casi sintetici." },
  { date:'2026-07-11 01:38', desc:"Fix reale rilevamento data contabile: pattern header 'Data' + 'Data Valuta' (nessuna delle due contiene 'contabile') non veniva riconosciuto, ricadeva sempre su valuta. Verificato con dati reali utente." },
  { date:'2026-07-11 01:31', desc:"Fix rilevamento colonna data contabile: il check cercava solo 'data contabile', non matchava header tipo 'Data Contabilizzazione' e ricadeva sempre sulla valuta" },
  { date:'2026-07-11 01:25', desc:"Import CSV/XLS carte: riconciliazione mensile (raggruppamento + selezione righe da importare) su data contabile (date_reg) invece di data valuta" },
  { date:'2026-07-11 01:12', desc:"Fix critico: setAppPref e altri documenti singleton (custom_cats, city_overrides, location_exclusions) ora usano merge:true invece di overwrite totale — causa reale di sparizione simultanea di soprannomi/chiave AI/vacanze/fornitori Utenze da sessioni con dati locali non aggiornati" },
  { date:'2026-07-11 01:01', desc:"Unifica compensazione Carte/PayPal/AltreEntrate: motore condiviso src/data/compensation.js, anti-doppia-compensazione, netAmt nei KPI core (Dashboard/Analytics/Transazioni/Carte/PayPal), badge+rimozione compensazione in PayPal" },
  { date:'2026-07-11 00:36', desc:"Utenze: mini-tabella mesi collassabile (chiusa di default) e ordine cronologico" },
  { date:'2026-07-11 00:19', desc:"Utenze: griglia 2x2, colori anno uniformi + legenda unica, mini-tabella mesi x anni, tooltip con anno, filtri Excel + ricerca in tabella" },
  { date:'2026-07-11 00:12', desc:"Carte di Credito: rimuove banner in costruzione, colonna Utente, KPI % categoria più usata, selezione multipla + abbina/compensa" },
  { date:'2026-07-11 00:03', desc:"Utenze: grafico multi-anno dot-line, fornitore in card, fix Altro (leftover puro), nascondi card senza fornitore" },
  { date:'2026-07-10 23:53', desc:"Fix: applySingleRule (esegui regola singola) ignorava rule.logic OR, sempre AND" },
  { date:'2026-07-10 23:47', desc:"Regole AI multi-condizione: aggiunto supporto logica O (OR), oltre a E (AND)" },
  { date:'2026-07-10 23:41', desc:"Carte di Credito: AI Descrizione editabile inline + colonne Categoria/Sottocategoria editabili" },
  { date:'2026-07-10 23:11', desc:"Alert chiave AI mancante in Home + check pre-import con conferma utente" },
  { date:'2026-07-10 23:00', desc:"Carte di Credito: tabella solo transazioni importate, istogramma mensile utilizzo carte, nuovi KPI" },
  { date:'2026-07-10 22:39', desc:"Migrazione Satispay: catch-all per accrediti esclusi orfani (senza satiMatches vivo), un-esclusi automaticamente" },
  { date:'2026-07-10 22:32', desc:"Satispay: accredito compensato non viene piu escluso (saldo reale sempre corretto), residuo simmetrico spesa/accredito via _compensatedAmt, migrazione dati storici" },
  { date:'2026-07-10 20:34', desc:"Saldo forzato spostato in sezione dedicata (Danger Zone) + fix coerenza Saldo Conto in Transazioni (ora filtra le escluse come Patrimonio/Dashboard)" },
  { date:'2026-07-10 19:58', desc:"Fix Undo riconciliazione carta: esclusione estratto + import dettaglio ora sono un unico blocco Undo (beginTxUndoBatch/commitTxUndoBatch)" },
  { date:'2026-07-10 19:42', desc:"Riconciliazione carta: abbinamento automatico ristretto esattamente al mese successivo (non piu un range di 2 mesi)" },
  { date:'2026-07-10 19:37', desc:"Fix riconciliazione carta: totale mese calcolato sul netto (non somma valori assoluti) + abbinamento automatico solo con estratti a data plausibile" },
  { date:'2026-07-10 19:31', desc:"Import carta: scarta righe di riepilogo/totale mensile nel file, totali sempre calcolati dalle transazioni singole" },
  { date:'2026-07-10 19:02', desc:"Fix critico: riconciliazione carta non scattava mai (type carta_credito/carta_debito); garanzia saldo invariato con rettifica automatica" },
  { date:'2026-07-10 18:44', desc:"Import: supporto file Excel (.xls/.xlsx) oltre a CSV" },
  { date:'2026-07-10 18:30', desc:"Import CSV carte: riconciliazione mensile spostata prima di AI/salvataggio" },
  { date:'2026-07-10 17:11', desc:"Satispay: click su barra/segmento del grafico annuale apre breakdown transazioni (data, nome, importo)" },
  { date:'2026-07-10 16:53', desc:"Satispay: etichetta importo dentro ogni segmento colorato (abbinati/non abbinati) nel grafico annuale" },
  { date:'2026-07-10 15:45', desc:"Satispay: fix reale - unifica il conteggio accrediti abbinati (satiMatches + _compensatedBy), risolve accrediti 'invisibili' nei grafici/contatori" },
  { date:'2026-07-10 15:13', desc:"Satispay: fix label totale mancante sulle barre verdi del grafico annuale (segmento a altezza 0)" },
  { date:'2026-07-10 15:04', desc:"Satispay: breakdown per anno accrediti non abbinati, totali sopra le barre nel grafico mensile" },
  { date:'2026-07-10 14:48', desc:"Weekend Vacanze v2: drill-down spese con ricategorizzazione, colonna Giorni, Costo/giorno, righe manuali carburante/autostrada; Uscite Overview: riconciliazione Adj vacanze" },
  { date:'2026-07-10 01:55', desc:"Entrate: rimossa annotazione (+bonus) dalla tabella Storico per Anno, mostra solo il totale" },
  { date:'2026-07-10 01:47', desc:"Entrate: fix Storico per Anno, bonus era gia incluso nella base Fra/Sofi mostrata" },
  { date:'2026-07-10 01:44', desc:"Entrate: valuta stipendio per singolo periodo/anno invece che unica per persona" },
  { date:'2026-07-10 00:56', desc:"Calendario: bottone Non e vacanza / Segna come vacanza direttamente nel popup del singolo giorno" },
  { date:'2026-07-10 00:54', desc:"Calendario: righe diagonali weekend anche sulle celle unite (modalita vacanza)" },
  { date:'2026-07-10 00:39', desc:"Calendario: righe diagonali sulle celle di sabato e domenica per distinguerle meglio" },
  { date:'2026-07-10 00:36', desc:"Weekend e Vacanze v2: totali sopra istogramma spesa + nuovo chart giorni di vacanza per anno" },
  { date:'2026-07-09 23:09', desc:"Weekend e Vacanze v2: undo su elimina/ignora + ripristino giorni esclusi per recuperare candidate perse" },
  { date:'2026-07-09 23:02', desc:"Weekend e Vacanze v2: selettore Mare/Montagna/Città editabile e colonna Costo/notte" },
  { date:'2026-07-09 21:26', desc:"Weekend e Vacanze v2: unione multi-candidata in una vacanza con nome comune (es. Svezia)" },
  { date:'2026-07-09 21:01', desc:"Weekend e Vacanze v2: tipo da categoria dominante, notti, emoji destinazione, pannello conferma candidate, grafico ultimi 5 anni" },
  { date:'2026-07-09 09:34', desc:"Calendario: drag-select giorni, flag 'non e vacanza' con revisione competenza; nuova sezione Uscite 'Weekend e Vacanze v2' sincronizzata col Calendario" },
  { date:'2026-07-09 08:57', desc:"Calendario: selezione multipla giorni per dichiarare vacanza+location; AI enrichment auto-categorizza Weekend e Vacanze nei periodi dichiarati; flag rivedere competenza per spese fuori periodo" },
  { date:'2026-07-09 08:01', desc:"Calendario: fix esclusione spese compensate (excluded flag in txByDate, tolleranza float su netAmt)" },
  { date:'2026-07-09 07:57', desc:"Calendario: nascondi spese compensate a zero da modal giorno e da cella" },
  { date:'2026-07-09 07:48', desc:"Calendario: mostra location nel titolo del modal giorno" },
  { date:'2026-07-09 00:39', desc:"fix: focus loss negli input del modal Impostazioni Stipendio (SalarySection nested component -> render function, key stabile)" },
  { date:'2026-07-09 00:16', desc:"fix: cursor jump in RAL inputs; hide zero-net txs in UscitePage" },
  { date:'2026-07-08 23:49', desc:"build: 20260708-2340 Rome" },
  { date:'2026-07-08 23:34', desc:"netAmt: fix CalendarioPage + UscitePage to show compensated amounts correctly" },
  { date:'2026-07-08 23:34', desc:"netAmt: fix CalendarioPage + UscitePage to show compensated amounts correctly" },
  { date:'2026-07-08 20:32', desc:"CompensaModal: mostra solo spese (amount < 0), escludi entrate" },
  { date:'2026-07-08 20:20', desc:"Fix APP_VERSION format: use actual Rome time (20260708-2019)" },
  { date:'2026-07-08 20:16', desc:"AltreEntrate CompensaModal: smart scoring (amount+date+desc), suggerito badge" },
  { date:'2026-07-08 09:04', desc:"Overlay popup fix; 💬 chiarimento AltreEntrate→Notifiche; dismiss ⚠️" },
  { date:'2026-07-08 08:56', desc:"Satispay: dismiss ⚠️ alert; note placeholder 'nota..'; righe più compatte" },
  { date:'2026-07-08 08:53', desc:"PayPal: multi-select abbina (compLinks); AltreEntrate mostra PayPal incomes" },
  { date:'2026-07-08 08:45', desc:"SatiCompensaModal: phase2 flow — abbina altra entrata per residuo" },
  { date:'2026-07-08 00:08', desc:"Calendario: fix date edit salva su competenza (non _effDate)" },
  { date:'2026-07-08 00:02', desc:"Calendario: DayModal filtra vacanze, editing inline data/descAI/cat per tx" },
  { date:'2026-07-07 13:03', desc:"Calendario: merge auto in vacanze, no toggle, fix city da vac txs, hint cross-mese" },
  { date:'2026-07-07 10:11', desc:"Calendario: campo location nel DayModal (anche giorni senza transazioni)" },
  { date:'2026-07-07 10:09', desc:"Calendario: nascondi Satispay solo se descAI contiene 'satispay'" },
  { date:'2026-07-07 10:04', desc:"Calendario: toggle Nascondi Satispay (attivo di default)" },
  { date:'2026-07-07 10:02', desc:"Satispay: colonna Stato min-width 220px + badge nowrap" },
  { date:'2026-07-07 09:56', desc:"Satispay: fix ⚠️ logica (accredito precedente), colonna Stato no wrap" },
  { date:'2026-07-07 08:35', desc:"Satispay: box compensazione anche per Cash Veicoli (usa txMatch)" },
  { date:'2026-07-07 08:33', desc:"Satispay: fix ⚠️ warning — cerca incTx anche in transactions (era excluded)" },
  { date:'2026-07-07 08:22', desc:"Calendario: unisci location + city edit; Satispay: ⚠️ data tardiva + undo" },
  { date:'2026-07-06 21:32', desc:"fix(calendario): celle fisse 36×52px overflow hidden; location mostra solo prima parola" },
  { date:'2026-07-06 21:27', desc:"fix(calendario): filtro vacanza mostra solo costi Weekend e Vacanze nelle celle" },
  { date:'2026-07-06 21:26', desc:"feat(satispay): matchSource tracking, auto-badge ⟳, unlink button in modal and table" },
  { date:'2026-07-06 21:23', desc:"fix(satispay): show accredito date in detail modal; require accredito >= spesa date for auto-match" },
  { date:'2026-07-05 15:08', desc:"feat(contanti): pending withdrawals, auto-assign, rebalance, fix linkedAmt" },
  { date:'2026-07-05 10:49', desc:"Mobile: portal overlays to body so confirmation sheets cover floating nav on iOS (fix z-index trap in .m-content); constrain sheets to 430px; v3.6.1" },
  { date:'2026-07-04 14:32', desc:"Media ACC Anno: annualized projection (currentYearTotal / monthsElapsed * 12)" },
  { date:'2026-07-04 14:31', desc:"Revert: keep Descrizione=description (original), restore _initCond to description, keep new Descrizione AI option" },
  { date:'2026-07-04 14:27', desc:"Rules: add Descrizione AI field option, default init to descAI instead of description" },
  { date:'2026-07-04 14:11', desc:"Annual chart: stacked income bars (light=non-abbinati, dark=abbinati), total label on top" },
  { date:'2026-07-04 14:08', desc:"Table: remove €sign from cells (add to title), rename last col to Media ACC Anno (current year / months elapsed)" },
  { date:'2026-07-04 12:58', desc:"Annual chart: labels on bars, no tooltip details; table: Media/anno + Media ult.6m columns" },
  { date:'2026-07-04 10:38', desc:"Total chart: annual (2022–now), icon opens category×year breakdown modal" },
  { date:'2026-07-04 10:35', desc:"Add total chart (all spese+accrediti incl compensated) above non-compensated chart" },
  { date:'2026-07-04 10:17', desc:"Fix chart: exclude compensated txs from tooltip totalTxs, show residual amount" },
  { date:'2026-07-04 10:15', desc:"Fix: apply search filter to accrediti rows in Spese da compensare" },
  { date:'2026-07-03 23:53', desc:"Fix accredito amount: show 2 decimal places" },
  { date:'2026-07-03 23:50', desc:"Spese da compensare: sticky thead, scrollable body, multi-select + Abbina button" },
  { date:'2026-07-03 23:44', desc:"Add NOTE column to Spese da compensare table (spesa + accredito rows)" },
  { date:'2026-07-03 23:40', desc:"fix: chart legend moved to top-right, tooltip maxHeight to avoid legend overlap" },
  { date:'2026-07-03 23:38', desc:"fix: accantonamenti non abbinati count excludes commissioni" },
  { date:'2026-07-03 23:30', desc:"fix: pre-populate CHF/EUR rates 2014-2026; tabs use Fra/Sofi names" },
  { date:'2026-07-03 23:25', desc:"feat: RAL config modal with 3 sections (tassi di cambio, salario 1, salario 2)" },
  { date:'2026-07-03 23:20', desc:"feat: chart tooltip shows individual txs; split transaction modal" },
  { date:'2026-07-03 23:14', desc:"feat: delta TX row in pot table, orange checkmark, splits capped to accantonamento" },
  { date:'2026-07-03 23:02', desc:"fix: delta message shows 'undefined' when no other pot selected" },
  { date:'2026-07-03 19:26', desc:"Entrate RAL: data inizio (month picker) invece di anno; rimuovi valuta/cambio da tabella; pannello ⚙️ sul grafico" },
  { date:'2026-07-03 16:16', desc:"Entrate RAL: aggiungi colonne Valuta e Cambio→EUR; push tutti i file aggiornati" },
  { date:'2026-07-03 16:08', desc:"Fix: king rule Run blocked by its own king protection — exclude self from isKingProtected check" },
  { date:'2026-07-03 15:57', desc:"Transactions: tighten COD–DATA column gap via CSS classes" },
  { date:'2026-07-03 15:03', desc:"Fix dates in Satispay modal; nowrap on AltreEntrate date; narrow COD column in Transactions" },
  { date:'2026-07-03 14:10', desc:"AltreEntrate: multi-compensation residuo — abbina più transazioni allo stesso incasso" },
  { date:'2026-07-03 14:01', desc:"AltreEntrate: rimuovi col Categoria; aggiungi col Residuo" },
  { date:'2026-07-03 13:59', desc:"AltreEntrate: cat L2 cliccabile/modificabile; importo no a-capo" },
  { date:'2026-07-03 13:33', desc:"AltreEntrate: fix popup descrizione originale (backdrop + centrato + chiudi)" },
  { date:'2026-07-03 12:55', desc:"PayPal: totali istogramma su tutti i mesi; Satispay: NOTA ultima colonna; AltreEntrate: causale + pallino desc originale" },
  { date:'2026-07-03 12:47', desc:"Calendario: rimuovi +/- importi; filtro vacanze basato su cat 'Weekend e Vacanze'" },
  { date:'2026-07-03 00:04', desc:"PayPal: totali uscite/entrate in cima alla tabella transazioni" },
  { date:'2026-07-03 00:02', desc:"fix: applySingleRule gives 0 when rule.action missing (saveEdit never wrote it)" },
  { date:'2026-07-02 23:57', desc:"fix: add all missing committed files causing Vercel build failures" },
  { date:'2026-07-02 23:52', desc:"Calendario: emoji barca/vacanza, filtri quick; fix pdfjs-dist in package.json" },
  { date:'2026-07-02 23:37', desc:"chore: bump version to 3.6.0" },
  { date:'2026-07-02 23:36', desc:"Satispay chart: fix tooltip labels (Addebiti vs Accrediti)" },
  { date:'2026-07-02 23:34', desc:"Uscite: sync all L1 cats, subtotale core, drag&drop row order" },
  { date:'2026-07-02 23:28', desc:"AccreditiNonAbbinati: colonna Nota manuale per ogni riga" },
  { date:'2026-07-02 23:23', desc:"Fix TDZ on descAI edit, compensation logic (excluded→0*), multi-link, skip btn" },
  { date:'2026-06-23', desc:'Satispay: quick filter "Compensate" in tabella Spese da compensare — nasconde le transazioni già abbinate parzialmente o totalmente; grafico spese non compensate esteso da 12 a 24 mesi' },
  { date:'2026-06-23', desc:'Risparmio: fix uscite mensili — mExp() ora usa expTotal() che esplode _satiLinked nei loro splits (stesso comportamento di Dashboard e Uscite); fix savgYear() con stessa logica' },
  { date:'2026-06-23', desc:'Satispay: tab Cecilia — flag "Fondo risparmio (no compensazione)" nel form pot; se attivo, nasconde SatiIncomeSection e SatiUsciteSection e mostra FundProjectionKPIs con proiezione saldo tra 1, 2, 5, 10, 15 anni (media versamenti ultimi 6 mesi)' },
  { date:'2026-06-23', desc:'Forecast: fix spese mensili — _satiLinked sostituiti con splits (stesso comportamento di Uscite e Dashboard); expTotal/expList aggiunti come helpers' },
  { date:'2026-06-23', desc:'Uscite: Media/mese → totale periodo ÷ 12 (era ÷ mesi attivi); asterisco con nota sotto tabella' },
  { date:'2026-06-23', desc:'Uscite: fix discrepanza cella/dettaglio — splits virtuali fondo Satispay ora incluse nei txs del pannello dettaglio (mostrate in corsivo come "⚙ Fondo: …", non cliccabili)' },
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
  const [d, t] = dateStr.split(' ')
  if (!t) return d
  return (
    <>
      <div>{d}</div>
      <div style={{ opacity: .6, fontWeight: 600 }}>{t}</div>
    </>
  )
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
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 92 }}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: 'var(--text3)',
                textAlign: 'center', lineHeight: 1.3, paddingTop: 14,
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
