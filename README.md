# Büchermonster

Eine PWA, um einen Bücherschrank zu erfassen. Läuft als App auf dem Homescreen, funktioniert offline und
speichert alles in der IndexedDB des Geräts.

**In diesem Repository liegt nur Quellcode.** Bücher, Notizen und die Namen von Leuten, die etwas ausgeliehen
haben, verlassen das Handy nie. Es gibt keinen Server, kein Konto und keine Synchronisation.

## Was die App kann

- Bücher per Barcode-Scan, per ISBN-Eingabe oder von Hand erfassen. Die Daten kommen von der Deutschen
  Nationalbibliothek, ersatzweise von OpenLibrary oder Google Books. Das ist die einzige Netzverbindung, die
  die App je aufbaut.
- Genre und Reihe werden aus der Antwort abgeleitet, aber nur vorgeschlagen — gespeichert wird, was im
  Formular steht.
- Lesestatus (ungelesen / lese gerade / gelesen), Bewertung von 1 bis 5, Genres, Reihe mit Bandnummer,
  Besitzer und ein Notizfeld je Buch.
- Verliehen und geliehen mit Person, Datum und Rückgabetermin; Überfälliges wird hervorgehoben, die Historie
  bleibt erhalten.
- Suchen über Titel, Autor, Reihe und Notizen. Sechs Sortierungen, sechs kombinierbare Filter.
- **Wunschliste** in einem eigenen Tab: Bücher draufscannen, „hab ich bekommen" schiebt sie ins Regal, und
  die Liste lässt sich als PDF verschicken — mit ISBN, damit derjenige die richtige Ausgabe findet. Beim
  Scannen meldet die App, wenn ein Buch schon im Regal oder schon auf der Wunschliste steht.
- Export als PDF und XLSX, Backup als JSON. Alles läuft im Browser, es geht nichts an einen Dienst raus.

## Entwickeln

```bash
npm install
npm run dev
```

```bash
npm test
npm run build
```

`npm run build` führt vorher `vue-tsc --noEmit` aus — ein Typfehler bricht den Build ab, in CI genauso.

Der Service Worker entsteht erst beim Produktions-Build. Für einen Offline-Test:

```bash
npm run build && npm run preview
```

Die App liegt dann unter `http://localhost:4173/buechermonster/`.

## Aufs Handy bekommen

Nach dem Deploy die Seite in **Chrome** (Android) bzw. **Safari** (iOS) öffnen und über das Menü zum
Startbildschirm hinzufügen. Android bietet das meist von selbst an.

Die Installation braucht **https**. Über `http://192.168.x.y` im heimischen WLAN lässt sich die App
anschauen, aber nicht installieren.

## Wo die Daten liegen

Ausschließlich in der IndexedDB des Browsers auf genau diesem Gerät. Das heißt:

- Ein neues Handy fängt bei null an. Vorher ein JSON-Backup ziehen und dort einspielen.
- Wer die Browserdaten für die Seite löscht, löscht das Regal.
- iOS räumt die Daten nicht installierter Web-Apps nach einigen Wochen Nichtbenutzung weg. Installiert ist sie
  davon ausgenommen.

Deshalb erinnert die App nach 30 Tagen ohne Backup daran. Der Import ersetzt den kompletten Bestand und
ergänzt ihn nicht.

## Aufbau

```
src/
├── db/          Dexie-Schema, Standardwerte, Backup
├── services/    Logik ohne UI: ISBN, Sortierschlüssel, Reihen-Heuristik,
│                Genre-Zuordnung, Filter, Buchsuche, Export
├── stores/      Pinia — Komponenten sprechen nur hierüber mit der Datenbank
├── components/  Wiederverwendete Bausteine
├── views/       Die Bildschirme
└── __tests__/   Vitest, 168 Tests über Datenschicht, Services und Stores
```

Komponenten importieren `db` nicht direkt. Sonst laufen Pinia-State und Datenbank auseinander, und die Liste
aktualisiert sich nach einer Änderung nicht mehr.

Der Base-Pfad `/buechermonster/` steht an vier Stellen und muss synchron bleiben: `vite.config.ts`, der Router
(über `import.meta.env.BASE_URL`), `start_url`/`scope` im Manifest und der Workbox-Fallback. Alle vier leiten
sich aus der einen Konstanten in `vite.config.ts` ab.

## Weiteres im Repo

- `docs/specs/2026-08-15-buechermonster-design.md` — Datenmodell und Entwurfsentscheidungen mit Begründung.
- `poc/buechermonster-klickdummy.html` — der Klickdummy von vor dem Bau. Eine Datei, Fake-Daten, keine
  Datenbank. Dient nur noch als Referenz für die Optik.
