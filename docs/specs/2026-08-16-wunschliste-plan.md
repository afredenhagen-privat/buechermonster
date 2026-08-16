# Wunschliste — Analyse und Plan

Stand: 2026-08-16 · Status: **umgesetzt und ausgeliefert**

Drei Punkte wurden am 2026-08-16 entschieden: Das Regal zeigt **nie** Wünsche, es gibt keinen Filter dafür.
Die Tableiste bleibt bei vier Einträgen, das Scannen wird ein runder Knopf. Die Detailansicht eines Wunsches
zeigt **nur** Titel, Autor, Reihe, Genre und Notizen.

## Was gefordert ist

1. Buch per Barcode/ISBN scannen und auf eine **Wunschliste** legen statt ins Regal
2. Beim Erfassen ein **Schalter „Wunschliste"**
3. **Eigener Tab** unten — die Wunschliste ist eine getrennte Liste, kein Filter im Regal
4. In der Wunschliste: **„Hab ich bekommen"** → das Buch wandert ins Regal
5. Beim Scannen **jedes** Buchs eine Meldung, wenn es schon auf der Wunschliste **oder** schon im Regal steht
6. Die Wunschliste **exportieren**, um sie jemandem zu geben

## Der Zweck, und was daraus folgt

Die Wunschliste wird von jemand anderem gelesen — das unterscheidet sie vom Regal. Wer sie bekommt, will
wissen, **was er kaufen soll**, nicht wie das Buch bewertet ist. Daraus folgen zwei Dinge, die man sonst
übersieht:

- Der Export braucht **andere Spalten** als der Regal-Export. Titel, Autor, Reihe mit Band, ISBN und Jahr sind
  relevant. Lesestatus, Bewertung und Ausleihe sind es nicht — die stehen bei einem Buch, das man nicht hat,
  ohnehin auf Anfangswerten.
- Die **ISBN gehört sichtbar** in den Export. Ohne sie kauft jemand die falsche Ausgabe.

## Datenmodell: ein Feld, keine zweite Tabelle

**Vorschlag:** ein Feld `place: 'shelf' | 'wish'` an der bestehenden `books`-Tabelle.

Ein Wunsch ist inhaltlich dasselbe wie ein Buch: Titel, Autor, Reihe, Genre, Cover, Notizen. Eine zweite
Tabelle würde all das verdoppeln — und die Dublettenprüfung müsste an zwei Stellen suchen, der ISBN-Abruf
zweimal existieren, und „bekommen" wäre ein Umkopieren zwischen Tabellen statt einer Feldänderung.

`place` und nicht `status`: `status` heißt in diesem Projekt bereits der Lesestatus. Zwei Felder namens
Status wären genau der Begriffskonflikt, nach dem hinterher jeder fragt.

**Der Preis dieser Entscheidung** ist, dass Wünsche überall dort auftauchen, wo heute pauschal über alle
Bücher gelaufen wird. Das sind genau diese Stellen — sie müssen alle angefasst werden, sonst zählt der
Zähler oben Wünsche mit und der Regal-Export nimmt sie auf:

| Stelle | heute | künftig |
|---|---|---|
| `App.vue` Kopfzeile „X Bücher" | `books.stats.total` | nur Regal |
| `booksStore.visibleBooks` | alle | nur Regal |
| `booksStore.stats` | alle | nur Regal |
| `booksStore.booksOfOwner` / `booksOfSeries` | alle | nur Regal |
| `genresStore.bookCountOf` | alle Verknüpfungen | nur Regal |
| `SettingsView` Export „alle Bücher" | `books.books` | nur Regal |
| `ShelfView` Zähler und Leer-Zustand | alle | nur Regal |

**Absicherung:** `booksStore` bekommt genau zwei Einstiege, `shelfBooks` und `wishBooks`. Alles andere baut
darauf auf, und `books` wird von keiner Ansicht mehr direkt gelesen. Eine Ansicht, die künftig alle Bücher
will, muss sich bewusst dafür entscheiden.

## Was ein Wunsch nicht hat

Ein Buch, das man nicht besitzt, kann man weder lesen noch bewerten noch verleihen. In der Detailansicht
eines Wunsches werden deshalb **ausgeblendet**: Lesestatus, Bewertung, Besitzer, Ausleihe samt Historie.
Sichtbar bleiben Titel, Autor, Reihe, Genre, Notizen — und der Knopf „Hab ich bekommen".

Ohne diese Ausblendung hätten wir Schalter, die nichts bewirken: eine Bewertung für ein ungelesenes,
nicht vorhandenes Buch, oder eine Ausleihe für ein Buch, das niemandem gehört.

Beim Verschieben ins Regal wird gesetzt: `place = 'shelf'`, `ownerId` auf die Vorbelegung, `status` bleibt
`unread`. Die Sortierung „Zuletzt hinzugefügt" soll den Zeitpunkt des Einräumens meinen, nicht den des
Wünschens — dafür kommt ein Feld `shelvedAt` dazu, das bei direkt angelegten Büchern gleich gesetzt wird.

