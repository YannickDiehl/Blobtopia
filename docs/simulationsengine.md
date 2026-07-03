# Die Simulationsengine von Blobtopia — sozialwissenschaftliche Fundierung

> Kurzdarstellung für Lehre und Präsentation. Stand: Juli 2026.
> Interne Plausibilitätsbefunde: siehe [simulationsengine-pruefnotiz.md](simulationsengine-pruefnotiz.md).

## 1. Zweck und Grundprinzip

Blobtopia ist eine synthetische Gesellschaft für die Methodenlehre. 500 künstliche Bürger:innen („Blobs") leben in fünf Stadtteilen und entwickeln über 22 simulierte Jahre (8.030 Ticks, 1 Tick = 1 Tag) politische Einstellungen, Parteibindungen und Verhaltensbereitschaften. Die Simulation wurde einmal offline berechnet (Rust, deterministisch aus Seed 118) und als Zeitreihe eingefroren; das Frontend spielt diese Daten nur ab. Jeder Durchlauf ist damit vollständig reproduzierbar.

Der didaktische Kern liegt in einer Eigenschaft, die reale Sozialforschung nie hat: Die wahren Werte aller Merkmale sind zu jedem Zeitpunkt bekannt. Eine studentische Stichprobenschätzung lässt sich deshalb nicht nur mit „der Wahrheit" vergleichen, sondern exakt in ihre Fehlerkomponenten zerlegen (Abschnitt 7).

## 2. Aufbau der Population

Die Bevölkerung entsteht in drei Schritten. Zuerst werden Haushalte gebildet, nach der deutschen Haushaltsstruktur (42 % Single, 33 % Paar, 25 % Familien); Kinder erhalten realistische Eltern-Kind-Altersabstände. Danach bekommt jede Person Demografie aus dem Profil ihres Stadtteils: Bildung (vier Stufen, kumulative Verteilungen je Stadtteil), Einkommen (stadtteilspezifische Spannen plus Bildungsbonus) und Alter (metrisch, 2–78). Schließlich werden Einstellungen und latente Konstrukte aus Stadtteil-Basiswerten plus demografischen Effekten plus individuellem Zufallsrauschen erzeugt.

Die fünf Stadtteile sind soziologisch typisierte Milieus mit bewusst überlappenden Verteilungen: Grüntal (ländlich-traditionell), Sonnenberg (akademisch-progressiv), Hafenviertel (divers, gemischt), Mittelfeld (suburban-zentristisch), Industriezone (prekär, deindustrialisierend). Kein Stadtteil ist homogen — jede Merkmalskombination kommt überall vor, nur mit unterschiedlicher Wahrscheinlichkeit. Kinder unter 18 tragen keine politischen Verhaltensmerkmale; ihre Einstellungen werden zu 70 % von den Eltern geprägt (politische Sozialisation in der Familie) und beim Volljährigwerden einmalig durch Bildungs- und Einkommenseffekte angepasst.

## 3. Einstellungen und latente Konstrukte (Messmodell)

Jeder Blob trägt drei direkte Einstellungen — politische Zufriedenheit, Links-Rechts-Selbsteinschätzung (1–10) und Institutionenvertrauen — sowie sechs Policy-Positionen (Wirtschaft, Umwelt, Sicherheit, Soziales, Migration, Demokratieverständnis), die aus Ideologie und Konstrukten abgeleitet werden.

Darüber liegt das eigentliche Messmodell: sechs latente Konstrukte mit insgesamt 21 Indikatoren. Der latente Wert selbst ist unbeobachtbar; messbar sind nur die Indikatoren, die aus dem latenten Wert plus Rauschen entstehen — genau die Logik reflektiver Operationalisierung, wie sie in der Vorlesung behandelt wird.

| Konstrukt | Indikatoren (Beispiele) | Theoretische Referenz | Zentrale Treiber im Modell |
|---|---|---|---|
| Politische Efficacy | Selbstwirksamkeit, pol. Wissen, Stimmenwichtigkeit (+ externe Efficacy) | Kognitive Mobilisierung (Dalton 1984); Verba/Schlozman/Brady 1995 | Bildung (+), Einkommen (+) |
| Soziales Kapital | Netzwerkgröße, Nachbarschaftsvertrauen, Gemeinschaftsaktivität (+ generalisiertes Vertrauen, Medienvertrauen) | Putnam 2000 | Alter (+), Lebensereignisse, Kontaktnetz |
| Autoritarismus | Gehorsam, Regelkonformität, Präferenz starker Führung | Adorno et al. 1950; Altemeyer 1981 | Alter (+), Bildung (−), Need for Closure |
| Politikverdrossenheit | Machtlosigkeit, wahrgenommene Komplexität, Parteiengleichgültigkeit | Entfremdungskonzept (Seeman 1959) | Ökonomische Deprivation (+), Vertrauensdefizit |
| (Post-)Materialismus | Ökonomische Sicherheit, Umwelt vs. Wirtschaft, Freiheit vs. Ordnung | Wertewandel (Inglehart 1977): Mangel- und Sozialisationshypothese | Einkommen (−), Alter (+) |
| Populismus | Anti-Elitismus, Volkszentrismus, Gut-Böse-Denken | Akkerman/Mudde/Zaslove 2014 | Verdrossenheit (+), niedrige Efficacy, Misstrauen |

Zusätzlich trägt jeder Blob ein stabiles Persönlichkeitsmerkmal, das „Need for Cognitive Closure" (Webster/Kruglanski 1994). Es moduliert die Anfälligkeit für sozialen Einfluss und autoritäre Angebote.

Die Effektstärken sind an empirische Benchmarks angelehnt und werden automatisiert geprüft (Abschnitt 8): etwa Bildung–Autoritarismus negativ (r ≤ −.15), Bildung–Efficacy positiv (r ≥ .10), Alter–Materialismus positiv, Einkommen–Zufriedenheit r ≈ .10–.50.

## 4. Dynamik: Was die Gesellschaft über 22 Jahre bewegt

Einstellungen sind im Modell keine Konstanten, sondern das Ergebnis konkurrierender Kräfte. Wöchentlich wirken:

1. **Persönlichkeitsverankerung.** Jeder Blob wird zu seinen Ausgangswerten zurückgezogen (Halbwertszeit grob 1–2 Jahre). Das bildet die hohe Rangordnungsstabilität von Dispositionen ab (Roberts/DelVecchio 2000) und verhindert, dass die Population homogenisiert.
2. **Sozialer Einfluss im Kontaktnetz.** Haushalt, Arbeitsplatz, Nachbarschaft und Freizeitorte erzeugen einen Kontaktgraphen (gewichtet, gedeckelt bei ~15 aktiven Kontakten, angelehnt an Dunbars innere Zone). Einstellungsangleichung folgt dem Bounded-Confidence-Modell (Hegselmann/Krause 2002): Nur hinreichend ähnliche Kontakte überzeugen; sehr ferne Positionen stoßen leicht ab. Gleiche Parteibindung verstärkt den Einfluss (In-Group-Bias, Tajfel/Turner 1979), Interaktion unter Gleichgesinnten schiebt von der Mitte weg (Gruppenpolarisierung, Moscovici/Zavalloni 1969).
3. **Mediale Umwelten.** Jeder Stadtteil hat eine typisierte Mediendiät (Qualitätspresse, Lokalzeitung, Boulevard/Social Media …), die Wissen, Komplexitätsempfinden und Führungspräferenzen unterschiedlich verschiebt — als bewusst vereinfachte Umsetzung von Agenda-Setting (McCombs/Shaw 1972) und Wissenskluft (Tichenor et al. 1970).
4. **Ideologie-Realignment.** Ökonomischer Abstieg plus Verdrossenheit plus niedrige Bildung driftet nach rechts („Left Behind", Inglehart/Norris 2019); hohe Bildung plus Postmaterialismus plus Efficacy driftet nach links. Parteibindung zieht zudem die Ideologie zur Parteiposition zurück (Dissonanzreduktion, Festinger 1957).
5. **Individuelle Lebensereignisse und Handlungsmuster.** Mit geringer Wochenwahrscheinlichkeit treten Jobverlust, Beförderung, Krankheit oder Gemeinschaftserfolge ein. Ein Entscheidungsbaum übersetzt Persönlichkeitskonstellationen in unterschiedliche Reaktionen auf gleiche Lagen — Engagement (Verba/Schlozman/Brady 1995), Rückzug (Norris 2011), autoritäre Radikalisierung (Moghaddam 2005), Gemeinschaftsaufbau (Putnam 2000).
6. **Strukturelle Rückkopplungen.** Relative Deprivation gegenüber dem eigenen Kontaktnetz senkt Zufriedenheit (Runciman 1966); Stadtteilökonomien entwickeln sich humankapitalabhängig auseinander (kumulative Verursachung, Myrdal 1957); Haushalte mit starkem Einkommens-Mismatch ziehen um (Tiebout 1956). Sättigungs- und Erosionsmechanismen halten die Verteilungen in empirisch plausiblen Bereichen (ESS-Ankerwerte für Vertrauen und Zufriedenheit).

Neben diesem Alltagsgeschehen wirken **Ereignisse**: exogen über einen Ereigniskalender (Wirtschaftskrise, Skandal, Naturkatastrophe, Reform, Medienkampagne …) mit asymmetrischer Betroffenheit — wer verletzlich ist (Stadtteil, Bildung, Einkommen), wird stärker getroffen — und endogen aus dem Systemzustand heraus (spontane Proteste bei niedrigem Vertrauen und hoher Protestbereitschaft, zivilgesellschaftliche Erfolge bei hoher kollektiver Efficacy, kollektive Resignation als Entfremdungsspirale).

## 5. Politisches Verhalten

Parteiwahl, Wahlbeteiligung und Protestbereitschaft werden aus Einstellungen und Konstrukten abgeleitet, nicht gesetzt. Die Parteiwahl folgt einem Softmax-Modell über die ideologische Distanz zu drei Parteien (Fortschritt, Mitte, Tradition) plus einer Option „Unabhängige", deren Wahrscheinlichkeit mit Misstrauen und Unzufriedenheit steigt. Starke Loyalität und eine Ein-Jahres-Sperre vor Neubewertungen erzeugen die empirisch typische Trägheit von Parteibindungen (Parteiidentifikation im Sinne des Michigan-Modells, Campbell et al. 1960): realistisch sind ein bis drei Wechsel in 22 Jahren.

Die Wahlbeteiligung folgt dem sozioökonomischen Standardmodell: Basiswahrscheinlichkeit ~68 %, erhöht durch Bildung, Alter, Efficacy und Stimmenwichtigkeit, gesenkt durch Parteiengleichgültigkeit und einen Zufallsterm für Alltagshindernisse; geklemmt auf 35–78 % (Anker: deutsche Wahlbeteiligung). Die Protestbereitschaft speist sich aus Unzufriedenheit und Misstrauen (Dalton 2008); kollektiver Protest bricht erst aus, wenn Stadtteil-Schwellen überschritten werden.

## 6. Von der Simulation zur Befragungsantwort

Studierende befragen die Blobs nicht direkt an der Datenbank, sondern über eine Antwort-Engine. Der gespeicherte Zustand eines Blobs wird in ein Sprachmodell-Persona übersetzt (kanonischer Prompt-Builder): Demografie, Einstellungen, alle 21 Indikatoren, Policy-Positionen, aktuelle Emotion und Tätigkeit. Entscheidend ist, dass Messfehler hier konstruiert und kontrolliert entsteht: Das Persona darf auf Skalenfragen nur den jeweils gefragten Wert nutzen (Konstrukt-Trennung), rundet auf ganze Zahlen, darf ±1–2 Punkte „menschlich" abweichen und variiert bei Wiederholungsfragen leicht. Numerische Profilwerte darf es nie nennen. Antwortverhalten wie Verweigerung bei sehr niedrigem Vertrauen ist Teil des Modells — Nonresponse ist damit nicht zufällig, sondern systematisch, wie in realen Erhebungen.

## 7. Der didaktische Kern: bekannte Wahrheit und exakte Fehlerzerlegung

Weil die wahren Werte bekannt sind, lässt sich jede Schätzung entlang des Total-Survey-Error-Rahmens exakt bilanzieren. Die Kette aus fünf Mittelwerten pro Item —

Populationsmittel → Frame-Mittel → wahres Mittel der Gezogenen → wahres Mittel der Antwortenden → beobachtete Schätzung

— zerlegt die Gesamtabweichung additiv in (1) Coverage-Fehler, (2) Stichprobenfehler, (3) Nonresponse-Verzerrung und (4) Messfehler. Die Summe der vier Komponenten entspricht per Konstruktion der Differenz zwischen Schätzung und Populationswert. Studierende sehen also nicht nur, dass ihre Schätzung abweicht, sondern woran es lag — und können Stichprobenverfahren (Zufalls-, geschichtete, Klumpen-, Quotenauswahl, jeweils parametrisierbar und seed-reproduzierbar) gezielt vergleichen.

## 8. Validierung und Grenzen

Die Engine wird durch eine siebenstufige Validierungspipeline geprüft: Datenintegrität, Verteilungsplausibilität gegen empirische Referenzwerte (ALLBUS, ESS, Bundestagswahlstatistik), Prompt-Genauigkeit, LLM-Kalibrierung (Abweichung Antwort vs. wahrer Wert), zeitliche Stabilität (Autokorrelation, Varianzerhalt, Reliabilitätsverfall), sowie vertiefte Plausibilitätstests einschließlich konfirmatorischer Faktorenstruktur (diskriminante Validität, maximale Inter-Konstrukt-Korrelation r < .85).

Transparenz verlangt, auch die Grenzen zu benennen. Blobtopia ist ein didaktisches Modell, kein Abbild Deutschlands: (1) Die Effektstärken sind heuristisch gesetzt und an Benchmark-Korridore kalibriert, nicht aus Daten geschätzt; Zusammenhänge fallen tendenziell kräftiger aus als in realen Bevölkerungsdaten — Effekte sollen von Studierenden gefunden werden können. (2) Die Einstellungskonsistenz liegt über realen Massenpublika: Policy-Positionen sind eng an die Links-Rechts-Ideologie gekoppelt, deutlich enger, als es die Constraint-Forschung (Converse 1964) für reale Befragte zeigt. (3) Über die lange Laufzeit ziehen gemeinsame Treiber theoretisch verwandte Konstrukte näher zusammen; Zusammenhangsanalysen sind auf frühen bis mittleren Zeitpunkten psychometrisch realistischer als am Ende der 22 Jahre. (4) Die Stadtteil-Trends (Deindustrialisierung, akademische Konsolidierung) sind gesetzte Szenarien, keine emergenten Ergebnisse. (5) Die Altersverteilung ist nur grob strukturiert, ein Geschlechtsmerkmal existiert bewusst nicht. Diese Entscheidungen sind im Quellcode dokumentiert und Teil des Lehrkonzepts: Ein Modell, dessen Annahmen man kennt, ist das ehrlichere Lehrmittel.

## Literatur (im Modell referenzierte Theorien)

Adorno, T. W. et al. (1950): The Authoritarian Personality. — Akkerman, A./Mudde, C./Zaslove, A. (2014): How Populist Are the People? Political Psychology 35(5). — Altemeyer, B. (1981): Right-Wing Authoritarianism. — Campbell, A. et al. (1960): The American Voter. — Converse, P. E. (1964): The Nature of Belief Systems in Mass Publics. — Dalton, R. J. (1984): Cognitive Mobilization and Partisan Dealignment. — Dalton, R. J. (2008): Citizen Politics. — Festinger, L. (1957): A Theory of Cognitive Dissonance. — Granovetter, M. (1978): Threshold Models of Collective Behavior. — Hegselmann, R./Krause, U. (2002): Opinion Dynamics and Bounded Confidence. — Inglehart, R. (1977): The Silent Revolution. — Inglehart, R./Norris, P. (2019): Cultural Backlash. — McCombs, M./Shaw, D. (1972): The Agenda-Setting Function of Mass Media. — Moscovici, S./Zavalloni, M. (1969): The Group as a Polarizer of Attitudes. — Myrdal, G. (1957): Economic Theory and Under-Developed Regions. — Noelle-Neumann, E. (1974): The Spiral of Silence. — Norris, P. (2011): Democratic Deficit. — Putnam, R. (2000): Bowling Alone. — Roberts, B./DelVecchio, W. (2000): The Rank-Order Consistency of Personality Traits. — Runciman, W. G. (1966): Relative Deprivation and Social Justice. — Seeman, M. (1959): On the Meaning of Alienation. — Tajfel, H./Turner, J. (1979): An Integrative Theory of Intergroup Conflict. — Tichenor, P. et al. (1970): Mass Media Flow and Differential Growth in Knowledge. — Tiebout, C. (1956): A Pure Theory of Local Expenditures. — Verba, S./Schlozman, K. L./Brady, H. (1995): Voice and Equality. — Webster, D./Kruglanski, A. (1994): Individual Differences in Need for Cognitive Closure.
