import { DOCUMENT } from '@angular/common';
import { Injectable, effect, inject, signal } from '@angular/core';
import { NfcLanguage, NfcSettingsDto } from '../models/nfc-game.models';

type Translation = {
  de: string;
  en: string;
};

const languageStorageKey = 'nfc-game-language';
const translatableAttributes = ['aria-label', 'title', 'placeholder', 'alt'] as const;

const translations: Translation[] = [
  { de: 'Live Plattform', en: 'Live platform' },
  { de: 'Live Game System', en: 'Live game system' },
  { de: 'NFC Game verwalten', en: 'Manage NFC Game' },
  { de: 'Verwalten', en: 'Manage' },
  { de: 'TV View öffnen', en: 'Open TV view' },
  { de: 'Light Mode', en: 'Light mode' },
  { de: 'Dark Mode', en: 'Dark mode' },
  { de: 'Ranking', en: 'Leaderboard' },
  { de: 'Spielabend', en: 'Game night' },
  { de: 'Spieleabend', en: 'Game nights' },
  { de: 'Spieleabend starten', en: 'Start game night' },
  { de: 'Spieleabend beenden', en: 'End game night' },
  { de: 'Neuer Spieleabend', en: 'New game night' },
  { de: 'Kein Spieleabend läuft', en: 'No game night is running' },
  { de: 'Vergangene Spieleabende', en: 'Past game nights' },
  { de: 'Noch keine vergangenen Spieleabende.', en: 'No past game nights yet.' },
  { de: 'Noch kein Gewinner', en: 'No winner yet' },
  { de: 'Kein Gewinner', en: 'No winner' },
  { de: 'Lade Spieleabend...', en: 'Loading game night...' },
  { de: 'Spieleabend konnte nicht gestartet werden.', en: 'Game night could not be started.' },
  { de: 'Spieleabend konnte nicht beendet werden.', en: 'Game night could not be finished.' },
  { de: 'Spieleabend-Daten konnten nicht geladen werden.', en: 'Game night data could not be loaded.' },
  { de: 'Starte einen Abend und alle danach gestarteten Game-Sessions werden automatisch zugeordnet.', en: 'Start a night and all game sessions started after that will be assigned automatically.' },
  { de: 'Wertungssystem', en: 'Scoring system' },
  { de: 'Punkte aus den Spielen zählen', en: 'Count points from games' },
  { de: 'Gewonnene Spiele zählen', en: 'Count won games' },
  { de: 'Optional', en: 'Optional' },
  { de: 'Schließen', en: 'Close' },
  { de: 'Abbrechen', en: 'Cancel' },
  { de: 'Starten', en: 'Start' },
  { de: 'Bereit', en: 'Ready' },
  { de: 'Beendet', en: 'Finished' },
  { de: 'Abbruch', en: 'Cancelled' },
  { de: 'zugeordnet', en: 'assigned' },
  { de: 'automatisch aufgenommen', en: 'added automatically' },
  { de: 'seit Start', en: 'since start' },
  { de: 'Dauer', en: 'Duration' },
  { de: 'Ergebnis', en: 'Result' },
  { de: 'Highlights', en: 'Highlights' },
  { de: 'Awards', en: 'Awards' },
  { de: 'Noch keine Awards. Der Abend braucht noch ein paar abgeschlossene Spiele.', en: 'No awards yet. The night needs a few finished games.' },
  { de: 'Bisherige Spiele', en: 'Games so far' },
  { de: 'Noch keine Spiele in diesem Spieleabend.', en: 'No games in this game night yet.' },
  { de: 'Spieler des Spieleabends', en: 'Players of the game night' },
  { de: 'Noch keine Spieleabend-Wertung.', en: 'No game night ranking yet.' },
  { de: 'Gleichstand', en: 'Tie' },
  { de: 'Siege', en: 'Wins' },
  { de: 'Minuten', en: 'minutes' },
  { de: 'Siege pro Spieler', en: 'Wins per player' },
  { de: 'Punkte pro Spieler', en: 'Points per player' },
  { de: 'Spieler', en: 'Players' },
  { de: 'Spiele', en: 'Games' },
  { de: 'Sounds', en: 'Sounds' },
  { de: 'Archiv', en: 'Archive' },
  { de: 'Verwaltung', en: 'Administration' },
  { de: 'Übersicht', en: 'Overview' },
  { de: 'Karten', en: 'Cards' },
  { de: 'Geräte', en: 'Devices' },
  { de: 'Devices', en: 'Devices' },
  { de: 'Inhalte', en: 'Content' },
  { de: 'Spielbibliothek', en: 'Game library' },
  { de: 'Soundbibliothek', en: 'Sound library' },
  { de: 'Einstellungen', en: 'Settings' },
  { de: 'Accounts', en: 'Accounts' },
  { de: 'Logout', en: 'Log out' },
  { de: 'Abmelden', en: 'Log out' },
  { de: 'Admin', en: 'Admin' },
  { de: 'NFC Game Admin', en: 'NFC Game Admin' },
  { de: 'Geräteeinstellungen', en: 'Device settings' },
  { de: 'Lädt...', en: 'Loading...' },
  { de: 'Speichert...', en: 'Saving...' },
  { de: 'Gespeichert', en: 'Saved' },
  { de: 'Fehler', en: 'Error' },
  { de: 'Darstellung', en: 'Appearance' },
  { de: 'Farbe & Theme', en: 'Color & theme' },
  { de: 'Farbe', en: 'Color' },
  { de: 'Theme', en: 'Theme' },
  { de: 'System', en: 'System' },
  { de: 'Helligkeit & Timeout', en: 'Brightness & timeout' },
  { de: 'Helligkeit', en: 'Brightness' },
  { de: 'Timeout', en: 'Timeout' },
  { de: 'Nie', en: 'Never' },
  { de: '1 Minute', en: '1 minute' },
  { de: '5 Minuten', en: '5 minutes' },
  { de: '10 Minuten', en: '10 minutes' },
  { de: 'Audio', en: 'Audio' },
  { de: 'Lautstärke & Sounds', en: 'Volume & sounds' },
  { de: 'Lautstärke', en: 'Volume' },
  { de: 'Sounds aktiv', en: 'Sounds enabled' },
  { de: 'Testton abspielen', en: 'Play test tone' },
  { de: 'Speichern', en: 'Save' },
  { de: 'Live', en: 'Live' },
  { de: 'Sprache', en: 'Language' },
  { de: 'Deutsch', en: 'German' },
  { de: 'Englisch', en: 'English' },
  { de: 'Website & Gerät', en: 'Website & device' },
  { de: 'Sprache & Oberfläche', en: 'Language & interface' },
  { de: 'Einstellungen konnten nicht gespeichert werden.', en: 'Settings could not be saved.' },
  { de: 'Bitte melde dich im Admin-Bereich an, um Einstellungen zu laden.', en: 'Please log in to the admin area to load settings.' },
  { de: 'Testton wurde ans Gerät gesendet.', en: 'Test tone was sent to the device.' },
  { de: 'Testton konnte nicht gesendet werden.', en: 'Test tone could not be sent.' },
  { de: 'NFC Geräte Simulation', en: 'NFC device simulation' },
  { de: 'ESP32 Touch Testgerät', en: 'ESP32 touch test device' },
  { de: 'Virtuelles NFC Touch Gerät', en: 'Virtual NFC touch device' },
  { de: '240x320 Display (ILI9341) + Touch-Input + echte Device Events.', en: '240x320 display (ILI9341) + touch input + real device events.' },
  { de: 'Daten neu laden', en: 'Reload data' },
  { de: 'Account verbinden', en: 'Connect account' },
  { de: 'Diesen Code im Admin-Tab Geräte eintragen.', en: 'Enter this code in the Devices admin tab.' },
  { de: 'Geräte öffnen', en: 'Open devices' },
  { de: 'Weniger Spieler', en: 'Fewer players' },
  { de: 'Teamgröße auswählen', en: 'Choose team size' },
  { de: 'Mehr Spieler', en: 'More players' },
  { de: 'NFC Karte scannen', en: 'Scan NFC card' },
  { de: 'Event senden', en: 'Send event' },
  { de: 'Session beenden', en: 'Finish session' },
  { de: 'Fernseher View', en: 'TV view' },
  { de: 'Fernseher', en: 'TV' },
  { de: 'Fernseher-Steuerung', en: 'TV controls' },
  { de: 'Angemeldet als', en: 'Signed in as' },
  { de: 'Warte auf QR-Scan', en: 'Waiting for QR scan' },
  { de: 'Warte auf Bestätigung am Handy', en: 'Waiting for confirmation on phone' },
  { de: 'Fehler beim Starten', en: 'Failed to start' },
  { de: 'Kein Account auf diesem Fernseher.', en: 'No account on this TV.' },
  { de: 'Mit dem Handy anmelden', en: 'Sign in with phone' },
  { de: 'Scanne den QR-Code, melde dich am Handy an oder erstelle dort einen Account. Der Fernseher verbindet sich danach automatisch.', en: 'Scan the QR code and sign in on your phone. The TV connects automatically afterwards.' },
  { de: 'Neuen QR-Code', en: 'New QR code' },
  { de: 'Normaler Login', en: 'Regular login' },
  { de: 'QR-Code zum Anmelden am Fernseher', en: 'QR code to sign in on TV' },
  { de: 'Gültig bis', en: 'Valid until' },
  { de: 'QR-Code wird vorbereitet', en: 'Preparing QR code' },
  { de: 'TV-Steuerung', en: 'TV controls' },
  { de: 'Spieler bearbeiten', en: 'Edit player' },
  { de: 'Spieler anlegen', en: 'Create player' },
  { de: 'Spielerbild Vorschau', en: 'Player image preview' },
  { de: 'Name', en: 'Name' },
  { de: 'Profilbild', en: 'Profile image' },
  { de: 'Bild auswählen', en: 'Choose image' },
  { de: 'Datei', en: 'File' },
  { de: 'Beschreibung', en: 'Description' },
  { de: 'NFC Karte', en: 'NFC card' },
  { de: 'Keine Karte zuweisen', en: 'Do not assign a card' },
  { de: 'Aktiv', en: 'Active' },
  { de: 'Neuer Spieler', en: 'New player' },
  { de: 'Status', en: 'Status' },
  { de: 'Punkte', en: 'Points' },
  { de: 'Bild', en: 'Image' },
  { de: 'Aktion', en: 'Action' },
  { de: 'Bearbeiten', en: 'Edit' },
  { de: 'Löschen', en: 'Delete' },
  { de: 'Keine Spieler vorhanden.', en: 'No players available.' },
  { de: 'Dieser Name kann später in anderen Nodes verwendet werden.', en: 'This name can be used later in other nodes.' },
  { de: 'Erwartete Karte', en: 'Expected card' },
  { de: 'Beliebige Karte', en: 'Any card' },
  { de: 'Spielerkarte', en: 'Player card' },
  { de: 'Spielkarte', en: 'Game card' },
  { de: 'Zufallsart', en: 'Random type' },
  { de: 'Zahlengenerator', en: 'Number generator' },
  { de: 'Team-/Spielergenerator', en: 'Team/player generator' },
  { de: 'Textgenerator', en: 'Text generator' },
  { de: 'Resultat als Variable speichern', en: 'Store result as variable' },
  { de: 'Live Arena', en: 'Live arena' },
  { de: 'Arena TV', en: 'Arena TV' },
  { de: 'Arena wird geladen...', en: 'Loading arena...' },
  { de: 'Spielverlauf', en: 'Game history' },
  { de: 'Session-Details', en: 'Session details' },
  { de: 'Ausgang', en: 'Result' },
  { de: 'Umfang', en: 'Scope' },
  { de: 'Konto-Punkte', en: 'Account points' },
  { de: 'vergeben', en: 'awarded' },
  { de: 'Endstand', en: 'Final result' },
  { de: 'Platzierung und Dashboard-Werte', en: 'Placements and dashboard values' },
  { de: 'Gewinner:', en: 'Winner:' },
  { de: 'Gewinner', en: 'Winner' },
  { de: 'Global', en: 'Global' },
  { de: 'Keine Teams gespeichert.', en: 'No teams saved.' },
  { de: 'Noch keine Events.', en: 'No events yet.' },
  { de: 'Lade Session...', en: 'Loading session...' },
  { de: 'Historie', en: 'History' },
  { de: 'offen', en: 'open' },
  { de: 'Offen', en: 'Open' },
  { de: 'Sieg', en: 'Win' },
  { de: 'Niederlage', en: 'Loss' },
  { de: 'Solo', en: 'Solo' },
  { de: 'Anzeigewert', en: 'Display value' },
  { de: 'läuft noch', en: 'still running' },
  { de: 'Lösche...', en: 'Deleting...' },
  { de: 'Noch keine Sessions.', en: 'No sessions yet.' },
  { de: 'Mit dem Handy bestätigen', en: 'Confirm on your phone' },
  { de: 'Verbindung wird erneut versucht', en: 'Retrying connection' },
  { de: 'Angemeldet', en: 'Signed in' },
  { de: 'QR-Code abgelaufen', en: 'QR code expired' },
  { de: 'Spiel beenden', en: 'Finish game' },
  { de: 'Beende...', en: 'Finishing...' },
  { de: 'Limit aktiv', en: 'Limit active' },
  { de: 'Live Rennen', en: 'Live race' },
  { de: 'Führung', en: 'Leading' },
  { de: 'Team bereit', en: 'Team ready' },
  { de: 'Wer liegt vorne?', en: 'Who is leading?' },
  { de: 'Spiel beendet', en: 'Game finished' },
  { de: 'Unentschieden', en: 'Draw' },
  { de: 'Niemand verliert heute.', en: 'Nobody loses today.' },
  { de: 'Beide Teams haben gleich viele Punkte.', en: 'Both teams have the same number of points.' },
  { de: 'Platz', en: 'Place' },
  { de: 'Runden', en: 'Rounds' },
  { de: 'Kurzüberblick', en: 'Quick guide' },
  { de: 'Flow-Builder', en: 'Flow builder' },
  { de: 'Spiele im Builder anlegen', en: 'Build games in the builder' },
  { de: 'Der Builder besteht aus Karten und Verbindungen. Jede Karte übernimmt genau einen Schritt, danach geht es über die passende Verbindung weiter.', en: 'The builder is made of cards and connections. Each card handles one step, then continues through the matching connection.' },
  { de: 'Grundablauf', en: 'Basic flow' },
  { de: 'Wichtige Regeln', en: 'Important rules' },
  { de: 'Vor dem Veröffentlichen', en: 'Before publishing' },
  { de: 'Karte platzieren', en: 'Place a card' },
  { de: 'Links einen Baustein wählen und auf die Fläche ziehen.', en: 'Pick a block on the left and place it on the canvas.' },
  { de: 'Verbindung setzen', en: 'Create a connection' },
  { de: 'Bei der ersten Karte "Von", beim Ziel "Zu" wählen.', en: 'Choose "From" on the first card and "To" on the target card.' },
  { de: 'Inhalt pflegen', en: 'Edit content' },
  { de: 'Rechts nur die Felder ausfüllen, die der Spieler wirklich sehen oder auslösen soll.', en: 'On the right, only fill in fields the player should actually see or trigger.' },
  { de: 'Werte speichern', en: 'Store values' },
  { de: 'Mit storeAs Eingaben benennen, damit spätere Karten sie wiederverwenden können.', en: 'Use storeAs to name inputs so later cards can reuse them.' },
  { de: 'Kleine, klare Schritte bauen.', en: 'Build small, clear steps.' },
  { de: 'Texte kurz halten. Das Gerät braucht Hinweise, keine Erklärungen.', en: 'Keep text short. The device needs prompts, not explanations.' },
  { de: 'Jede Verbindung braucht einen klaren Anlass, zum Beispiel NEXT oder CARD_SCANNED.', en: 'Every connection needs a clear trigger, for example NEXT or CARD_SCANNED.' },
  { de: 'Prüfen, speichern, dann veröffentlichen.', en: 'Validate, save, then publish.' },
  { de: 'Start vorhanden und erreichbar.', en: 'Start exists and is reachable.' },
  { de: 'Alle Schritte führen sinnvoll weiter.', en: 'All steps continue in a sensible way.' },
  { de: 'Texte am Gerät sind kurz und verständlich.', en: 'Device text is short and clear.' },
  { de: 'Links eine Karte wählen, anklicken oder auf die Fläche ziehen.', en: 'Choose a card on the left, click it, or drag it onto the canvas.' },
  { de: 'Mit Von und Zu den nächsten Schritt verbinden.', en: 'Connect the next step with From and To.' },
  { de: 'Dropdowns und Optionen rechts in den Eigenschaften pflegen.', en: 'Edit dropdowns and options in the properties panel on the right.' },
  { de: 'Werte mit storeAs speichern und später mit $ verwenden.', en: 'Store values with storeAs and use them later with $.' },
  { de: 'Hilfe', en: 'Help' },
  { de: 'Start', en: 'Start' },
  { de: 'Weiter', en: 'Next' },
  { de: 'Zurück', en: 'Back' },
  { de: 'Von', en: 'From' },
  { de: 'Zu', en: 'To' },
  { de: 'Validieren', en: 'Validate' },
  { de: 'Veröffentlichen', en: 'Publish' },
  { de: 'Schritt 1 von 5', en: 'Step 1 of 5' },
  { de: 'Schritt 2 von 5', en: 'Step 2 of 5' },
  { de: 'Schritt 3 von 5', en: 'Step 3 of 5' },
  { de: 'Schritt 4 von 5', en: 'Step 4 of 5' },
  { de: 'Schritt 5 von 5', en: 'Step 5 of 5' },
  { de: 'Karten aus der Palette ziehen', en: 'Drag cards from the palette' },
  { de: 'Links liegen alle Bausteine. Ziehe eine Karte auf die Fläche oder klicke sie an, wenn sie in der Mitte landen soll.', en: 'All building blocks are on the left. Drag a card onto the canvas or click it if it should land in the center.' },
  { de: 'Start ist der Einstieg in dein Spiel.', en: 'Start is the entry point of your game.' },
  { de: 'Anzeige-Karten zeigen Text, Popups oder Sounds.', en: 'Display cards show text, popups, or sounds.' },
  { de: 'NFC-Karten warten auf echte Karten-Scans.', en: 'NFC cards wait for real card scans.' },
  { de: 'Karten miteinander verbinden', en: 'Connect cards' },
  { de: 'Wähle bei der ersten Karte Von und danach bei der Zielkarte Zu. Der Builder legt den passenden Auslöser automatisch an.', en: 'Choose From on the first card and then To on the target card. The builder creates the matching trigger automatically.' },
  { de: 'Normale Karten verwenden meistens NEXT.', en: 'Regular cards usually use NEXT.' },
  { de: 'Scan-Karten verwenden CARD_SCANNED oder den konkreten Scan-Typ.', en: 'Scan cards use CARD_SCANNED or the specific scan type.' },
  { de: 'Bedingungen haben eigene Pfade für TRUE und FALSE.', en: 'Conditions have separate paths for TRUE and FALSE.' },
  { de: 'Dropdowns und Optionen steuern Pfade', en: 'Dropdowns and options control paths' },
  { de: 'Bei Menü-Karten erzeugt jede Option einen eigenen Ausgang. Wenn du im Dropdown eine Option änderst, bekommt der Pfad den passenden Event.', en: 'For menu cards, each option creates its own output. When you change an option in the dropdown, the path gets the matching event.' },
  { de: 'Optionen wie Weiter, Bank oder Team werden antippbar.', en: 'Options like Continue, Bank, or Team become tappable.' },
  { de: 'Verbindungen merken sich die ausgewählte Option.', en: 'Connections remember the selected option.' },
  { de: 'Dropdowns helfen bei Feldern wie Karte, Zielwert oder Empfänger.', en: 'Dropdowns help with fields like card, target value, or recipient.' },
  { de: 'Variablen mit $ schreiben', en: 'Write variables with $' },
  { de: 'Alles, was du speicherst, kannst du später mit $ wieder einsetzen. Tippe $ in ein Text- oder Berechnungsfeld, um Vorschläge zu öffnen.', en: 'Everything you store can be used later with $. Type $ in a text or calculation field to open suggestions.' },
  { de: 'storeAs legt den Namen ohne $ fest, zum Beispiel amount.', en: 'storeAs defines the name without $, for example amount.' },
  { de: '$amount setzt den gespeicherten Wert ein.', en: '$amount inserts the stored value.' },
  { de: '$lastScannedPlayer.name greift auf Eigenschaften eines Objekts zu.', en: '$lastScannedPlayer.name accesses properties of an object.' },
  { de: 'Prüfen, speichern, veröffentlichen', en: 'Validate, save, publish' },
  { de: 'Validieren zeigt dir fehlende Verbindungen oder unerreichbare Karten. Speichern legt den Entwurf ab, Veröffentlichen macht ihn spielbar.', en: 'Validate shows missing connections or unreachable cards. Save stores the draft, Publish makes it playable.' },
  { de: 'Jede Karte sollte vom Start erreichbar sein.', en: 'Every card should be reachable from Start.' },
  { de: 'Jede wichtige Entscheidung braucht einen nächsten Schritt.', en: 'Every important decision needs a next step.' },
  { de: 'Kurze Gerätetexte funktionieren während des Spiels am besten.', en: 'Short device texts work best during play.' },
  { de: 'Anzeige-Karte', en: 'Display card' },
  { de: 'NFC-Karte', en: 'NFC card' },
  { de: 'Text anzeigen', en: 'Show text' },
  { de: 'Willkommen', en: 'Welcome' },
  { de: 'Spieler scannen', en: 'Scan player' },
  { de: 'Bausteine', en: 'Blocks' },
  { de: 'Übung', en: 'Exercise' },
  { de: 'Übungsfläche', en: 'Practice canvas' },
  { de: 'Übungskarte', en: 'Practice card' },
  { de: 'Übung geschafft', en: 'Exercise complete' },
  { de: 'Übung wiederholen', en: 'Restart exercise' },
  { de: 'Noch offen', en: 'Still open' },
  { de: 'Ziehe eine Karte hierher oder klicke links auf einen Baustein.', en: 'Drag a card here or click a block on the left.' },
  { de: 'Das fühlt sich genauso an wie später auf der Canvas.', en: 'This works just like it will on the canvas later.' },
  { de: 'Intro', en: 'Intro' },
  { de: 'Regel zeigen', en: 'Show rule' },
  { de: 'Quelle wählen', en: 'Choose source' },
  { de: 'Verbindung erstellt', en: 'Connection created' },
  { de: 'Verbindung erstellt. NEXT ist gesetzt.', en: 'Connection created. NEXT is set.' },
  { de: 'Quelle gewählt. Klicke jetzt auf Zu.', en: 'Source selected. Now click To.' },
  { de: 'Klicke erst auf Von, danach auf Zu.', en: 'Click From first, then To.' },
  { de: 'Eigenschaften', en: 'Properties' },
  { de: 'Ausgänge', en: 'Outputs' },
  { de: 'Option wählen', en: 'Choose option' },
  { de: 'Ausgewählter Pfad:', en: 'Selected path:' },
  { de: 'Wähle eine Option im Dropdown.', en: 'Choose an option in the dropdown.' },
  { de: 'Wiederverwenden', en: 'Reuse' },
  { de: 'Variable erkannt', en: 'Variable detected' },
  { de: 'Tippe $', en: 'Type $' },
  { de: 'Text- oder Berechnungsfeld', en: 'Text or calculation field' },
  { de: 'z.B. Du bekommst $amount Punkte', en: 'e.g. You get $amount points' },
  { de: 'Vorschläge', en: 'Suggestions' },
  { de: 'Findet fehlende Pfade und nicht erreichbare Karten.', en: 'Finds missing paths and unreachable cards.' },
  { de: 'Legt den Flow als Entwurf ab.', en: 'Stores the flow as a draft.' },
  { de: 'Macht das Spiel für Sessions verfügbar.', en: 'Makes the game available for sessions.' },
  { de: 'Validieren üben', en: 'Practice validation' },
  { de: 'Flow geprüft', en: 'Flow checked' },
  { de: 'Bereit zum Speichern', en: 'Ready to save' },
  { de: 'Erst den Flow prüfen.', en: 'Check the flow first.' },
  { de: 'Alles bereit', en: 'All set' },
  { de: 'Merken', en: 'Remember' },
  { de: 'Loslegen', en: 'Get started' },
  { de: 'Der Flow ist deine Spiel-Anleitung', en: 'The flow is your game guide' },
  { de: 'Baue den Ablauf so, wie ihn das Gerät später erlebt: anzeigen, scannen, entscheiden, Werte ändern, abschließen.', en: 'Build the sequence as the device will experience it later: display, scan, decide, change values, finish.' },
  { de: 'Einzelne Aktionen im Spiel.', en: 'Individual actions in the game.' },
  { de: 'Verbindungen', en: 'Connections' },
  { de: 'Entscheiden, wohin es weitergeht.', en: 'Decide where the flow continues.' },
  { de: 'Variablen', en: 'Variables' },
  { de: 'Merken Werte für spätere Karten.', en: 'Store values for later cards.' },
  { de: '1. Karten drag & droppen', en: '1. Drag and drop cards' },
  { de: 'Ziehe links einen Baustein aus der Palette direkt auf die Canvas. Alternativ klickst du eine Karte an, dann wird sie mittig eingefügt.', en: 'Drag a block from the palette on the left directly onto the canvas. Alternatively, click a card and it will be inserted in the center.' },
  { de: 'Karten lassen sich danach direkt auf der Canvas verschieben.', en: 'Cards can then be moved directly on the canvas.' },
  { de: 'Die rechte Seitenleiste zeigt immer die Eigenschaften der ausgewählten Karte.', en: 'The right sidebar always shows the properties of the selected card.' },
  { de: 'Nutze kleine Schritte: eine Karte, eine Aufgabe.', en: 'Use small steps: one card, one job.' },
  { de: '2. Karten verbinden', en: '2. Connect cards' },
  { de: 'Klicke bei der Quellkarte auf Von und danach bei der Zielkarte auf Zu. So entsteht ein gerichteter Pfeil im Flow.', en: 'Click From on the source card and then To on the target card. This creates a directed arrow in the flow.' },
  { de: 'Der Pfeil zeigt, welcher Schritt als Nächstes kommt.', en: 'The arrow shows which step comes next.' },
  { de: 'Je nach Kartentyp wird automatisch ein passender Event wie NEXT, VALUE_CONFIRMED oder PLAYER_CARD_SCANNED gewählt.', en: 'Depending on the card type, a matching event such as NEXT, VALUE_CONFIRMED, or PLAYER_CARD_SCANNED is selected automatically.' },
  { de: 'Wenn eine Karte mehrere Ausgänge haben kann, erstellt der Builder den nächsten noch freien Ausgang.', en: 'If a card can have multiple outputs, the builder creates the next available output.' },
  { de: '3. Dropdowns und Menüpfade', en: '3. Dropdowns and menu paths' },
  { de: 'Dropdowns findest du rechts in den Eigenschaften. Bei Menü-Karten kannst du Optionen anlegen; jede Option kann später einen eigenen Pfad bekommen.', en: 'Dropdowns are in the properties panel on the right. For menu cards, you can create options; each option can later get its own path.' },
  { de: 'Eine Option "Bank" erzeugt zum Beispiel einen BANK_SELECTED-Pfad.', en: 'An option like "Bank" creates a BANK_SELECTED path, for example.' },
  { de: 'Bei Spieler- oder Spielkarten-Scans kannst du den erwarteten Kartentyp festlegen.', en: 'For player or game card scans, you can define the expected card type.' },
  { de: 'Bei Empfängern und Teamwerten helfen Dropdowns, vorhandene Variablen sauber auszuwählen.', en: 'For recipients and team values, dropdowns help select existing variables cleanly.' },
  { de: '4. Variablen verstehen', en: '4. Understand variables' },
  { de: 'Variablen transportieren Werte von einer Karte zur nächsten. In storeAs-Feldern schreibst du nur den Namen, später benutzt du ihn mit $.', en: 'Variables carry values from one card to the next. In storeAs fields you write only the name, then use it later with $.' },
  { de: 'Ein Number-Picker mit storeAs amount speichert eine Zahl.', en: 'A number picker with storeAs amount stores a number.' },
  { de: 'In Texten kannst du "Du bekommst $amount Punkte" schreiben.', en: 'In texts you can write "You get $amount points".' },
  { de: 'In Berechnungen funktionieren Ausdrücke wie $current - $amount oder $current + $amount.', en: 'In calculations, expressions like $current - $amount or $current + $amount work.' },
  { de: 'Typische Muster', en: 'Typical patterns' },
  { de: 'Wert eingeben und weiterverwenden', en: 'Enter and reuse a value' },
  { de: 'Spieler scannen und Namen anzeigen', en: 'Scan a player and show the name' },
  { de: 'Auswahl verzweigen', en: 'Branch from a choice' },
  { de: 'Speichere eine Zahl als amount und nutze sie später in Texten oder Berechnungen.', en: 'Store a number as amount and use it later in texts or calculations.' },
  { de: 'Speichere den gescannten Spieler als lastScannedPlayer und nutze danach seinen Namen.', en: 'Store the scanned player as lastScannedPlayer and then use their name.' },
  { de: 'Menü-Optionen wie Weiter, Bank und Team können jeweils eigene Verbindungen bekommen.', en: 'Menu options like Continue, Bank, and Team can each get their own connections.' },
  { de: 'Hero', en: 'Hero' },
  { de: 'Reader', en: 'Reader' },
  { de: 'Erkennen', en: 'Detection' },
  { de: 'Ablauf', en: 'Flow' },
  { de: 'Audio', en: 'Audio' },
  { de: 'System', en: 'System' },
  { de: 'Ein Reader für Karten, Abläufe und direkte Eingaben.', en: 'A reader for cards, flows, and direct input.' },
  { de: 'Kontaktlose Karten sofort erkennen.', en: 'Detect contactless cards instantly.' },
  { de: 'Jede Karte kann eigene Inhalte und Aktionen auslösen.', en: 'Each card can trigger its own content and actions.' },
  { de: 'Scannen, erkennen, weitermachen.', en: 'Scan, identify, continue.' },
  { de: 'Eingaben laufen direkt über das Display.', en: 'Inputs happen directly on the display.' },
  { de: 'Hinweise und Sounds kommen direkt aus dem Gerät.', en: 'Prompts and sounds come directly from the device.' },
  { de: 'Alles in einem kompakten System.', en: 'Everything in one compact system.' },
];

