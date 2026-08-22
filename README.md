# NFC Game

Eigenstaendiges NFC-Game-Projekt, aus den NFC-Teilen von `SebisProjectsWebsite` und `SebisProjectsServer` herausgeloest.

## Struktur

- `frontend`: Angular-App fuer das NFC-Game
- `backend`: Spring Boot Backend fuer das NFC-Game
- `backend/firmware`: ESP32-Firmware und OTA-Binaerdateien fuer das NFC-Device

## Lokale Ports

- Frontend: `http://localhost:4301`
- Backend: `http://localhost:8081`
- Postgres: `localhost:5433`

## Starten

1. Datenbank starten

```bash
cd /Users/ederersebastian/IdeaProjects/Test/NfcGame/backend
docker compose up -d
```

2. Backend starten

```bash
cd /Users/ederersebastian/IdeaProjects/Test/NfcGame/backend
./gradlew bootRun
```

3. Frontend starten

```bash
cd /Users/ederersebastian/IdeaProjects/Test/NfcGame/frontend
npm install
npm start
```

## Hinweise

- Das Frontend ist auf `http://localhost:8081` als API-Ziel vorkonfiguriert.
- Das Backend nutzt eine eigene Datenbank `nfcgamedb` auf Port `5433`.
- OTA-Firmware wird aus `backend/firmware/nfc-game-device` geladen.
- Die Device-Quellen aus dem bisherigen Frontend liegen unter `backend/firmware/device-source`.
