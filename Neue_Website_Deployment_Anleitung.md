# Neue Angular + Spring Boot + PostgreSQL Website auf den Server deployen

Feste Server-IP:

```text
159.195.44.54
```

Diese Anleitung ist als Vorlage für neue Projekte gedacht. Pro Projekt müssen vor allem Domain, Projektname, Backend-Port, DB-Port und DB-Zugangsdaten angepasst werden.

---

## 0. Werte für das neue Projekt festlegen

Beispiel:

```text
Domain:           neuesprojekt.sebi4.com
Frontend:         NeuesFrontend
Backend:          NeuesBackend

Server-Ordner:    /opt/neuesprojekt
Frontend-Ordner:  /var/www/neuesprojekt.sebi4.com/browser

Backend-Port:     8082
DB-Port:          5434

DB-Name:          neuesprojektdb
DB-User:          neuesprojekt
DB-Passwort:      EIN_SICHERES_PASSWORT
```

Wichtig: Für jedes neue Backend und jede neue PostgreSQL-Instanz einen noch freien Port verwenden.

Belegte Backend-Ports prüfen:

```bash
ss -ltnp | grep -E '8080|8081|8082|8083'
```

Belegte DB-Ports prüfen:

```bash
ss -ltnp | grep -E '5432|5433|5434|5435'
```

---

# 1. DNS-Eintrag erstellen

Beim Domainanbieter einen neuen `A`-Record erstellen.

Beispiel:

```text
Typ:       A
Hostname:  neuesprojekt
IP:        159.195.44.54
TTL:       3600
```

Danach prüfen:

```bash
dig +short neuesprojekt.sebi4.com
```

Erwartete Ausgabe:

```text
159.195.44.54
```

---

# 2. Ordner auf dem Server erstellen

Mit dem Server verbinden:

```bash
ssh root@159.195.44.54
```

Frontend-Ordner:

```bash
mkdir -p /var/www/neuesprojekt.sebi4.com/browser
```

Backend-/DB-Ordner:

```bash
mkdir -p /opt/neuesprojekt
```

Am Ende:

```text
/var/www/neuesprojekt.sebi4.com/browser
/opt/neuesprojekt
```

---

# 3. Angular Production Config vorbereiten

Im Production-Build sollte das Frontend für Backend-Requests relative URLs verwenden.

Empfohlen:

```text
/api
```

Beispiel:

```typescript
apiUrl: '/api'
```

Nicht verwenden:

```text
http://localhost:8080
http://localhost:8082
http://159.195.44.54:8082
```

Ein Request wie:

```text
/api/auth/login
```

wird dann automatisch zu:

```text
https://neuesprojekt.sebi4.com/api/auth/login
```

und Nginx leitet `/api/` an Spring Boot weiter.

---

# 4. Angular bauen

Lokal im Frontend-Projekt:

```bash
ng build --configuration production
```

Bei aktuellen Angular-Versionen liegt das Ergebnis meist unter:

```text
dist/PROJEKTNAME/browser/
```

Beispiel:

```text
dist/NeuesFrontend/browser/
```

---

# 5. Angular hochladen

Optional zuerst den alten Build löschen:

```bash
ssh root@159.195.44.54 "rm -rf /var/www/neuesprojekt.sebi4.com/browser/*"
```

Dann den neuen Build hochladen:

```bash
scp -r dist/NeuesFrontend/browser/* root@159.195.44.54:/var/www/neuesprojekt.sebi4.com/browser/
```

Auf dem Server prüfen:

```bash
ls -la /var/www/neuesprojekt.sebi4.com/browser/
```

Dort muss insbesondere vorhanden sein:

```text
index.html
```

---

# 6. PostgreSQL mit Docker Compose einrichten

Auf dem Server:

```bash
nano /opt/neuesprojekt/docker-compose.yml
```

Beispiel:

```yaml
services:
  database:
    image: postgres:15.2
    restart: unless-stopped
    ports:
      - "127.0.0.1:5434:5432"
    environment:
      POSTGRES_USER: neuesprojekt
      POSTGRES_DB: neuesprojektdb
      POSTGRES_PASSWORD: EIN_SICHERES_PASSWORT
    volumes:
      - ./db:/var/lib/postgresql/data
```

Wichtig:

```yaml
127.0.0.1:5434:5432
```

Dadurch ist PostgreSQL nur lokal auf dem Server erreichbar und nicht direkt aus dem Internet.

Die Daten werden dauerhaft gespeichert unter:

```text
/opt/neuesprojekt/db
```

---

# 7. Datenbank starten

```bash
cd /opt/neuesprojekt
docker compose up -d
```

Status:

```bash
docker compose ps
```

Logs:

```bash
docker compose logs --tail=80 database
```

Datenbank testen:

```bash
docker compose exec database psql -U neuesprojekt -d neuesprojektdb
```

Beenden:

```text
\q
```

---

# 8. Spring Boot mit der Server-DB verbinden

Das Backend muss auf die lokale Docker-DB zeigen.

Beispiel:

```text
jdbc:postgresql://localhost:5434/neuesprojektdb
```

Zum Beispiel in `application-prod.yml`:

```yaml
spring:
  datasource:
    url: jdbc:postgresql://localhost:5434/neuesprojektdb
    username: neuesprojekt
    password: EIN_SICHERES_PASSWORT
```

Falls Flyway verwendet wird, werden die Tabellen beim ersten Start normalerweise automatisch erstellt.

---

# 9. Spring Boot bauen

Lokal im Backend-Projekt:

```bash
./gradlew clean bootJar
```

JAR-Datei prüfen:

```bash
ls -lh build/libs/
```

Beispiel:

```text
NeuesBackend-0.0.1-SNAPSHOT.jar
```

---

# 10. Backend hochladen

Lokal:

```bash
scp build/libs/NeuesBackend-0.0.1-SNAPSHOT.jar root@159.195.44.54:/opt/neuesprojekt/app.jar
```

Damit heißt die Datei auf dem Server immer:

```text
/opt/neuesprojekt/app.jar
```

---

# 11. restart.sh erstellen

Auf dem Server:

```bash
nano /opt/neuesprojekt/restart.sh
```

Inhalt:

```bash
#!/bin/bash

PID_FILE="/opt/neuesproject/app.pid"
LOG_FILE="/opt/neuesproject/backend.log"
JAR_FILE="/opt/neuesproject/app.jar"

if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")

    if kill -0 "$PID" 2>/dev/null; then
        echo "Stopping backend PID $PID..."
        kill "$PID"
        sleep 2
    fi
fi

echo "Starting backend..."

nohup java -jar "$JAR_FILE" \
    --spring.profiles.active=prod \
    --spring.datasource.url=jdbc:postgresql://127.0.0.1:5434/neuesprojectdb \
    --spring.datasource.username=neuesproject \
    --spring.datasource.password=neuesproject_password \
    --server.address=127.0.0.1 \
    --server.port=8082 \
    > "$LOG_FILE" 2>&1 &

echo $! > "$PID_FILE"

echo "Backend started with PID $(cat "$PID_FILE")"
```

Ausführbar machen:

```bash
chmod +x /opt/neuesprojekt/restart.sh
```

---

# 12. Backend starten

```bash
/opt/neuesprojekt/restart.sh
```

Logs:

```bash
tail -n 80 /opt/neuesprojekt/backend.log
```

Live-Logs:

```bash
tail -f /opt/neuesprojekt/backend.log
```

---

# 13. Prüfen, ob Spring Boot läuft

```bash
ss -ltnp | grep 8082
```

Direkt testen:

```bash
curl -i http://127.0.0.1:8082/
```

Ein `404` ist okay, wenn das Backend keinen Endpoint `/` besitzt.

Besser einen echten API-Endpoint testen:

```bash
curl -i http://127.0.0.1:8082/api/DEIN-ENDPOINT
```

---

# 14. Nginx Config erstellen

Auf dem Server:

```bash
nano /etc/nginx/sites-available/neuesprojekt.sebi4.com
```

Inhalt:

```nginx
server {
    listen 80;
    listen [::]:80;

    server_name neuesprojekt.sebi4.com;

    root /var/www/neuesprojekt.sebi4.com/browser;
    index index.html;

    client_max_body_size 50m;

    # Spring Boot Backend
    location /api/ {
        proxy_pass http://127.0.0.1:8082;

        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # Angular SPA
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Wichtig:

Wenn Spring Boot selbst Endpoints wie diese besitzt:

```text
/api/auth/login
/api/projects
```

dann:

```nginx
proxy_pass http://127.0.0.1:8082;
```

ohne `/` am Ende verwenden.

---

# 15. Nginx Site aktivieren

```bash
ln -s /etc/nginx/sites-available/neuesprojekt.sebi4.com /etc/nginx/sites-enabled/neuesprojekt.sebi4.com
```

Prüfen:

```bash
ls -la /etc/nginx/sites-enabled/
```

Dort sollte etwas wie Folgendes stehen:

```text
neuesprojekt.sebi4.com -> /etc/nginx/sites-available/neuesprojekt.sebi4.com
```

---

# 16. Nginx testen und laden

```bash
nginx -t
```

Erwartet:

```text
syntax is ok
test is successful
```

Danach:

```bash
systemctl reload nginx
```

Jetzt sollte HTTP funktionieren:

```text
http://neuesprojekt.sebi4.com
```

---

# 17. HTTPS mit Certbot aktivieren

Erst nachdem HTTP funktioniert:

```bash
certbot --nginx -d neuesprojekt.sebi4.com
```

Danach:

```bash
nginx -t
systemctl reload nginx
```

Jetzt sollte die Seite erreichbar sein unter:

```text
https://neuesprojekt.sebi4.com
```

---

# 18. API über HTTPS testen

```bash
curl -i https://neuesprojekt.sebi4.com/api/DEIN-ENDPOINT
```

Aufbau:

```text
Angular
   |
   | /api/...
   v
