<template lang="pug">
.survey-window(:class="{ 'has-timeline': timelineMode }", :style="panelStyle")
  .survey-card(:style="cardStyle")
    //- Header doubles as the drag handle (matches panelConfig.headerSelector)
    .survey-header
      .header-text
        .survey-title Befragungsinstitut
        .survey-subtitle Eigene Befragung erstellen
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
            span.action-btn.del(@click="removeItem(i)", title="Entfernen")
              b-icon(icon="close", size="is-small")
          textarea.survey-input.item-text(v-model="it.text", rows="3", placeholder="Frage UND Antwortskala selbst formulieren — z. B. „Wie zufrieden sind Sie mit der Politik? Skala von 1 bis 10, wobei 1 = gar nicht und 10 = völlig.“", @input="onItemText(it)")
          .item-meta(v-if="it.text && it.text.trim()")
            span.detect-chip(:class="it.construct ? 'ok' : 'warn'")
              b-icon(:icon="it.construct ? 'check-circle' : 'alert'", size="is-small")
              span {{ it.construct ? ('beantwortbar · ' + scaleLabel(it)) : 'nicht beantwortbar — Merkmal wählen' }}
            label.misst-label misst:
            select.survey-input.misst-select(:value="it.construct || ''", @change="onConstructChange(it, $event)")
              option(value="") automatisch erkennen
              optgroup(v-for="g in constructGroups", :key="g.group", :label="g.group")
                option(v-for="c in g.items", :key="c.key", :value="c.key") {{ c.label }}
        button.survey-btn.add-btn(@click="addItem")
          b-icon(icon="plus", size="is-small")
          span Item hinzufügen
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
              input.survey-input(type="number", min="1", v-model.number="design.numClusters")
              label Pro Klumpen ziehen (leer = alle, zweistufig)
              input.survey-input(type="number", min="1", v-model.number="design.withinClusterN", placeholder="alle")
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
              label Planung: n für gewünschte Präzision (±e, 95 %)
              .planner-row
                span ±
                input.survey-input.mini(type="number", step="0.1", min="0.1", v-model.number="planE")
                span.planner-result → n ≥ {{ plannedN != null ? plannedN : '—' }}
              p.mini-hint konservative Annahme σ ≈ Skalenbreite/4 = {{ planSigma }} · Rahmen N = {{ frameBlobs.length }}
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
                tr(v-for="(r, ri) in result.rows", :key="r.blobId")
                  td.idx {{ ri + 1 }}
                  td(v-for="c in tableColumns", :key="c.key") {{ c.cell(r) }}
          p.mini-hint kA = keine Angabe (verweigert) · wn = weiß nicht · — = nicht beantwortbar
          .error-banner(v-if="unsupportedItems.length") Für {{ unsupportedItems.join(', ') }} kamen keine Antworten — das Merkmal ist in der Simulation nicht verfügbar. Im Fragebogen die „misst …“-Zuordnung prüfen.
          button.survey-btn.primary(@click="onExport")
            b-icon(icon="download", size="is-small")
            span Als CSV exportieren
          button.survey-btn(@click="surveyStore.exportCodebook()")
            b-icon(icon="book-open-variant", size="is-small")
            span Codebook exportieren

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
            p.hint Die Simulation kennt die wahren Werte aller Blobs. Beim Aufdecken wird jeder Schätzer exakt in die vier Fehlerquellen zerlegt: Coverage, Ziehung, Nonresponse, Messung.
            button.survey-btn.primary(@click="surveyStore.revealTruth()")
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
          button.survey-btn(@click="surveyStore.exportInstructorCsv()")
            b-icon(icon="download", size="is-small")
            span Dozenten-CSV (mit wahren Werten)
          .relock-row
            span.reset-link(@click="relock") Wieder sperren
</template>

