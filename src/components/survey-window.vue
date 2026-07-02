<template lang="pug">
.survey-window(:class="{ 'has-timeline': timelineMode }", :style="panelStyle")
  .survey-card(:style="cardStyle")
    //- Briefkopf — doubles as the drag handle (matches panelConfig.headerSelector)
    .survey-header
      img.briefkopf-logo(src="/blobtopia-logo.png", alt="")
      .header-text
        .survey-title Befragungsinstitut Blobtopia
        .survey-subtitle Rathausplatz 1 · 00001 Blobtopia · Abt. Empirische Blobforschung
      .formblatt-nr
        div Formblatt {{ formblattNr }}
        div Studien-Nr. {{ studienNr }}
      .header-actions
        span.action-btn(@click="$emit('close')", title="Schließen")
          b-icon(icon="close", size="is-small")

    .survey-steps
      span.step-tab(:class="{ active: step === 'editor' }", @click="step = 'editor'") Fragebogen
      span.step-tab(:class="{ active: step === 'sample' }", @click="step = 'sample'") Stichprobe
      span.step-tab(:class="{ active: step === 'results' }", @click="step = 'results'") Ergebnis
      span.step-tab.truth-tab(:class="{ active: step === 'truth' }", @click="step = 'truth'")
        b-icon(:icon="truthUnlocked ? 'lock-open-variant' : 'lock'", size="is-small")
        span Wahrheit

    .survey-body
      //- ═══════════ FRAGEBOGEN ═══════════
      .survey-section(v-if="step === 'editor'")
        .study-actions
          button.survey-btn.mini-btn(@click="surveyStore.exportStudy()", title="Design + Seed + Feld-Tick als Datei — Import reproduziert die Daten exakt")
            b-icon(icon="content-save", size="is-small")
            span Studie speichern
          button.survey-btn.mini-btn(@click="$refs.studyFile.click()")
            b-icon(icon="folder-open", size="is-small")
            span Studie laden
          input(type="file", ref="studyFile", accept=".json,application/json", style="display:none", @change="onStudyFile")
        p.hint Formuliere eigene Fragen und Antwortskalen selbst (wie im Codebook) — die Wortwahl wirkt sich aus.
        .item-card(v-for="(it, i) in localItems", :key="i")
          .item-head
            span.item-num {{ i + 1 }}
            input.survey-input.item-kuerzel(v-model="it.name", maxlength="40", placeholder="Kürzel – z. B. Atommüll", title="Kurzname der Frage – wird zum Variablennamen (Spaltenname) im .xlsx-Export")
            span.action-btn.del(@click="removeItem(i)", title="Entfernen")
              b-icon(icon="close", size="is-small")
          textarea.survey-input.item-text(v-model="it.text", rows="3", placeholder="Frage UND Antwortskala selbst formulieren — z. B. „Wie zufrieden sind Sie mit der Politik? Skala von 1 bis 10, wobei 1 = gar nicht und 10 = völlig.“", @input="onItemInput(it)", @blur="onItemBlur(it)")
          .item-meta(v-if="it.text && it.text.trim()")
            span.detect-chip.checking(v-if="ana(it).state === 'checking'")
              b-icon(icon="timer-sand", size="is-small")
              span Frage wird geprüft …
            span.detect-chip.ok(v-else-if="it.construct")
              b-icon(icon="check-circle", size="is-small")
              span {{ 'erkannt: ' + constructLabel(it.construct) + ' · ' + scaleLabel(it) + missingSummary(it) }}
            span.detect-chip.warn(v-else-if="ana(it).state === 'error'")
              b-icon(icon="alert", size="is-small")
              span Analyse nicht möglich
            span.detect-chip.warn(v-else-if="ana(it).state === 'unmeasurable'")
              b-icon(icon="alert", size="is-small")
              span in dieser Simulation nicht messbar
            span.detect-chip.idle(v-else)
              b-icon(icon="help-circle-outline", size="is-small")
              span noch nicht geprüft
            button.survey-btn.mini-btn.recheck(v-if="ana(it).state !== 'checking'", @click="checkItem(it)", title="Die Frage vom Institut auswerten lassen") Frage prüfen
          p.reword-hint.err(v-if="ana(it).conflicts && ana(it).conflicts.length")
            | Hinweis: Code {{ ana(it).conflicts.join(', ') }} liegt im Gültigbereich der Skala und wird als gültiger Wert behandelt — vergib fehlenden Werten Zahlen außerhalb der Skala (z. B. -9 oder 99).
          p.reword-hint.err(v-if="ana(it).state === 'error'")
            | {{ ana(it).error }} — bitte erneut prüfen (die Auswertung braucht eine Internetverbindung).
          .unmeasurable-hint(v-else-if="ana(it).state === 'unmeasurable'")
            p.reword-hint
              | Die Frage löst auf nichts auf, das die Blobs besitzen. Formuliere sie etwas konkreter —
              | z. B. zu Zufriedenheit, Vertrauen, Sorgen oder einer politischen Einstellung.
            button.survey-btn.mini-btn(v-if="ana(it).suggestion", @click="acceptSuggestion(it)") Meintest du „{{ constructLabel(ana(it).suggestion) }}“? Übernehmen
          .construct-correct(v-if="it.construct")
            a.correct-link(@click="toggleCorrecting(it)") {{ ana(it).correcting ? 'abbrechen' : 'Konstrukt stimmt nicht?' }}
            select.survey-input.mini.correct-select(v-if="ana(it).correcting", :value="it.construct", @change="setConstruct(it, $event.target.value)")
              optgroup(v-for="g in constructOptions", :key="g.group", :label="g.group")
                option(v-for="o in g.items", :key="o.key", :value="o.key") {{ o.label }}
        button.survey-btn.add-btn(@click="addItem")
          b-icon(icon="plus", size="is-small")
          span Item hinzufügen
        p.mini-hint.missing-default-hint
          | Fehlende Werte werden standardmäßig als −9 (Verweigert) und −8 (Weiß nicht) kodiert. Eigene Codes + Labels gibst du direkt in der Frage an — z. B. „… 8 = weiß nicht, 9 = keine Angabe“.
        .nonresp-block
          label.nonresp-title(title="Wer gar nicht an der Befragung teilnimmt (Unit-Nonresponse) — gilt für den ganzen Fall, nicht je Frage") Nichtteilnahme (ganzer Fall)
          .nonresp-row
            input.survey-input.mini.nonresp-code(type="number", v-model.number="design.nonresponse.code", title="Zahlencode im Datensatz/Export")
            input.survey-input.nonresp-text(v-model="design.nonresponse.label", maxlength="40", placeholder="Nicht teilgenommen")
          p.mini-hint Wer gar nicht teilnimmt, bekommt im Export diesen einen Code (Default −13 „Nicht teilgenommen“); der genaue Grund (verweigert / nicht erreicht …) steht zusätzlich in der Spalte „disposition“.
        .panel-block.demo-block
          .block-head
            span.block-title Hintergrundmerkmale erheben
            span.block-meta {{ design.demographics.length }} gewählt
          .block-body
            p.mini-hint Wie im echten Fragebogen landet Soziodemographie nur im Datensatz, wenn du sie ausdrücklich erhebst.
            .chips
              span.chip(v-for="d in demographicsCatalog", :key="d.key", :class="{ active: isDemoOn(d.key) }", @click="toggleDemo(d.key)") {{ d.label }}

      //- ═══════════ STICHPROBE ═══════════
      .survey-section(v-else-if="step === 'sample'")
        //- ① Grundgesamtheit eingrenzen
        .panel-block
          .block-head(@click="filtersOpen = !filtersOpen")
            span.block-title ① Grundgesamtheit eingrenzen
            span.block-meta {{ frameBlobs.length }} Blobs
            b-icon(:icon="filtersOpen ? 'chevron-up' : 'chevron-down'", size="is-small")
          .block-body(v-if="filtersOpen")
            .filter-group
              label Distrikte
              .chips
                span.chip(v-for="d in districts", :key="d.id", :class="{ active: isFilterOn('districts', d.id) }", @click="toggleFilter('districts', d.id)") {{ d.name }}
            .filter-group
              label Bildung
              .chips
                span.chip(v-for="e in education", :key="e.level", :class="{ active: isFilterOn('education', e.level) }", @click="toggleFilter('education', e.level)") {{ e.label }}
            .filter-group
              label Partei
              .chips
                span.chip(v-for="p in parties", :key="p", :class="{ active: isFilterOn('parties', p) }", @click="toggleFilter('parties', p)") {{ p }}
            .filter-group.range
              label Alter
              input.survey-input.mini(type="number", v-model.number="design.filter.ageMin", placeholder="min", @change="onFilterChange")
              span.dash –
              input.survey-input.mini(type="number", v-model.number="design.filter.ageMax", placeholder="max", @change="onFilterChange")
            .filter-group.range
              label Einkommen
              input.survey-input.mini(type="number", v-model.number="design.filter.incomeMin", placeholder="min", @change="onFilterChange")
              span.dash –
              input.survey-input.mini(type="number", v-model.number="design.filter.incomeMax", placeholder="max", @change="onFilterChange")
            span.reset-link(@click="resetFilter") Filter zurücksetzen

        //- ② Ziehungsverfahren
        .panel-block
          .block-head
            span.block-title ② Ziehungsverfahren
          .block-body
            label.radio-row(v-for="t in techniques", :key="t.key", :class="{ active: design.technique === t.key }")
              input(type="radio", :value="t.key", v-model="design.technique")
              span {{ t.label }}
            .params(v-if="design.technique === 'srs'")
              label Stichprobengröße (n)
              input.survey-input(type="number", min="1", v-model.number="design.n")
            .params(v-else-if="design.technique === 'stratified'")
              label Schichtungsvariable
              select.survey-input(v-model="design.strataVar")
                option(value="district") Distrikt
                option(value="education_level") Bildung
                option(value="age_group") Altersgruppe
              label Allokation
              select.survey-input(v-model="design.allocation")
                option(value="proportional") proportional
                option(value="equal") gleich
              label Stichprobengröße (n)
              input.survey-input(type="number", min="1", v-model.number="design.n")
            .params(v-else-if="design.technique === 'cluster'")
              label Klumpen-Variable
              select.survey-input(v-model="design.clusterVar")
                option(value="district") Distrikt
                option(value="education_level") Bildung
              label Anzahl Klumpen
              input.survey-input(type="number", min="1", :max="clusterPreview ? clusterPreview.totalClusters : null", v-model.number="design.numClusters")
              label Pro Klumpen ziehen (leer = alle, zweistufig)
              input.survey-input(type="number", min="1", v-model.number="design.withinClusterN", placeholder="alle")
              p.mini-hint.cluster-size(v-if="clusterPreview")
                template(v-if="clusterPreview.within")
                  | ≈ <b>{{ clusterPreview.estimate }}</b> Befragte = {{ clusterPreview.k }} Klumpen × je {{ clusterPreview.within }}. Die Größe kommt aus Klumpenzahl × Ziehung pro Klumpen — nicht aus einem festen n.
                template(v-else)
                  | ≈ <b>{{ clusterPreview.estimate }}</b> Befragte ({{ clusterPreview.minN }}–{{ clusterPreview.maxN }} je nach gezogenen Klumpen) = alle Mitglieder von {{ clusterPreview.k }} der {{ clusterPreview.totalClusters }} Klumpen. Die Klumpenzahl bestimmt die Größe — nicht ein n.
              p.mini-hint.cluster-warn(v-if="clusterPreview && clusterPreview.k < 2")
                | ⚠ Mit nur einem Klumpen lässt sich die Streuung zwischen den Klumpen nicht schätzen, und bei unterschiedlich großen Klumpen ist die Schätzung verzerrt. Wähle mindestens 2 Klumpen.
            .params(v-else-if="design.technique === 'systematic'")
              p.mini-hint Jede k-te Einheit aus dem geordneten Rahmen, zufälliger Start.
              label Stichprobengröße (n)
              input.survey-input(type="number", min="1", v-model.number="design.n")
            .params(v-else-if="design.technique === 'quota'")
              label Schichtungsvariable
              select.survey-input(v-model="design.strataVar", @change="fillQuotasProportional")
                option(value="district") Distrikt
                option(value="education_level") Bildung
              label Soll-Zellen (editierbar)
              .quota-row(v-for="c in quotaCells", :key="c.key")
                span.quota-label {{ c.label }} ({{ c.count }})
                input.survey-input.mini(type="number", min="0", :value="quotaValue(c.key)", @input="setQuota(c.key, $event)")
              span.reset-link(@click="fillQuotasProportional") proportional zu den Randverteilungen befüllen
              label Gesamtgröße (n)
              input.survey-input(type="number", min="1", v-model.number="design.n", @change="fillQuotasProportional")
            .params(v-else-if="design.technique === 'manual'")
              p.mini-hint Wähle die Blobs unten von Hand aus — beobachte, wie deine Auswahl von der Grundgesamtheit abweicht.
            .params(v-if="design.technique !== 'manual'")
              label Seed (Reproduzierbarkeit)
              input.survey-input(type="number", v-model.number="design.seed")
            .planner(v-if="['srs', 'stratified', 'systematic'].includes(design.technique)")
              label Wie viele Befragte brauchst du?
              p.mini-hint Je genauer dein Ergebnis sein soll, desto mehr Leute musst du befragen. Gib an, wie nah dein geschätzter Mittelwert am wahren Wert liegen soll (±):
              .planner-row
                span ±
                input.survey-input.mini(type="number", step="0.1", min="0.1", v-model.number="planE")
                span.planner-result → mindestens {{ plannedN != null ? plannedN : '—' }} Befragte
              .planner-explain
                span.explain-toggle(@click="planExplain = !planExplain") {{ planExplain ? '▾' : '▸' }} Was heißt das?
                .explain-body(v-if="planExplain")
                  p
                    b ±{{ komma(planE) }} — Genauigkeit:
                    |  So weit darf dein geschätzter Mittelwert höchstens vom wahren Wert abweichen. Kleineres ± = genauer = mehr Befragte nötig.
                  p
                    b 95 % — Sicherheit:
                    |  In 95 von 100 solcher Stichproben liegt der wahre Wert in deinem ±-Bereich.
                  p
                    b σ ≈ {{ komma(planSigma) }} — Streuung der Antworten:
                    |  Wie unterschiedlich die Leute antworten. Vorab unbekannt, deshalb grob als Skalenbreite ÷ 4 geschätzt (Faustregel).
                  p
                    b N = {{ frameBlobs.length }} — Grundgesamtheit:
                    |  So viele Blobs gibt es in deiner Auswahl. Ist N klein, brauchst du etwas weniger Befragte (endliche-Population-Korrektur).
                  p.explain-note Gemeint ist die Genauigkeit deiner Mittelwert­schätzung — also wie schmal das Konfidenzintervall um den Mittelwert ist. Das ist nicht die Teststärke (Power), mit der man einen Effekt wie einen Gruppenunterschied aufdeckt.
            button.survey-btn(v-if="design.technique !== 'manual'", @click="onPreview")
              b-icon(icon="account-search", size="is-small")
              span Stichprobe ziehen

        //- ③ Feldarbeit (Modus + Kontaktversuche → Unit-Nonresponse)
        .panel-block
          .block-head
            span.block-title ③ Feldarbeit
            span.block-meta {{ fieldModeLabel }}
          .block-body
            label.radio-row(v-for="m in fieldModes", :key="m.key", :class="{ active: design.fieldMode === m.key }")
              input(type="radio", :value="m.key", v-model="design.fieldMode")
              span {{ m.label }}
            .params
              label Kontaktversuche (1–4)
              input.survey-input.mini(type="number", min="1", max="4", v-model.number="design.contactAttempts")
              p.mini-hint Nicht alle machen mit: Erreichbarkeit und Kooperation sind selektiv. Mehr Versuche heben die Ausschöpfung — neutralisieren die Selektivität aber nicht.
            p.mini-hint.expected(v-if="expectedResponse != null")
              | Voraussichtliche Ausschöpfung: <b>~{{ Math.round(expectedResponse * 100) }} %</b>. Kurze, klare Fragebögen heben sie; sensible oder überladene Fragen senken sie.

        //- ④ Längsschnitt (Trend / Panel über die Timeline)
        .panel-block
          .block-head
            span.block-title ④ Längsschnitt
            span.block-meta {{ longitudinalLabel }}
          .block-body
            label.radio-row(v-for="t in longTypes", :key="t.key", :class="{ active: design.longitudinal.type === t.key }")
              input(type="radio", :value="t.key", v-model="design.longitudinal.type")
              span {{ t.label }}
            template(v-if="design.longitudinal.type !== 'cross'")
              p.mini-hint Welle 1 = aktueller Zeitpunkt (Jahr {{ currentYear }}). Weitere Wellen:
              .wave-row(v-for="(y, i) in design.longitudinal.waveYears", :key="i")
                span.wave-label Welle {{ i + 2 }}
                select.survey-input.mini(v-model.number="design.longitudinal.waveYears[i]")
                  option(v-for="y2 in availableYears", :key="y2", :value="y2") Jahr {{ y2 }}
                span.action-btn.del(@click="design.longitudinal.waveYears.splice(i, 1)")
                  b-icon(icon="close", size="is-small")
              button.survey-btn.mini-btn(v-if="design.longitudinal.waveYears.length < 3", @click="addWave")
                b-icon(icon="plus", size="is-small")
                span Welle hinzufügen
              p.mini-hint(v-if="design.longitudinal.type === 'panel'") Panel: Die Netto-Stichprobe aus Welle 1 wird wiederbefragt — mit selektivem Ausfall (Attrition) und Abgängen aus der Population.
              p.mini-hint(v-else) Trend: Jede Welle ist eine frische Ziehung mit demselben Design.

        //- ⑤ Auswahl / Realisierung
        .panel-block
          .block-head
            span.block-title ⑤ {{ design.technique === 'manual' ? 'Blobs selbst auswählen' : 'Realisierte Stichprobe' }}
            span.block-meta n = {{ sampleN }} / {{ frameBlobs.length }}
          .block-body
            .dist(v-if="dist && Object.keys(dist).length")
              .dist-row(v-for="(c, k) in dist", :key="k")
                span.dist-key {{ distLabel(k) }}
                span.dist-bar
                  span.dist-fill(:style="{ width: distPct(c) + '%' }")
                span.dist-val {{ c }}
            input.survey-input.search(v-model="search", :placeholder="design.technique === 'manual' ? 'Kandidaten durchsuchen …' : 'In der Stichprobe suchen …'")
            .blob-list
              .blob-row(v-for="b in shownBlobs", :key="b.id", :class="{ picked: design.technique === 'manual' && isPicked(b) }")
                template(v-if="design.technique === 'manual'")
                  input(type="checkbox", :checked="isPicked(b)", @change="togglePick(b)")
                span.b-name {{ b.name || b.id.substring(0, 6) }}
                span.b-meta {{ districtName(b.district) }} · {{ b.age }}J · {{ eduLabel(b.education_level) }}{{ b.party_name ? ' · ' + b.party_name : '' }}
                span.action-btn.del(v-if="design.technique !== 'manual'", @click="excludeUnit(b.id)", title="Aus Stichprobe entfernen")
                  b-icon(icon="close", size="is-small")
              .list-empty(v-if="!shownBlobs.length") {{ design.technique === 'manual' ? 'Keine Kandidaten — Filter prüfen.' : 'Noch nicht gezogen — „Stichprobe ziehen" oben.' }}
            .list-overflow(v-if="listOverflow > 0") … und {{ listOverflow }} weitere (Suche eingrenzen)

      //- ═══════════ ERGEBNIS (inkl. Erhebung) ═══════════
      .survey-section(v-else-if="step === 'results'")
        p.hint Die Stichprobe wird synthetisch befragt — kostenlos, reproduzierbar, inkl. modellierter Fragebogeneffekte.
        .info-item
          span.info-label Items im Fragebogen
          span.info-value {{ localItems.length }}
        .info-item
          span.info-label Stichprobe
          span.info-value n = {{ sampleN }}
        button.survey-btn.primary(:disabled="!localItems.length || isRunning", @click="onRun")
          b-icon(icon="flash", size="is-small")
          span Befragung durchführen
        .progress-line(v-if="progress && progress.total")
          span Befragt: {{ progress.done }} / {{ progress.total }}
        .error-banner(v-if="error") {{ error }}
        template(v-if="result")
          .results-divider
          template(v-if="result.meta.waves && result.meta.waves.length")
            .info-item(v-for="(w, wi) in result.meta.waves", :key="wi")
              span.info-label Welle {{ wi + 1 }} (Jahr {{ yearOf(w.tick) }})
              span.info-value n = {{ w.net }} / {{ w.gross }} · {{ Math.round(w.responseRate * 100) }} %
          template(v-else-if="result.meta.gross != null")
            .info-item
              span.info-label Brutto-Stichprobe
              span.info-value {{ result.meta.gross }}
            .info-item
              span.info-label Netto (Teilnehmende)
              span.info-value {{ result.meta.net }}
            .info-item
              span.info-label Ausschöpfungsquote
              span.info-value {{ Math.round(result.meta.responseRate * 100) }} %
            .dispo-row
              span.dispo(v-for="(c, k) in result.meta.dispositions", :key="k") {{ k }}: {{ c }}
          .info-item(v-else)
            span.info-label Datensätze
            span.info-value {{ result.rows.length }}
          .info-item
            span.info-label Items
            span.info-value {{ result.meta.items }}
          //- Deskriptive Schätzer + Gewichtung
          table.data-table.summary-table(v-if="itemSummary.length")
            thead
              tr
                th Item
                th n
                th Mittel
                th gewichtet
                th(v-if="calib.enabled") kalibriert
            tbody
              tr(v-for="s in itemSummary", :key="s.id")
                td {{ s.id }}
                td {{ s.n }}
                td {{ fmt(s.mean) }}
                td {{ fmt(s.meanWeighted) }}
                td(v-if="calib.enabled") {{ fmt(s.meanCalibrated) }}
          .calib-row
            label.radio-row(:class="{ active: calib.enabled }")
              input(type="checkbox", :checked="calib.enabled", @change="surveyStore.SET_CALIB({ enabled: $event.target.checked })")
              span Post-Stratifizierung (an wahre Randverteilungen)
            .chips(v-if="calib.enabled")
              span.chip(:class="{ active: calibHasVar('district') }", @click="toggleCalibVar('district')") Distrikt
              span.chip(:class="{ active: calibHasVar('education_level') }", @click="toggleCalibVar('education_level')") Bildung
            p.mini-hint(v-if="calib.enabled && calibration && calibration.uncovered > 0") Achtung: {{ calibration.uncovered }} Rahmen-Einheiten liegen in Zellen ohne Antwortende — Gewichtung kann leere Zellen nicht füllen.
          .data-table-wrap
            table.data-table
              thead
                tr
                  th #
                  th(v-for="c in tableColumns", :key="c.key") {{ c.label }}
              tbody
                tr(v-for="(r, ri) in result.rows", :key="r.blobId", :class="{ 'row-nonresp': r.disposition && r.disposition !== 'teilgenommen' }")
                  td.idx {{ ri + 1 }}
                  td(v-for="c in tableColumns", :key="c.key") {{ c.cell(r) }}
          p.mini-hint Fehlende Werte tragen ihr Label (Standard: −9 Verweigert · −8 Weiß nicht) · — = nicht beantwortbar · Nichtteilnehmende (gedämpft) zeigen ihren Dispositionsgrund (im Export: {{ design.nonresponse.code }} {{ design.nonresponse.label }})
          .error-banner(v-if="unsupportedItems.length") Für {{ unsupportedItems.join(', ') }} kamen keine Antworten — die Frage ließ sich nicht eindeutig zuordnen. Formuliere sie im Fragebogen etwas konkreter (z. B. zu Zufriedenheit, Vertrauen oder einer Einstellung).
          button.survey-btn.primary(@click="surveyStore.exportXlsx()")
            b-icon(icon="download", size="is-small")
            span Für R exportieren (.xlsx)
          p.mini-hint Die .xlsx lässt sich in R mit mariposa::read_xlsx() samt Variablen-/Wertelabels und Missing-Codes zurücklesen. Vergebene Kürzel werden zu den Spaltennamen.

      //- ═══════════ WAHRHEIT (Gott-Perspektive, hinter dem Dozenten-Schloss) ═══════════
      .survey-section(v-else-if="step === 'truth'")
        template(v-if="!truthUnlocked")
          .truth-lock
            b-icon(icon="lock", size="is-small")
            p.hint Die wahren Populationswerte sind für Studierende gesperrt — sie würden das Schätzen unter Unsicherheit vorwegnehmen.
            input.survey-input(type="password", v-model="passwordAttempt", :placeholder="passwordError ? 'Falsch' : 'Passwort'", :class="{ 'has-error': passwordError }", @keydown.enter="tryUnlock")
            button.survey-btn(@click="tryUnlock") Entsperren
        template(v-else-if="!result")
          .truth-lock
            p.hint Noch keine Befragung durchgeführt — erst im Tab „Ergebnis“ erheben, dann lässt sich der Schätzer hier gegen die Wahrheit zerlegen.
            span.reset-link(@click="relock") Wieder sperren
        template(v-else-if="!truthRevealed")
          .truth-lock
            //- Versiegelter Umschlag: die Wahrheit liegt physisch im Raum,
            //- das Aufdecken ist ein Siegelbruch
            .umschlag(role="img", aria-label="Versiegelter Umschlag mit den wahren Werten")
              .klappe
              .siegel B
              .aufschrift
                span.geheim-stempel Nur für Dozent:innen
                .zeile2 WAHRE WERTE · STUDIE {{ studienNr }}
            p.hint Die Simulation kennt die wahren Werte aller Blobs. Beim Siegelbruch wird jeder Schätzer exakt in die Fehlerquellen zerlegt: Coverage, Ziehung, Nonresponse, Messung.
            button.survey-btn.primary.siegel-btn(@click="surveyStore.revealTruth()")
              b-icon(icon="eye", size="is-small")
              span Wahre Werte aufdecken
            span.reset-link(@click="relock") Wieder sperren
        template(v-else)
          .wave-chips(v-if="result.meta.waves && result.meta.waves.length > 1")
            span.chip(v-for="(w, wi) in result.meta.waves", :key="wi", :class="{ active: truthWave === wi }", @click="surveyStore.SET_TRUTH_WAVE(wi)") Welle {{ wi + 1 }}
          .truth-item(v-for="d in decomposition", :key="d.id")
            .truth-head
              span.item-num {{ d.id }}
              span.truth-construct {{ d.constructLabel || 'ohne Konstrukt' }}
            p.truth-text {{ d.text }}
            p.mini-hint(v-if="!d.available") {{ d.reason }}
            template(v-else)
              .tse-chain
                .tse-row(v-for="row in chainRows(d)", :key="row.label")
                  span.tse-label {{ row.label }}
                  span.tse-axis
                    span.tse-dot(:class="row.cls", :style="{ left: axisPct(row.value, d) + '%' }")
                  span.tse-val {{ fmt(row.value) }}
              .tse-deltas
                .tse-delta(v-for="c in componentRows(d)", :key="c.label")
                  span.tse-delta-label {{ c.label }}
                  span.tse-delta-val(:class="deltaClass(c.value)") {{ signed(c.value) }}
                .tse-delta.total
                  span.tse-delta-label Gesamt (Schätzer − Wahrheit)
                  span.tse-delta-val(:class="deltaClass(d.total)") {{ signed(d.total) }}
              .tse-parts(v-if="d.measurementParts")
                .tse-delta.part(v-for="p in measurementPartRows(d)", :key="p.label")
                  span.tse-delta-label {{ p.label }}
                  span.tse-delta-val(:class="deltaClass(p.value)") {{ signed(p.value) }}
              p.mini-hint(v-if="d.lambda < 1") Item-Validität λ = {{ d.lambda }} — die Frage lädt auch auf „{{ d.crossLabel }}“ (Kreuzladung als Teil des Messfehlers).
              .info-item(v-if="calib.enabled && calibratedFor(d) != null")
                span.info-label Kalibrierter Schätzer (Post-Strat.)
                span.info-value {{ fmt(calibratedFor(d)) }} · Restfehler {{ signed(calibratedFor(d) - d.popMean) }}
              .info-item(v-if="d.ci95")
                span.info-label 95-%-KI des Schätzers
                span.info-value {{ fmt(d.ci95[0]) }} bis {{ fmt(d.ci95[1]) }} · {{ ciCoversTruth(d) ? 'enthält die Wahrheit' : 'verfehlt die Wahrheit' }}
              p.mini-hint(v-else-if="d.seNote") {{ d.seNote }}
              .sim-hist(v-if="simResult && simResult.perItem[d.id] && simResult.perItem[d.id].estimates.length")
                .hist-bars
                  span.hist-bar(v-for="(h, i) in histBars(d)", :key="i", :style="{ height: h + '%' }")
                  span.hist-truth(:style="{ left: histTruthPct(d) + '%' }", title="wahrer Populationswert")
                .hist-meta
                  span B = {{ simResult.replications }}
                  span Mittel {{ fmt(simResult.perItem[d.id].mean) }}
                  span simulierter SE {{ fmt(simResult.perItem[d.id].sd) }}
          //- Reliabilität (≥2 Items pro Konstrukt)
          .truth-item(v-if="reliability", v-for="rel in reliability", :key="'rel-' + rel.construct")
            .truth-head
              span.item-num α
              span.truth-construct Skala „{{ rel.label }}“ ({{ rel.itemIds.join(', ') }})
            .info-item
              span.info-label Cronbachs α ({{ rel.n }} vollständige Fälle)
              span.info-value {{ rel.alpha != null ? rel.alpha.toFixed(2) : 'zu wenige Fälle' }}
            .info-item(v-if="rel.avgR != null")
              span.info-label Mittlere Inter-Item-Korrelation
              span.info-value {{ rel.avgR.toFixed(2) }}
            .info-item(v-if="rel.trueReliability != null")
              span.info-label Wahre Reliabilität (Var(τ)/Var(X))
              span.info-value {{ rel.trueReliability.toFixed(2) }}
            p.mini-hint Achtung: Akquieszenz erzeugt korrelierte Fehler — α kann die Reliabilität überschätzen.

          //- Veränderung über die Wellen (Trend/Panel): geschätzt vs. wahr
          .truth-item.change-card(v-if="waveChanges && result.meta.waves.length > 1", v-for="wc in waveChanges", :key="'wc-' + wc.id")
            .truth-head
              span.item-num {{ wc.id }}
              span.truth-construct Veränderung über {{ wc.perWave.length }} Wellen
            table.data-table.summary-table
              thead
                tr
                  th Welle
                  th Schätzer
                  th Δ geschätzt
                  th Δ wahr (Pop.)
                  th(v-if="result.meta.type === 'panel'") Attrition-Bias
              tbody
                tr(v-for="(pw, wi) in wc.perWave", :key="wi")
                  td W{{ pw.wave }} (J{{ yearOf(pw.tick) }})
                  td {{ fmt(pw.estimate) }}
                  td {{ wi === 0 ? '—' : signed(pw.estimate - wc.perWave[0].estimate) }}
                  td {{ wi === 0 ? '—' : signed(pw.popMean - wc.perWave[0].popMean) }}
                  td(v-if="result.meta.type === 'panel'") {{ wi === 0 || pw.respTrueMean == null || pw.baseTrueMean == null ? '—' : signed(pw.respTrueMean - pw.baseTrueMean) }}
            p.mini-hint(v-if="result.meta.type === 'panel'") Attrition-Bias = wahre Werte der Verbleiber minus der gesamten Panel-Basis (jeweils am Wellen-Zustand).

          .results-divider
          .sim-controls
            label Stichprobenverteilung: komplette Befragung B-mal wiederholen (synthetisch, kostenlos)
            .sim-row
              input.survey-input.mini(type="number", min="50", max="2000", step="50", v-model.number="simB")
              button.survey-btn(:disabled="isSimulating", @click="surveyStore.runSimulation(simB)")
                b-icon(icon="chart-bar", size="is-small")
                span {{ isSimulating ? 'Simuliere … ' + simProgress.done + '/' + simProgress.total : 'Simulieren' }}
            p.mini-hint Zufallsdesigns streuen um die Wahrheit — Auswahl- und Fragebogen-Bias überleben auch 1000 Wiederholungen.
          button.survey-btn(@click="surveyStore.exportInstructorXlsx()")
            b-icon(icon="download", size="is-small")
            span Dozenten-Datei (.xlsx, mit wahren Werten)
          button.survey-btn(@click="surveyStore.exportInstructorCsv()")
            b-icon(icon="download", size="is-small")
            span … dasselbe als CSV
          .relock-row
            span.reset-link(@click="relock") Wieder sperren
