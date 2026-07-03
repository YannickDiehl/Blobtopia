# Interne Prüfnotiz: Plausibilität der Simulationsengine

> Intern, nicht zur Weitergabe. Vollständige Durchsicht des Simulationskerns
> (`crates/simulation-core/src/society/*`, `stage/*`) sowie der Messkette
> (`src/lib/build-system-prompt.js`, `src/lib/survey-truth.js`) am 2026-07-03.
> Gesamturteil vorab: Die Engine ist theoretisch fundiert, ungewöhnlich gut
> im Code dokumentiert und in den Wirkrichtungen fast durchgehend plausibel.
> Die folgenden Punkte sind Einschränkungen und Angriffsflächen, die man vor
> einer Vorstellung kennen sollte — kein Befund ist ein Showstopper.

## A0. Empirische Nachmessung an den exportierten Ticks (2026-07-03)

Alle folgenden Aussagen wurden an den tatsächlich ausgelieferten wahren Werten
nachgerechnet (Tick 105, n=382 Erwachsene, vs. Tick 8001, n=500; Skript lief
gegen `public/data/timeline/ticks/`). Kernwerte:

| Kennwert | Tick 105 | Tick 8001 | Referenz/Benchmark |
|---|---|---|---|
| Ideologie M (SD) | 5.55 (1.67) | 5.52 (1.75) | ALLBUS ~5.1 (1.8) ✓ |
| Vertrauen M (SD) | 4.76 (**1.24**) | 5.03 (**1.27**) | ESS ~4.8 (**~2.2**) — SD komprimiert |
| r(Einkommen, Zufriedenheit) | .60 | **.82** | eigener Benchmark .10–.50 — **verletzt** |
| r(Ideologie, policy_economy) | .92 | .93 | reale Einstellungskonsistenz ~.2–.4 — **weit drüber** |
| r(policy_social, policy_economy) | **.998** | **.999** | zwei Items, faktisch EINE Variable |
| r(Efficacy, Machtlosigkeit) | −.57 | **−.79** | Literatur −.4 bis −.6; Ende nahe Diskriminanzgrenze |
| r(Protestbereitschaft, Zufriedenheit) | −.84 | **−.96** | deterministischer Index, keine eigene Größe |
| r(Alter, ökon. Sicherheit) | +.02 | **−.24** | eigener Benchmark ≥ +.05 (Inglehart) — **Vorzeichen kippt** |
| r(Bildung, Efficacy) | .61 | .46 | Richtung ✓, Stärke ~2× reale Effekte |
| Konstrukt-interne r | .43–.72 | .60–.78 | plausible Reliabilität ✓ |

## A. Inhaltliche Befunde (theoretische Plausibilität)

### A1. Policy-Positionen: keine eigenständigen Messgrößen (wichtigster Punkt)