<script>
import { mapState, mapStores } from 'pinia'
import { useSurveyStore } from '@/stores/survey'
import { useSimulationStore } from '@/stores/simulation'
import draggablePanel from '@/mixins/draggable-panel'
import { parseItem } from '@/lib/survey-parse'
import { planSampleSize } from '@/lib/survey-sampling'
import { FIELD_MODES } from '@/lib/survey-fieldwork'
import { calibratedEstimate } from '@/lib/survey-weighting'
import { datasetColumns } from '@/lib/survey-dataset'
import { CONSTRUCTS } from '@/lib/survey-constructs'
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
      step: 'editor'
      , filtersOpen: true
      , search: ''
      , techniques: TECHNIQUES
      // Wahrheit-Tab: same instructor lock as the blob inspector (one unlock
      // opens both — the key is shared deliberately).
      , truthUnlocked: localStorage.getItem('blobtopia_inspector_unlocked') === 'true'
      , passwordAttempt: ''
      , passwordError: false
      , simB: 500
      , planE: 0.5
      , localItems: []
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
        , longitudinal: { type: 'cross', waveYears: [] }
      }
    }
  }
  , computed: {
    panelConfig() {
      return {
        storageKey: 'blobtopia_panel_survey'
        , minWidth: 380
        , maxWidth: 820
        , minHeight: 340
        , maxHeight: Math.round(window.innerHeight * 0.92)
        , headerSelector: '.survey-header'
        , resizable: true
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
    , constructGroups() {
      const groups = []
      const byName = {}
      for (const c of CONSTRUCTS) {
        if (!byName[c.group]) { byName[c.group] = { group: c.group, items: [] }; groups.push(byName[c.group]) }
        byName[c.group].items.push(c)
      }
      return groups
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
        cols.push({ key: id, label: id, cell: r => this.fmtAnswer(r.answers && r.answers[id]) })
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
      , 'calib', 'calibration', 'itemSummary', 'waveChanges', 'truthWave'])
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
      const total = Number(this.design.n) || 0
      const cells = this.quotaCells
      const frameN = Math.max(1, this.frameBlobs.length)
      const q = {}
      for (const c of cells) q[c.key] = Math.round(total * c.count / frameN)
      this.design.quotas = q
    }
    , blankItem(i) {
      return {
        id: 'q' + i
        , text: ''
        , scale: { min: 1, max: 10, minLabel: '', maxLabel: '', format: 'numeric' }
        , construct: null
        , constructManual: false
        , wording: {}
      }
    }
    , addItem() {
      this.localItems.push(this.blankItem(this.localItems.length + 1))
    }
    , removeItem(i) {
      this.localItems.splice(i, 1)
    }
    , onItemText(it) {
      const p = parseItem(it.text)
      it.scale = p.scale
      it.wording = p.wording
      // Auto-Erkennung folgt dem Text, solange nicht manuell zugeordnet wurde.
      if (!it.constructManual) it.construct = p.construct
    }
    , onConstructChange(it, e) {
      const v = e.target.value
      if (v) {
        it.constructManual = true
        it.construct = v
      } else {
        it.constructManual = false
        it.construct = parseItem(it.text).construct
      }
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
    , fmtAnswer(a) {
      if (!a) return ''
      if (a.status === 'answered') return a.value
      if (a.status === 'refused') return 'kA'
      if (a.status === 'dontknow') return 'wn'
      return '—'
    }
    // ── Run / export ──
    , onRun() {
      this.surveyStore.runFieldwork()
    }
    , onExport() {
      this.surveyStore.exportCsv()
    }
    // ── Wahrheit-Tab ──
    , tryUnlock() {
      const correct = import.meta.env.VUE_APP_INSPECTOR_PASSWORD || 'blob123'
      if (this.passwordAttempt === correct) {
        this.truthUnlocked = true
        this.passwordError = false
        this.passwordAttempt = ''
        localStorage.setItem('blobtopia_inspector_unlocked', 'true')
      } else {
        this.passwordError = true
        this.passwordAttempt = ''
      }
    }
    , relock() {
      this.truthUnlocked = false
      localStorage.removeItem('blobtopia_inspector_unlocked')
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
      return 'Skala ' + s.min + '–' + s.max
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
      return v == null ? '—' : v.toFixed(2)
    }
    , signed(v) {
      return v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(2)
    }
    , deltaClass(v) {
      if (v == null) return ''
      return Math.abs(v) < 0.05 ? 'neutral' : (v > 0 ? 'pos' : 'neg')
    }
    , ciCoversTruth(d) {
      return d.ci95 && d.popMean >= d.ci95[0] && d.popMean <= d.ci95[1]
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
.survey-window
  position: absolute
  bottom: 1rem
  left: 1rem
  // Über der TimelineBar (6/7), unter der TopBar (10) — sonst fängt die
  // Timeline Touch-Gesten am Resize-Grip ab, wenn das Fenster tief hängt
  z-index: 8
  pointer-events: auto
  // Card darf nie unter die TopBar (44px, z-index 10) ragen — sonst sind
  // die Tabs auf flachen Viewports (Beamer/Tablet quer) nicht klickbar
  .survey-card
    max-height: calc(100vh - 44px - 2rem)
  &.has-timeline
    bottom: 10rem
    .survey-card
      max-height: calc(100vh - 44px - 11rem)

.survey-card
  background: rgba(0, 0, 0, 0.9)
  backdrop-filter: blur(8px)
  border-radius: 8px
  border: 1px solid rgba(255, 255, 255, 0.15)
  width: 460px
  max-height: 86vh
  display: flex
  flex-direction: column
  overflow: hidden
  color: $grey-lighter
  font-size: 0.8rem

.survey-header
  display: flex
  align-items: center
  gap: 0.5rem
  padding: 0.6rem 0.75rem
  border-bottom: 1px solid rgba(255, 255, 255, 0.1)
  flex-shrink: 0
  cursor: grab
  &:active
    cursor: grabbing

  .header-text
    flex: 1
    min-width: 0

  .survey-title
    font-weight: 700
    font-size: 0.95rem
    color: $grey-lighter

  .survey-subtitle
    font-size: 0.7rem
    color: $grey
    margin-top: 1px

  .header-actions
    display: flex
    gap: 0.3rem
    flex-shrink: 0

  .action-btn
    cursor: pointer
    color: $grey
    display: inline-flex
    align-items: center
    padding: 2px
    &:hover
      color: $grey-lighter

.survey-steps
  display: flex
  border-bottom: 1px solid rgba(255, 255, 255, 0.1)
  flex-shrink: 0

  .step-tab
    flex: 1
    text-align: center
    padding: 0.45rem 0.25rem
    font-size: 0.74rem
    color: $grey
    cursor: pointer
    border-bottom: 2px solid transparent
    transition: all 0.15s
    &:hover
      color: $grey-lighter
    &.active
      color: $primary
      border-bottom-color: $primary

.survey-body
  flex: 1 1 auto
  min-height: 0
  overflow-y: auto
  -webkit-overflow-scrolling: touch
  padding: 0.6rem 0.75rem

.hint
  font-size: 0.72rem
  color: $grey
  margin-bottom: 0.6rem

.mini-hint
  font-size: 0.7rem
  color: $grey
  margin-bottom: 0.4rem

// ── Fragebogen ──
.item-card
  border: 1px solid rgba(255, 255, 255, 0.1)
  border-radius: 6px
  padding: 0.5rem
  margin-bottom: 0.5rem

  .item-head
    display: flex
    align-items: center
    gap: 0.4rem
    margin-bottom: 0.4rem

  .item-num
    font-weight: 700
    color: $grey

  .action-btn.del
    cursor: pointer
    color: $grey
    margin-left: auto
    display: inline-flex
    &:hover
      color: #e74c3c

.survey-input
  background: rgba(255, 255, 255, 0.06)
  border: 1px solid rgba(255, 255, 255, 0.18)
  border-radius: 4px
  color: $grey-lighter
  padding: 0.3rem 0.4rem
  font-size: 0.75rem
  font-family: inherit
  outline: none
  width: 100%
  box-sizing: border-box
  &:focus
    border-color: $primary
  &.mini
    width: 70px

.item-text
  resize: vertical

.study-actions
  display: flex
  gap: 0.4rem
  margin-bottom: 0.5rem
  .survey-btn.mini-btn
    margin-top: 0
    padding: 0.3rem
    font-size: 0.7rem

.quota-row
  display: flex
  align-items: center
  gap: 0.4rem
  margin-bottom: 0.25rem
  .quota-label
    flex: 1
    font-size: 0.7rem
    color: $grey-light

.planner
  margin-top: 0.6rem
  padding-top: 0.5rem
  border-top: 1px dashed rgba(255, 255, 255, 0.12)
  .planner-row
    display: flex
    align-items: center
    gap: 0.35rem
    font-size: 0.75rem
    color: $grey-light
  .planner-result
    font-weight: 600
    color: $grey-lighter

.item-meta
  display: flex
  align-items: center
  gap: 0.4rem
  margin-top: 0.35rem
  flex-wrap: wrap

.detect-chip
  display: inline-flex
  align-items: center
  gap: 0.25rem
  padding: 0.1rem 0.45rem
  border-radius: 999px
  font-size: 0.66rem
  white-space: nowrap
  &.ok
    border: 1px solid rgba(78, 204, 163, 0.5)
    color: #4ecca3
  &.warn
    border: 1px solid rgba(230, 126, 34, 0.6)
    color: #e67e22

.misst-label
  font-size: 0.66rem
  text-transform: uppercase
  letter-spacing: 0.3px
  color: $grey
  margin-left: auto

.misst-select
  width: auto
  max-width: 200px
  font-size: 0.7rem
  padding: 0.15rem 0.3rem

// ── Stichprobe blocks ──
.panel-block
  border: 1px solid rgba(255, 255, 255, 0.1)
  border-radius: 6px
  margin-bottom: 0.5rem
  overflow: hidden

  .block-head
    display: flex
    align-items: center
    gap: 0.4rem
    padding: 0.45rem 0.6rem
    background: rgba(255, 255, 255, 0.04)
    cursor: default

  .block-title
    font-weight: 700
    font-size: 0.74rem
    color: $grey-lighter

  .block-meta
    margin-left: auto
    font-size: 0.7rem
    color: $primary

  .block-body
    padding: 0.5rem 0.6rem

.filter-group
  margin-bottom: 0.5rem

  label
    display: block
    font-size: 0.66rem
    text-transform: uppercase
    letter-spacing: 0.3px
    color: $grey
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
  gap: 0.25rem

.chip
  padding: 0.15rem 0.5rem
  border: 1px solid rgba(255, 255, 255, 0.2)
  border-radius: 999px
  font-size: 0.7rem
  color: $grey-light
  cursor: pointer
  transition: all 0.12s
  &:hover
    color: $grey-lighter
  &.active
    background: $primary
    border-color: $primary
    color: #fff

.dash
  color: $grey

.reset-link
  font-size: 0.68rem
  color: $grey
  cursor: pointer
  text-decoration: underline
  &:hover
    color: $grey-lighter

.radio-row
  display: flex
  align-items: center
  gap: 0.4rem
  padding: 0.2rem 0
  font-size: 0.76rem
  color: $grey-light
  cursor: pointer
  &.active
    color: $grey-lighter

.params
  margin-top: 0.4rem
  label
    display: block
    font-size: 0.66rem
    text-transform: uppercase
    letter-spacing: 0.3px
    color: $grey
    margin: 0.4rem 0 0.2rem

// ── Realized sample / picker ──
.search
  margin: 0.4rem 0

.blob-list
  max-height: 200px
  overflow-y: auto
  border: 1px solid rgba(255, 255, 255, 0.08)
  border-radius: 4px

.blob-row
  display: flex
  align-items: center
  gap: 0.4rem
  padding: 0.25rem 0.4rem
  font-size: 0.72rem
  border-bottom: 1px solid rgba(255, 255, 255, 0.05)
  &:last-child
    border-bottom: none
  &.picked
    background: rgba(78, 204, 163, 0.12)

  .b-name
    font-weight: 600
    color: $grey-lighter
    white-space: nowrap

  .b-meta
    color: $grey
    flex: 1
    min-width: 0
    overflow: hidden
    text-overflow: ellipsis
    white-space: nowrap

  .action-btn.del
    cursor: pointer
    color: $grey
    display: inline-flex
    &:hover
      color: #e74c3c

.list-empty
  padding: 0.6rem
  font-size: 0.72rem
  color: $grey
  text-align: center

.list-overflow
  font-size: 0.66rem
  color: $grey
  margin-top: 0.3rem
  text-align: center

// ── shared ──
.survey-btn
  display: inline-flex
  align-items: center
  justify-content: center
  gap: 0.35rem
  width: 100%
  padding: 0.45rem
  margin-top: 0.4rem
  border: 1px solid rgba(255, 255, 255, 0.2)
  border-radius: 5px
  background: rgba(255, 255, 255, 0.06)
  color: $grey-lighter
  font-size: 0.78rem
  font-family: inherit
  cursor: pointer
  transition: all 0.15s
  &:hover
    background: rgba(255, 255, 255, 0.12)
  &:disabled
    opacity: 0.4
    cursor: not-allowed
  &.primary
    background: $primary
    border-color: $primary
    color: #fff
    &:hover
      filter: brightness(1.1)
  &.add-btn
    border-style: dashed

.info-item
  display: flex
  justify-content: space-between
  padding: 0.2rem 0
  .info-label
    color: $grey
  .info-value
    color: $grey-lighter
    font-weight: 600

.dist
  margin-bottom: 0.5rem

  .dist-row
    display: flex
    align-items: center
    gap: 0.4rem
    margin-bottom: 0.25rem
    font-size: 0.7rem

  .dist-key
    width: 90px
    color: $grey-light
    white-space: nowrap
    overflow: hidden
    text-overflow: ellipsis

  .dist-bar
    flex: 1
    height: 8px
    background: rgba(255, 255, 255, 0.08)
    border-radius: 4px
    overflow: hidden

  .dist-fill
    display: block
    height: 100%
    background: $primary

  .dist-val
    width: 28px
    text-align: right
    color: $grey-lighter

.results-divider
  border-top: 1px solid rgba(255, 255, 255, 0.1)
  margin: 0.6rem 0 0.4rem

// ── Ergebnis-Datentabelle ──
.data-table-wrap
  margin-top: 0.4rem
  max-height: 240px
  overflow: auto
  border: 1px solid rgba(255, 255, 255, 0.1)
  border-radius: 4px

.data-table
  width: 100%
  border-collapse: collapse
  font-size: 0.68rem
  white-space: nowrap

  th
    position: sticky
    top: 0
    background: #1a1a1a
    color: $grey
    font-weight: 600
    text-align: left
    padding: 0.25rem 0.45rem
    border-bottom: 1px solid rgba(255, 255, 255, 0.15)

  td
    padding: 0.2rem 0.45rem
    color: $grey-lighter
    border-bottom: 1px solid rgba(255, 255, 255, 0.05)
    &.idx
      color: $grey

  tbody tr:last-child td
    border-bottom: none

.demo-block
  margin-top: 0.6rem

.progress-line
  margin-top: 0.5rem
  font-size: 0.8rem
  color: $grey-light

.error-banner
  margin-top: 0.5rem
  padding: 0.4rem 0.5rem
  background: rgba(231, 76, 60, 0.15)
  border: 1px solid rgba(231, 76, 60, 0.4)
  border-radius: 4px
  color: #e74c3c
  font-size: 0.72rem

// ── Wahrheit (Gott-Perspektive) ──
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

.survey-input.has-error
  border-color: #e74c3c

.truth-item
  border: 1px solid rgba(255, 255, 255, 0.1)
  border-radius: 6px
  padding: 0.5rem
  margin-bottom: 0.6rem

.truth-head
  display: flex
  align-items: center
  gap: 0.4rem
  .item-num
    font-weight: 700
    color: $grey

.truth-construct
  margin-left: auto
  font-size: 0.68rem
  color: $primary

.truth-text
  font-size: 0.72rem
  color: $grey-light
  margin: 0.25rem 0 0.5rem

.tse-chain
  margin-bottom: 0.4rem

.tse-row
  display: flex
  align-items: center
  gap: 0.4rem
  margin-bottom: 0.3rem
  font-size: 0.7rem

.tse-label
  width: 132px
  color: $grey-light
  white-space: nowrap
  overflow: hidden
  text-overflow: ellipsis

.tse-axis
  flex: 1
  position: relative
  height: 10px
  background: rgba(255, 255, 255, 0.07)
  border-radius: 5px

.tse-dot
  position: absolute
  top: 50%
  width: 10px
  height: 10px
  border-radius: 50%
  transform: translate(-50%, -50%)
  &.truth
    background: $primary
  &.est
    background: #e67e22

.tse-val
  min-width: 38px
  text-align: right
  color: $grey-lighter
  white-space: nowrap

.tse-deltas
  border-top: 1px dashed rgba(255, 255, 255, 0.12)
  padding-top: 0.35rem
  margin-bottom: 0.3rem

.tse-delta
  display: flex
  justify-content: space-between
  font-size: 0.7rem
  padding: 0.1rem 0
  .tse-delta-label
    color: $grey
  .tse-delta-val
    font-weight: 600
    &.pos
      color: #e67e22
    &.neg
      color: #3498db
    &.neutral
      color: $grey-light
  &.total
    border-top: 1px solid rgba(255, 255, 255, 0.12)
    margin-top: 0.2rem
    padding-top: 0.25rem
    .tse-delta-label
      color: $grey-lighter

.sim-hist
  margin-top: 0.4rem

.hist-bars
  position: relative
  display: flex
  align-items: flex-end
  gap: 1px
  height: 56px
  background: rgba(255, 255, 255, 0.04)
  border-radius: 4px
  padding: 2px
  overflow: hidden

.hist-bar
  flex: 1
  background: rgba(78, 204, 163, 0.55)
  border-radius: 1px 1px 0 0
  min-height: 1px

.hist-truth
  position: absolute
  top: 0
  bottom: 0
  width: 2px
  background: #e67e22

.hist-meta
  display: flex
  gap: 0.8rem
  font-size: 0.66rem
  color: $grey
  margin-top: 0.2rem

.sim-controls
  margin-bottom: 0.4rem
  label
    display: block
    font-size: 0.7rem
    color: $grey-light
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

.dispo-row
  display: flex
  flex-wrap: wrap
  gap: 0.5rem
  margin: 0.25rem 0
  .dispo
    font-size: 0.68rem
    color: $grey
    border: 1px solid rgba(255, 255, 255, 0.15)
    border-radius: 999px
    padding: 0.05rem 0.45rem

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
    font-size: 0.72rem
    color: $grey-light
  .action-btn.del
    cursor: pointer
    color: $grey
    display: inline-flex
    &:hover
      color: #e74c3c

.wave-chips
  display: flex
  gap: 0.3rem
  margin-bottom: 0.5rem

.change-card
  border-color: rgba(78, 204, 163, 0.35)
</style>
