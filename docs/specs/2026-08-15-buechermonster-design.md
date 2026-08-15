# Büchermonster (BM) — Design & Umsetzungsplan

Stand: 2026-08-15
Repo: `buechermonster` (öffentlich, GitHub Pages)
URL später: `https://<github-user>.github.io/buechermonster/`

## Was die App ist

Eine PWA für genau ein Handy. Erfasst den eigenen Bücherschrank, funktioniert offline, speichert alles
in der IndexedDB des Geräts. Kein Server, kein Login, kein Sync. Die einzige Netzverbindung, die die App
je aufbaut, ist der ISBN-Abruf beim Erfassen eines neuen Buchs.

Im GitHub-Repo liegt ausschließlich Quellcode. Keine Buchdaten, keine Notizen, keine Namen von Leuten,
die etwas ausgeliehen haben.

## Stack

Vue 3 (`<script setup lang="ts">`) · TypeScript · Vite 6 · Pinia · Dexie 4 · Tailwind 3 ·
vite-plugin-pwa · Vitest + happy-dom + fake-indexeddb · Deploy über GitHub Actions auf Pages.

TypeScript entschieden am 2026-08-15. Der Build läuft über `vue-tsc --noEmit && vite build`, ein Typfehler
bricht damit auch die GitHub-Action ab. Die JS-only-Regel des Users bleibt für UI5-Apps bestehen und gilt hier
nicht, siehe `mobile-pwa-creator`-Skill.

Zentral ist `src/types.ts`: `BookStatus = 'unread' | 'reading' | 'read'` und
`LoanDirection = 'out' | 'in'` stehen dort als Union-Typen, die Dexie-Tabellen werden als
`Table<Book, number>` typisiert. Damit ist ein Tippfehler in einem Statuswert ein Build-Fehler und kein
Filter, der stillschweigend nichts findet.

Zusätzlich, jeweils lazy geladen (erst beim ersten Benutzen heruntergeladen, danach vom Service Worker
gecacht und offline verfügbar):

| Zweck | Paket | ca. |
|---|---|---|
| PDF-Export | `jspdf` + `jspdf-autotable` | 400 KB |
| XLSX-Export | `xlsx` (SheetJS) | 350 KB |
| Barcode-Fallback | `@zxing/browser` | 200 KB |

---

## Datenmodell (Dexie)

```js
db.version(1).stores({
  books:       '++id, titleSort, authorSort, *authors, status, rating, seriesId, isbn13, ownerId, addedAt',
  genres:      '++id, &name, isDefault',
  book_genres: '++id, bookId, genreId, [bookId+genreId]',
  series:      '++id, &name',
  owners:      '++id, &name, isDefault',
  loans:       '++id, bookId, direction, returnedAt, dueAt',
  settings:    '&key'
});
```

### books

Indizierte Felder stehen oben im Schema-String, alles Weitere sind freie Properties:

| Feld | Typ | Herkunft |
|---|---|---|
| `title`, `subtitle` | String | API oder manuell |
| `titleSort` | String | abgeleitet, führende Artikel abgeschnitten (siehe Sortierung) |
| `authors` | Array&lt;String&gt; | API oder manuell, multiEntry-Index für den Autor-Filter |
| `authorSort` | String | abgeleitet, `"Funke, Cornelia"` |
| `isbn13`, `isbn10` | String\|null | Scan oder manuell |
| `publisher`, `publishedYear`, `pageCount`, `language` | | API |
| `coverDataUrl` | String\|null | Base64-Thumbnail, damit Cover offline da sind |
| `status` | `'unread'` \| `'reading'` \| `'read'` | Pflichtfeld, genau einer |
| `rating` | 0–5 | 0 = nicht bewertet |
| `ownerId` | Number | wem das Buch gehört, siehe `owners` |
| `seriesId`, `seriesIndex` | Number\|null | Reihe + Bandnummer |
| `notes` | String | das Notizfeld aus der Detailansicht |
| `addedAt`, `updatedAt`, `finishedAt` | ISO-String | |

Autoren liegen als Array direkt am Buch, nicht in einer eigenen Tabelle. Der `*authors`-multiEntry-Index
macht den Autorenfilter trotzdem schnell, und ein Buch mit drei Autoren braucht keine Junction-Zeilen.

Genres dagegen bekommen eine eigene Tabelle plus M:N-Verknüpfung, weil sie eine gepflegte Liste mit Farben
sind und ein Buch mehreren Genres angehören darf (Fantasy + Jugendbuch).

### owners

