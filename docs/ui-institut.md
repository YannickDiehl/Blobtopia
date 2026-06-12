# UI-Rekonzeption „Das Institut“ — Plan & Designsystem

> Verbindliches Zielbild: `design-prototyp/komplett.html` (8 Ansichten, gerendert
> via `node design-prototyp/render-komplett.mjs`). Beschlossen mit Yannick am
> 2026-06-12. Dieses Dokument ist die Arbeitsgrundlage der Umsetzung auf dem
> Branch `feat/institut-ui`.

## Leitidee

Die UI besteht nicht aus Panels, sondern aus **physischen Artefakten zweier
Materialwelten** über der unangetasteten 3D-Spielzeugstadt:

1. **Institut (Papier):** alles, was die *Forschung* produziert — Karteikarten,
   Formblätter, Stempel, Endlospapier, versiegelte Umschläge. Schreibmaschine
   + rote Dozenten-Handschrift + Stempel als Interaktionssprache.
2. **Blob-Welt (digital-bunt):** alles, was die *Blobs* produzieren — das
   BlobPhone mit dem BlobFeed („Blubs“, „weiterblubbern“), die Gazetta als
   gedruckte Zeitung in der Presse-Mappe.

Strukturprinzip: **zwei Räume** als Ordner-Reiter oben (der Bildschirm ist
eine Akte): **Stadt** (Feld: beobachten, interviewen, Feed lesen) und
**Schreibtisch** (Auswertung: Studien, Presse, Dozentenzimmer). Die Timeline
ist in beiden Räumen die **Filmrolle des Stadtarchivs** („Aufzeichnung ·
22 Jahre“) — die Precomputed-Architektur als Fiktion.

## Festgezurrte Entscheidungen

- **Dozenten-Dashboard wird komplett entfernt** (Route, `src/components/dashboard/`,
  Store-Cache). Lehrkern (Wahrheit/TSE) liegt im Survey-Feature und bleibt.
- **Pink = Wahrheit/Dozent** (Logo-Blob ohne Distrikt): Siegel, Dozentenzimmer-
  Mappe, `kA`/`wn`-Vermerke. Distrikt-UI-Töne: Grüntal `#4caf6d`, Sonnenberg
  `#eebc2f`, Hafen `#4596d8`, Mittelfeld `#e8893a`, Industriezone `#8a93a6`
  (Welt-Bodenfarben bleiben unverändert, inkl. Industriezone-Grau).
- **Ein Dozenten-Schloss** (Registratur-Mappe „Dozentenzimmer“) statt drei
  Stellen; gleicher Unlock-Mechanismus (`VUE_APP_INSPECTOR_PASSWORD`,
  localStorage `blobtopia_inspector_unlocked`).
- Karten **docken** (tablet-robust), kein freies Drag mehr für Inspektoren.
- Stadt-Editor (`/#/editor`) bleibt unangetastet (eigenes Werkzeug).
- **Funktionserhalt ist Pflicht:** Logik-Schicht (`src/lib/survey-*.js`,
  Stores, `timeline-decode`, Chat-Transport) wird nicht angefasst. Alle
  Bedienfunktionen (Grundgesamtheits-Filter, 6 Ziehungsverfahren, Quoten-
  Editor, manueller Picker, n-Planer, Feldarbeit, Wellen, Post-Strat,
  Exporte, Studien-Import) bleiben vollständig bedienbar.
- Kein Vercel-Deploy ohne Yannicks Go.

## Typografie (self-hosted, `src/assets/fonts/`)

| Rolle | Schrift | Verwendung |
|---|---|---|
| Schreibmaschine | Special Elite | Formularinhalte, Karteikarten, Protokolle, Datenmatrix-Werte |
| Handschrift | Caveat (variabel) | Dozenten-Anmerkungen (rot), Bleistift-Notizen (graphit) |
| Druck | Archivo (variabel) | Formular-Labels (Kapitälchen), Stempeltexte, Fließtext-UI |
| Rund | Baloo 2 (variabel) | NUR BlobPhone/Blob-Digitalwelt |
| LM Mono | (bestehend, CDN) | bleibt für Alt-Flächen, wird schrittweise abgelöst |

## Artefakt-Vokabular (CSS-Klassen in `src/styles/_institut.scss`)