https://neuesprojekt.sebi4.com
   |
   v
Nginx
   |
   v
127.0.0.1:8082
   |
   v
Spring Boot
   |
   v
localhost:5434
   |
   v
PostgreSQL Docker
```

---

# 19. CORS-Fehler

Wenn Folgendes erscheint:

```text
Invalid CORS request
```

prüfen:

1. Angular Production verwendet `/api`.
2. Es wird kein `localhost` oder Server-IP als API-URL verwendet.
3. Falls Spring Security explizite Origins verwendet, die Production-Domain hinzufügen:

```text
https://neuesprojekt.sebi4.com
```

Zusätzlich zu z. B.:

```text
http://localhost:4200
```

---

# 20. 502 Bad Gateway

Ein `502 Bad Gateway` bedeutet normalerweise:

Nginx läuft, aber Spring Boot ist nicht erreichbar.

Prüfen:

```bash
ss -ltnp | grep 8082
```

Logs:

```bash
tail -n 100 /opt/neuesprojekt/backend.log
```

Backend direkt testen:

```bash
curl -i http://127.0.0.1:8082/
```

Nginx-Fehler:

```bash
tail -n 50 /var/log/nginx/error.log
```

Nach einem Backend-Neustart kann für einige Sekunden ein `502` erscheinen, während Spring Boot noch startet.

---

# 21. Falsche Website oder Home Assistant wird angezeigt

Falls die Domain eine andere Seite oder Home Assistant öffnet:

```bash
ls -la /etc/nginx/sites-enabled/
```

Prüfen, ob die neue Site aktiviert wurde.

Zusätzlich:

```bash
nginx -T | grep -n -B 5 -A 20 "neuesprojekt.sebi4.com"
```

Häufige Ursache:

- DNS vorhanden
- Nginx Config erstellt
- aber Symlink unter `sites-enabled` vergessen

---

# 22. Lokale PostgreSQL-Daten übernehmen

Falls die lokale DB bereits Daten enthält:

## Lokal exportieren

```bash
docker compose exec -T database pg_dump -U neuesprojekt -d neuesprojektdb > neuesprojektdb.sql
```

Auf Server hochladen:

```bash
scp neuesprojektdb.sql root@159.195.44.54:/opt/neuesprojekt/
```

## Auf dem Server importieren

```bash
cd /opt/neuesprojekt
docker compose exec -T database psql -U neuesprojekt -d neuesprojektdb < neuesprojektdb.sql
```

Tabellen prüfen:

```bash
docker compose exec database psql -U neuesprojekt -d neuesprojektdb
```

Dann:

```text
\dt
```

---

# Normaler Deployment-Ablauf nach der Ersteinrichtung

## Frontend / Angular

Lokal:

```bash
ng build --configuration production
```

Optional alten Build löschen:

```bash
ssh root@159.195.44.54 "rm -rf /var/www/neuesprojekt.sebi4.com/browser/*"
```

Neuen Build hochladen:

```bash
scp -r dist/NeuesFrontend/browser/* root@159.195.44.54:/var/www/neuesprojekt.sebi4.com/browser/
```

Bei einem normalen Angular-Update ist kein Nginx-Neustart nötig.

---

## Backend / Spring Boot

Lokal:

```bash
./gradlew clean bootJar
```

```bash
scp build/libs/NeuesBackend-0.0.1-SNAPSHOT.jar root@159.195.44.54:/opt/neuesprojekt/app.jar
```

Server:

```bash
/opt/neuesprojekt/restart.sh
```

Logs:

```bash
tail -n 80 /opt/neuesprojekt/backend.log
```

---

## Datenbank

Normalerweise ist bei einem normalen Deployment nichts zu tun.

Status:

```bash
cd /opt/neuesprojekt
docker compose ps
```

Falls sie nicht läuft:

```bash
docker compose up -d
```

Logs:

```bash
docker compose logs --tail=80 database
```

---

# Vorlage für jedes neue Projekt

```text
DOMAIN=
FRONTEND_NAME=
BACKEND_NAME=

SERVER_IP=159.195.44.54

PROJECT_DIR=/opt/...
FRONTEND_DIR=/var/www/.../browser

BACKEND_PORT=
DB_PORT=

DB_USER=
DB_NAME=
DB_PASSWORD=
```

Empfohlene Struktur:

```text
/var/www/DOMAIN/browser
└── Angular

/opt/PROJEKT/
├── app.jar
├── restart.sh
├── backend.log
├── app.pid
├── docker-compose.yml
└── db/
```

Nginx-Aufbau:

```text
https://DOMAIN/
        ├── /       → Angular
        └── /api/   → Spring Boot → PostgreSQL
```

Wichtig bei mehreren Projekten auf demselben Server:

- jede Domain bekommt eine eigene Nginx Config
- jedes Backend bekommt einen eigenen Port
- jede PostgreSQL-Instanz bekommt einen eigenen Host-Port
- PostgreSQL möglichst nur an `127.0.0.1` binden
- vor neuen Ports immer prüfen, ob sie schon verwendet werden