Der Schrank gehört einer Person, ein Teil der Bücher gehört jemand anderem. Deshalb ein `ownerId` am Buch
statt eines Booleans: ein Boolean wie `isOwn` würde behaupten, es gehe um „gehört der App-Besitzerin",
gemeint ist aber das Gegenteil, nämlich „gehört Adi". Zwei Einträge sind vorbelegt und in den Einstellungen
umbenennbar, ein dritter Name lässt sich jederzeit ergänzen. Der Eintrag mit `isDefault` ist die Vorbelegung
beim Anlegen neuer Bücher, und nur abweichende Besitzer bekommen im Regal einen Chip — sonst stünde an
fast jedem Buch dasselbe dran.

Besitz und Ausleihe sind zwei verschiedene Dinge: ein Buch von Adi im Schrank ist nicht geliehen, es steht
einfach da.

### loans

Eine Zeile pro Ausleihvorgang, Historie bleibt erhalten:

| Feld | Bedeutung |
|---|---|
| `direction` | `'out'` = ich hab's verliehen, `'in'` = ich hab's geliehen |
| `personName` | an wen bzw. von wem |
| `startedAt` | Datum |
| `dueAt` | Rückgabetermin, optional |
| `returnedAt` | `null` solange offen — das ist die Definition von „aktuell ausgeliehen" |

Ein Buch ist ausgeliehen, wenn dazu ein Loan mit `returnedAt === null` existiert. Kein separates
Boolean-Flag am Buch, sonst laufen die zwei Wahrheiten irgendwann auseinander.

### Seed-Genres

Roman & Belletristik, Krimi & Thriller, Fantasy, Science-Fiction, Historisches, Horror, Liebesroman,
Klassiker, Kinder- & Jugendbuch, Comic & Graphic Novel, Sachbuch, Biografie, Ratgeber, Kochbuch, Reise.

Eigene Genres kannst du in den Einstellungen anlegen, umbenennen, einfärben und löschen.

---

## ISBN-Erfassung

Drei Wege, alle enden im selben Bearbeiten-Formular, bevor gespeichert wird:

1. **Barcode scannen.** Kamera über `getUserMedia`, Erkennung primär mit der nativen `BarcodeDetector`-API
   (Android Chrome kann das ohne Zusatzcode), sonst wird `@zxing/browser` nachgeladen — der Weg für
   iOS-Safari. Drei Punkte, an denen das sonst still scheitert und die am 2026-08-15 genau so gescheitert
   sind: die Formatliste darf nur Werte aus der Spezifikation enthalten (`'isbn'` gibt es dort nicht, der
   Konstruktor wirft dann und die Kamera läuft ohne je etwas zu erkennen), die Kamera braucht
   `focusMode: 'continuous'`, weil ein Handy auf Nahdistanz sonst nicht scharfstellt, und die Auflösung
   muss hoch genug sein, damit die schmalen Striche eines EAN-13 überhaupt genug Pixel bekommen.
   Vorbild ist der Scanner im Vorratsmonster, der genau das richtig macht.

   Ein gescannter EAN-13 wird zusätzlich auf den Bereich 978/979 geprüft. Produkt-Barcodes rechnen die
   Prüfziffer identisch — ohne diese Prüfung würde eine Shampooflasche als ISBN durchgehen und die App
   nur „nicht gefunden" melden, statt zu sagen, dass das kein Buch ist.

   **Nachtrag, nachdem es damit immer noch nicht lief:** Das Format war nur die halbe Wahrheit. Ein Test
   mit selbst erzeugten EAN-13-Bildern zeigt, dass die Erkennung scharfe, kleine und leicht unscharfe Codes
   in 36–160 ms liest und erst bei starker Unschärfe aussteigt. Das Problem ist also das Kamerabild, nicht
   der Decoder — auf Android steckt hinter der nativen API ohnehin Googles ML Kit, dieselbe Erkennung wie
   in guten Scanner-Apps. Daraus folgen vier Maßnahmen:

   - **Foto statt Live-Bild.** Ein `<input type="file" accept="image/*" capture="environment">` öffnet die
     Kamera-App des Systems. Die stellt selbst scharf, mit Autofokus und Makro, und liefert ein Standbild,
     das die Live-Ansicht nicht erreicht. Das ist der zuverlässigste Weg und deshalb gleichwertig neben dem
     Scannen platziert, nicht als Notlösung versteckt.
   - **Objektivwahl.** Bei `facingMode: environment` nimmt Chrome irgendeine Rückkamera. Erwischt es die
     Ultraweitwinkel- oder Telelinse, hat die oft Fixfokus oder eine Naheinstellgrenze von 20 cm. Alle
     Kameras werden aufgelistet und lassen sich durchschalten.
   - **Zoom.** Die meisten Handys stellen unter 10 cm gar nicht scharf. Weiter weg gehen und hineinzoomen
     ist der richtige Weg, nicht näher rangehen.
   - **Antippen zum Scharfstellen**, mit `pointsOfInterest` wo unterstützt, sonst durch Neuanstoßen des
     Dauerfokus.

   Dazu eine ausklappbare Diagnose in der Ansicht: Erkennungsart, Formate, Auflösung, Objektivname, Zahl der
   Kameras, Fokusmodi, Zoombereich, Licht. Ohne die lässt sich aus der Ferne nicht beurteilen, woran es auf
   einem konkreten Gerät scheitert.

   Als Decoder ersetzt **ZXing-C++ als WebAssembly** (über `barcode-detector`) den früheren
   TypeScript-Port von ZXing — der ist von den freien Erkennern der schwächste. Die 1 MB WebAssembly werden
   erst geladen, wenn die native Erkennung fehlt oder nichts findet.
