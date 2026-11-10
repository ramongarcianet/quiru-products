<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import OdontogramV2 from '../../components/odontogram-ai/OdontogramV2.vue'
import SessionFindings from '../../components/odontogram-ai/SessionFindings.vue'
import AiClinicalTools from '../../components/odontogram-ai/AiClinicalTools.vue'
import { isConversationalOdontogramEnabled } from '../../config/conversationalOdontogram'
import { NTS188_SYMBOLS } from '../../domain/nts188/NTS188SymbolCatalog'
import { TOOTH_SURFACES, VALID_FDI_TEETH } from '../../domain/nts188/NTS188RulesEngine'
import { quiruLiveErrorMessage, startQuiruOdontogramLive } from '../../services/quiruOdontogramLive'
import { useConversationalOdontogram } from '../../stores/useConversationalOdontogram'
import { item as patient, leer as readPatient } from '../../store/paciente'
import { miUsuario, voiceAccessEnabled } from '../../store/sesion'
import { detenerVoz } from '../../store/odontograma'

const route = useRoute()
const router = useRouter()
const userId = miUsuario()?.uid || ''
const patientId = String(route.params.idPaciente || '')
const enabled = isConversationalOdontogramEnabled(userId)
const authorized = ref(false)
const loading = ref(true)
const loadError = ref('')
const voiceState = ref('idle')
const voiceError = ref('')
const liveController = ref(null)
const voiceStartedAt = ref(null)
const summary = ref(null)
let completionTimer = null
const selectedFinding = ref('CARIES')
const cariesType = ref('DENTIN')
const surface = ref('OCCLUSAL')
const absenceReason = ref('')
const selectedCode = ref('')
const selectedCondition = ref('GOOD')
const secondTooth = ref('')
const returningToPatients = ref(false)

