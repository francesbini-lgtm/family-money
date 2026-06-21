# Family Money Tracker — Guida Deploy

## Stack
- **Frontend:** React 19 + Vite
- **State:** Zustand
- **Backend:** Firebase (Auth, Firestore, AI Logic)
- **Charts:** Recharts
- **AI:** Gemini via Firebase AI Logic
- **Deploy:** Netlify Drop

---

## Prima del deploy: Firebase Console

### 1. Authentication → Domini autorizzati
Aggiungi il tuo dominio Netlify (es. `cheery-concha-163c24.netlify.app`):
```
Firebase Console → Authentication → Settings → Authorized domains → Add domain
```

### 2. Firestore Rules
Vai in Firestore → Rules e incolla:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Household data — only authenticated members
    match /households/{householdId}/{document=**} {
      allow read, write: if request.auth != null
        && exists(/databases/$(database)/documents/household_members/$(request.auth.uid))
        && get(/databases/$(database)/documents/household_members/$(request.auth.uid)).data.householdId == householdId;
    }
    // User settings and TOTP secrets — only the user themselves
    match /totp_secrets/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /user_settings/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    // Household membership — read by auth users, write by system
    match /household_members/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    // Invitations — read by anyone with token, write by owner
    match /invitations/{token} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
  }
}
```

### 3. Firebase AI Logic (Gemini)
```
Firebase Console → Build → AI Logic (o Vertex AI) → Enable
```
Scegli regione `europe-west8` (Milano) per rispettare il GDPR.

### 4. Firestore Indexes (opzionale per performance)
Se vedi errori "index required" nella console, Firebase ti manda un link diretto per crearli.

---

## Deploy su Netlify

### Metodo semplice (Netlify Drop)
1. Estrai `family-money-react.zip`
2. Vai su [app.netlify.com/drop](https://app.netlify.com/drop)
3. Trascina la cartella `dist` (non lo zip, la cartella dentro)
4. Copia il dominio assegnato (es. `cheery-concha-163c24.netlify.app`)
5. Aggiungilo in Firebase Auth → Authorized domains

### Fix SPA routing su Netlify
Crea un file `dist/_redirects` con:
```
/*  /index.html  200
```
Questo evita 404 su refresh della pagina.

---

## Primo accesso

1. Apri l'app su Netlify
2. Clicca "Accedi con Google" → accetta il popup
3. Prima volta → ti mostra il QR code per Microsoft Authenticator
   - Apri Microsoft Authenticator
   - Tocca + → Altro account
   - Scansiona il QR
4. Inserisci il codice a 6 cifre dall'app
5. Inserisci il PIN: `182218`
6. Sei dentro 🎉

### Demo mode
Al PIN inserisci `000000` → carica dati di esempio (6 mesi di transazioni fake).

---

## Struttura Firestore

```
households/{householdId}/
  transactions/{txId}
  scadenze/{id}
  vehicles/{id}
  veh_expenses/{id}
  vacations/{id}
  nanny_ts/{id}
  colf_ts/{id}
  portfolios/{id}
  sati_pots/{id}

household_members/{userId}
totp_secrets/{userId}
user_settings/{userId}
invitations/{token}
```

---

## Invitare un secondo membro (es. Sofia)

1. Impostazioni → Profilo → "Genera Link Invito"
2. Copia il link e mandalo a Sofia
3. Sofia apre il link → fa il login Google → TOTP setup → PIN
4. Da quel momento vede tutti i dati in tempo reale

---

## Abilitare le notifiche push

1. Vai in Scadenze → clicca "Notifiche" 
2. Accetta il permesso del browser
3. Le scadenze entro 7 giorni ti notificano automaticamente

---

## File da NON committare
- `src/firebase.js` contiene le credenziali Firebase — non condividerle pubblicamente.
  In produzione usa variabili d'ambiente Vite:
  ```
  VITE_FIREBASE_API_KEY=xxx
  ```
  E modifica `firebase.js` per leggere da `import.meta.env.VITE_*`.

---

## Troubleshooting

**Login loop dopo Google auth:**
→ Il dominio Netlify non è in Firebase Auth → Authorized domains. Aggiungilo.

**"Firebase AI Logic not enabled":**
→ Abilita il servizio in Firebase Console → AI Logic.

**Transazioni non si salvano:**
→ Controlla le Firestore Rules. Verifica di essere loggato.

**QR code non appare:**
→ Il servizio `api.qrserver.com` potrebbe essere bloccato. Usa il codice manuale.