2. **ISBN eintippen.** 10 oder 13 Stellen, Prüfziffer wird lokal validiert, bevor überhaupt eine
   Abfrage rausgeht.
3. **Komplett manuell.** Für alte Bücher ohne ISBN.

### Abfrage

Drei Quellen, der Reihe nach (korrigiert am 2026-08-15, siehe unten):

1. **Deutsche Nationalbibliothek** über die SRU-Schnittstelle, Format `oai_dc`. Kennt praktisch jedes in
   Deutschland erschienene Buch, braucht keinen Schlüssel und schickt `Access-Control-Allow-Origin: *`.
2. **OpenLibrary** für fremdsprachige Titel, die die DNB nicht hat.
3. **Google Books** ganz hinten.

Ursprünglich stand Google Books an erster Stelle. Das war falsch: ohne API-Schlüssel läuft die Abfrage über
ein gemeinsames Kontingent, das regelmäßig erschöpft ist — die Antwort ist dann `429 Quota exceeded`, und
zwar für alle. Ein Schlüssel kommt nicht in Frage, das Repository ist öffentlich. Die DNB hat dieses Problem
nicht und ist für deutsche Bücher ohnehin die bessere Quelle.

Jede Quelle bekommt acht Sekunden. Ohne dieses Limit bleibt eine Anfrage, die weder antwortet noch abbricht,
ewig hängen, und die Ansicht steht dauerhaft auf „wird gefragt".

Die drei Ausgänge werden unterschieden, weil sie im UI verschiedene Sätze brauchen: Treffer, nichts gefunden,
keine Quelle erreichbar. Bei den letzten beiden öffnet sich das Formular leer mit vorbelegter ISBN.

Titelbilder gibt die DNB nicht heraus. Die kommen deshalb immer über die Cover-Adresse von OpenLibrary,
anhand der ISBN — mit `default=false`, damit es 404 statt eines grauen Platzhalters gibt. Fehlt das Bild,
bleibt die Farbkachel mit der Initiale.

Trefferdaten sind immer nur ein Vorschlag. Das Formular zeigt sie an, du korrigierst, dann wird
gespeichert. Nichts landet ungeprüft in der Datenbank.

### Genre automatisch