</template>

<script>
import { mapState, mapStores } from 'pinia'
import { useSurveyStore } from '@/stores/survey'
import { useSimulationStore } from '@/stores/simulation'
import draggablePanel from '@/mixins/draggable-panel'
import { analyzeItem } from '@/lib/survey-llm-analyze'
import { CONSTRUCTS, CONSTRUCTS_BY_KEY } from '@/lib/survey-constructs'
import { planSampleSize, allocateLargestRemainder } from '@/lib/survey-sampling'
import { FIELD_MODES, expectedResponseRate, questionnaireBurden } from '@/lib/survey-fieldwork'
import { calibratedEstimate } from '@/lib/survey-weighting'
import { datasetColumns } from '@/lib/survey-dataset'
import { DEMOGRAPHICS, DEMOGRAPHICS_BY_KEY } from '@/lib/survey-demographics'
import { DISTRICT_NAMES, PARTY_NAMES, EDUCATION_LABELS } from '@/lib/blob-adapter'

function clone(x) { return JSON.parse(JSON.stringify(x)) }

const TECHNIQUES = [
  { key: 'srs', label: 'Einfache Zufallsstichprobe' }
  , { key: 'stratified', label: 'Geschichtete Stichprobe' }
  , { key: 'cluster', label: 'Klumpenstichprobe' }
  , { key: 'systematic', label: 'Systematische Auswahl' }
  , { key: 'quota', label: 'Quotenstichprobe' }
  , { key: 'manual', label: 'Manuell selbst auswählen' }
]