const session = useConversationalOdontogram({ patientId, userId })
const patientName = computed(() => [patient.value?.nombre, patient.value?.apellidoPaterno, patient.value?.apellidoMaterno].filter(Boolean).join(' '))
const patientAge = computed(() => {
  if (!patient.value?.fechaNacimiento) return null
  const birth = new Date(patient.value.fechaNacimiento)
  if (Number.isNaN(birth.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  if (today < new Date(today.getFullYear(), birth.getMonth(), birth.getDate())) age -= 1
  return age
})
const surfaces = Object.entries(TOOTH_SURFACES).map(([value, data]) => ({ value, label: data.label }))
const selectedSymbol = computed(() => NTS188_SYMBOLS.find(item => item.key === selectedFinding.value))
const requiresCondition = computed(() => selectedSymbol.value?.color === 'STATE')
const requiresSurface = computed(() => !['CARIES', 'TOOTH_ABSENT'].includes(selectedFinding.value)
  && ['SURFACE_FILL', 'SURFACE_OUTLINE', 'FISSURE_LINE', 'WORN_SURFACE'].includes(selectedSymbol.value?.renderer))
const requiresSecondTooth = computed(() => ['ORTHO_FIXED', 'ORTHO_REMOVABLE', 'INVERTED_PARENTHESES', 'DOUBLE_CIRCLE', 'BRIDGE', 'DOUBLE_ARCH_LINE', 'CROSSED_ARROWS'].includes(selectedSymbol.value?.renderer))
const availableCodes = computed(() => selectedSymbol.value?.codes || [])
const manualReady = computed(() => Boolean(session.highlightedTooth.value)
  && (!requiresSecondTooth.value || Boolean(secondTooth.value))
  && (!availableCodes.value.length || Boolean(selectedCode.value) || ['CARIES', 'TOOTH_ABSENT'].includes(selectedFinding.value)))

watch(selectedFinding, () => {
  selectedCode.value = selectedSymbol.value?.codes?.length === 1 ? selectedSymbol.value.codes[0] : ''
  selectedCondition.value = 'GOOD'
  secondTooth.value = ''
  absenceReason.value = ''
})
function diagnosisDate(value) {
  const raw = value?.toDate?.() || value
  const date = raw ? new Date(raw) : null
  return date && !Number.isNaN(date.getTime())
    ? new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short' }).format(date)
    : 'sin fecha'
}

function diagnosisLabel(diagnosis, index) {
  const number = session.diagnoses.value.length - index
  const state = diagnosis.status === 'COMPLETED' ? 'Finalizado' : 'En curso'
  return `Diagnóstico ${number} · ${diagnosisDate(diagnosis.updatedAt || diagnosis.createdAt)} · ${(diagnosis.findings || []).length} hallazgo(s) · ${state}`
}

onMounted(async () => {
  try {
    if (!enabled || !patientId || !userId) return
    await readPatient(patientId)
    authorized.value = patient.value?.idOdontologo === userId && patient.value?.estado !== false
    if (authorized.value) {
      const result = await session.loadPersistedSession()
      if (!result.success) loadError.value = result.error
    }
  } catch (error) {
    console.error('No se pudo cargar la atención con QUIRU AI:', error)
    loadError.value = 'No se pudo cargar la atención. Verifica tu conexión e inténtalo nuevamente.'
  } finally {
    loading.value = false
  }
})

onBeforeUnmount(async () => {
  if (completionTimer) clearTimeout(completionTimer)
  await stopVoice('route-change')
  await session.abandonSession()
})

function showCompletion(result) {
  summary.value = result
  if (completionTimer) clearTimeout(completionTimer)
  completionTimer = setTimeout(() => {
    summary.value = null
    completionTimer = null
  }, 3000)
}

function selectTooth(tooth) {
  session.highlightedTooth.value = tooth
  session.record('click')
}

function addManualPreview() {
  session.record('click')
  const base = { tooth: session.highlightedTooth.value, finding: selectedFinding.value }
  if (selectedFinding.value === 'CARIES') Object.assign(base, { cariesType: cariesType.value, surface: surface.value })
  if (selectedFinding.value === 'TOOTH_ABSENT') Object.assign(base, { absenceReason: absenceReason.value })
  if (!['CARIES', 'TOOTH_ABSENT'].includes(selectedFinding.value)) {
    Object.assign(base, {
      ntsCode: selectedCode.value || null,
      condition: requiresCondition.value ? selectedCondition.value : null,
      surface: requiresSurface.value ? surface.value : null,
      secondTooth: requiresSecondTooth.value ? Number(secondTooth.value) : null
    })
  }
  session.previewFinding(base, 'MANUAL')
}

function plainResult(result) {
  if (!result) return { success: false }
  if (result.valid === false) return { success: false, valid: false, errors: result.errors, status: result.status }
  if (result.preview) return { success: true, valid: true, preview: {
    tooth: result.preview.tooth, secondTooth: result.preview.secondTooth, teeth: result.preview.teeth,
    findingLabel: result.preview.findingLabel, ntsCode: result.preview.ntsCode,
    condition: result.preview.condition, surfaceLabel: result.preview.surfaceLabel,
    description: result.preview.description
  } }
  return result
}

async function startVoice() {
  if (session.isDiagnosisReadOnly.value) {
    session.assistantMessage.value = 'Este diagnóstico está finalizado y es de solo lectura. Genera uno nuevo para continuar.'
    return
  }
  voiceError.value = ''
  try {
    // Garantiza que el reconocedor heredado de Odontograma no conserve el micrófono.
    detenerVoz()
    session.record('ai')
    liveController.value = await startQuiruOdontogramLive({
      onState: (state, reason) => {
        if (state === 'listening' && !voiceStartedAt.value) voiceStartedAt.value = Date.now()
        if (state === 'idle' && voiceStartedAt.value) {
          session.metrics.value.liveSeconds += Math.round((Date.now() - voiceStartedAt.value) / 1000)
          voiceStartedAt.value = null
        }
        voiceState.value = state
        if (reason === 'inactivity') session.assistantMessage.value = 'Sesión de voz cerrada por inactividad. Puedes continuar manualmente.'
        if (reason === 'maximum-duration') session.assistantMessage.value = 'Se alcanzó el límite de voz. Puedes continuar manualmente.'
      },
      onToolCall: () => session.record('tool'),
      onVoiceTurn: () => session.record('voice'),
      onAiRequest: () => session.record('ai'),
      onSoundStart: () => {
        session.assistantMessage.value = 'Te escucho…'
      },
      onInterimTranscript: transcript => {
        session.assistantMessage.value = `Escuchando: “${transcript}”…`
      },
      onTranscript: transcript => {
        session.assistantMessage.value = `Te escuché: “${transcript}”. Procesando…`
      },
      onError: message => {
        voiceError.value = message
        session.assistantMessage.value = `${message} Puedes continuar manualmente.`
      },
      preview: findings => ({ results: findings.map(finding => plainResult(session.previewFinding(finding, 'VOICE'))) }),
      correct: args => plainResult(session.correctPending(args)),
      confirm: () => session.confirmPending(),
      undo: () => session.undoPending(),
      summary: () => ({ success: true, ...session.sessionSummary() }),
      finish: async () => {
        const result = await session.finishSession()
        if (result.success) showCompletion(result)
        return result
      }
    })
    session.assistantMessage.value = 'Micrófono activo. Habla ahora.'
  } catch (error) {
    voiceError.value = quiruLiveErrorMessage(error)
    voiceState.value = 'error'
    session.assistantMessage.value = `${voiceError.value} Puedes continuar manualmente.`
  }
}

async function stopVoice(reason = 'user') {
  const controller = liveController.value
  liveController.value = null
  if (controller) await controller.stop(reason)
  voiceState.value = 'idle'
}

async function confirm() {
  session.record('click')
  await session.confirmPending()
}

async function finish() {
  session.record('click')
  const result = await session.finishSession()
  if (!result.success) return
  showCompletion(result)
  await stopVoice('finished')
}

async function changeDiagnosis(event) {
  const previousId = session.selectedDiagnosisId.value || ''
  const result = session.selectDiagnosis(event.target.value)
  if (!result.success) event.target.value = previousId
  else {
    summary.value = null
    if (session.isDiagnosisReadOnly.value) await stopVoice('read-only-diagnosis')
  }
}

function generateNewDiagnosis() {
  if (session.pendingFindings.value.length) {
    session.beginNewDiagnosis()
    return
  }
  if (session.selectedDiagnosisId.value && !window.confirm('Se preparará un diagnóstico nuevo. El diagnóstico seleccionado conservará sus hallazgos. ¿Deseas continuar?')) return
  session.record('click')
  const result = session.beginNewDiagnosis()
  if (result.success) summary.value = null
}

function returnToPatients() {
  if (returningToPatients.value) return
  returningToPatients.value = true
  const target = router.resolve({ name: 'pacientes' })
  void stopVoice('return-to-patients').catch(error => {
    console.error('No se pudo detener la voz al salir de la atención.', error)
  })
  window.location.assign(target.href)
}
</script>

<template lang="pug">
.ai-attention
  .state-card(v-if="loading") Cargando atención…
  .state-card(v-else-if="!enabled")
    h1 Atención con QUIRU AI no habilitada
    p Esta función experimental no está habilitada para tu usuario.
    button.btn.btn-outline-primary(type="button" :disabled='returningToPatients' @click='returnToPatients') Volver a pacientes
  .state-card(v-else-if="loadError" role="alert")
    h1 No se pudo cargar la atención
    p {{ loadError }}
    button.btn.btn-outline-primary(type="button" :disabled='returningToPatients' @click='returnToPatients') Volver a pacientes
  .state-card(v-else-if="!authorized")
    h1 No se puede abrir este paciente
    p No tienes permisos para acceder a esta atención.
    button.btn.btn-outline-primary(type="button" :disabled='returningToPatients' @click='returnToPatients') Volver a pacientes
  template(v-else)
    header.patient-header
      div
        span.eyebrow Flujo experimental
        h1 Atención con QUIRU AI
        p.mb-0
          strong {{ patientName }}
          span(v-if="patientAge !== null")  · {{ patientAge }} años
          span  · {{ patient.tipoDocumento }} {{ patient.numeroDocumento }}
      button.btn.btn-outline-secondary(type="button" :disabled='returningToPatients' @click='returnToPatients')
        i.bi.bi-arrow-left.me-2
        | Pacientes

    .diagnosis-toolbar
      label.diagnosis-picker
        span Diagnóstico visualizado
        select.form-select(:value="session.selectedDiagnosisId.value || ''" :disabled="session.busy.value || !session.diagnoses.value.length" @change="changeDiagnosis")
          option(v-if="!session.selectedDiagnosisId.value" value="") Nuevo diagnóstico (sin guardar)
          option(v-if="!session.diagnoses.value.length && session.selectedDiagnosisId.value" value="") Sin diagnósticos registrados
          option(v-for="(diagnosis, index) in session.diagnoses.value" :key="diagnosis.id" :value="diagnosis.id") {{ diagnosisLabel(diagnosis, index) }}
      button.btn.btn-primary(type="button" :disabled="session.busy.value" @click="generateNewDiagnosis")
        i.bi.bi-plus-circle.me-2
        | Generar nuevo diagnóstico

    .completion(v-if="summary")
      i.bi.bi-check-circle-fill
      div
        h2 Atención finalizada
        p.mb-0 {{ summary.persisted }} hallazgo(s) · {{ summary.corrections }} corrección(es) · {{ summary.durationSeconds }} s

    .workspace(v-else)
      main.clinical-area
        .section-heading
          div
            span.eyebrow Odontograma V2
            h2 Registro visual
          span.legend
            i.pending-dot
            | Pendiente
            i.persisted-dot
            | Confirmado
        OdontogramV2(:findings="session.findings.value" :selected-tooth="session.highlightedTooth.value" @select-tooth="selectTooth")

        .read-only-notice(v-if="session.isDiagnosisReadOnly.value")
          i.bi.bi-lock-fill
          div
            strong Diagnóstico finalizado
            p.mb-0 Los hallazgos pueden consultarse, pero ya no pueden modificarse. Genera un diagnóstico nuevo para continuar.
        .manual-card(v-else)
          .manual-title
            h2 Registro manual
            span Selecciona una pieza en el odontograma
          .manual-grid
            label
              span Hallazgo
              select.form-select(v-model="selectedFinding")
                option(v-for="symbol in NTS188_SYMBOLS" :key="symbol.key" :value="symbol.key") 6.1.{{ symbol.number }} · {{ symbol.label }}
            label(v-if="selectedFinding === 'CARIES'")
              span Clasificación NTS
              select.form-select(v-model="cariesType")
                option(value="WHITE_SPOT") MB · Mancha blanca
                option(value="ENAMEL") CE · Esmalte
                option(value="DENTIN") CD · Dentina
                option(value="PULP") CDP · Compromiso pulpar
            label(v-if="selectedFinding === 'CARIES'")
              span Superficie
              select.form-select(v-model="surface")
                option(v-for="option in surfaces" :key="option.value" :value="option.value") {{ option.label }}
            label(v-if="selectedFinding === 'TOOTH_ABSENT'")
              span Motivo NTS
              select.form-select(v-model="absenceReason")
                option(value="" disabled) Selecciona el motivo
                option(value="NOT_ERUPTED") DNE · No erupcionado
                option(value="EXTRACTION_CARIES") DEX · Extracción por experiencia de caries
                option(value="OTHER") DAO · Otra razón no relacionada con caries
            label(v-if="!['CARIES', 'TOOTH_ABSENT'].includes(selectedFinding) && availableCodes.length")
              span Sigla normativa
              select.form-select(v-model="selectedCode")
                option(value="" disabled) Selecciona la sigla
                option(v-for="code in availableCodes" :key="code" :value="code") {{ code }}
            label(v-if="requiresCondition")
              span Estado
              select.form-select(v-model="selectedCondition")
                option(value="GOOD") Buen estado · azul
                option(value="BAD") Mal estado · rojo
            label(v-if="requiresSurface")
              span Superficie
              select.form-select(v-model="surface")
                option(v-for="option in surfaces" :key="option.value" :value="option.value") {{ option.label }}
            label(v-if="requiresSecondTooth")
              span Segunda pieza / extensión
              select.form-select(v-model="secondTooth")
                option(value="" disabled) Selecciona una pieza
                option(v-for="tooth in VALID_FDI_TEETH" :key="tooth" :value="tooth" :disabled="tooth === session.highlightedTooth.value") Pieza {{ tooth }}
            button.btn.btn-primary(type="button" :disabled="!manualReady" @click="addManualPreview") Vista previa

        SessionFindings(:findings="session.findings.value")

      aside.quiru-panel
        .quiru-brand
          span.sparkle ✦
          div
            h2 QUIRU AI
            span(v-if="voiceAccessEnabled" :class="`voice-${voiceState}`") {{ voiceState === 'listening' ? 'Escuchando' : voiceState === 'connecting' ? 'Conectando' : 'Disponible' }}
        p.assistant-message {{ session.assistantMessage.value }}
        p.alert.alert-danger.py-2(v-if="session.error.value || (voiceAccessEnabled && voiceError)" role="alert") {{ session.error.value || voiceError }}

        .read-only-voice(v-if="voiceAccessEnabled && session.isDiagnosisReadOnly.value")
          i.bi.bi-lock-fill.me-2
          | Registro finalizado · solo lectura
        .voice-start(v-else-if="voiceAccessEnabled && voiceState !== 'listening' && voiceState !== 'connecting'")
          p Puedes registrar hallazgos utilizando voz o interactuando directamente con el odontograma.
          button.btn.btn-primary.w-100(type="button" @click="startVoice")
            i.bi.bi-mic-fill.me-2
            | Iniciar asistencia por voz
          small Continuar manualmente siempre está disponible.
        button.btn.btn-outline-primary.w-100(v-else-if="voiceAccessEnabled" type="button" @click="stopVoice('user')")
          i.bi.bi-pause-fill.me-2
          | Pausar voz

        .pending-card(v-if="session.pendingFindings.value.length")
          strong Pendiente de confirmación
          ul
            li(v-for="finding in session.pendingFindings.value" :key="finding.id") Pieza {{ finding.tooth }} · {{ finding.ntsCode }} {{ finding.surfaceLabel || '' }}
          .actions
            button.btn.btn-success(type="button" :disabled="session.busy.value" @click="confirm")
              i.bi.bi-check-lg.me-1
              | Confirmar
            button.btn.btn-outline-secondary(type="button" :disabled="session.busy.value" @click="session.undoPending()")
              i.bi.bi-arrow-counterclockwise.me-1
              | Deshacer

        button.btn.btn-outline-danger.w-100.mt-auto(v-if="!session.isDiagnosisReadOnly.value" type="button" @click="finish") Finalizar atención

    AiClinicalTools(
      :patient="patient"
      :findings="session.findings.value"
      :diagnosis="session.selectedDiagnosis.value"
      :readonly="session.isDiagnosisReadOnly.value"
      :busy="session.busy.value"
      :on-save="session.saveClinicalDetails"
    )

</template>

<style lang="sass" scoped>
.ai-attention
  --ai-purple: #6d5ce7
  min-height: calc(100vh - 5rem)
  padding: 1rem
  background: #f5f8fc
.patient-header
  display: flex
  align-items: center
  justify-content: space-between
  margin-bottom: 1rem
  padding: 1rem 1.25rem
  border: 1px solid #dce6f3
  border-radius: 18px
  background: white
.diagnosis-toolbar
  display: flex
  align-items: flex-end
  gap: 1rem
  margin-bottom: 1rem
  padding: 1rem 1.25rem
  border: 1px solid #dce6f3
  border-radius: 18px
  background: white
.diagnosis-picker
  display: grid
  flex: 1
  gap: .35rem
  span
    color: #53657d
    font-size: .8rem
    font-weight: 700
  h1
    margin: .2rem 0
    color: #102a56
    font-size: 1.55rem
.eyebrow
  color: var(--ai-purple)
  font-size: .72rem
  font-weight: 800
  letter-spacing: .08em
  text-transform: uppercase
.workspace
  display: grid
  grid-template-columns: minmax(0, 1fr) 330px
  gap: 1rem
.clinical-area
  display: grid
  min-width: 0
  gap: 1rem
.section-heading
  display: flex
  justify-content: space-between
  align-items: end
  h2
    margin: .15rem 0 0
    color: #102a56
    font-size: 1.2rem
.legend
  display: flex
  align-items: center
  gap: .35rem
  color: #617087
  font-size: .75rem
.pending-dot, .persisted-dot
  width: .65rem
  height: .65rem
  margin-left: .4rem
  border-radius: 50%
.pending-dot
  background: #8b5cf6
.persisted-dot
  background: #2563eb
.manual-card, .quiru-panel, .state-card, .completion
  border: 1px solid #dce6f3
  border-radius: 18px
  background: white
.read-only-notice
  display: flex
  align-items: flex-start
  gap: .75rem
  padding: 1rem
  border: 1px solid #b9c7d9
  border-radius: 18px
  background: #eef3f8
  color: #3c4d63
  i
    margin-top: .15rem
.read-only-voice
  padding: .85rem
  border-radius: 12px
  background: #eef3f8
  color: #53657d
  font-weight: 700
.manual-card
  padding: 1rem
.manual-title
  display: flex
  justify-content: space-between
  align-items: center
  h2
    margin: 0
    color: #102a56
    font-size: 1rem
  span
    color: #68758a
    font-size: .78rem
.manual-grid
  display: grid
  grid-template-columns: repeat(4, minmax(0, 1fr)) auto
  align-items: end
  margin-top: .8rem
  gap: .65rem
  label > span
    display: block
    margin-bottom: .3rem
    color: #526179
    font-size: .72rem
    font-weight: 700
.quiru-panel
  position: sticky
  top: 1rem
  display: flex
  flex-direction: column
  min-height: 620px
  padding: 1.1rem
.quiru-brand
  display: flex
  align-items: center
  gap: .7rem
  h2
    margin: 0
    color: #102a56
    font-size: 1.15rem
  span:not(.sparkle)
    color: #65738a
    font-size: .72rem
.sparkle
  display: grid
  width: 2.5rem
  height: 2.5rem
  place-items: center
  border-radius: 12px
  color: white
  background: linear-gradient(135deg, #6d5ce7, #3b82f6)
  font-size: 1.3rem
.assistant-message
  min-height: 4.5rem
  margin: 1rem 0
  padding: .85rem
  border-radius: 12px
  background: #f4f1ff
  color: #2d2463
.voice-start
  display: grid
  gap: .65rem
  small
    color: #6b7890
.pending-card
  margin-top: 1rem
  padding: .85rem
  border: 1px solid #d9d0ff
  border-radius: 12px
  background: #fbf9ff
  ul
    margin: .6rem 0
    padding-left: 1.2rem
  .actions
    display: flex
    gap: .5rem
.completion
  display: flex
  align-items: center
  padding: 2rem
  gap: 1rem
  i
    color: #16a34a
    font-size: 2rem
  h2
    margin: 0 0 .25rem
    color: #102a56
.state-card
  max-width: 620px
  margin: 4rem auto
  padding: 2rem
  text-align: center

@media (max-width: 1100px)
  .workspace
    grid-template-columns: 1fr
  .quiru-panel
    position: static
    min-height: auto
  .manual-grid
    grid-template-columns: repeat(2, 1fr)

@media (max-width: 600px)
  .ai-attention
    padding: .5rem
  .patient-header
    align-items: flex-start
    flex-direction: column
    gap: .75rem
  .diagnosis-toolbar
    align-items: stretch
    flex-direction: column
  .manual-grid
    grid-template-columns: 1fr
</style>
