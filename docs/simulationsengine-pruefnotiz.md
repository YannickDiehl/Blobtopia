# Interne Prüfnotiz: Plausibilität der Simulationsengine

> Intern, nicht zur Weitergabe. Vollständige Durchsicht des Simulationskerns
> (`crates/simulation-core/src/society/*`, `stage/*`) sowie der Messkette
> (`src/lib/build-system-prompt.js`, `src/lib/survey-truth.js`) am 2026-07-03.
> Gesamturteil vorab: Die Engine ist theoretisch fundiert, ungewöhnlich gut
> im Code dokumentiert und in den Wirkrichtungen fast durchgehend plausibel.
> Die folgenden Punkte sind Einschränkungen und Angriffsflächen, die man vor
> einer Vorstellung kennen sollte — kein Befund ist ein Showstopper.

## A. Inhaltliche Befunde (theoretische Plausibilität)

### A1. Efficacy ↔ Verdrossenheit: bewusst entkoppelt (wichtigster Punkt)

`latent_traits.rs:293` — die Efficacy-Kopplung der Verdrossenheit wurde vollständig
entfernt („was r=−.81 even at 0.1, destroying discriminant validity"); auch im
laufenden Update treiben die Konstrukte einander nicht mehr (Efficacy: Bildung;
Verdrossenheit: Vertrauensdefizit). Empirisch sind interne Efficacy und
Machtlosigkeit jedoch nahe Antonyme (Seeman 1959); reale Daten zeigen deutlich
negative Korrelationen (~ −.4 bis −.6). Studierende, die beide Konstrukte messen
und korrelieren, finden also schwächere Zusammenhänge, als die Literatur erwarten
ließe. Das ist ein legitimer psychometrischer Trade-off (CFA-Trennbarkeit über
22 Jahre), muss aber aktiv als Modellentscheidung kommuniziert werden — sonst
wirkt es bei kritischer Nachfrage wie ein Fehler. Empfehlung: in der Vorstellung
proaktiv als „diskriminante Validität vor Kriteriumsvalidität" rahmen (in der
Darstellung unter „Grenzen" bereits enthalten).

### A2. Protestbereitschaft: Efficacy-Vorzeichen diskutabel

`political_behavior.rs:156-162` — Protestbereitschaft = Unzufriedenheit (.25) +
Misstrauen (.25) + **niedrige** Efficacy (.10). Die Grievance-Komponenten sind
gut belegt (Dalton 2008). Für die Efficacy widerspricht das Vorzeichen aber dem
Ressourcenmodell: Protestierende weisen empirisch eher hohe interne Efficacy auf
(Verba/Schlozman/Brady 1995; Dalton 2008). Mildernd: Das Merkmal heißt
„readiness" (Frustrationspotenzial), nicht Teilnahme, und der Endogenous-Protest
in `sim.rs:2202` belohnt dann tatsächlich Efficacy (Teilnehmer gewinnen
Selbstwirksamkeit). Trotzdem: Wenn Studierende Protestbereitschaft mit
Selbstwirksamkeit korrelieren, kommt ein (schwach) negativer Zusammenhang heraus,
den man verteidigen können muss. Option für später: Gewicht 0.10 auf 0 setzen
oder invertieren; die Grievance-Anteile tragen das Konstrukt allein.

### A3. Zitationsgenauigkeit: drei lose Referenzen

Für eine Methodenvorstellung sind die Code-Kommentare angenehm belesen, drei
Zuordnungen sind aber lockerer, als der Kommentar suggeriert:

1. `latent_traits.rs:279` nennt **Feldman & Stenner 1997** als Beleg dafür, dass
   Alter der Primärtreiber des Autoritarismus sei. F&S 1997 ist eine Theorie der
   Bedrohungsaktivierung, kein Altersbefund. Der positive Alters-/Kohorteneffekt
   selbst ist empirisch gut belegt (z. B. Kohortensozialisation), nur die
   Quelle passt nicht. Besser: allgemein „Kohortenbefunde" oder Altemeyer.
2. `sim.rs:2190` nennt **Granovetter (Threshold-Modell)** für den spontanen
   Protest. Implementiert ist aber ein Distrikt-Mittelwert-Trigger mit
   Zufallswahrscheinlichkeit, keine heterogenen Individualschwellen mit Kaskade.
   Als Inspiration zitierbar, als Implementierung nicht.
3. `sim.rs:664` nennt **Olson 1965** für den Complacency-Mechanismus (hohe
   Efficacy + hohe Zufriedenheit → Rückzug). Olsons Kollektivgutproblem ist
   verwandt, aber nicht deckungsgleich; eher „Zufriedenheitsparadox" / geringe
   Mobilisierung bei Saturiertheit.

### A4. Normative Asymmetrie in `MediaCampaign`

`sim.rs:1471-1519` — progressive Kampagnen (Partei 0) erhalten einen exklusiven
„We hear you"-Mechanismus: bei Geringverdienern steigen Efficacy, Vertrauen,
Wahlnorm dauerhaft (Base-Shifts). Konservative Kampagnen verschieben nur
Ideologie. Es gibt keinen spiegelbildlichen Mechanismus (z. B. „Law and
Order"-Aktivierung). Das ist als Szenario-Setzung legitim (der Ereigniskalender
erzählt eine konkrete Geschichte), sollte aber als solche deklariert werden,
bevor jemand „eingebauten Bias" diagnostiziert.

### A5. Familiale Transmission eher am oberen Rand

`sim.rs:196-210` — Kinder übernehmen 70 % der elterlichen Einstellungswerte
(plus Rauschen). Die Sozialisationsforschung (Jennings/Niemi-Tradition) findet
moderate Transmission, stark themenabhängig; 70 % ist didaktisch gewollt hoch
(sichtbare Familienähnlichkeit). Vertretbar, aber als Setzung kennzeichnen.

### A6. Demografische Vereinfachungen

- **Alter:** Singles ziehen uniform aus 18–78 (`household.rs:43`), Familien
  strukturiert. Es entsteht keine realistische Alterspyramide; Randverteilungen
  des Alters weichen von Deutschland ab. Für Zusammenhangsanalysen unkritisch,
  für Verteilungsvergleiche nennen.
- **Kein Geschlecht:** bewusste Auslassung; Studierende inferieren ggf. aus
  Namen. Achtung: Die Namenspools kodieren zugleich Herkunft/Milieu je Stadtteil
  (`blob.rs:160 ff.`) — namensbasierte Geschlechts- oder Herkunftsvariablen sind
  also konfundiert und methodisch angreifbar. Als Lehr-Anlass nutzbar
  (Operationalisierungsproblem!), aber vorher wissen.
- **Bildung→Einkommen individuell schwach:** nur +250 €/Stufe innerhalb des
  Stadtteils (`blob.rs:548-554`); die Gesamtkorrelation entsteht überwiegend
  kompositorisch über die Stadtteile. Bei stadtteil-kontrollierten Analysen
  (Partialkorrelation, FE) wird der Bildungseffekt aufs Einkommen klein.

### A7. Kleinere Beobachtungen

- Turnout hart geklemmt auf 35–78 % (`political_behavior.rs:149`) — verhindert
  Extremjahre; deckt sich mit dem Benchmark-Korridor (60–82 % nur auf Aggregat).
- Ideologie-Realignment verschiebt zu 40 % dauerhaft die Base
  (`sim.rs:1885`) — starker Ratchet, gewollt für die Left-Behind-Erzählung.
- Emotionsmodell ist ein Valenz-Arousal-Quadrantenschema (Russell-Circumplex,
  unzitiert) — nur Färbung der Chat-Antworten, keine Datenrelevanz.
- Kinder (2–17) erhalten bei Spawn volle Einstellungs-/Konstruktwerte; sie sind
  von politischem Verhalten und Events ausgenommen, tauchen aber in der
  Population auf. Eligibility-Filter der Befragung muss (und scheint) das
  abfangen — bei Demonstrationen auf „Grundgesamtheit = Wahlbevölkerung" achten.

## B. Technisch-konzeptionelle Absicherung (positiv)

Zur Vorbereitung auf kritische Nachfragen die stärksten Punkte:

1. **Exakte TSE-Zerlegung by construction** (`survey-truth.js`): Die vier
   Fehlerkomponenten addieren sich identisch zur Gesamtabweichung — kein
   Schätzverfahren, sondern Teleskopsumme. Das ist das beste Argument des
   ganzen Projekts.
2. **Determinismus:** Seed 118, getestet (`tests/determinism.rs`); jede
   studentische Ziehung ist seed-reproduzierbar.
3. **Messfehler ist Design, nicht Artefakt:** ±1–2-Spielraum, Rundung,
   Konstrukt-Trennung, Wiederholungsvariation und vertrauensabhängige
   Verweigerung sind explizit im Prompt kodiert (`build-system-prompt.js:313-381`)
   und per Layer-4-Kalibrierung vermessen.
4. **Benchmark-Verankerung** (`scripts/validation/empirical_benchmarks.py`):
   ALLBUS-Ideologie (M, SD), ESS-Vertrauen, Wahlbeteiligung, Gini-Korridor,
   Bildung–Autoritarismus, Alter–Materialismus, Varianzerhalt, CFA-Diskriminanz —
   die Plausibilität wird nicht behauptet, sondern automatisiert geprüft.
5. **Stabilitätsmechanik statt Drift:** Persönlichkeitsverankerung, Sättigungs-
   dämpfer, Ceiling-Erosion und Hedonic-Adaptation-Floors halten 22 Jahre
   Simulation in realistischen Wertebereichen, ohne Varianz zu vernichten
   (Varianzerhalt ist Prüfkriterium, min. 40 %).

## C. Empfohlene Reihenfolge vor der Vorstellung

1. A1 und A2 als bekannte, begründete Modellentscheidungen in die eigene
   Argumentation aufnehmen (A1 steht bereits im Grenzen-Abschnitt der
   Darstellung).
2. Die drei losen Zitate (A3) im Code-Kommentar bei Gelegenheit korrigieren —
   fünf Minuten Arbeit, nimmt einem Fachpublikum die billigste Angriffsfläche.
3. A4 und A5 nur bei Nachfrage: „Ereigniskalender erzählt ein Szenario."
4. A6 (Namen/Geschlecht) einmal selbst durchdenken, bevor Studierende auf die
   Idee kommen — eignet sich gut als bewusste Übungsfalle.