`inst-papier` (Korn+Schatten), `inst-karteikarte` (liniert + rote Randlinie),
`inst-stempel`/`--blau` (Doppelrahmen), `inst-knopf` (Stempel-Button mit
Druck-Animation), `inst-hand-rot`/`inst-hand-blei`, `inst-kreis` (Rotstift-
Ellipse = ausgewählte Option), `inst-kasten` (Ankreuzkästchen), `inst-flagge`
(Distriktfarbe), `inst-tape`, `inst-vermerk` (roter Mini-Stempel in Tabellen).
Selektions-Pattern: **Radio = einkreisen, Checkbox = ankreuzen, Submit =
stempeln.** Native Inputs bleiben darunter erhalten (a11y + Funktion).

## Oberflächen-Mapping (alle Funktionen!)

| Funktion (heute) | Artefakt (neu) |
|---|---|
| TopBar-Toggles | Ordner-Reiter Stadt/Schreibtisch + Logo-Sticker + Datums-Stempel |
| TimelineBar (Play/Speed/Scrub/Events/Wahlen) | Filmrolle: Projektor-Knopf, Tempo-Plakette, Band-Scrubbing, Ereignis-Fähnchen |
| Blob-Inspektor (Floating, Passwort-Teil) | Karteikarte mit Polaroid; wahre Werte = pinkes Beiblatt nach Dozenten-Unlock |
| Gebäude-Inspektor | Hausakte (gleiche Karteikartenform; Bewohner/Beschäftigte/Kapazität) |
| Chat (Start/Verlauf/Senden/Beenden/Export) | Interview-Protokoll + Kassette (AUFNAHME = Session aktiv) |
| BlobFeed (Tweets bis Tick) | BlobPhone (Mini gesperrt in Stadt-Ecke → Vollansicht); Blubs/weiterblubbern |
| CommandPalette (Suche/Distrikt-Flug) | Melderegister-Suchzettel (⌘K) |
| Survey „Fragebogen“ (freie Items, beantwortbar, misst:, Demografie-Chips) | Formblatt S-3 + Zusatzblatt Hintergrundmerkmale |
| Survey „Stichprobe“ (Filter, 6 Verfahren, Quoten, manuell, n-Planer, Feldarbeit, Wellen) | Formblatt Z-1 (§1–§4) + Ziehungsprotokoll + Namensliste |
| Survey „Ergebnis“ (Matrix, Dispositionen, Post-Strat, CSV/Codebook) | Datenlieferung auf Endlospapier + Kennwerte/Kalibrierung/Versand-Zettel |
| Survey „Wahrheit“ (TSE, Simulator, Reliabilität, Wellen, Dozenten-CSV) | Dozentenzimmer: Umschlag + Siegelbruch + Geheim-Blatt |
| Studien speichern/laden/Autosave | „In Mappe ablegen“ / „Studie laden“ + Vermerk |
| Gazetta (50 Ausgaben, 2 Blätter) | Presse-Mappe: Blobspiegel (Fraktur) / blobtopia kurier (rot), Ausgaben-Schieber |
| Tour (8 Schritte) | Karteikarten-Stapel, Inhalte auf neue Räume umgeschrieben |
| Dashboard | ENTFERNT |

## Etappen (jede einzeln lauffähig + committet)

- [ ] **E0** Tokens + Schriften (`_institut.scss`, `_fonts.scss`); Light-Theme
      vorbereitet (`[data-theme="light"]` in Bulma-Bridge), Umschalten erst E2.
- [ ] **E1** Dashboard-Rückbau (Route, Komponenten, Store-Actions/Cache,
      chart.js-Dependency prüfen, e2e-Baselines `07/08/09-dash-*` entfernen).
- [ ] **E2** Akten-Shell: TopBar→Reiter, Schreibtisch-Route (Registratur:
      Studien/Presse/Dozentenzimmer), Filmstreifen-Timeline, Theme-Switch.
- [ ] **E3** Studien-Werkstatt (S-3/Z-1/Datenlieferung) — Survey-UI-Umbau.
- [ ] **E4** Dozentenzimmer (Schloss konsolidieren, Siegel-Ritual, Wahrheit).
- [ ] **E5** Stadt-Feld (Karteikarte, Hausakte, Protokoll, BlobPhone, Suchzettel).
- [ ] **E6** Feinschliff: Presse-Layouts, Tour, Mikroanimationen (Stempel-
      Plop), e2e-Suiten anpassen + Baselines neu, README/ARCHITECTURE.

## Test-Strategie

`npm test` (18 Suiten, Logik) muss nach JEDER Etappe grün sein. `npm run e2e`
wird pro Etappe an neue Selektoren angepasst; Screenshot-Baselines werden am
Ende von E6 einmal neu gezogen. Browser-Smoke nach jeder Etappe gegen den
Dev-Server (Chrome headless + WebKit).