@Injectable({ providedIn: 'root' })
export class NfcI18nService {
  private readonly document = inject(DOCUMENT);
  private readonly languageState = signal<NfcLanguage>(this.initialLanguage());
  private readonly translationByText = new Map<string, Translation>();
  private readonly originalTextByNode = new WeakMap<Text, string>();
  private readonly translatedTextByNode = new WeakMap<Text, string>();
  private readonly originalAttributesByElement = new WeakMap<Element, Partial<Record<(typeof translatableAttributes)[number], string>>>();
  private readonly translatedAttributesByElement = new WeakMap<Element, Partial<Record<(typeof translatableAttributes)[number], string>>>();
  private observer: MutationObserver | null = null;
  private translationQueued = false;
  private applyingTranslations = false;

  readonly language = this.languageState.asReadonly();

  constructor() {
    for (const translation of translations) {
      this.translationByText.set(translation.de, translation);
      this.translationByText.set(translation.en, translation);
    }

    effect(() => {
      const language = this.languageState();
      this.document.documentElement.lang = language === 'DE' ? 'de' : 'en';
      this.persistLanguage(language);
      this.scheduleTranslateDocument();
    });
  }

  start() {
    if (this.observer || !this.document.body) return;

    this.observer = new MutationObserver(() => {
      if (this.applyingTranslations) return;
      this.scheduleTranslateDocument();
    });
    this.observeDocument();
    this.scheduleTranslateDocument();
  }