export default {
  name: 'SurveyWindow'
  , mixins: [draggablePanel]
  , props: {
    timelineMode: { type: Boolean, default: false }
  }
  , data() {
    return {
      filtersOpen: true
      , search: ''
      , techniques: TECHNIQUES
      , passwordAttempt: ''
      , passwordError: false
      , simB: 500
      , planE: 0.5
      , planExplain: false
      , localItems: []
      // LLM-Analyse pro Item (transient, NICHT in der Studien-Datei):
      //   { [itemId]: { state: 'idle'|'checking'|'done'|'unmeasurable'|'error',
      //                 error, suggestion, rationale, correcting } }
      , analysis: {}
      , design: {
        technique: 'srs'
        , n: 40
        , seed: 12345
        , strataVar: 'district'
        , allocation: 'proportional'
        , clusterVar: 'district'
        , numClusters: 2
        , excludeMinors: true
        , filter: { districts: [], education: [], parties: [], ageMin: null, ageMax: null, incomeMin: null, incomeMax: null }
        , manualInclude: []
        , manualExclude: []
        , demographics: ['name']
        , quotas: {}
        , withinClusterN: null
        , fieldMode: 'personal'
        , contactAttempts: 2
        // Unit-Nonresponse: Code + Label auf Studien-Ebene (Default -13 „Nicht
        // teilgenommen"), anpassbar wie die Item-Missings.
        , nonresponse: { code: -13, label: 'Nicht teilgenommen' }
        , longitudinal: { type: 'cross', waveYears: [] }
      }
    }
  }
  , computed: {
    // Arbeitsschritt + Dozenten-Schloss leben im Store (die Registratur-
    // Mappe "Dozentenzimmer" springt darüber direkt zum Wahrheit-Blatt)
    step: {
      get() { return this.surveyStore.step }
      , set(v) { this.surveyStore.SET_STEP(v) }
    }
    , truthUnlocked() {
      return this.surveyStore.instructorUnlocked
    }
    , panelConfig() {
      return {
        // _v2: einmaliger Reset, damit die neue zentrierte Standardlage greift
        // (eine alt gespeicherte, links-bündige Position würde sie sonst überschreiben)
        storageKey: 'blobtopia_panel_survey_v2'
        , minWidth: 380
        , maxWidth: 820
        , minHeight: 340
        , maxHeight: Math.round(window.innerHeight * 0.92)
        , headerSelector: '.survey-header'
        , resizable: true
        // Das Blatt liegt auf der Schreibunterlage RECHTS der Registratur und
        // darf nie darunter rutschen (sie liegt z-9 darüber und verdeckte sonst
        // Briefkopf/Text). Breit: hinter der aktiven Mappe (~227px); schmal
        // (≤900px, Registratur = 64px-Griffleiste): direkt rechts daneben.
        , minLeft: 230
        , minLeftNarrow: 84
        , narrowBelow: 900
      }
    }
    , cardStyle() {
      if (this.panelW !== null || this.panelH !== null) {
        return { width: '100%', height: '100%', maxHeight: 'none' }
      }
      return {}
    }
    , districts() {
      return DISTRICT_NAMES.map((name, id) => ({ id, name }))
    }
    , education() {
      return EDUCATION_LABELS.map((label, level) => ({ level, label }))
    }
    , parties() {
      return PARTY_NAMES
    }
    , frameBlobs() {
      return this.surveyStore.frameBlobs
    }
    , sampleN() {
      if (this.design.technique === 'manual') return this.design.manualInclude.length
      return this.lastSample ? this.lastSample.realizedN : 0
    }
    , listBlobs() {
      if (this.design.technique === 'manual') return this.frameBlobs
      return this.lastSample ? this.lastSample.units.map(u => u.blob) : []
    }
    , shownBlobs() {
      const q = this.search.trim().toLowerCase()
      let list = this.listBlobs
      if (q) list = list.filter(b => (b.name || b.id).toLowerCase().indexOf(q) >= 0)
      return list.slice(0, 120)
    }
    , listOverflow() {
      const q = this.search.trim().toLowerCase()
      const total = q ? this.listBlobs.filter(b => (b.name || b.id).toLowerCase().indexOf(q) >= 0).length : this.listBlobs.length
      return Math.max(0, total - 120)
    }
    , distMax() {
      if (!this.dist) return 1
      return Math.max(1, ...Object.keys(this.dist).map(k => this.dist[k]))
    }
    , demographicsCatalog() {
      return DEMOGRAPHICS
    }
    // Konstrukte nach Gruppe — nur für die seltene manuelle Korrektur der
    // LLM-Zuordnung (versteckt, bis „Konstrukt stimmt nicht?“ angeklickt wird).
    , constructOptions() {
      const groups = []
      const byGroup = {}
      for (const c of CONSTRUCTS) {
        if (!byGroup[c.group]) { byGroup[c.group] = { group: c.group, items: [] }; groups.push(byGroup[c.group]) }
        byGroup[c.group].items.push({ key: c.key, label: c.label })
      }
      return groups
    }
    , quotaCells() {
      const v = this.design.strataVar || 'district'
      const acc = b => (v === 'district' ? b.district : b.education_level)
      const counts = {}
      for (const b of this.frameBlobs) {
        const k = String(acc(b))
        counts[k] = (counts[k] || 0) + 1
      }
      return Object.keys(counts).sort().map(k => ({ key: k, label: this.distLabel(k), count: counts[k] }))
    }
    , planSigma() {
      let range = 0
      for (const it of this.localItems) {
        const s = it.scale || {}
        if (s.min != null && s.max != null) range = Math.max(range, s.max - s.min)
      }
      if (!range) range = 9 // Default-1–10-Skala
      return Math.round((range / 4) * 100) / 100
    }
    , plannedN() {
      return planSampleSize({ e: this.planE, sigma: this.planSigma, N: this.frameBlobs.length })
    }
    // Items, auf die im Ergebnis ausschließlich 'unsupported' kam (Daten-Loch).
    , unsupportedItems() {
      if (!this.result || !this.result.rows.length) return []
      return this.localItems
        .filter(it => this.result.rows.every(r => {
          const a = r.answers && r.answers[it.id]
          return !a || a.status === 'unsupported'
        }))
        .map(it => it.id)
    }
    // Columns of the visible data matrix: collected demographics, then items.
    , tableColumns() {
      if (!this.result || !this.result.rows.length) return []
      const cols = datasetColumns(this.result.rows).map(k => ({
        key: k
        , label: DEMOGRAPHICS_BY_KEY[k] ? DEMOGRAPHICS_BY_KEY[k].label : k
        , cell: r => (r[k] == null ? '' : r[k])
      }))
      for (const it of this.localItems) {
        const id = it.id
        // Spaltenkopf = Kürzel (wie im .xlsx-Export), Fallback auf die Item-ID.
        const label = (it.name && String(it.name).trim()) || id
        cols.push({ key: id, label: label, cell: r => this.fmtAnswer(r.answers && r.answers[id], it, r.disposition) })
      }
      return cols
    }
    , fieldModes() {
      return Object.values(FIELD_MODES)
    }
    , fieldModeLabel() {
      const m = FIELD_MODES[this.design.fieldMode]
      return m ? m.label : ''
    }
    // Voraussichtliche Ausschöpfung über den aktuellen Rahmen — reagiert live auf
    // Modus, Kontaktversuche UND den Fragebogen (Last). Macht sichtbar, dass die
    // Quote ein Design-Feedback ist: saubere/kurze Fragebögen heben sie, sensible
    // oder überladene senken sie. Die realisierte Quote zeigt der Ergebnis-Tab.
    , expectedResponse() {
      return expectedResponseRate(this.frameBlobs, {
        mode: this.design.fieldMode
        , attempts: this.design.contactAttempts
        , burden: questionnaireBurden(this.localItems)
      })
    }
    // Live-Größenvorschau der Klumpenstichprobe: bei Klumpen bestimmt
    // Klumpenzahl × Klumpengröße (bzw. × Ziehung pro Klumpen) die Stichprobe —
    // NICHT ein festes n. Macht das vor dem Ziehen sichtbar und nennt die
    // ehrliche Spannweite (kleinste vs. größte Klumpen).
    , clusterPreview() {
      if (this.design.technique !== 'cluster') return null
      const v = this.design.clusterVar || 'district'
      const acc = b => (v === 'education_level' ? b.education_level : b.district)
      const sizes = {}
      for (const b of this.frameBlobs) { const k = String(acc(b)); sizes[k] = (sizes[k] || 0) + 1 }
      const clusterSizes = Object.values(sizes)
      const totalClusters = clusterSizes.length
      if (!totalClusters) return { totalClusters: 0, k: 0, estimate: 0, minN: 0, maxN: 0, within: null }
      const k = Math.min(Math.max(1, Number(this.design.numClusters) || 1), totalClusters)
      const within = Number(this.design.withinClusterN) || null
      const sorted = clusterSizes.slice().sort((a, b) => a - b)
      const sumOf = arr => arr.reduce((a, b) => a + b, 0)
      if (within) {
        // zweistufig: je Klumpen min(within, Klumpengröße)
        const minN = sumOf(sorted.slice(0, k).map(s => Math.min(within, s)))
        const maxN = sumOf(sorted.slice(totalClusters - k).map(s => Math.min(within, s)))
        return { totalClusters, k, within, estimate: Math.round((minN + maxN) / 2), minN, maxN }
      }
      const minN = sumOf(sorted.slice(0, k))
      const maxN = sumOf(sorted.slice(totalClusters - k))
      const mean = Math.round(k * this.frameBlobs.length / totalClusters)
      return { totalClusters, k, within: null, estimate: mean, minN, maxN }
    }
    , longTypes() {
      return [
        { key: 'cross', label: 'Querschnitt (eine Welle)' }
        , { key: 'trend', label: 'Trend (neue Ziehung pro Welle)' }
        , { key: 'panel', label: 'Panel (gleiche Blobs wiederbefragt)' }
      ]
    }
    , longitudinalLabel() {
      const t = this.longTypes.find(t => t.key === this.design.longitudinal.type)
      const extra = this.design.longitudinal.type !== 'cross' ? ' · ' + (this.design.longitudinal.waveYears.length + 1) + ' Wellen' : ''
      return (t ? t.label.split(' (')[0] : '') + extra
    }
    , ticksPerYear() {
      const m = this.simulationStore.timelineMeta
      return (m && m.ticks_per_year) || 365
    }
    , currentYear() {
      return Math.floor((this.simulationStore.tick || 0) / this.ticksPerYear)
    }
    // Briefkopf: Formblatt-Nummer je Arbeitsschritt + Aktenzeichen
    , formblattNr() {
      return { editor: 'S-3', sample: 'Z-1', results: 'D-2', truth: 'W-0' }[this.step] || 'S-3'
    }
    , studienNr() {
      const tag = ((this.simulationStore.tick || 0) % this.ticksPerYear) + 1
      return this.currentYear + '/' + String(tag).padStart(3, '0')
    }
    , availableYears() {
      const m = this.simulationStore.timelineMeta
      const maxYear = Math.floor(((m && m.max_tick) || 8030) / this.ticksPerYear)
      const out = []
      for (let y = 0; y <= maxYear; y++) out.push(y)
      return out
    }
    , ...mapStores(useSurveyStore, useSimulationStore)
    , ...mapState(useSurveyStore, ['lastSample', 'dist', 'result', 'progress', 'isRunning', 'error'
      , 'truthRevealed', 'simResult', 'isSimulating', 'simProgress', 'decomposition'
      , 'calib', 'calibration', 'itemSummary', 'waveChanges', 'truthWave', 'reliability'])
  }
  , created() {
    this.surveyStore.loadStudyDraft()
    this.initFromStore()
  }
  , watch: {
    localItems: {
      deep: true
      , handler(v) { this.surveyStore.SET_ITEMS(clone(v)) }
    }
    , design: {
      deep: true
      , handler() { this.surveyStore.SET_DESIGN(this.canonicalDesign()) }
    }
    // Quote: leere Soll-Zellen sofort proportional vorbelegen. Ohne das zeigte
    // die UI Nullen, während der Store beim Ziehen still proportional auffüllte
    // — was Studierende sehen, muss dem entsprechen, was gezogen wird.
    , 'design.technique'(t) {
      if (t === 'quota' && !Object.values(this.design.quotas || {}).some(v => v > 0)) {
        this.fillQuotasProportional()
      }
    }
  }
  , methods: {
    initFromStore() {
      const storedItems = this.surveyStore.items
      this.localItems = (storedItems && storedItems.length) ? clone(storedItems) : [this.blankItem(1)]
      const d = this.surveyStore.design
      if (d) {
        this.design.technique = d.technique || 'srs'
        this.design.n = d.n != null ? d.n : 40
        this.design.seed = d.seed != null ? d.seed : 12345
        this.design.strataVar = (d.strataVars && d.strataVars[0]) || 'district'
        this.design.allocation = d.allocation || 'proportional'
        this.design.clusterVar = d.clusterVar || 'district'
        this.design.numClusters = d.numClusters || 2
        this.design.withinClusterN = d.withinClusterN || null
        this.design.excludeMinors = !(d.eligibility && d.eligibility.excludeMinors === false)
        if (d.filter) this.design.filter = Object.assign(this.design.filter, d.filter)
        this.design.manualInclude = (d.manualInclude || []).slice()
        this.design.manualExclude = (d.manualExclude || []).slice()
        this.design.demographics = (d.demographics || ['name']).slice()
        this.design.quotas = d.quotas ? Object.assign({}, d.quotas) : {}
        this.design.fieldMode = d.fieldMode || 'personal'
        this.design.contactAttempts = d.contactAttempts != null ? d.contactAttempts : 2
        this.design.nonresponse = d.nonresponse
          ? { code: Number.isInteger(d.nonresponse.code) ? d.nonresponse.code : -13, label: d.nonresponse.label || 'Nicht teilgenommen' }
          : { code: -13, label: 'Nicht teilgenommen' }
        this.design.longitudinal = d.longitudinal
          ? { type: d.longitudinal.type || 'cross', waveYears: (d.longitudinal.waveYears || []).slice() }
          : { type: 'cross', waveYears: [] }
      }
    }
    , addWave() {
      const last = this.design.longitudinal.waveYears.length
        ? this.design.longitudinal.waveYears[this.design.longitudinal.waveYears.length - 1]
        : this.currentYear
      const maxYear = this.availableYears[this.availableYears.length - 1]
      this.design.longitudinal.waveYears.push(Math.min(maxYear, last + 4))
    }
    , yearOf(tick) {
      return Math.floor((tick || 0) / this.ticksPerYear)
    }
    , calibHasVar(v) {
      return this.calib.vars.indexOf(v) >= 0
    }
    , toggleCalibVar(v) {
      const vars = this.calib.vars.slice()
      const i = vars.indexOf(v)
      if (i >= 0) { if (vars.length > 1) vars.splice(i, 1) } else vars.push(v)
      this.surveyStore.SET_CALIB({ vars })
    }
    , calibratedFor(d) {
      if (!this.calibration || !this.result) return null
      return calibratedEstimate(this.result.rows, d.id, this.calibration.weights)
    }
    , onStudyFile(e) {
      const file = e.target.files && e.target.files[0]
      e.target.value = ''
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        if (this.surveyStore.importStudy(String(reader.result))) {
          this.initFromStore()
          this.step = 'editor'
        }
      }
      reader.readAsText(file)
    }
    // ── Quoten ──
    , quotaValue(key) {
      return this.design.quotas[key] != null ? this.design.quotas[key] : 0
    }
    , setQuota(key, e) {
      const v = parseInt(e.target.value, 10)
      this.design.quotas[key] = isNaN(v) ? 0 : Math.max(0, v)
    }
    , fillQuotasProportional() {
      // Largest-Remainder statt Zellen-Rundung: die Soll-Zellen summieren
      // GARANTIERT auf n (Math.round je Zelle driftete um ±1–2).
      const total = Number(this.design.n) || 0
      const sizes = this.quotaCells.map(c => ({ key: c.key, size: c.count }))
      this.design.quotas = allocateLargestRemainder(total, sizes, 'proportional')
    }
    , blankItem(i) {
      return {
        id: 'q' + i
        , name: '' // frei vergebenes Kürzel → Variablenname (Spalte) im .xlsx-Export
        , text: ''
        , scale: { min: 1, max: 10, minLabel: '', maxLabel: '', format: 'numeric' }
        , construct: null
        , wording: {}
      }
    }
    , addItem() {
      this.localItems.push(this.blankItem(this.localItems.length + 1))
    }
    , removeItem(i) {
      this.localItems.splice(i, 1)
    }
    // Tippen: nur den Analyse-Status zurücksetzen (kein Live-Parse mehr). Die
    // eigentliche Auswertung macht das LLM beim Verlassen des Feldes oder per
    // „Frage prüfen“-Knopf. Eine geänderte Frage löst die alte Konstrukt-Bindung,
    // sonst liefe der Feldstart-Wächter mit veralteten Daten weiter.
    , onItemInput(it) {
      const a = this.analysis[it.id]
      if (a && a.state === 'done' && a.text === (it.text || '').trim()) return
      this._setAnalysis(it.id, { state: 'idle' })
      it.construct = null
    }
    , onItemBlur(it) {
      const t = (it.text || '').trim()
      const a = this.analysis[it.id] || {}
      if (!t) { this._setAnalysis(it.id, { state: 'idle' }); return }
      if (a.state === 'checking') return
      // Schon geprüft und Text unverändert → nicht erneut bezahlen.
      if (it.construct && a.state === 'done' && a.text === t) return
      this.checkItem(it)
    }
    // Die Frage vom LLM strukturiert auswerten lassen und auf den Engine-Vertrag
    // abbilden (Skala/Konstrukt/Polung/Frageeffekte/Validität). Kein stiller
    // Ausfall: Fehler werden sichtbar gemacht.
    , async checkItem(it) {
      const t = (it.text || '').trim()
      if (!t) return
      this._setAnalysis(it.id, { state: 'checking', error: null })
      try {
        const r = await analyzeItem(t)
        it.scale = r.scale
        it.wording = r.wording
        it.validity = r.validity
        it.stem = r.stem || ''
        it.construct = r.measurable ? r.construct : null
        this._setAnalysis(it.id, {
          state: r.measurable ? 'done' : 'unmeasurable'
          , suggestion: r.suggestion, rationale: r.rationale, correcting: false, text: t
          // als fehlend gemeinte Codes, die den Gültigbereich treffen → sichtbare Warnung
          , conflicts: r.missingConflicts || []
        })
      } catch (e) {
        const msg = (e && e.message) ? e.message : 'Analyse fehlgeschlagen.'
        this._setAnalysis(it.id, { state: 'error', error: msg, text: t })
      }
    }
    // Vorschlag bei „nicht messbar“ übernehmen (z. B. „meintest du
    // Institutionenvertrauen?“).
    , acceptSuggestion(it) {
      const a = this.analysis[it.id]
      if (a && a.suggestion) this.setConstruct(it, a.suggestion)
    }
    // Konstrukt-Korrektur (selten nötig): manuelles Override der LLM-Zuordnung.
    , setConstruct(it, key) {
      it.construct = (key && CONSTRUCTS_BY_KEY[key]) ? key : null
      this._setAnalysis(it.id, {
        state: it.construct ? 'done' : 'unmeasurable'
        , correcting: false, text: (it.text || '').trim()
      })
    }
    , toggleCorrecting(it) {
      const a = this.analysis[it.id] || {}
      this._setAnalysis(it.id, { correcting: !a.correcting })
    }
    , ana(it) { return this.analysis[it.id] || {} }
    , constructLabel(key) {
      const c = key ? CONSTRUCTS_BY_KEY[key] : null
      return c ? c.label : (key || 'Konstrukt')
    }
    , _setAnalysis(id, patch) {
      const prev = this.analysis[id] || {}
      this.analysis = Object.assign({}, this.analysis, { [id]: Object.assign({}, prev, patch) })
    }
    , canonicalDesign() {
      return {
        technique: this.design.technique
        , mode: 'synthetic'
        , n: Number(this.design.n) || 0
        , seed: Number(this.design.seed) || 0
        , strataVars: [this.design.strataVar]
        , allocation: this.design.allocation
        , clusterVar: this.design.clusterVar
        , numClusters: Number(this.design.numClusters) || 1
        , eligibility: { excludeMinors: this.design.excludeMinors }
        , filter: this.cleanFilter()
        , manualInclude: this.design.manualInclude.slice()
        , manualExclude: this.design.manualExclude.slice()
        , demographics: this.design.demographics.slice()
        , quotas: Object.keys(this.design.quotas || {}).length ? Object.assign({}, this.design.quotas) : null
        , withinClusterN: Number(this.design.withinClusterN) || null
        , fieldMode: this.design.fieldMode || 'personal'
        , contactAttempts: Math.max(1, Math.min(4, Number(this.design.contactAttempts) || 2))
        , nonresponse: {
          code: Number.isInteger(this.design.nonresponse.code) ? this.design.nonresponse.code : -13
          , label: (this.design.nonresponse.label && String(this.design.nonresponse.label).trim()) || 'Nicht teilgenommen'
        }
        , longitudinal: {
          type: this.design.longitudinal.type || 'cross'
          , waveYears: this.design.longitudinal.waveYears.slice()
        }
      }
    }
    , cleanFilter() {
      const f = this.design.filter
      const num = v => (v === '' || v == null || isNaN(v)) ? null : Number(v)
      return {
        districts: f.districts.slice()
        , education: f.education.slice()
        , parties: f.parties.slice()
        , ageMin: num(f.ageMin)
        , ageMax: num(f.ageMax)
        , incomeMin: num(f.incomeMin)
        , incomeMax: num(f.incomeMax)
      }
    }
    // ── Filters ──
    , isFilterOn(key, value) {
      return this.design.filter[key].indexOf(value) >= 0
    }
    , toggleFilter(key, value) {
      const arr = this.design.filter[key]
      const i = arr.indexOf(value)
      if (i >= 0) arr.splice(i, 1)
      else arr.push(value)
      this.onFilterChange()
    }
    , onFilterChange() {
      this.surveyStore.SET_DESIGN(this.canonicalDesign())
      if (this.design.technique !== 'manual') this.surveyStore.previewSample()
    }
    , resetFilter() {
      this.design.filter = { districts: [], education: [], parties: [], ageMin: null, ageMax: null, incomeMin: null, incomeMax: null }
      this.onFilterChange()
    }
    // ── Draw / pick ──
    , onPreview() {
      this.surveyStore.SET_DESIGN(this.canonicalDesign())
      this.surveyStore.previewSample()
    }
    , isPicked(b) {
      return this.design.manualInclude.indexOf(b.id) >= 0
    }
    , togglePick(b) {
      const i = this.design.manualInclude.indexOf(b.id)
      if (i >= 0) this.design.manualInclude.splice(i, 1)
      else this.design.manualInclude.push(b.id)
      this.surveyStore.SET_DESIGN(this.canonicalDesign())
      this.surveyStore.previewSample()
    }
    , excludeUnit(id) {
      if (this.design.manualExclude.indexOf(id) < 0) this.design.manualExclude.push(id)
      this.surveyStore.SET_DESIGN(this.canonicalDesign())
      this.surveyStore.previewSample()
    }
    // ── Labels ──
    , districtName(d) {
      return DISTRICT_NAMES[d] || ('Distrikt ' + d)
    }
    , eduLabel(e) {
      return EDUCATION_LABELS[e] || '?'
    }
    , distLabel(k) {
      // dist is keyed by the first strata var (district by default)
      const v = (this.design.strataVar) || 'district'
      if (v === 'district') return this.districtName(Number(k))
      if (v === 'education_level') return this.eduLabel(Number(k))
      return k
    }
    , distPct(c) {
      return Math.round(100 * c / this.distMax)
    }
    // ── Hintergrundmerkmale ──
    , isDemoOn(key) {
      return this.design.demographics.indexOf(key) >= 0
    }
    , toggleDemo(key) {
      const i = this.design.demographics.indexOf(key)
      if (i >= 0) this.design.demographics.splice(i, 1)
      else this.design.demographics.push(key)
    }
    // Nonresponse stays visible in the matrix — that IS the teaching point.
    , fmtAnswer(a, item, disposition) {
      if (a) {
        if (a.status === 'answered') return a.value
        // Studierenden-Label zeigen, falls für diese Art angelegt — sonst der
        // kohärente Default (Verweigert / Weiß nicht), passend zum xlsx-Fallback.
        const declared = (item && item.scale && item.scale.missingLabels) || []
        if (a.status === 'refused') { const m = declared.find(x => x.kind === 'refused'); return m ? m.label : 'Verweigert' }
        if (a.status === 'dontknow') { const m = declared.find(x => x.kind === 'dontknow'); return m ? m.label : 'Weiß nicht' }
        if (a.status) return '—' // unsupported / unbekannt → nicht beantwortbar
        if (a.value != null) return a.value // Altbestand: Wert ohne Status
      }
      // Kein Antwort-Objekt = Unit-Nonresponse: den Dispositionsgrund zeigen
      // (keine Leerstelle); im Export trägt das Item -13 (Nicht teilgenommen).
      if (disposition && disposition !== 'teilgenommen') return disposition
      return ''
    }
    // Kurzhinweis im Erkannt-Chip, wie viele fehlende Werte die Studierende
    // selbst angelegt hat (Transparenz, analog zur Polungs-/Skalen-Anzeige).
    , missingSummary(it) {
      const m = it.scale && it.scale.missingLabels
      return (m && m.length) ? ' · ' + m.length + (m.length === 1 ? ' fehlender Wert' : ' fehlende Werte') : ''
    }
    // ── Run / export ──
    , onRun() {
      this.surveyStore.runFieldwork()
    }
    // ── Wahrheit-Tab ──
    , tryUnlock() {
      const ok = this.surveyStore.unlockInstructor(this.passwordAttempt)
      this.passwordError = !ok
      this.passwordAttempt = ''
    }
    , relock() {
      this.surveyStore.relockInstructor()
    }
    // The telescoping chain of six means — dots on the item's own scale.
    , chainRows(d) {
      return [
        { label: 'Population (wahr)', value: d.popMean, cls: 'truth' }
        , { label: 'Rahmen (wahr)', value: d.frameMean, cls: 'truth' }
        , { label: 'Brutto-Stichprobe (wahr)', value: d.sampleTrueMean, cls: 'truth' }
        , { label: 'Teilnehmende (wahr)', value: d.unitTrueMean != null ? d.unitTrueMean : d.sampleTrueMean, cls: 'truth' }
        , { label: 'Item-Antwortende (wahr)', value: d.respTrueMean, cls: 'truth' }
        , { label: 'Schätzer (beobachtet)', value: d.estimate, cls: 'est' }
      ]
    }
    , componentRows(d) {
      return [
        { label: '① Coverage (Rahmen-Einschränkung)', value: d.coverage }
        , { label: '② Ziehung / Auswahl', value: d.sampling }
        , { label: '③a Unit-Nonresponse (Teilnahme)', value: d.nonresponseUnit != null ? d.nonresponseUnit : 0 }
        , { label: '③b Item-Nonresponse (kA/wn)', value: d.nonresponseItem != null ? d.nonresponseItem : d.nonresponse }
        , { label: '④ Messung (Wording + Rauschen)', value: d.measurement }
      ]
    }
    , scaleLabel(it) {
      const s = it.scale || {}
      if (s.format === 'open' || s.min == null || s.max == null) return 'offene Zahlenangabe'
      // Polung sichtbar machen: bei invers gepolten Skalen weiß der/die
      // Studierende, dass die niedrige Zahl den hohen Ausprägungspol meint.
      return 'Skala ' + s.min + '–' + s.max + (s.reversed ? ' · invers gepolt' : '')
    }
    // Zahl mit deutschem Dezimalkomma (für die Power-Erklärung)
    , komma(n) {
      return String(n).replace('.', ',')
    }
    // Achsenbereich der 5-Punkte-Kette: Item-Skala, bei offenen Zahlenfragen
    // (Alter, Einkommen) aus den fünf Mittelwerten selbst abgeleitet.
    , axisRange(d) {
      const s = d.scale || {}
      if (s.min != null && s.max != null && s.max > s.min) return [s.min, s.max]
      const vals = [d.popMean, d.frameMean, d.sampleTrueMean, d.respTrueMean, d.estimate].filter(v => v != null)
      let lo = Math.min(...vals), hi = Math.max(...vals)
      if (hi - lo < 1e-9) { lo -= 1; hi += 1 }
      const pad = (hi - lo) * 0.1
      return [lo - pad, hi + pad]
    }
    , axisPct(v, d) {
      const range = this.axisRange(d)
      if (v == null || range[1] === range[0]) return 50
      return Math.max(0, Math.min(100, ((v - range[0]) / (range[1] - range[0])) * 100))
    }
    , fmt(v) {
      return v == null ? '—' : v.toFixed(2).replace('.', ',')
    }
    , signed(v) {
      return v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(2).replace('.', ',')
    }
    , deltaClass(v) {
      if (v == null) return ''
      return Math.abs(v) < 0.05 ? 'neutral' : (v > 0 ? 'pos' : 'neg')
    }
    , ciCoversTruth(d) {
      return d.ci95 && d.popMean >= d.ci95[0] && d.popMean <= d.ci95[1]
    }
    // Aufschlüsselung von ④: nur nennenswerte Anteile + immer der Rest.
    , measurementPartRows(d) {
      const labels = {
        acquiescence: '· davon Akquieszenz'
        , framing: '· davon Framing'
        , socialDesirability: '· davon Soziale Erwünschtheit'
        , validity: '· davon Validität (Kreuzladung)'
        , underreporting: '· davon Underreporting'
        , residual: '· davon Rauschen/Rundung'
      }
      const out = []
      for (const k of Object.keys(labels)) {
        const v = d.measurementParts[k]
        if (k === 'residual' || Math.abs(v) >= 0.005) out.push({ label: labels[k], value: v })
      }
      return out
    }
    // ── Simulator-Histogramm ──
    , histRange(d) {
      const v = this.simResult.perItem[d.id].estimates
      let lo = Math.min(d.popMean, ...v)
      let hi = Math.max(d.popMean, ...v)
      if (hi - lo < 1e-9) { lo -= 0.5; hi += 0.5 }
      const pad = (hi - lo) * 0.05
      return [lo - pad, hi + pad]
    }
    , histBars(d) {
      const v = this.simResult.perItem[d.id].estimates
      const range = this.histRange(d)
      const nb = 24
      const counts = new Array(nb).fill(0)
      for (const x of v) {
        const i = Math.min(nb - 1, Math.floor(((x - range[0]) / (range[1] - range[0])) * nb))
        counts[i]++
      }
      const max = Math.max(1, ...counts)
      return counts.map(c => Math.round((100 * c) / max))
    }
    , histTruthPct(d) {
      const range = this.histRange(d)
      return Math.max(0, Math.min(100, ((d.popMean - range[0]) / (range[1] - range[0])) * 100))
    }
  }
}
</script>