## Lebenszyklus — alle vier Wege

| | Weg |
|---|---|
| **Anlegen** | Schalter „Auf die Wunschliste" im Hinzufügen-Formular, neben „Gehört" |
| **Anzeigen** | eigener Tab, eigene Liste, Suche und Sortierung wie im Regal |
| **Ändern** | dieselbe Detailansicht wie ein Buch, nur mit weniger Feldern |
| **Löschen** | „Von der Wunschliste nehmen" in der Detailansicht — wer sich vertippt, muss das korrigieren können |

Zusätzlich der **Rückweg**: in der Detailansicht eines Regalbuchs „Zurück auf die Wunschliste". Das ist der
Korrekturweg, wenn beim Erfassen der Schalter falsch stand.

## Die Dublettenmeldung

Heute gibt es bereits eine Warnung, aber nur nach erfolgreichem ISBN-Abruf und nur als Text. Drei
Änderungen:

1. Sie greift **vor** dem Netzabruf. Die ISBN kennen wir sofort, also kann die Meldung sofort kommen, statt
   erst nach zwei Sekunden Wartezeit.
2. Sie sagt **wo**: „steht schon in deinem Regal" oder „steht schon auf deiner Wunschliste".
3. Sie ist **anklickbar** und springt zu dem Buch. Eine Meldung, die einen Fund nennt, ihn aber nicht
   erreichbar macht, ist eine halbe Kette.

Blockiert wird nichts — doppelte Exemplare gibt es, das Anlegen bleibt möglich.

## Backup: die Falle

Bestehende Backups sind Version 1 und kennen `place` nicht. Wird ein solches Backup nach der Änderung
eingespielt, stünde bei jedem Buch `place = undefined` — und damit wäre es weder im Regal noch auf der
Wunschliste, also **unsichtbar**. Deshalb:

- Dexie auf `version(2)` mit einem Upgrade, das bestehende Zeilen auf `place = 'shelf'` setzt
- `BACKUP_VERSION` auf 2, aber Version 1 **weiterhin annehmen** und beim Import die fehlenden Felder
  ergänzen, statt sie abzulehnen
- Ein Test, der ein Backup im alten Format einspielt und prüft, dass alle Bücher danach im Regal stehen

## Navigation: vier Tabs, Scannen als runder Knopf

Entschieden am 2026-08-16. Die Leiste bleibt bei vier Einträgen, „Hinzufügen" verlässt sie:

`📚 Regal · ⭐ Wünsche · 🤝 Ausleihen · ⚙️ Einstellungen`

Das Scannen wird ein runder Knopf, der über der Liste schwebt — rechts unten, oberhalb der Leiste, mit
Abstand zur Home-Leiste des Geräts. Fünf Tabs hätten auf 360 px kürzere Namen erzwungen; so bleiben die
bisherigen stehen, und die häufigste Aktion fällt stärker auf als vorher.

**Nebeneffekt, den wir mitnehmen:** der Knopf liegt über dem Regal **und** über der Wunschliste. Wo er
gedrückt wird, entscheidet die Vorbelegung — aus dem Regal heraus landet das Buch im Regal, aus der
Wunschliste heraus auf der Wunschliste. Der Schalter im Formular bleibt trotzdem, damit man es
umentscheiden kann.

Technisch bleibt `/hinzufuegen` eine eigene Route; der Knopf ruft sie mit `?wunsch=1` auf, wenn er in der
Wunschliste gedrückt wurde.

## Umsetzung — vertikal geschnitten

Jeder Schritt geht vom Datenmodell bis ins Bedienelement, damit nichts halbfertig liegen bleibt.

1. **Feld und Migration.** `place` und `shelvedAt` in `types.ts`, Dexie `version(2)` mit Upgrade,
   Backup-Import für Version 1 und 2. Tests für Migration und Alt-Backup.
2. **Regal abdichten.** `shelfBooks`/`wishBooks` im Store, alle sieben Stellen aus der Tabelle oben
   umstellen. Test: ein Wunsch taucht in Regal, Zähler, Statistik und Export nicht auf.
3. **Erfassen.** Schalter im Hinzufügen-Formular, Dublettenmeldung mit Ort und Sprungziel.
4. **Wunschliste und Navigation.** Vierter Tab „Wünsche" statt „Hinzufügen", Scan-Knopf über Regal und
   Wunschliste, Liste mit Suche und Sortierung, „Hab ich bekommen", „Von der Wunschliste nehmen".
   Detailansicht mit reduzierten Feldern.
5. **Rückweg** aus dem Regal auf die Wunschliste.
6. **Export.** Eigener Knopf in der Wunschliste, PDF und XLSX mit den Wunschlisten-Spalten.
7. **Prüfen.** Tests grün, Build sauber, Durchklicken im Browser, dann Deploy.

## Was bewusst draußen bleibt

Keine Preise, keine Kaufhinweise, keine Priorisierung der Wünsche, kein Teilen per Link. Die Liste wird als
PDF verschickt, das reicht für den Zweck. Lässt sich später ergänzen, kostet jetzt nur Zeit.