`attitudes.rs:87-116` + `sim.rs:725-752` — die sechs Policy-Positionen werden
ohne jede idiosynkratische Komponente aus Ideologie + Traits abgeleitet: Die
Initialisierung enthält keinen Zufallsterm, und der wöchentliche Drift (5 %)
zieht jede Position deterministisch auf ihr Ziel zurück; nur Event-Schocks
erzeugen vorübergehende Abweichung (Halbwertszeit ~13 Wochen). Ergebnis in den
Daten: r(policy_social, policy_economy) = .998 — Wirtschafts- und Sozialposition
sind faktisch dieselbe Variable; alle Policies korrelieren .79–.93 mit der
Ideologie. Reale Massenpublika zeigen deutlich schwächere Einstellungskonsistenz
(Converse 1964: „constraint" ~.2–.4). Der LLM-Messfehler (±1–2) dämpft das
Beobachtete, aber die wahren Werte bleiben quasi kollinear. Didaktische Folge:
Wer zwei Policy-Items erhebt und eine Skala baut, bekommt α ≈ 1; wer Policy auf
Ideologie regressiert, bekommt unrealistisch saubere Modelle. Fix wäre billig:
pro Blob ein stabiles, bei Spawn gezogenes Residuum je Policy-Dimension (z. B.
±1.5) auf das Drift-Ziel addieren.

### A2. Dynamische Konvergenzen: drei Kennwerte laufen aus dem Korridor

Über die 22 Jahre koppeln sich Größen aneinander, die zu Beginn korrekt
kalibriert waren:

1. **Einkommen–Zufriedenheit** steigt von r=.60 auf .82 und verletzt am Ende
   den eigenen Benchmark (.10–.50, `empirical_benchmarks.py:45`). Treiber sind
   die kumulierten einkommensabhängigen Mechanismen (Hedonic-Floor, ökonomisches
   Feedback, relative Deprivation), die alle in dieselbe Richtung wirken.
2. **Alter–Materialismus** kippt von +.02 auf −.24 — das Gegenteil der
   Inglehart-Erwartung und des eigenen Benchmarks (≥ +.05). Ursache: Das
   wöchentliche Update (`latent_traits.rs:477`) kennt nur Einkommen als Treiber;
   der bei Spawn gesetzte Kohorteneffekt erodiert, und Ältere haben höhere
   Einkommen → negatives Vorzeichen. Die Genesis war Inglehart-konform (Werte
   in formativen Jahren fixiert), die Dynamik unterläuft das.
3. **Efficacy–Machtlosigkeit** wächst von −.57 (genau im Literaturband −.4 bis
   −.6) auf −.79 — trotz der im Code dokumentierten Entkopplung
   (`latent_traits.rs:293`). Die gemeinsamen Treiber (Bildung, Vertrauen,
   Distrikt) reichen, um die Konstrukte über die Laufzeit wieder zusammenzuziehen;
   die Diskriminanzgrenze (r < .85) wird am Ende nur knapp gehalten.
   Wichtig: Die frühere Fassung dieser Notiz behauptete, Studierende fänden
   *schwächere* Korrelationen als die Literatur — das ist nach Nachmessung
   falsch; der Wert liegt im bzw. über dem Literaturband.

Praktische Konsequenz für die Lehre: Für Erhebungen mit späten Ticks (Jahr
15–22) sind Zusammenhangsanalysen „zu schön"; frühe bis mittlere Ticks sind
psychometrisch die ehrlicheren Grundgesamtheiten.

### A3. Protestbereitschaft: deterministischer Index, Efficacy-Vorzeichen diskutabel

`political_behavior.rs:156-162` — Protestbereitschaft = Unzufriedenheit (.25) +
Misstrauen (.25) + **niedrige** Efficacy (.10), ohne eigenen Zufallsterm. In den
Daten: r(Protest, Zufriedenheit) = −.96 am Ende — die Größe ist kein eigenes
Merkmal, sondern eine Linearkombination der Einstellungen. Zusätzlich widerspricht
das Efficacy-Vorzeichen dem Ressourcenmodell: Protestierende weisen empirisch
eher hohe interne Efficacy auf (Verba/Schlozman/Brady 1995; Dalton 2008);
gemessen ist r(Protest, Efficacy) = −.94. Mildernd: Das Merkmal heißt „readiness"
(Frustrationspotenzial), nicht Teilnahme, und der endogene Protest in
`sim.rs:2202` belohnt Teilnehmer mit Efficacy-Gewinn. Option für später:
Efficacy-Term invertieren oder streichen und ein stabiles Individualresiduum
ergänzen.

### A4. Zitationsgenauigkeit: drei lose Referenzen

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

### A5. Normative Asymmetrie in `MediaCampaign`

`sim.rs:1471-1519` — progressive Kampagnen (Partei 0) erhalten einen exklusiven
„We hear you"-Mechanismus: bei Geringverdienern steigen Efficacy, Vertrauen,
Wahlnorm dauerhaft (Base-Shifts). Konservative Kampagnen verschieben nur
Ideologie. Es gibt keinen spiegelbildlichen Mechanismus (z. B. „Law and
Order"-Aktivierung). Das ist als Szenario-Setzung legitim (der Ereigniskalender
erzählt eine konkrete Geschichte), sollte aber als solche deklariert werden,
bevor jemand „eingebauten Bias" diagnostiziert.

### A6. Familiale Transmission eher am oberen Rand

`sim.rs:196-210` — Kinder übernehmen 70 % der elterlichen Einstellungswerte
(plus Rauschen). Die Sozialisationsforschung (Jennings/Niemi-Tradition) findet
moderate Transmission, stark themenabhängig; 70 % ist didaktisch gewollt hoch
(sichtbare Familienähnlichkeit). Vertretbar, aber als Setzung kennzeichnen.

### A7. Demografische Vereinfachungen

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

### A8. Kleinere Beobachtungen

- **Vertrauens-SD komprimiert** (gemessen 1.24–1.27 vs. ESS ~2.2): Die
  Ceiling-Erosion oberhalb von 5.0 (`sim.rs:612`) und die Base-Erosion oberhalb
  4.5 stauchen den oberen Rand; nur 7–17 % der Blobs liegen über 6.5, niemand
  über 9. Mittelwert-Anker stimmt, Streuung ist eng — bei Verteilungsvergleichen
  mit ESS-Daten nennen.

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

1. A1 (Policy-Kollinearität) vor der Vorstellung entschärfen oder offensiv als
   bekannte Grenze benennen — es ist der Punkt, den ein Fachpublikum mit einer
   einzigen Korrelationstabelle finden kann. Der Fix (stabiles Individualresiduum
   je Policy) ist klein, erfordert aber Precompute + Re-Export.
2. A2 pragmatisch abfedern: Übungs-Erhebungen auf frühe bis mittlere Ticks
   legen; die Benchmark-Verletzungen (Einkommen–Zufriedenheit, Alter–Materialismus
   am Laufzeitende) als offene Kalibrierungspunkte führen.
3. Die drei losen Zitate (A4) im Code-Kommentar bei Gelegenheit korrigieren —
   fünf Minuten Arbeit, nimmt einem Fachpublikum die billigste Angriffsfläche.
4. A5 und A6 nur bei Nachfrage: „Ereigniskalender erzählt ein Szenario."
5. A7 (Namen/Geschlecht) einmal selbst durchdenken, bevor Studierende auf die
   Idee kommen — eignet sich gut als bewusste Übungsfalle.