<style lang="sass" scoped>
// ═══════════════════════════════════════════════════════════════════════
// Die Studienmappe: ein Formblatt des Befragungsinstituts auf dem
// Schreibtisch (Zielbild design-prototyp/komplett.html, Plan
// docs/ui-institut.md). Alle Klassennamen sind e2e-Vertrag — nur die
// Optik wechselt von Dunkel-Panel auf Papier.
// ═══════════════════════════════════════════════════════════════════════

$korn: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2'/%3E%3CfeColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .05 0'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E")

.survey-window
  position: absolute
  bottom: 1rem
  // Standardlage: mittig auf der Schreibunterlage (rechts der Registratur).
  // Blatt = 540px → linke Kante = Mitte der Unterlage − 270px. Die Unterlage
  // reicht von 230px bis vw−40px ⇒ Mitte = (vw+190)/2 ⇒ left = 0.5vw − 175.
  left: calc(50vw - 175px)
  // Schmale Viewports: Registratur ist nur 64px-Griffleiste, Blatt 460px,
  // Unterlage 80px…vw−16px ⇒ left = 0.5vw − 198.
  @media (max-width: 900px)
    left: calc(50vw - 198px)
  // Über der TimelineBar (6/7), unter der TopBar (10)
  z-index: 8
  pointer-events: auto
  filter: drop-shadow(0 14px 26px rgba(40, 28, 8, 0.45))
  .survey-card
    max-height: calc(100vh - 48px - 2rem)
  &.has-timeline
    bottom: 7.5rem
    .survey-card
      max-height: calc(100vh - 48px - 8.5rem)