Google Books liefert Kategorien wie `"Juvenile Fiction / Fantasy & Magic"`. Eine Mapping-Tabelle
(`services/genreMapping.js`) übersetzt die gängigen englischen Kategorien auf die deutschen Seed-Genres.
Was nicht gemappt werden kann, wird als Vorschlags-Chip angeboten („als neues Genre anlegen?"), und wenn
du das ignorierst, bleibt das Buch ohne Genre. Automatik hier heißt Vorbelegung, nicht Entscheidung.

### Reihe und Band automatisch

Die Buch-APIs geben Reiheninformationen nur unzuverlässig heraus. Deshalb eine Heuristik über Titel und
Untertitel (`services/seriesParser.js`), die die üblichen Schreibweisen erkennt:

```
"Die Tribute von Panem 2"        → Reihe "Die Tribute von Panem", Band 2
"Der dunkle Turm, Band 3"        → Reihe "Der dunkle Turm", Band 3
"Eragon (Eragon, Bd. 1)"         → Reihe "Eragon", Band 1
"Discworld #5"                   → Reihe "Discworld", Band 5
```

Erkanntes wird im Formular vorbelegt und ist überschreibbar. Erkennt die Heuristik nichts, wählst du
Reihe und Band von Hand — bestehende Reihen kommen dabei als Autocomplete.

---

## Ansichten

Vier Tabs unten, mehr passt nicht in Daumenreichweite:

| Route | Tab | Inhalt |
|---|---|---|
| `/` | 📚 Regal | Buchliste, Suche, Sortierung, Filter |
| `/scan` | 📷 Hinzufügen | Scanner, ISBN-Eingabe, manuelles Anlegen |
| `/ausleihen` | 🤝 Ausleihen | offene Ausleihen, überfällige zuerst |
| `/einstellungen` | ⚙️ Einstellungen | Genres, Reihen, Export, Backup |

Dazu die Detailansicht `/buch/:id`, die aus dem Regal heraus geöffnet wird.

### Regal

Jede Zeile zeigt **Titel und Autor** — das ist gesetzt. Dazu Cover-Miniatur (oder eine Kachel mit den
Initialen, wenn kein Cover da ist), Sterne, Statuspunkt, Genre-Chips, bei Reihenbüchern `Reihenname · Bd. 3`,
und bei ausgeliehenen Büchern eine Zeile `Verliehen an Jonas · zurück bis 30.09.`

Sortierung: Titel A–Z, Titel Z–A, Autor A–Z, Bewertung absteigend, zuletzt hinzugefügt, Reihe + Band.

Titel werden ohne führende Artikel sortiert, „Der Herr der Ringe" steht also unter H, nicht unter D.
Betroffen sind `Der Die Das Ein Eine The A An`. Autoren sortieren nach `Nachname, Vorname`, abgeleitet
aus dem letzten Namensbestandteil, in der Detailansicht überschreibbar für Fälle wie „von Schirach".

Filter, kombinierbar, in einem Bottom-Sheet:
Status · Genre (mehrere) · Mindestbewertung · Reihe · Besitzer · Ausleihstatus (verliehen / geliehen /
überfällig). Dazu ein Suchfeld über Titel, Autor, Reihe und Notizen.

Aktive Filter erscheinen als Chips über der Liste, jeder einzeln wegtippbar.

### Buchdetail

Tippen auf ein Buch öffnet diese Ansicht. Oben Cover, Titel, Autor. Darunter:

- Status als Dreier-Umschalter (Ungelesen / Lese gerade / Gelesen). Beim Wechsel auf „Gelesen" wird
  `finishedAt` gesetzt.
- Sterne 1–5, nochmal auf denselben Stern tippen setzt die Bewertung zurück.
- Genre-Chips, antippen zum Ändern.
- Reihe + Band.
- Besitzer, umschaltbar zwischen den in den Einstellungen gepflegten Namen.
- Ausleihe: offener Vorgang mit Person und Rückgabetermin, Button „zurückgegeben", darunter die Historie.
- **Notizfeld**, mehrzeilig, speichert beim Verlassen des Feldes.

### Ausleihen

Zwei Abschnitte: *Ich habe verliehen* und *Ich habe geliehen*. Überfällige stehen oben und sind rot
markiert. Pro Eintrag: Buch, Person, seit wann, Rückgabetermin, Button „zurückgegeben".

---

## Export und Backup

Alles läuft rein im Browser, es geht nichts an einen Dienst raus.

| Format | Inhalt | Zweck |
|---|---|---|
| PDF | Tabelle Titel / Autor / Reihe / Genre / Status / Bewertung, mit Kopfzeile und Datum | drucken, verschicken |
| XLSX | eine Zeile pro Buch, alle Felder als Spalten | weiterfiltern in Excel |
| JSON | vollständiger Datenbestand inkl. Notizen, Ausleihhistorie und Cover | Backup, wieder importierbar |

PDF und XLSX exportieren standardmäßig **genau die Auswahl, die gerade im Regal sichtbar ist** — Filter
und Sortierung inklusive. Ein Schalter im Export-Dialog schaltet auf „alle Bücher" um.

Der JSON-Import ersetzt den gesamten Bestand, nicht ergänzend, und fragt vorher nach. Die Backup-Datei
trägt eine Versionsnummer; ein Import mit unbekannter Version wird abgelehnt statt halb eingespielt.

In den Einstellungen steht, wann das letzte Backup war. Liegt das über 30 Tage zurück, erscheint im Regal
ein dezenter Hinweis. Das ist kein Gimmick: iOS räumt IndexedDB von nicht installierten Web-Apps
irgendwann weg, und ein Gerätewechsel tut das garantiert.

---

## Pinia-Stores

Komponenten sprechen ausschließlich mit Stores, Stores sprechen mit Dexie. Kein `import { db }` in
einer `.vue`-Datei.

| Store | Verantwortung |
|---|---|
| `booksStore` | Bücher-CRUD, Filter- und Sortierzustand, gefilterte Liste als Getter |
| `genresStore` | Genres + `book_genres`-Verknüpfungen |
| `seriesStore` | Reihen anlegen/finden, verwaiste Reihen aufräumen |
| `ownersStore` | Besitzer-Namen, Vorbelegung |
| `loansStore` | Ausleihen, offene/überfällige Getter |
| `settingsStore` | `lastBackupAt` und Kleinkram |

Logik ohne UI-Bezug liegt in `src/services/` und wird direkt getestet:
`isbn.ts` (Prüfziffern), `bookLookup.ts` (API-Antwort → Buchobjekt), `genreMapping.ts`,
`seriesParser.ts`, `sortKeys.ts`, `filters.ts`, `export/pdf.ts`, `export/xlsx.ts`.

Löschen eines Buchs räumt in derselben Transaktion `book_genres` und `loans` mit ab — IndexedDB hat
keine Fremdschlüssel, das muss von Hand passieren.

---

## Verifikation

Vitest deckt ab:

- ISBN-Prüfziffer, ISBN-10 → ISBN-13-Umrechnung, Ablehnung von Müll-Eingaben
- `bookLookup`: Google-Books-Antwort → Buchobjekt, fehlende Felder, leere Trefferliste, Fallback auf
  OpenLibrary, Verhalten ohne Netz (gemockter `fetch`)
- `seriesParser`: die vier Schreibweisen oben plus Negativfälle, die keine Reihe sind
- `genreMapping`: bekannte Kategorien, unbekannte Kategorie bleibt Vorschlag
- `sortKeys`: Artikel abschneiden, Autor-Umdrehung, Umlaute korrekt einsortiert (`localeCompare` mit `'de'`)
- `filters`: jeder Filter einzeln, mehrere kombiniert, leeres Ergebnis
- Stores: CRUD, Statuswechsel setzt `finishedAt`, Ausleihe öffnen/zurückgeben, kaskadiertes Löschen
- Backup: Export → alles löschen → Import → identischer Bestand; unbekannte Version wird abgelehnt

Manuell im Browser (`npm run build && npm run preview`):
Buch per ISBN anlegen · Notiz schreiben, App neu laden, Notiz noch da · Filter Genre + Bewertung
kombiniert · PDF und XLSX öffnen und reinschauen · Backup exportieren, IndexedDB leeren, importieren ·
Netz aus, App startet trotzdem · Deep-Link `/buechermonster/buch/1` direkt aufrufen.

Auf dem Handy: aus Chrome zum Startbildschirm hinzufügen, Flugmodus an, App starten.

---

## Reihenfolge der Umsetzung

1. Gerüst: Verzeichnisse, `package.json`, Vite-/Tailwind-/PWA-Konfiguration, Icons
2. Datenschicht: `db/database.js`, `db/seed.js`, `db/backup.js` **mit Tests**
3. Services: `isbn`, `sortKeys`, `seriesParser`, `genreMapping`, `filters`, `bookLookup` **mit Tests**
4. Stores auf der Datenschicht **mit Tests**
5. App-Shell: `App.vue`, Router, BottomNav
6. Ansichten: Einstellungen → Regal → Buchdetail → Hinzufügen/Scanner → Ausleihen
7. Export-Module PDF und XLSX, lazy geladen
8. PWA-Feinschliff, `npm test` grün, `npm run build` sauber, Smoke-Test im Browser
9. Repo anlegen, Actions-Workflow, Pages aktivieren, Install aufs Handy

Der Base-Pfad `/buechermonster/` muss an vier Stellen synchron sein (Vite, Vue Router, PWA-Manifest,
Workbox-Fallback), und der Workflow kopiert `dist/index.html` nach `dist/404.html`, sonst gibt es beim
ersten Deep-Link eine 404-Seite.

---

## Bewusst nicht dabei

Kein Sync zwischen Geräten, kein Wunschzettel oder Leseziel, keine Lesefortschritt-Prozente, keine
Volltextsuche über Buchinhalte, kein Teilen von Listen, keine Statistikseite. Lässt sich alles später
ergänzen, kostet aber jetzt nur Zeit.
