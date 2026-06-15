<p align="center">
  <img src="public/blobtopia-logo.png" alt="Blobtopia Logo" width="400">
</p>

<h1 align="center">Blobtopia</h1>

<p align="center">
  <strong>Eine interaktive 3D-Gesellschaftssimulation als Lehrwerkzeug für die empirische Sozialforschung.</strong>
</p>

<p align="center">
  <a href="https://blobtopia.vercel.app/#/s/0?intro=1"><strong>Blobtopia live ausprobieren</strong></a>
</p>

Blobtopia ist eine simulierte Stadt mit 500 kugelförmigen Wesen — den *Blobs* — die in fünf Distrikten leben, arbeiten, wählen und protestieren. Studierende erforschen diese Gesellschaft wie echte Sozialforscher\*innen: durch Beobachtung, Interviews, Datenanalyse und Inhaltsanalyse.

Teil des **Globtopia-Lehrkonzepts** für das Proseminar *Methoden I* (B.A. Politikwissenschaft) an der Philipps-Universität Marburg.

---

## Inspiration & Credits

Blobtopia baut auf drei Projekten auf, ohne die es nicht existieren würde:

- **[minutelabsio/evolution-simulator](https://github.com/minutelabsio/evolution-simulator)** von Jasper Palfree (GPL-3.0) — die ursprüngliche Simulationsplattform, deren Aufbau und Darstellung als Grundlage für Blobtopia dienen. Die Blob-Wesen, das Bausteinsystem und die 3D-Ansicht stammen aus diesem Projekt.

- **[Primer Learning](https://www.youtube.com/@PrimerLearning)** — der YouTube-Kanal von Justin Helps, dessen Simulationsvideos zu Evolution und entstehenden Gesellschaften die Idee inspirierten, kugelförmige Figuren (*Blobs*) als anschauliche Vertreter sozialer Akteure einzusetzen.

- **[Kenney](https://kenney.nl)** — die 3D-Stadtmodelle (Gebäude, Straßen, Pflanzen, Infrastruktur) stammen aus den Asset-Packs von Kenney Vleugels, vor allem *City Kit (Suburban)*, *City Kit (Commercial)* und *Nature Kit*. Alle Kenney-Assets stehen unter **CC0 1.0 Universal (Public Domain)**.

Blobtopia verwandelt die ursprüngliche Evolutionssimulation in eine **politikwissenschaftliche Gesellschaftssimulation**: Statt Nahrungssuche und Fortpflanzung bildet es Einstellungen, Wahlen, soziale Netzwerke und politische Krisen ab.

---

## Was ist Blobtopia?

Blobtopia ist ein *lebendiges Labor* für die Methodenlehre. Es verbindet drei didaktische Säulen:

1. **Beobachtung** — Studierende beobachten die 3D-Stadt, erkennen Muster (wer geht wann wohin, und warum?) und lernen, sichtbare Merkmale von verborgenen Eigenschaften zu unterscheiden.

2. **Befragung** — Über ein KI-gestütztes Interview-System lassen sich Blobs direkt befragen. Jeder Blob antwortet im Rahmen seiner Persönlichkeit, seiner Einstellungen und seiner aktuellen Stimmung — inklusive sozialer Erwünschtheit und Antwortverweigerung.

3. **Datenanalyse** — Materialien wie der BlobFeed (kurze Nachrichten wie auf Twitter) und die BlobGazetta (Zeitungsausgaben) eignen sich für die Inhaltsanalyse; die aufgezeichneten Zeitverläufe erlauben quantitative Auswertungen.

Der Clou: Die Simulation kennt die *wahren Werte* jedes Blobs. Studierende erleben den Unterschied zwischen dem, was sie durch eine Befragung erfahren, und dem, was tatsächlich der Fall ist — und verstehen so Gültigkeit (Validität), Zuverlässigkeit (Reliabilität) und Messfehler ganz unmittelbar.

---

## Wie es funktioniert

Blobtopia ist **vollständig vorberechnet**: Die gesamte 22-jährige Entwicklung der Gesellschaft (über 8.000 Tage) wird einmal im Voraus berechnet und gespeichert. Die Anwendung im Browser spielt diese Geschichte dann nur noch ab — wie ein Film, durch den man vor- und zurückspulen kann.

Die **einzige Live-Komponente** sind die KI-gestützten Interviews: Wenn man einen Blob direkt befragt, entsteht die Antwort in dem Moment.

*Technische Details zum Aufbau stehen in [ARCHITECTURE.md](ARCHITECTURE.md).*

---

## Stadt-Editor

Unter der Adresse `/#/editor` gibt es ein Werkzeug, mit dem Lehrende die Stadt selbst gestalten können (am Desktop): Gebäude platzieren, drehen, verschieben und löschen, Straßenzüge ziehen, Distrikte einfärben sowie Schritte rückgängig machen und wiederholen. Pro Gebäude lassen sich Bezeichnung, Funktion und Kapazität festlegen. Ein Prüf-Assistent warnt sofort, wenn die Stadt nicht simulierbar wäre — etwa bei zu wenig Wohnraum für alle Blobs oder unerreichbaren Gebäuden.

Der Arbeitsstand wird automatisch gesichert. **„In Welt ansehen"** zeigt den Entwurf sofort in der 3D-Stadt (rein zur Ansicht — das Verhalten der Blobs bleibt zunächst das der ausgelieferten Standard-Stadt). Damit eine neu gebaute Stadt auch wirklich neu simuliert wird, muss die Simulation einmal neu durchgerechnet werden (siehe [Setup](#setup)).

---

## Die Gesellschaft

### 500 Blobs in 5 Distrikten

| Distrikt | Blobs | Profil |
|---|---|---|
| **Grüntal** | 80 | Ländlich, niedrige Zufriedenheit, links orientiert, geringes Vertrauen |
| **Sonnenberg** | 80 | Wohlhabend, hohe Zufriedenheit, rechts orientiert, hohes Vertrauen |
| **Hafenviertel** | 120 | Urban und vielfältig, breit gestreute Einstellungen, hohe Durchmischung |
| **Mittelfeld** | 120 | Mitte, gemäßigte Werte, mittleres Einkommen |
| **Industriezone** | 100 | Arbeiterviertel, niedrige Zufriedenheit, links, niedriges Vertrauen |

Jeder Blob hat: Name, Alter, Bildung, Einkommen, Wohnort, Arbeitsplatz, Parteinähe, neun politische Einstellungen, verborgene Persönlichkeitseigenschaften samt beobachtbaren Anzeichen, eine aktuelle Stimmung und ein stabiles Persönlichkeitsmerkmal.

---

## Verborgene Eigenschaften (Konstrukte)

Blobtopia bildet **sechs verborgene Konstrukte** mit insgesamt **21 beobachtbaren Anzeichen** ab. Die Konstrukte sind nicht direkt messbar — Studierende müssen sie durch Befragung und Beobachtung greifbar machen (operationalisieren).

### 1. Politische Wirksamkeit (Efficacy)

*„Kann ich als Bürger\*in politisch etwas bewirken?"* (nach Dalton)

- „Ich kann politische Entscheidungen beeinflussen"
- Verständnis politischer Abläufe
- „Meine Stimme zählt bei Wahlen"
- „Die Regierung kümmert sich um die Meinung normaler Leute"

**Stärkster Einfluss:** Bildung — je höher, desto stärker das Gefühl der Wirksamkeit.

### 2. Soziales Kapital

*„Bin ich sozial eingebunden?"* (nach Putnam)

- Zahl regelmäßiger sozialer Kontakte
- Vertrauen in die Nachbarschaft
- Häufigkeit gemeinschaftlicher Aktivitäten
- „Den meisten Menschen kann man vertrauen"
- Vertrauen in die Medienberichterstattung

**Stärkster Einfluss:** Alter — soziale Bindungen wachsen über das Leben.

### 3. Autoritarismus

*„Brauchen wir starke Führung und Ordnung?"* (nach Feldman & Stenner)

- „Gehorsam und Respekt vor Autorität sind wichtige Tugenden"
- „Regeln müssen strikt befolgt werden"
- „Starke Führung ist besser als langes parlamentarisches Diskutieren"

**Stärkster Einfluss:** Alter (ältere Jahrgänge stärker); höhere Bildung schwächt es ab.

### 4. Politikverdrossenheit

*„Ist das politische System mir entfremdet?"*

- „Die da oben machen doch, was sie wollen"
- „Politik ist zu kompliziert für normale Leute"
- „Alle Parteien sind im Grunde gleich"

**Stärkster Einfluss:** Einkommen — je niedriger, desto stärker die Verdrossenheit.

### 5. Materialismus vs. Postmaterialismus

*„Was zählt mehr: Sicherheit oder Selbstverwirklichung?"* (nach Inglehart)

- Wirtschaftliche Sicherheit gegenüber Selbstentfaltung
- „Umwelt ist wichtiger als Wachstum"
- „Freiheit ist wichtiger als Ordnung"

**Stärkster Einfluss:** Einkommen — wirtschaftliche Unsicherheit fördert materielle Prioritäten.

### 6. Populismus

*„Steht das Volk gegen die Elite?"* (nach Akkerman, Mudde & Zaslove)

- „Politiker haben den Kontakt zum Volk verloren"
- „Das Volk, nicht die Politiker, sollte wichtige Fragen entscheiden"
- „Politik ist letztlich Gut gegen Böse"

**Zusammengesetztes Konstrukt:** gespeist aus hoher Verdrossenheit, geringer Wirksamkeit und niedrigem Sozialkapital.

---

## Politische Einstellungen

Jeder Blob hat **neun politische Einstellungen** auf einer Skala von 0 bis 10:

| Einstellung | Pole |
|---|---|
| Politische Zufriedenheit | unzufrieden – zufrieden |
| Ideologie | links – rechts |
| Vertrauen in Institutionen | misstrauisch – vertrauensvoll |
| Wirtschaftspolitik | staatliche Regulierung – Marktfreiheit |
| Umweltpolitik | Umweltschutz – Wirtschaftswachstum |
| Sicherheitspolitik | Bürgerfreiheiten – Ordnung und Kontrolle |
| Sozialpolitik | Umverteilung – Eigenverantwortung |
| Migrationspolitik | offen – restriktiv |
| Demokratieverständnis | direkte Demokratie – repräsentative Eliten |

Diese Einstellungen verändern sich durch **Ereignisse**, **sozialen Einfluss** und **Lebenserfahrung**.

---

## Politisches Verhalten

### Parteien

| Partei | Ausrichtung |
|---|---|
| **Fortschritt** | progressiv, links |
| **Mitte** | zentristisch |
| **Tradition** | konservativ, rechts |
| **Unabhängige** | systemkritisch, parteiungebunden |

### Wahlverhalten

Wer sowohl sehr unzufrieden als auch sehr misstrauisch ist, bleibt der Wahl eher fern. Wahlen finden alle vier Jahre statt.

### Protest

Die Protestbereitschaft steigt, je stärker Unzufriedenheit und Misstrauen zusammenkommen. Überschreitet sie in einem Distrikt eine Schwelle, beginnen dort Proteste — und besonders unzufriedene Blobs ziehen zum Rathausplatz.

---

## Stimmungen

Jeder Blob hat eine Stimmung, die sich daraus ergibt, wie positiv oder negativ und wie ruhig oder aufgewühlt er sich fühlt: **begeistert, hoffnungsvoll, zufrieden, gelassen, angespannt, besorgt, frustriert** oder **wütend**.

Die Stimmung färbt seine Interview-Antworten, seine Kurznachrichten und die Zeitungsartikel.

---

## Sozialer Einfluss

Jeder Blob ist in ein soziales Netzwerk eingebunden (bis zu 15 enge Kontakte). Am stärksten zählen Haushaltsmitglieder, dann Kolleg\*innen, Nachbar\*innen und Bekannte.

Blobs in Sichtweite beeinflussen sich gegenseitig in Zufriedenheit, Ideologie und Vertrauen — je näher, desto stärker. Sehr ausgeprägte Überzeugungen lassen sich schwerer beeinflussen. Dieser soziale Einfluss wird wöchentlich neu berechnet.

---

## Persönlichkeit: Bedürfnis nach Eindeutigkeit

Jeder Blob hat ein stabiles **Bedürfnis nach klaren, eindeutigen Antworten** (in der Forschung: *Need for Cognitive Closure*, nach Webster & Kruglanski):

- **Stark ausgeprägt:** bevorzugt einfache, klare Antworten, ist anfälliger für populistische Botschaften, ändert seine Ideologie schneller, neigt stärker zum Autoritarismus.
- **Schwach ausgeprägt:** hält Mehrdeutigkeit besser aus, ist widerstandsfähiger gegen Populismus, denkt eher in Graustufen.

Dieses Merkmal beeinflusst, wie empfänglich ein Blob für bestimmte Botschaften ist und wie er im Interview kommuniziert.

---

## Ereignisse

Über die 22 Jahre laufen **27 Ereignisse** ab. Jedes löst eine Kette von Wirkungen auf Einstellungen und Eigenschaften aus — und zwar **ungleich verteilt**: Manche Distrikte und Einkommensgruppen trifft es härter als andere.

| Ereignis | Wirkung |
|---|---|
| **Wirtschaftskrise** | Trifft niedrige Bildung und niedriges Einkommen härter. Materielle Prioritäten steigen, das Gefühl der Wirksamkeit sinkt, Populismus wächst. |
| **Politischer Skandal** | Vertrauensverlust besonders bei Anhänger\*innen der betroffenen Partei. Überträgt sich auf andere, vor allem bei geringem politischen Wissen. |
| **Naturkatastrophe** | Trifft einen ganzen Distrikt. Solidarität entsteht: das soziale Kapital steigt trotz Verlusten, das Umweltbewusstsein wächst. |
| **Politische Reform** | Geringverdiener profitieren (Zufriedenheit und Wirksamkeit steigen); Besserverdienende reagieren je nach Haltung unterschiedlich. |
| **Medienkampagne** | Wirkt weniger stark bei höherer Bildung. Fortschrittliche Kampagnen in benachteiligten Distrikten stärken das Gefühl der Wirksamkeit. |
| **Bildungsreform** | Langfristig wirksam: Bildung, Einkommen und Wissen steigen, das Bedürfnis nach Eindeutigkeit sinkt. |
| **Bürgererfolg** | Trifft einen Distrikt. Vertrauen, Wirksamkeit und Beteiligung steigen — „Engagement lohnt sich". |
| **Kulturveranstaltung** | Trifft einen Distrikt. Zufriedenheit und Gemeinschaftsgefühl steigen. |
| **Polarisierungsdebatte** | Zu einem Thema (Klima, Sicherheit, Ungleichheit). Die Bevölkerung driftet auseinander. |
| **Ungleichheitsbericht** | Zufriedenheit sinkt, je größer die eigene Einkommenslücke wirkt. Die Kritik an „den Eliten" wächst. |
| **Distriktübergreifender Konflikt** | Regionale Identität verstärkt sich, die Distrikte polarisieren gegeneinander, das Vertrauen in Institutionen sinkt. |
| **Korruptionsenthüllung** | Vertrauensverlust überall, Gefühl der Machtlosigkeit steigt, Protestwelle über alle Distrikte. |

---

## Materialien

### BlobFeed (kurze Nachrichten)

1.707 vorberechnete Kurznachrichten, mit KI erzeugt. Jede spiegelt die aktuelle Stimmung und Persönlichkeit eines Blobs, seine politischen Einstellungen, sein Bildungsniveau (von Umgangssprache bis akademisch) und seine Reaktion auf aktuelle Ereignisse.

### BlobGazetta (Zeitungen)

50 Zeitungsausgaben in zwei Stilrichtungen (fortschrittlich und konservativ), mit KI erzeugt. Sie berichten über Wahlergebnisse, Krisen, Skandale und gesellschaftliche Entwicklungen.

### KI-Interviews

Studierende können Blobs in einem Chat-Gespräch interviewen. Die KI antwortet im Charakter des jeweiligen Blobs — auf Basis seiner Eigenschaften, Einstellungen, Stimmung und aktuellen Tätigkeit. Schutzmechanismen sorgen dafür, dass die KI in ihrer Rolle bleibt.

---

## Die Akte: Stadt & Schreibtisch

Die Oberfläche ist als Sammlung **physischer Forschungsartefakte** über der 3D-Stadt gestaltet. Der Bildschirm ist eine Akte mit zwei Reitern:

- **Stadt** (das Feld): Einen Blob antippen öffnet seine **Karteikarte** mit Porträt (das Gesicht zeigt die Stimmung) und Feldnotiz; „Interview führen" startet ein **Protokoll** mit laufender Aufnahme; ein Gebäude öffnet seine **Hausakte**; die Kurznachrichten laufen auf dem **BlobPhone** (das „Twitter" der Blobs); ⌘K öffnet das **Einwohnermelderegister**. Die Zeitleiste ist die **Filmrolle des Stadtarchivs** („Aufzeichnung · 22 Jahre").
- **Schreibtisch** (die Auswertung): eine Registratur mit **Studien** (dem Befragungsinstitut), der **Presse** (dem Blobspiegel und dem blobtopia kurier) und dem verschlossenen **Dozentenzimmer** — dahinter liegen, versiegelt, die wahren Werte.

Bedienlogik im Stil von Papier und Stempel: Auswahlfelder werden eingekreist oder angekreuzt, Absenden-Knöpfe „stempeln", Hinweise stehen in Bleistift-Handschrift.

### Befragungsinstitut

Statt Blobs einzeln zu interviewen, können Studierende ganze automatisierte Befragungen in Auftrag geben (Studienmappe am Schreibtisch oder Taste `b`):

1. **Fragebogen** — Fragen und Antwortskalen werden komplett frei formuliert (wie in einem Codebook). Das System erkennt automatisch die Skala, das gemessene Merkmal und mögliche Frageeffekte. Jedes Item zeigt an, ob es beantwortbar ist; wird eine Frage nicht erkannt, gibt ein freundlicher Hinweis den Rat, sie konkreter zu formulieren. Ohne erkennbares Merkmal kann die Simulation keine Antwort erzeugen — der Feldstart wird dann mit klarer Meldung blockiert (keine stillen leeren Spalten). **Hintergrundmerkmale** (Name, Distrikt, Alter, Bildung, Partei, Einkommen) landen nur dann im Datensatz, wenn man sie ausdrücklich erhebt — wie im echten Fragebogen.

2. **Stichprobe** — ein einstellbares Ziehungsdesign mit Filtern für die Grundgesamtheit (Distrikt, Bildung, Partei, Alter, Einkommen) und sechs Verfahren: Zufallsauswahl, geschichtet, Klumpen (ein- und zweistufig), systematisch, Quote und manuelle Auswahl (damit Auswahlverzerrung erlebbar wird). Reproduzierbar, mit einem Planer für die nötige Stichprobengröße. Dazu die **Feldarbeit**: Der Erhebungsmodus (persönlich, Telefon, online) und die Zahl der Kontaktversuche steuern, wer ausfällt — so unterscheiden sich Brutto und Netto, samt Ausschöpfungsquote im Datensatz. Im **Längsschnitt** gibt es Trend- und Panel-Studien über die Zeit (bis zu vier Wellen, beim Panel mit selektiver Abwanderung). Studien lassen sich als Datei sichern und exakt wiederholen.

3. **Ergebnis** — die Antworten werden aus den gespeicherten wahren Werten der Blobs erzeugt, ergänzt um realistischen Messfehler und nachgebildete Frageeffekte (Zustimmungstendenz, Framing, soziale Erwünschtheit, nicht-zufällige Antwortausfälle). Die Datentabelle ist direkt im Fenster sichtbar; Export als CSV (passend für deutsches Excel) samt Codebook.

4. **Wahrheit** (hinter dem Dozenten-Schloss) — weil die Simulation die wahren Werte kennt, lässt sich jeder Schätzwert **exakt** in seine Fehlerquellen zerlegen (Total Survey Error): Abdeckung, Ziehung, Ausfälle und Messung ergeben zusammen genau die Abweichung von der Wahrheit; der Messfehler wird weiter aufgeschlüsselt. Dazu: ehrliche Standardfehler, ein **Wiederholungs-Simulator** (zeigt, dass sich Zufallsfehler herausmittelt, eine Verzerrung aber bleibt), eine **Gewichtung** an die wahren Randverteilungen, die **Zuverlässigkeit** von Item-Batterien (Cronbachs Alpha) und bei Längsschnitten der Vergleich von geschätzter und wahrer Veränderung. Es gibt ein Dozenten-CSV mit den wahren Werten; das Studierenden-CSV bleibt wahrheitsfrei.

Eine KI-gestützte Befragungs-Variante existiert vollständig, ist aber aus Kostengründen nicht freigeschaltet.

---

## Leben in der 3D-Stadt

### Tagesablauf

Jeder Blob hat einen eigenen Tagesplan: schlafen, pendeln, arbeiten, Mittagspause, spazieren, Freizeit, heimgehen.

### Bewegung

Die Blobs bewegen sich natürlich durch die Stadt: Sie wählen ein Ziel in der Nähe, gehen ruhig dorthin, halten kurz inne und suchen sich ein neues — jeder mit eigenem Tempo und Timing (inspiriert von *Cities: Skylines* und *Die Sims*).

### Lieblingsorte

Wo ein Blob seine Freizeit verbringt, hängt von seinen Eigenschaften ab:

- **Hafenpromenade** — gemeinschaftlich aktive Blobs
- **Steinweg-Park** — umweltbewusste, postmaterielle Blobs
- **Flussufer** — zufriedene, nicht entfremdete Blobs
- **Ringstraßen-Allee** — junge, selbstwirksame Blobs
- **Marktplatz** — materiell und gemeinschaftlich orientierte Blobs

---

## Für Entwickler

### Verwendete Technik

| Bereich | Technologie |
|---|---|
| Frontend | Vue 3, Pinia, Vue Router |
| Build | Vite |
| 3D-Darstellung | Three.js (mit Kenney-Modellen) |
| Oberfläche | Oruga |
| Simulation | Rust (offline) |
| KI-Chat | Anthropic Claude (Serverless Function) |
| Hosting | Vercel |

### Setup

Voraussetzung: Node ≥ 22.5 (siehe `.nvmrc`).

```bash
npm ci          # Abhängigkeiten installieren
npm run dev     # Entwicklungsserver (http://localhost:8080)
npm test        # Tests
npm run build   # Produktions-Build
```

Die Offline-Werkzeuge (Rust-Simulation, Zeitleisten-Export, Generierung der Nachrichten und Zeitungen) sind für den Betrieb der App **nicht nötig**. Details dazu in [ARCHITECTURE.md](ARCHITECTURE.md) und [data/README.md](data/README.md).

**Hinweis für frische Clones:** Die großen Zeitverlaufsdaten (~2,3 GB) liegen nicht im Repository — siehe [data/README.md](data/README.md).

### Repository-Aufbau

| Pfad | Inhalt |
|---|---|
| `src/` | Frontend (3D-Welt, Inspektor, Chat, Befragungsinstitut) |
| `api/chat.js` | Schnittstelle für die KI-Interviews |
| `crates/` | Rust-Simulation (offline) |
| `scripts/` | Export, Tests und Generierung |
| `data/`, `public/data/` | Quelldaten und exportierte Zeitleiste |

---

## Lizenz

Dieses Projekt steht unter der **GNU General Public License v3.0** (GPL-3.0), da es auf [minutelabsio/evolution-simulator](https://github.com/minutelabsio/evolution-simulator) aufbaut, das unter GPL-3.0 lizenziert ist. Siehe [LICENSE](LICENSE) für den vollständigen Lizenztext.

**Drittanbieter-Lizenzen:**

| Komponente | Lizenz | Quelle |
|---|---|---|
| evolution-simulator | GPL-3.0 | [minutelabsio/evolution-simulator](https://github.com/minutelabsio/evolution-simulator) |
| Kenney 3D-Assets | CC0 1.0 (Public Domain) | [kenney.nl](https://kenney.nl) |
| Vue.js, Three.js, Oruga | MIT | jeweilige Repositories |