.survey-card
  background-color: var(--inst-papier-hell)
  background-image: $korn
  border-radius: 2px
  width: 540px
  // Schmale Viewports (Tablet hochkant): schmaleres Blatt, sonst fehlt
  // dem Resize-Grip der Spielraum bis zur Viewport-Klemmung
  @media (max-width: 900px)
    width: 460px
  max-height: 86vh
  display: flex
  flex-direction: column
  overflow: hidden
  color: var(--inst-tinte)
  font-family: var(--inst-druck)
  font-size: 0.8rem

// ── Briefkopf (zugleich Drag-Griff) ──
.survey-header
  display: flex
  align-items: center
  gap: 0.6rem
  padding: 0.7rem 0.9rem 0.5rem
  border-bottom: 2.5px solid var(--inst-tinte)
  margin: 0 0.9rem
  flex-shrink: 0
  cursor: grab
  &:active
    cursor: grabbing

  .briefkopf-logo
    height: 34px
    flex-shrink: 0
    pointer-events: none

  .header-text
    flex: 1
    min-width: 0

  .survey-title
    font-weight: 800
    font-size: 0.78rem
    letter-spacing: 2px
    text-transform: uppercase
    color: var(--inst-tinte)
    white-space: nowrap

  .survey-subtitle
    font-size: 0.56rem
    letter-spacing: 0.5px
    color: var(--inst-beschriftung)
    margin-top: 2px

  .formblatt-nr
    font-family: var(--inst-schreibmaschine)
    font-size: 0.58rem
    color: var(--inst-beschriftung)
    text-align: right
    line-height: 1.5
    white-space: nowrap
    flex-shrink: 0

  .header-actions
    display: flex
    gap: 0.3rem
    flex-shrink: 0

  .action-btn
    cursor: pointer
    color: var(--inst-beschriftung)
    display: inline-flex
    align-items: center
    padding: 2px
    &:hover
      color: var(--inst-stempelrot)