  applySettings(settings: NfcSettingsDto) {
    this.setLanguage(settings.language ?? 'DE');
  }

  setLanguage(language: NfcLanguage) {
    this.languageState.set(language);
  }

  translate(text: string, language = this.languageState()): string {
    return this.translateText(text, language);
  }

  pick(de: string, en: string, language = this.languageState()): string {
    return language === 'DE' ? de : en;
  }

  locale(language = this.languageState()): string {
    return language === 'DE' ? 'de-AT' : 'en-US';
  }

  private scheduleTranslateDocument() {
    if (this.translationQueued) return;

    this.translationQueued = true;
    queueMicrotask(() => {
      this.translationQueued = false;
      this.runTranslationPass();
    });
  }

  private runTranslationPass() {
    const body = this.document.body;
    if (!body || this.applyingTranslations) return;

    this.applyingTranslations = true;
    this.observer?.disconnect();
    try {
      this.translateDocument(this.languageState());
    } finally {
      this.applyingTranslations = false;
      this.observeDocument();
    }
  }

  private translateDocument(language: NfcLanguage) {
    const body = this.document.body;
    if (!body) return;

    const walker = this.document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      if (this.canTranslateNode(node)) textNodes.push(node);
    }

    for (const node of textNodes) {
      const source = this.originalTextForNode(node);
      const translated = this.translateWithWhitespace(source, language);
      if (translated !== node.data) node.data = translated;
      this.translatedTextByNode.set(node, translated);
    }