// ── Blattreiter (Workflow Fragebogen → Stichprobe → Ergebnis · Wahrheit) ──
.survey-steps
  display: flex
  gap: 4px
  padding: 0.5rem 0.9rem 0
  flex-shrink: 0

  .step-tab
    flex: 1
    display: inline-flex
    align-items: center
    justify-content: center
    gap: 0.2rem
    text-align: center
    padding: 0.4rem 0.25rem
    font-family: var(--inst-schreibmaschine)
    font-size: 0.72rem
    letter-spacing: 0.5px
    color: #8a7c5e
    background: var(--inst-karton)
    border-radius: 6px 6px 0 0
    box-shadow: inset 0 -5px 6px rgba(90, 70, 30, 0.14)
    cursor: pointer
    transition: all 0.15s
    &:hover
      background: #efe4c8
    &.active
      background: rgba(51, 81, 142, 0.1)
      box-shadow: inset 0 2.5px 0 var(--inst-stempelblau)
      color: var(--inst-stempelblau)
      font-weight: bold
    &.truth-tab
      color: #a8588a
      background: rgba(224, 105, 159, 0.12)
      &.active
        background: rgba(224, 105, 159, 0.2)
        box-shadow: inset 0 2.5px 0 var(--inst-pink)
        color: #9c2f63

.survey-body
  flex: 1 1 auto
  min-height: 0
  overflow-y: auto
  -webkit-overflow-scrolling: touch
  padding: 0.6rem 0.9rem 0.9rem

  &::-webkit-scrollbar
    width: 7px
  &::-webkit-scrollbar-track
    background: rgba(43, 58, 85, 0.06)
  &::-webkit-scrollbar-thumb
    border-radius: 4px
    background: rgba(43, 58, 85, 0.25)

.hint
  font-size: 0.72rem
  color: var(--inst-tinte-soft)
  margin-bottom: 0.6rem

.mini-hint
  font-family: var(--inst-hand)
  font-size: 0.85rem
  color: var(--inst-graphit)
  margin-bottom: 0.4rem
  line-height: 1.15

  &.cluster-size
    margin-top: 0.35rem
    color: var(--inst-tinte, var(--inst-graphit))

  &.cluster-warn
    color: var(--inst-stempelrot)
    font-weight: 600

// ── Fragebogen: Nichtteilnahme-Code/Label auf Studien-Ebene ──
.nonresp-block
  margin: 0.2rem 0 0.6rem
  padding: 0.45rem 0.55rem
  background: rgba(255, 252, 244, 0.7)
  border: 1.5px solid #ece1c8
  border-radius: 4px

  .nonresp-title
    display: block
    font-family: var(--inst-hand)
    font-size: 0.85rem
    color: var(--inst-graphit)
    margin-bottom: 0.3rem

  .nonresp-row
    display: flex
    gap: 0.4rem
    align-items: center
    margin-bottom: 0.35rem

  .nonresp-code
    width: 4.4rem
    flex: 0 0 auto

  .nonresp-text
    flex: 1 1 auto

  .mini-hint
    margin-bottom: 0

// ── Fragebogen: Items als Formblatt-Fragen ──
.item-card
  background: rgba(255, 252, 244, 0.7)
  border: 1.5px solid #ece1c8
  border-radius: 4px
  padding: 0.5rem
  margin-bottom: 0.55rem

  .item-head
    display: flex
    align-items: center
    gap: 0.4rem
    margin-bottom: 0.35rem

  .item-num
    font-family: var(--inst-schreibmaschine)
    font-weight: 700
    color: var(--inst-beschriftung)
    flex: none
    &::before
      content: 'q'

  .item-kuerzel
    flex: 1 1 auto
    width: auto
    min-width: 0
    font-weight: 700
    color: var(--inst-stempelblau)

  .action-btn.del
    cursor: pointer
    color: var(--inst-beschriftung)
    margin-left: auto
    display: inline-flex
    &:hover
      color: var(--inst-stempelrot)

.survey-input
  background: rgba(255, 255, 255, 0.45)
  border: none
  border-bottom: 1.5px dotted var(--inst-linie)
  border-radius: 0
  color: var(--inst-tinte)
  padding: 0.3rem 0.2rem 0.15rem
  font-size: 0.78rem
  font-family: var(--inst-schreibmaschine)
  outline: none
  width: 100%
  box-sizing: border-box
  &:focus
    border-bottom: 2px solid var(--inst-stempelblau)
  &::placeholder
    color: var(--inst-beschriftung)
    opacity: 0.75
  &.mini
    width: 70px

select.survey-input
  border: 1.5px solid rgba(43, 58, 85, 0.25)
  border-radius: 4px
  background: rgba(255, 255, 255, 0.6)

.item-text
  resize: vertical
  border: 1.5px dashed rgba(43, 58, 85, 0.3)
  border-radius: 4px
  background: repeating-linear-gradient(180deg, rgba(255, 255, 255, 0.5) 0 22px, rgba(70, 110, 160, 0.07) 22px 23px)
  line-height: 23px
  padding: 0.2rem 0.4rem

.study-actions
  display: flex
  gap: 0.4rem
  margin-bottom: 0.5rem
  .survey-btn.mini-btn
    margin-top: 0
    padding: 0.3rem
    font-size: 0.62rem

.quota-row
  display: flex
  align-items: center
  gap: 0.4rem
  margin-bottom: 0.25rem
  .quota-label
    flex: 1
    font-family: var(--inst-schreibmaschine)
    font-size: 0.7rem
    color: var(--inst-tinte-soft)

.planner
  margin-top: 0.6rem
  padding-top: 0.5rem
  border-top: 1.5px dashed rgba(43, 58, 85, 0.25)
  .planner-row
    display: flex
    align-items: center
    gap: 0.35rem
    font-family: var(--inst-schreibmaschine)
    font-size: 0.75rem
    color: var(--inst-tinte-soft)
  .planner-result
    font-weight: 600
    color: var(--inst-tinte)

  // Ausklappbare Erklärung „Was heißt das?“ — Symbole in Alltagssprache
  .planner-explain
    margin-top: 0.45rem
  .explain-toggle
    display: inline-block
    font-family: var(--inst-druck)
    font-size: 0.7rem
    font-weight: 700
    letter-spacing: 0.3px
    color: var(--inst-stempelblau)
    cursor: pointer
    user-select: none
    &:hover
      text-decoration: underline
  .explain-body
    margin-top: 0.35rem
    padding: 0.45rem 0.6rem
    background: rgba(51, 81, 142, 0.06)
    border-left: 2.5px solid rgba(51, 81, 142, 0.35)
    border-radius: 0 4px 4px 0
    font-size: 0.72rem
    line-height: 1.35
    color: var(--inst-tinte-soft)
    p
      margin: 0 0 0.4rem
      &:last-child
        margin-bottom: 0
      b
        color: var(--inst-tinte)
    .explain-note
      margin-top: 0.5rem
      padding-top: 0.4rem
      border-top: 1px dashed rgba(43, 58, 85, 0.28)
      font-style: italic
      color: var(--inst-tinte-soft)

.item-meta
  display: flex
  align-items: center
  gap: 0.4rem
  margin-top: 0.4rem
  flex-wrap: wrap

// Prüfvermerke: beantwortbar (blauer Haken) / nicht beantwortbar (roter Stempel)
.detect-chip
  display: inline-flex
  align-items: center
  gap: 0.25rem
  padding: 0.08rem 0.45rem
  border-radius: 3px
  font-size: 0.62rem
  font-weight: 800
  letter-spacing: 0.5px
  white-space: nowrap
  text-transform: uppercase
  opacity: 0.9
  &.ok
    border: 1.5px solid #2c7d40
    color: #2c7d40
    transform: rotate(-0.5deg)
  &.warn
    border: 2px double var(--inst-stempelrot)
    color: var(--inst-stempelrot)
    transform: rotate(-1.5deg)
  &.checking
    border: 1.5px solid var(--inst-graphit)
    color: var(--inst-graphit)
    transform: rotate(-0.5deg)
  &.idle
    border: 1.5px dashed rgba(107, 111, 118, 0.55)
    color: var(--inst-graphit)
    opacity: 0.75

// „Frage prüfen“ rechts an die Prüfvermerk-Zeile
.recheck.mini-btn
  margin-left: auto

// Freundlicher Umformulier-Hinweis, wenn die Frage (noch) nicht erkannt wurde
.reword-hint
  font-family: var(--inst-hand)
  font-size: 0.95rem
  line-height: 1.2
  color: var(--inst-handrot)
  margin: 0.3rem 0 0.1rem
  padding-left: 0.1rem
  &.err
    color: var(--inst-stempelrot)

.unmeasurable-hint
  margin-top: 0.2rem

// Seltene manuelle Konstrukt-Korrektur (versteckt bis angeklickt)
.construct-correct
  margin-top: 0.3rem
  .correct-link
    font-size: 0.7rem
    color: var(--inst-stempelblau)
    cursor: pointer
    text-decoration: underline
  .correct-select
    margin-top: 0.25rem
    width: 100%

// ── Stichprobe: §-Abschnitte des Ziehungsplans ──
.panel-block
  margin-bottom: 0.7rem

  .block-head
    display: flex
    align-items: center
    gap: 0.4rem
    padding: 0.3rem 0
    border-bottom: 1.5px solid rgba(141, 127, 99, 0.45)
    cursor: default

  .block-title
    font-weight: 800
    font-size: 0.62rem
    letter-spacing: 1.5px
    text-transform: uppercase
    color: var(--inst-beschriftung)

  .block-meta
    margin-left: auto
    font-family: var(--inst-hand)
    font-size: 0.9rem
    color: var(--inst-graphit)

  .block-body
    padding: 0.5rem 0.1rem 0.1rem

.filter-group
  margin-bottom: 0.5rem

  label
    display: block
    font-size: 0.6rem
    font-weight: 800
    text-transform: uppercase
    letter-spacing: 1px
    color: var(--inst-beschriftung)
    margin-bottom: 0.25rem

  &.range
    display: flex
    align-items: center
    gap: 0.3rem
    label
      width: 100%

.chips
  display: flex
  flex-wrap: wrap
  gap: 0.3rem

// Filter-Chips: Karteireiter-Fähnchen, aktiv = blau gestempelt
.chip
  padding: 0.15rem 0.55rem
  border: 1.5px solid rgba(43, 58, 85, 0.3)
  border-radius: 3px
  font-family: var(--inst-schreibmaschine)
  font-size: 0.68rem
  color: var(--inst-tinte-soft)
  background: rgba(255, 255, 255, 0.45)
  cursor: pointer
  transition: all 0.12s
  &:hover
    border-color: var(--inst-stempelblau)
  &.active
    background: var(--inst-stempelblau)
    border-color: var(--inst-stempelblau)
    color: #fff

.dash
  color: var(--inst-beschriftung)

.reset-link
  font-family: var(--inst-hand)
  font-size: 0.9rem
  color: var(--inst-graphit)
  cursor: pointer
  text-decoration: underline
  text-decoration-style: wavy
  text-decoration-thickness: 1px
  &:hover
    color: var(--inst-tinte)

// Auswahl per Rotstift: aktive Option ist eingekreist
.radio-row
  display: flex
  align-items: center
  gap: 0.15rem
  padding: 0.12rem 0
  font-family: var(--inst-schreibmaschine)
  font-size: 0.76rem
  color: var(--inst-tinte-soft)
  cursor: pointer

  input
    // Unsichtbar, aber klickbar (Playwright braucht eine Box)
    position: absolute
    width: 14px
    height: 14px
    opacity: 0
    margin: 0

  span
    display: inline-block
    border: 2px solid transparent
    border-radius: 50%
    padding: 1px 10px 2px
    transform: rotate(-1.5deg)
    transition: border-color 0.12s ease

  &:hover span
    border-color: rgba(196, 55, 42, 0.25)

  &.active
    color: var(--inst-tinte)
    span
      border-color: var(--inst-handrot)

.params
  margin-top: 0.4rem
  label
    display: block
    font-size: 0.6rem
    font-weight: 800
    text-transform: uppercase
    letter-spacing: 1px
    color: var(--inst-beschriftung)
    margin: 0.4rem 0 0.2rem

// ── Realisierte Stichprobe / Namensliste ──
.search
  margin: 0.4rem 0

.blob-list
  max-height: 200px
  overflow-y: auto
  border: 1.5px solid rgba(141, 127, 99, 0.35)
  border-radius: 4px
  background: rgba(255, 255, 255, 0.4)

.blob-row
  display: flex
  align-items: center
  gap: 0.4rem
  padding: 0.25rem 0.4rem
  font-family: var(--inst-schreibmaschine)
  font-size: 0.7rem
  border-bottom: 1px solid rgba(141, 127, 99, 0.2)
  &:last-child
    border-bottom: none
  &.picked
    background: rgba(51, 81, 142, 0.1)

  input[type="checkbox"]
    accent-color: var(--inst-stempelblau)

  .b-name
    font-weight: 600
    color: var(--inst-tinte)
    white-space: nowrap

  .b-meta
    color: var(--inst-beschriftung)
    flex: 1
    min-width: 0
    overflow: hidden
    text-overflow: ellipsis
    white-space: nowrap

  .action-btn.del
    cursor: pointer
    color: var(--inst-beschriftung)
    display: inline-flex
    &:hover
      color: var(--inst-stempelrot)

.list-empty
  padding: 0.6rem
  font-family: var(--inst-hand)
  font-size: 0.9rem
  color: var(--inst-graphit)
  text-align: center

.list-overflow
  font-size: 0.66rem
  color: var(--inst-beschriftung)
  margin-top: 0.3rem
  text-align: center

// ── Stempel-Knöpfe ──
.survey-btn
  display: inline-flex
  align-items: center
  justify-content: center
  gap: 0.35rem
  width: 100%
  padding: 0.45rem
  margin-top: 0.4rem
  border: 2.5px solid var(--inst-stempelblau)
  border-radius: 4px
  background: rgba(255, 255, 255, 0.5)
  color: var(--inst-stempelblau)
  font-size: 0.66rem
  font-weight: 800
  letter-spacing: 1.5px
  text-transform: uppercase
  font-family: var(--inst-druck)
  cursor: pointer
  box-shadow: 0 2px 0 rgba(51, 81, 142, 0.35)
  transition: transform 0.06s ease, box-shadow 0.06s ease, background 0.15s
  &:hover
    background: rgba(255, 255, 255, 0.85)
  &:active
    transform: translateY(2px)
    box-shadow: 0 0 0 rgba(51, 81, 142, 0.35)
  &:disabled
    opacity: 0.4
    cursor: not-allowed
  &.primary
    background: var(--inst-stempelblau)
    color: #fff
    &:hover
      filter: brightness(1.12)
  &.add-btn
    border-style: dashed
    box-shadow: none
    color: var(--inst-tinte-soft)
    border-color: rgba(43, 58, 85, 0.35)