    for (const attribute of translatableAttributes) {
      for (const element of Array.from(body.querySelectorAll(`[${attribute}]`))) {
        const source = this.originalAttributeForElement(element, attribute);
        if (!source) continue;
        const translated = this.translateText(source, language);
        if (translated !== element.getAttribute(attribute)) element.setAttribute(attribute, translated);
        this.rememberTranslatedAttribute(element, attribute, translated);
      }
    }
  }

  private canTranslateNode(node: Text): boolean {
    const parent = node.parentElement;
    if (!parent) return false;
    if (['MAT-ICON', 'SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE'].includes(parent.tagName)) return false;
    return !parent.closest('[data-i18n-skip="true"]');
  }

  private originalTextForNode(node: Text): string {
    const current = restoreGermanUmlauts(node.data);
    const previousTranslation = this.translatedTextByNode.get(node);
    const previousOriginal = this.originalTextByNode.get(node);
    if (!previousOriginal || current !== previousTranslation) {
      this.originalTextByNode.set(node, current);
      return current;
    }
    return previousOriginal;
  }

  private originalAttributeForElement(element: Element, attribute: (typeof translatableAttributes)[number]): string | null {
    const current = element.getAttribute(attribute);
    if (!current) return null;

    const originalAttributes = this.originalAttributesByElement.get(element) ?? {};
    const translatedAttributes = this.translatedAttributesByElement.get(element) ?? {};
    if (!originalAttributes[attribute] || current !== translatedAttributes[attribute]) {
      originalAttributes[attribute] = current;
      this.originalAttributesByElement.set(element, originalAttributes);
      return current;
    }
    return originalAttributes[attribute] ?? current;
  }

  private rememberTranslatedAttribute(element: Element, attribute: (typeof translatableAttributes)[number], translated: string) {
    const translatedAttributes = this.translatedAttributesByElement.get(element) ?? {};
    translatedAttributes[attribute] = translated;
    this.translatedAttributesByElement.set(element, translatedAttributes);
  }

  private translateWithWhitespace(value: string, language: NfcLanguage): string {
    const match = value.match(/^(\s*)(.*?)(\s*)$/s);
    if (!match) return value;
    const translated = this.translateText(match[2], language);
    return `${match[1]}${translated}${match[3]}`;
  }

  private translateText(value: string, language: NfcLanguage): string {
    const normalized = restoreGermanUmlauts(value);
    const direct = this.translationByText.get(normalized);
    if (direct) return language === 'DE' ? direct.de : direct.en;

    let translated = normalized;
    for (const item of translations) {
      const source = language === 'DE' ? item.en : item.de;
      const target = language === 'DE' ? item.de : item.en;
      if (!canUsePartialTranslation(source, target)) continue;
      translated = translated.split(source).join(target);
    }
    return translated;
  }

  private initialLanguage(): NfcLanguage {
    try {
      const stored = localStorage.getItem(languageStorageKey);
      return stored === 'EN' ? 'EN' : 'DE';
    } catch {
      return 'DE';
    }
  }

  private persistLanguage(language: NfcLanguage) {
    try {
      localStorage.setItem(languageStorageKey, language);
    } catch {
      // Backend settings remain the source of truth for signed-in users.
    }
  }

  private observeDocument() {
    const body = this.document.body;
    if (!this.observer || !body) return;

    this.observer.observe(body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...translatableAttributes],
    });
  }
}

function canUsePartialTranslation(source: string, target: string): boolean {
  if (source === target) return false;
  if (source.length < 8) return false;
  if (!/[\s.,:;!?/()&-]/.test(source)) return false;
  if (target.includes(source)) return false;
  return true;
}

function restoreGermanUmlauts(value: string): string {
  return value
    .replaceAll('Geraet', 'Gerät')
    .replaceAll('Geraete', 'Geräte')
    .replaceAll('geraet', 'gerät')
    .replaceAll('geraete', 'geräte')
    .replaceAll('oeffnen', 'öffnen')
    .replaceAll('Oeffnen', 'Öffnen')
    .replaceAll('hoer', 'hör')
    .replaceAll('Zuruecksetzen', 'Zurücksetzen')
    .replaceAll('zuruecksetzen', 'zurücksetzen')
    .replaceAll('spaeter', 'später')
    .replaceAll('Naechste', 'Nächste')
    .replaceAll('naechste', 'nächste');
}