.info-item
  display: flex
  justify-content: space-between
  padding: 0.2rem 0
  .info-label
    color: var(--inst-beschriftung)
  .info-value
    font-family: var(--inst-schreibmaschine)
    color: var(--inst-tinte)
    font-weight: 600

// Bleistift-Balken (Ziehungsprotokoll)
.dist
  margin-bottom: 0.5rem

  .dist-row
    display: flex
    align-items: center
    gap: 0.4rem
    margin-bottom: 0.25rem
    font-family: var(--inst-schreibmaschine)
    font-size: 0.68rem

  .dist-key
    width: 90px
    color: var(--inst-tinte-soft)
    white-space: nowrap
    overflow: hidden
    text-overflow: ellipsis

  .dist-bar
    flex: 1
    height: 10px
    background: rgba(43, 58, 85, 0.07)
    border-radius: 2px
    overflow: hidden

  .dist-fill
    display: block
    height: 100%
    background: repeating-linear-gradient(45deg, rgba(90, 95, 105, 0.55) 0 2px, rgba(90, 95, 105, 0.22) 2px 4px)
    border-right: 1.5px solid rgba(70, 75, 85, 0.7)

  .dist-val
    width: 28px
    text-align: right
    color: var(--inst-tinte)

.results-divider
  border-top: 2px dashed rgba(141, 127, 99, 0.4)
  margin: 0.6rem 0 0.4rem

// ── Datenlieferung: Endlospapier ──
.data-table-wrap
  margin-top: 0.4rem
  max-height: 240px
  overflow: auto
  border: none
  border-radius: 2px
  background: #fbfbf6 repeating-linear-gradient(180deg, rgba(110, 170, 120, 0.13) 0 24px, transparent 24px 48px)
  // Transportlochstreifen links + rechts
  background-image: radial-gradient(circle at 9px 12px, rgba(90, 110, 90, 0.35) 3px, transparent 4px), radial-gradient(circle at calc(100% - 9px) 12px, rgba(90, 110, 90, 0.35) 3px, transparent 4px), repeating-linear-gradient(180deg, rgba(110, 170, 120, 0.13) 0 24px, transparent 24px 48px)
  background-size: 18px 24px, 18px 24px, auto
  background-repeat: repeat-y, repeat-y, repeat
  background-position: left top, right top, left top
  box-shadow: inset 0 0 0 1.5px rgba(90, 110, 90, 0.3)
  padding: 0 18px

.data-table
  width: 100%
  border-collapse: collapse
  font-family: var(--inst-schreibmaschine)
  font-size: 0.66rem
  white-space: nowrap

  th
    position: sticky
    top: 0
    background: #f3f3ea
    color: #5d6e54
    font-weight: 600
    font-size: 0.56rem
    letter-spacing: 1px
    text-transform: uppercase
    text-align: left
    padding: 0.3rem 0.45rem
    border-bottom: 2px solid rgba(60, 90, 60, 0.4)

  td
    padding: 0.2rem 0.45rem
    color: #27332a
    &.idx
      color: #8a9882

  // Nichtteilnehmende (Unit-Nonresponse) gedämpft + kursiv — die Item-Zellen
  // tragen den Dispositionsgrund, sind aber klar von echten Antworten abgesetzt.
  tr.row-nonresp td
    color: #9aa392
    font-style: italic

.demo-block
  margin-top: 0.6rem

.progress-line
  margin-top: 0.5rem
  font-family: var(--inst-schreibmaschine)
  font-size: 0.78rem
  color: var(--inst-tinte-soft)

.error-banner
  margin-top: 0.5rem
  padding: 0.4rem 0.5rem
  border: 2px double var(--inst-stempelrot)
  border-radius: 3px
  color: var(--inst-stempelrot)
  font-size: 0.7rem
  font-weight: 600
  transform: rotate(-0.4deg)
  background: rgba(255, 255, 255, 0.4)

// ── Wahrheit (Dozentenzimmer-Vorzimmer im Formblatt) ──
.truth-tab
  display: inline-flex
  align-items: center
  justify-content: center
  gap: 0.2rem

.truth-lock
  display: flex
  flex-direction: column
  align-items: center
  gap: 0.5rem
  text-align: center
  padding: 1rem 0.5rem
  .survey-input, .survey-btn
    max-width: 220px
  .survey-btn.siegel-btn
    max-width: 260px
    border-color: #9c2f63
    color: #9c2f63
    box-shadow: 0 2px 0 rgba(156, 47, 99, 0.35)
    &.primary
      background: var(--inst-pink)
      border-color: var(--inst-pink)
      color: #fff

// Versiegelter Umschlag (Kraftpapier + pinkes Siegel)
.umschlag
  position: relative
  width: 250px
  height: 158px
  margin: 0.3rem auto 0.7rem
  background: linear-gradient(160deg, #d3b285, #bf9c6c)
  box-shadow: 0 8px 18px rgba(40, 28, 8, 0.35)

  .klappe
    position: absolute
    left: 0
    right: 0
    top: 0
    height: 58px
    background: linear-gradient(170deg, #c8a87b, #b39059)
    clip-path: polygon(0 0, 100% 0, 50% 100%)
    box-shadow: 0 3px 6px rgba(0, 0, 0, 0.2)

  .siegel
    position: absolute
    left: 50%
    top: 40px
    transform: translateX(-50%)
    width: 44px
    height: 44px
    border-radius: 48% 52% 50% 50% / 52% 48% 52% 48%
    background: radial-gradient(circle at 38% 32%, #ef8fc0, #c2417f 65%, #9c2f63)
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.35), inset 0 -3px 6px rgba(0, 0, 0, 0.25)
    display: flex
    align-items: center
    justify-content: center
    color: #fff0f8
    font-weight: 800
    font-size: 18px
    z-index: 2

  .aufschrift
    position: absolute
    left: 0
    right: 0
    top: 96px
    text-align: center

  .geheim-stempel
    display: inline-block
    font-weight: 800
    font-size: 0.6rem
    letter-spacing: 1.5px
    text-transform: uppercase
    color: var(--inst-stempelrot)
    border: 2px double var(--inst-stempelrot)
    padding: 2px 9px
    transform: rotate(-3deg)
    opacity: 0.9

  .zeile2
    margin-top: 6px
    font-family: var(--inst-schreibmaschine)
    font-size: 0.58rem
    letter-spacing: 1px
    color: #5a431f

.survey-input.has-error
  border-bottom-color: var(--inst-stempelrot)
  &::placeholder
    color: var(--inst-stempelrot)

.truth-item
  background: rgba(253, 248, 238, 0.85)
  border: 1.5px solid rgba(224, 105, 159, 0.35)
  border-radius: 4px
  padding: 0.5rem
  margin-bottom: 0.6rem

.truth-head
  display: flex
  align-items: center
  gap: 0.4rem
  .item-num
    font-family: var(--inst-schreibmaschine)
    font-weight: 700
    color: var(--inst-beschriftung)

.truth-construct
  margin-left: auto
  font-size: 0.62rem
  font-weight: 800
  letter-spacing: 0.5px
  color: #9c2f63

.truth-text
  font-family: var(--inst-schreibmaschine)
  font-size: 0.7rem
  color: var(--inst-tinte-soft)
  margin: 0.25rem 0 0.5rem

.tse-chain
  margin-bottom: 0.4rem

.tse-row
  display: flex
  align-items: center
  gap: 0.4rem
  margin-bottom: 0.3rem
  font-size: 0.66rem

.tse-label
  width: 132px
  color: var(--inst-tinte-soft)
  white-space: nowrap
  overflow: hidden
  text-overflow: ellipsis

.tse-axis
  flex: 1
  position: relative
  height: 10px
  border-bottom: 1.5px solid rgba(43, 58, 85, 0.5)

.tse-dot
  position: absolute
  top: 50%
  width: 11px
  height: 11px
  border-radius: 50%
  border: 2.5px solid var(--inst-tinte)
  background: var(--inst-papier-hell)
  transform: translate(-50%, -50%)
  box-sizing: border-box
  &.truth
    border-color: var(--inst-pink)
    background: var(--inst-pink)
  &.est
    border-color: var(--inst-stempelrot)
    background: var(--inst-stempelrot)

.tse-val
  min-width: 38px
  text-align: right
  font-family: var(--inst-schreibmaschine)
  color: var(--inst-tinte)
  white-space: nowrap

.tse-deltas
  border-top: 1.5px dashed rgba(43, 58, 85, 0.25)
  padding-top: 0.35rem
  margin-bottom: 0.3rem

.tse-parts
  margin: 0 0 0.3rem 0.8rem
  opacity: 0.9
  .tse-delta
    font-size: 0.62rem

.tse-delta
  display: flex
  justify-content: space-between
  font-size: 0.68rem
  padding: 0.1rem 0
  .tse-delta-label
    color: var(--inst-beschriftung)
  .tse-delta-val
    font-family: var(--inst-schreibmaschine)
    font-weight: 600
    &.pos
      color: var(--inst-stempelrot)
    &.neg
      color: var(--inst-stempelblau)
    &.neutral
      color: var(--inst-graphit)
  &.total
    border-top: 1.5px solid rgba(43, 58, 85, 0.4)
    margin-top: 0.2rem
    padding-top: 0.25rem
    .tse-delta-label
      color: var(--inst-tinte)
      font-weight: 700

// Replikations-Histogramm in Bleistift
.sim-hist
  margin-top: 0.4rem

.hist-bars
  position: relative
  display: flex
  align-items: flex-end
  gap: 1px
  height: 56px
  border-bottom: 2px solid rgba(43, 58, 85, 0.5)
  padding: 2px 2px 0
  overflow: hidden

.hist-bar
  flex: 1
  background: repeating-linear-gradient(45deg, rgba(90, 95, 105, 0.5) 0 2px, rgba(90, 95, 105, 0.22) 2px 4px)
  border: 1px solid rgba(70, 75, 85, 0.5)
  border-bottom: none
  min-height: 1px

.hist-truth
  position: absolute
  top: 0
  bottom: 0
  width: 2.5px
  background: var(--inst-stempelrot)

.hist-meta
  display: flex
  gap: 0.8rem
  font-family: var(--inst-schreibmaschine)
  font-size: 0.62rem
  color: var(--inst-beschriftung)
  margin-top: 0.2rem

.sim-controls
  margin-bottom: 0.4rem
  label
    display: block
    font-size: 0.68rem
    color: var(--inst-tinte-soft)
    margin-bottom: 0.3rem
  .sim-row
    display: flex
    gap: 0.4rem
    align-items: center
    .survey-input.mini
      width: 90px
    .survey-btn
      margin-top: 0

.relock-row
  margin-top: 0.5rem
  text-align: center

// Dispositionscodes als rote Stempel-Vermerke
.dispo-row
  display: flex
  flex-wrap: wrap
  gap: 0.4rem
  margin: 0.25rem 0
  .dispo
    font-size: 0.58rem
    font-weight: 800
    letter-spacing: 0.5px
    text-transform: uppercase
    color: var(--inst-stempelrot)
    border: 1.5px solid var(--inst-stempelrot)
    border-radius: 3px
    padding: 0.05rem 0.4rem
    transform: rotate(-1.5deg)
    opacity: 0.85

.summary-table
  margin-top: 0.4rem

.calib-row
  margin-top: 0.4rem
  .chips
    margin: 0.3rem 0

.wave-row
  display: flex
  align-items: center
  gap: 0.4rem
  margin-bottom: 0.25rem
  .wave-label
    font-family: var(--inst-schreibmaschine)
    font-size: 0.72rem
    color: var(--inst-tinte-soft)
  .action-btn.del
    cursor: pointer
    color: var(--inst-beschriftung)
    display: inline-flex
    &:hover
      color: var(--inst-stempelrot)

.wave-chips
  display: flex
  gap: 0.3rem
  margin-bottom: 0.5rem
</style>
