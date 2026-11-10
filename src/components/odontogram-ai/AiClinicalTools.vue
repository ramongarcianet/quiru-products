<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import OdontogramV2 from './OdontogramV2.vue'
import { progressFile } from '../../store/storage'
import { buildTreatmentAppointments, mergeFindingsIntoTreatmentPlan } from '../../domain/clinical/treatmentPlan'
import { guardarCita } from '../../store/citas'
import { obtenerTodos as obtenerPrecios, registro as catalogoTratamientos } from '../../store/precios'

const props = defineProps({
  patient: { type: Object, default: () => ({}) },
  findings: { type: Array, default: () => [] },
  diagnosis: { type: Object, default: null },
  readonly: Boolean,
  busy: Boolean,
  onSave: { type: Function, required: true }
})

const router = useRouter()
const { push } = router
let detenerCatalogo = () => {}

const activeDialog = ref('')
const feedback = ref('')
const feedbackIsError = ref(false)
const saving = ref(false)
const attendingPlanIndex = ref(-1)
const additionalData = reactive({ especificaciones: '', observaciones: '', receta: '', archivos: [] })
const selectedFiles = ref([])
const treatmentPlan = ref([])
const storedFiles = computed(() => Array.isArray(additionalData.archivos) ? additionalData.archivos : [])
const treatmentOptions = computed(() => catalogoTratamientos.value
  .filter(treatment => treatment.activo !== false)
  .map(treatment => ({
    ...treatment,
    nombre: treatment.nombre || treatment.tipo || '',
    precio: Number(treatment.precio || 0),
  }))
  .filter(treatment => treatment.nombre))

onMounted(() => { detenerCatalogo = obtenerPrecios() })
onUnmounted(() => detenerCatalogo?.())

const patientName = computed(() => [props.patient?.nombre, props.patient?.apellidoPaterno, props.patient?.apellidoMaterno].filter(Boolean).join(' ') || 'Paciente sin nombre')
const documentLabel = computed(() => [props.patient?.tipoDocumento, props.patient?.numeroDocumento].filter(Boolean).join(' ') || 'No registrado')
const patientAge = computed(() => {
  if (!props.patient?.fechaNacimiento) return null
  const birth = new Date(props.patient.fechaNacimiento)
  if (Number.isNaN(birth.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  if (today < new Date(today.getFullYear(), birth.getMonth(), birth.getDate())) age -= 1
  return age
})
const reportDate = computed(() => new Intl.DateTimeFormat('es-PE', { dateStyle: 'long' }).format(new Date()))
const totalPlanPrice = computed(() => treatmentPlan.value.reduce((total, row) => total + sumTreatmentField(row, 'Precio'), 0))
const totalPlanPaid = computed(() => treatmentPlan.value.reduce((total, row) => total + sumTreatmentField(row, 'Acuenta'), 0))

const summaryRows = computed(() => {
  const groups = new Map()
  props.findings.forEach(finding => {
    const diagnosis = finding.description || finding.findingLabel || 'Hallazgo sin descripción'
    const key = `${finding.ntsCode || ''}|${diagnosis}`
    if (!groups.has(key)) groups.set(key, { code: finding.ntsCode || '—', diagnosis, teeth: new Set(), count: 0 })
    const row = groups.get(key)
    const teeth = Array.isArray(finding.teeth) ? finding.teeth : [finding.tooth]
    teeth.filter(Boolean).forEach(tooth => row.teeth.add(tooth))
    row.count += 1
  })
  return [...groups.values()].map(row => ({ ...row, teeth: [...row.teeth].join(', ') || '—' }))
})

function newPlannedTreatment(value = {}) {
  const treatment = value.Tratamiento
  return {
    ...value,
    Tratamiento: typeof treatment === 'string' ? treatment : treatment?.label || treatment?.value || '',
    Fecha: value.Fecha || '',
    Precio: Number(value.Precio || 0),
    Acuenta: Number(value.Acuenta || 0),
    Observacion: value.Observacion || value.observations || ''
  }
}

function newPlanRow(value = {}) {
  let treatments = Array.isArray(value.Tratamiento) ? value.Tratamiento.map(newPlannedTreatment) : []
  if (!treatments.length && (value.treatment || value.observations)) {
    treatments = [newPlannedTreatment({
      Tratamiento: value.treatment || '',
      Observacion: value.observations || ''
    })]
  }
  return {
    Pieza: value.Pieza ?? value.tooth ?? '',
    Diagnostico: value.Diagnostico || value.diagnosis || 'Sin diagnóstico',
    Atendido: value.Atendido === true,
    sourceFindingId: value.sourceFindingId || value.findingId || null,
    isManual: value.isManual === true,
    Tratamiento: treatments
  }
}

function emptyTreatment(finding = {}) {
  const teeth = Array.isArray(finding.teeth) ? finding.teeth : [finding.tooth]
  return newPlanRow({
    tooth: teeth.filter(Boolean).join(', '),
    diagnosis: [finding.ntsCode, finding.description || finding.findingLabel].filter(Boolean).join(' · '),
    sourceFindingId: finding.id || null
  })
}

function syncTreatmentPlanWithFindings() {
  treatmentPlan.value = mergeFindingsIntoTreatmentPlan(treatmentPlan.value, props.findings)
}

function sumTreatmentField(row, field) {
  return (row.Tratamiento || []).reduce((total, treatment) => total + Number(treatment?.[field] || 0), 0)
}

function amountRemaining(row) {
  return sumTreatmentField(row, 'Precio') - sumTreatmentField(row, 'Acuenta')
}

function addPlannedTreatment(row) {
  if (!Array.isArray(row.Tratamiento)) row.Tratamiento = []
  row.Tratamiento.push(newPlannedTreatment())
}

function applyCatalogTreatment(treatment) {
  const selectedName = String(treatment.Tratamiento || '').trim().toLocaleLowerCase('es')
  const selected = treatmentOptions.value.find(option => option.nombre.trim().toLocaleLowerCase('es') === selectedName)
  if (!selected) return
  treatment.Tratamiento = selected.nombre
  treatment.Precio = selected.precio
  treatment.catalogoId = selected.id
  treatment.Codigo = selected.codigo || ''
  treatment.Categoria = selected.categoria || ''
  treatment.Especialidad = selected.especialidad || ''
  treatment.DuracionMinutos = Number(selected.duracionMinutos || 0)
}

function removePlannedTreatment(row, index) {
  row.Tratamiento.splice(index, 1)
}

function addPlanRow() {
  treatmentPlan.value.unshift(newPlanRow({ isManual: true }))
}

function attendPlan(index) {
  attendingPlanIndex.value = index
  activeDialog.value = 'attend'
}

function hydrateClinicalData() {
  const saved = props.diagnosis?.additionalData || {}
  additionalData.especificaciones = saved.especificaciones || ''
  additionalData.observaciones = saved.observaciones || ''
  additionalData.receta = saved.receta || ''
  additionalData.archivos = Array.isArray(saved.archivos) ? [...saved.archivos] : []
  selectedFiles.value = []
  progressFile.value = 0
  treatmentPlan.value = Array.isArray(props.diagnosis?.treatmentPlan) ? props.diagnosis.treatmentPlan.map(newPlanRow) : []
  syncTreatmentPlanWithFindings()
  feedback.value = ''
  feedbackIsError.value = false
}

watch(() => props.diagnosis?.id, hydrateClinicalData, { immediate: true })
watch(() => props.findings, syncTreatmentPlanWithFindings, { deep: true })

function openDialog(name) {
  feedback.value = ''
  feedbackIsError.value = false
  if (name === 'plan') syncTreatmentPlanWithFindings()
  activeDialog.value = name
}

function closeDialog() {
  if (saving.value || props.busy) return
  if (activeDialog.value === 'additional') hydrateClinicalData()
  activeDialog.value = ''
  feedback.value = ''
  feedbackIsError.value = false
}

function goToPatients() {
  activeDialog.value = ''
  window.location.assign(router.resolve({ name: 'pacientes' }).href)
}

function handleFileSelection(event) {
  const acceptedFiles = []
  const rejectedFiles = []
  for (const file of Array.from(event.target.files || [])) {
    if (!['image/jpeg', 'image/png', 'application/pdf'].includes(file.type)) {
      rejectedFiles.push(`${file.name}: formato no admitido`)
    } else if (file.size > 4000000) {
      rejectedFiles.push(`${file.name}: supera el máximo de 4 MB`)
    } else {
      acceptedFiles.push(file)
    }
  }
  selectedFiles.value.push(...acceptedFiles)
  feedback.value = rejectedFiles.length
    ? `No se agregaron ${rejectedFiles.join('; ')}.`
    : ''
  feedbackIsError.value = rejectedFiles.length > 0
  event.target.value = ''
}

function removePendingFile(index) {
  selectedFiles.value.splice(index, 1)
}

async function deleteStoredFile(file) {
  if (props.readonly || saving.value || props.busy) return
  saving.value = true
  feedback.value = ''
  feedbackIsError.value = false
  try {
    const result = await props.onSave({
      additionalData: {
        especificaciones: additionalData.especificaciones,
        observaciones: additionalData.observaciones,
        receta: additionalData.receta
      },
      files: [],
      removedFiles: [file]
    })
    if (result?.success) {
      additionalData.archivos = [...(result.additionalData?.archivos || [])]
      feedback.value = result.warning || 'Archivo eliminado.'
    } else {
      feedback.value = result?.error || 'No se pudo eliminar el archivo.'
      feedbackIsError.value = true
    }
  } finally {
    saving.value = false
  }
}

async function persist(data, message) {
  if (props.readonly) return
  saving.value = true
  feedback.value = ''
  feedbackIsError.value = false
  try {
    const result = await props.onSave(data)
    if (result?.success) {
      if (result.additionalData) {
        additionalData.archivos = [...(result.additionalData.archivos || [])]
        selectedFiles.value = []
      }
      feedback.value = result.warning || message
    } else {
      feedback.value = result?.error || 'No se pudieron guardar los cambios.'
      feedbackIsError.value = true
    }
  } finally {
    saving.value = false
  }
}

const saveAdditionalData = () => persist({
  additionalData: {
    especificaciones: additionalData.especificaciones,
    observaciones: additionalData.observaciones,
    receta: additionalData.receta
  },
  files: [...selectedFiles.value]
}, 'Datos adicionales guardados.')
async function saveTreatmentPlan() {
  if (props.readonly) return
  saving.value = true
  feedback.value = ''
  feedbackIsError.value = false
  let planSaved = false
  try {
    buildTreatmentAppointments(
      treatmentPlan.value,
      props.patient?.id,
      props.diagnosis?.id || 'pending-session'
    )
    const result = await props.onSave({
      treatmentPlan: treatmentPlan.value.map(row => ({
        ...row,
        Tratamiento: row.Tratamiento.map(treatment => ({
          ...treatment,
          Resto: Number(treatment.Precio || 0) - Number(treatment.Acuenta || 0)
        }))
      }))
    })
    if (!result?.success) {
      feedback.value = result?.error || 'No se pudo guardar el plan de tratamiento.'
      feedbackIsError.value = true
      return
    }
    planSaved = true
    const appointments = buildTreatmentAppointments(
      treatmentPlan.value,
      props.patient?.id,
      result.sessionId || props.diagnosis?.id
    )
    for (const appointment of appointments) {
      await guardarCita(appointment, appointment.id)
    }
    feedback.value = appointments.length
      ? `Plan guardado. ${appointments.length} cita(s) de 30 minutos creadas o actualizadas en la agenda.`
      : 'Plan guardado. Asigna fecha y hora a los tratamientos para crear citas en la agenda.'
  } catch (error) {
    console.error('No se pudo guardar el plan de tratamiento o sus citas:', error)
    feedback.value = planSaved && error.message
      ? `El plan se guardó, pero no se pudieron guardar todas las citas: ${error.message}`
      : error.message || 'No se pudo completar el guardado del plan y sus citas.'
    feedbackIsError.value = true
  } finally {
    saving.value = false
  }
}
function openDatePicker(event) {
  if (typeof event.currentTarget.showPicker === 'function') event.currentTarget.showPicker()
}
function printClinicalRecord() {
  closeDialog()
  window.requestAnimationFrame(() => window.print())
}
</script>

<template lang="pug">
section.clinical-tools(aria-label='Herramientas clínicas de la atención')
  .tools-heading
    div
      span.eyebrow Continuidad clínica
      h2 Documentación de la atención
    small Utiliza los hallazgos y el gráfico del diagnóstico seleccionado
  .tools-grid
    button.tool-button(type='button' @click="openDialog('additional')")
      i.bi.bi-file-earmark-plus
      span
        strong Agregar
        small Datos adicionales
    button.tool-button(type='button' @click="openDialog('plan')")
      i.bi.bi-clipboard2-check
      span
        strong Generar
        small Planificar tratamiento
    button.tool-button(type='button' @click="openDialog('summary')")
      i.bi.bi-card-checklist
      span
        strong Resumen
        small Diagnóstico
    button.tool-button(type='button' @click='printClinicalRecord')
      i.bi.bi-printer
      span
        strong Imprimir
        small Ficha sanitaria / dental

  section.treatment-overview(aria-label='Resumen del plan de tratamiento')
    .treatment-overview-heading
      div
        h3 Plan de tratamiento
        small Pieza, diagnóstico y montos planificados
      button.btn.btn-primary(type='button' :disabled='readonly || busy || saving' @click="openDialog('plan')")
        i.bi.bi-list-ul.me-2
        | Planificar
    .summary-table-wrap(v-if='treatmentPlan.length')
      table.table.summary-table.treatment-summary-table
        thead
          tr
            th Pieza
            th Diagnóstico
            th Precio
            th A cuenta
            th Resto
            th Atender
        tbody
          tr(v-for='(row, index) in treatmentPlan' :key='`treatment-overview-${index}`')
            td {{ row.Pieza || '—' }}
            td {{ row.Diagnostico }}
            td {{ sumTreatmentField(row, 'Precio').toFixed(2) }}
            td {{ sumTreatmentField(row, 'Acuenta').toFixed(2) }}
            td {{ amountRemaining(row).toFixed(2) }}
            td
              button.btn.btn-outline-primary.btn-sm(
                type='button'
                :disabled='saving || busy'
                @click='attendPlan(index)'
              )
                i.bi.bi-journal-medical.me-1
                | Atender
          tr.treatment-total-row
            th(colspan='2') Total
            th {{ totalPlanPrice.toFixed(2) }}
            th {{ totalPlanPaid.toFixed(2) }}
            th {{ (totalPlanPrice - totalPlanPaid).toFixed(2) }}
            th
    p.empty-plan(v-else) Aún no hay tratamientos planificados.

Teleport(to='body')
  .clinical-overlay(v-if='activeDialog' @click.self='closeDialog')
    section.clinical-dialog(:class="{ wide: activeDialog !== 'additional' }" role='dialog' aria-modal='true')
      header
        div
          span.eyebrow Atención con QUIRU AI
          h2(v-if="activeDialog === 'additional'") Datos adicionales
          h2(v-else-if="activeDialog === 'plan'") Plan de tratamiento
          h2(v-else-if="activeDialog === 'attend'") Atender
          h2(v-else) Resumen de diagnóstico
        button.btn-close(type='button' aria-label='Cerrar' @click='closeDialog')

      .dialog-body.form-stack(v-if="activeDialog === 'additional'")
        p.readonly-message(v-if='readonly')
          i.bi.bi-lock-fill.me-2
          | Diagnóstico finalizado: información en modo consulta.
        label
          span Especificaciones
          textarea.form-control(v-model='additionalData.especificaciones' rows='4' :disabled='readonly')
        label
          span Observaciones
          textarea.form-control(v-model='additionalData.observaciones' rows='4' :disabled='readonly')
        label
          span Receta
          textarea.form-control(v-model='additionalData.receta' rows='4' :disabled='readonly')
        .attachment-picker
          label(for='ai-clinical-files') Adjuntar archivos
          input#ai-clinical-files.form-control(
            type='file'
            accept='image/jpeg,image/png,application/pdf'
            multiple
            :disabled='readonly || saving || busy'
            @change='handleFileSelection'
          )
          small Formatos permitidos: JPG, PNG y PDF. Máximo 4 MB por archivo.
          .progress(v-if='progressFile > 0' role='progressbar' :aria-valuenow='progressFile' aria-valuemin='0' aria-valuemax='100')
            .progress-bar(:style="{ width: `${progressFile}%` }") {{ progressFile.toFixed(0) }} %

        .attachments-list
          h3 Adjuntos guardados
          p(v-if='!storedFiles.length && !selectedFiles.length') No hay archivos adjuntos.
          table.table.table-hover(v-else)
            thead
              tr
                th Adjuntos
                th Tipo
                th
            tbody
              tr(
                v-for='(file, index) in storedFiles'
                :key='file'
              )
                StorageItem(:storageRef='file')
                td.attachment-action
                  BotonSeguro(
                    v-if='!saving && !busy && !readonly'
                    :onSuccess='() => deleteStoredFile(file)'
                  )
                    i.bi.bi-trash(aria-hidden='true')
                  span(v-else-if='saving || busy') Guardando…
              tr(v-for='(file, index) in selectedFiles' :key="`pending-${file.name}-${index}`")
                td(colspan='2')
                  i.bi.bi-paperclip.me-2
                  | {{ file.name }}
                  small.ms-2 Pendiente de guardar
                td.attachment-action
                  button.btn.btn-outline-secondary.btn-sm(
                    type='button'
                    :disabled='saving || busy'
                    :aria-label='`Quitar archivo ${file.name}`'
                    @click='removePendingFile(index)'
                  )
                    i.bi.bi-x-lg

      .dialog-body(v-else-if="activeDialog === 'plan'")
        p.readonly-message(v-if='readonly')
          i.bi.bi-lock-fill.me-2
          | Diagnóstico finalizado: plan en modo consulta.
        .d-flex.justify-content-between.align-items-center.mb-3
          h3.mb-0 Tratamientos planificados
          button.btn.btn-primary(v-if='!readonly' type='button' @click='addPlanRow')
            i.bi.bi-plus-circle.me-2
            | Agregar tratamiento
        .catalog-notice(v-if='!readonly && !treatmentOptions.length')
          i.bi.bi-info-circle
          span Aún no hay tratamientos activos en el catálogo.
          button.btn.btn-sm.btn-outline-primary(type='button' @click="push({ name: 'tratamientos' })") Registrar tratamientos
        p.empty-plan(v-if='!treatmentPlan.length') No hay diagnósticos para planificar. Agrega un tratamiento para comenzar.
        .plan-list
          article.plan-row(v-for='(row, index) in treatmentPlan' :key='index')
            label
              span Pieza
              input.form-control(v-model='row.Pieza' placeholder='Pieza' :disabled='readonly')
            label
              span Diagnóstico
              input.form-control(v-model='row.Diagnostico' placeholder='Diagnóstico' :disabled='readonly')
            .planned-treatment-list
              .planned-treatment-row(v-for='(treatment, treatmentIndex) in row.Tratamiento' :key='treatmentIndex')
                label
                  span Tratamiento
                  input.form-control(
                    v-model='treatment.Tratamiento'
                    :list='`ai-treatment-options-${index}-${treatmentIndex}`'
                    placeholder='Selecciona o escribe un tratamiento'
                    :disabled='readonly'
                    @input='applyCatalogTreatment(treatment)'
                  )
                  datalist(:id='`ai-treatment-options-${index}-${treatmentIndex}`')
                    option(
                      v-for='option in treatmentOptions'
                      :key='option.id'
                      :value='option.nombre'
                      :label='`${option.nombre} · S/ ${option.precio.toFixed(2)}`'
                    )
                label
                  span Fecha
                  input.form-control.treatment-date-input(
                    v-model='treatment.Fecha'
                    type='datetime-local'
                    :disabled='readonly'
                    @click='openDatePicker'
                  )
                label
                  span Precio
                  input.form-control(v-model.number='treatment.Precio' type='number' min='0' max='10000' step='0.01' :disabled='readonly')
                label
                  span A cuenta
                  input.form-control(v-model.number='treatment.Acuenta' type='number' min='0' max='10000' step='0.01' :disabled='readonly')
                label
                  span Resto
                  output {{ (Number(treatment.Precio || 0) - Number(treatment.Acuenta || 0)).toFixed(2) }}
                button.btn.btn-outline-danger(
                  v-if='!readonly'
                  type='button'
                  title='Quitar tratamiento'
                  :disabled='saving || busy'
                  @click='removePlannedTreatment(row, treatmentIndex)'
                )
                  i.bi.bi-trash
              button.btn.btn-outline-primary.btn-sm(
                v-if='!readonly'
                type='button'
                :disabled='saving || busy'
                @click='addPlannedTreatment(row)'
              )
                i.bi.bi-plus-lg.me-2
                | Agregar detalle

      .dialog-body(v-else-if="activeDialog === 'attend'")
        p.readonly-message(v-if='readonly')
          i.bi.bi-lock-fill.me-2
          | Diagnóstico finalizado: registro en modo consulta.
        template(v-if='treatmentPlan[attendingPlanIndex]')
          .attend-heading
            h3 Diagnóstico: {{ treatmentPlan[attendingPlanIndex].Diagnostico }}
            h3 Pieza: {{ treatmentPlan[attendingPlanIndex].Pieza || '—' }}
          .attend-treatment-list
            article.attend-treatment-row(
              v-for='(treatment, index) in treatmentPlan[attendingPlanIndex].Tratamiento'
              :key='index'
            )
              strong {{ treatment.Tratamiento || 'Tratamiento sin especificar' }}
              label
                span Comentarios
                textarea.form-control(
                  v-model='treatment.Observacion'
                  rows='2'
                  placeholder='Comentarios'
                  :disabled='readonly'
                )
          p.empty-plan(v-if='!(treatmentPlan[attendingPlanIndex].Tratamiento || []).length') No hay tratamientos agregados para atender.
        p.empty-plan(v-else) Selecciona un tratamiento válido.

      .dialog-body.summary-content(v-else)
        .patient-summary
          strong {{ patientName }}
          span {{ documentLabel }}
        OdontogramV2(:findings='findings')
        .summary-table-wrap
          table.table.summary-table
            thead
              tr
                th Código
                th Diagnóstico
                th Cantidad
                th Piezas
            tbody
              tr(v-for='row in summaryRows' :key='`${row.code}-${row.diagnosis}`')
                td {{ row.code }}
                td {{ row.diagnosis }}
                td {{ row.count }}
                td {{ row.teeth }}
              tr(v-if='!summaryRows.length')
                td(colspan='4') No hay hallazgos registrados en esta sesión.

      footer(v-if="activeDialog !== 'summary'")
        span(:class="{ error: feedbackIsError }") {{ feedback }}
        button.btn.btn-outline-secondary(type='button' @click='goToPatients')
          i.bi.bi-arrow-left.me-2
          | Pacientes
        button.btn.btn-secondary(type='button' @click='closeDialog') Cerrar
        button.btn.btn-primary(v-if="activeDialog === 'additional' && !readonly" type='button' :disabled='saving || busy' @click='saveAdditionalData') Guardar datos
        button.btn.btn-primary(v-if="['plan', 'attend'].includes(activeDialog) && !readonly" type='button' :disabled='saving || busy' @click='saveTreatmentPlan') Guardar plan
      footer(v-else)
        button.btn.btn-outline-secondary(type='button' @click='goToPatients')
          i.bi.bi-arrow-left.me-2
          | Pacientes
        button.btn.btn-primary(type='button' @click='printClinicalRecord')
          i.bi.bi-printer.me-2
          | Imprimir ficha

section.print-sheet(aria-hidden='true')
  header.print-header
    h1 FICHA DE IDENTIFICACIÓN SANITARIA / FICHA DENTAL
    p {{ reportDate }}
  .print-patient
    span
      strong Paciente: 
      | {{ patientName }}
    span
      strong Documento: 
      | {{ documentLabel }}
    span(v-if='patientAge !== null')
      strong Edad: 
      | {{ patientAge }} años
    span(v-if='patient?.sexo')
      strong Sexo: 
      | {{ patient.sexo }}
    span(v-if='patient?.fechaNacimiento')
      strong Fecha de nacimiento: 
      | {{ patient.fechaNacimiento }}
    span(v-if='patient?.Direccion || patient?.direccion')
      strong Dirección: 
      | {{ patient.Direccion || patient.direccion }}
    span
      strong Celular: 
      | {{ patient?.telefono || 'No registrado' }}
    span
      strong Correo: 
      | {{ patient?.email || 'No registrado' }}
  OdontogramV2(:findings='findings')
  h2 Resumen de diagnóstico
  table.table.summary-table
    thead
      tr
        th Código
        th Diagnóstico
        th Cantidad
        th Piezas
    tbody
      tr(v-for='row in summaryRows' :key='`print-${row.code}-${row.diagnosis}`')
        td {{ row.code }}
        td {{ row.diagnosis }}
        td {{ row.count }}
        td {{ row.teeth }}
  .print-additional(v-if='additionalData.especificaciones || additionalData.observaciones || additionalData.receta')
    h2 Datos adicionales
    p(v-if='additionalData.especificaciones')
      strong Especificaciones: 
      | {{ additionalData.especificaciones }}
    p(v-if='additionalData.observaciones')
      strong Observaciones: 
      | {{ additionalData.observaciones }}
    p(v-if='additionalData.receta')
      strong Receta e indicaciones: 
      | {{ additionalData.receta }}
  div(v-if='treatmentPlan.length')
    h2 Plan de tratamiento
    table.table.summary-table
      thead
        tr
          th Pieza
          th Diagnóstico
          th Tratamiento
          th Fecha
          th Precio
          th A cuenta
          th Resto
          th Comentarios
      tbody
        template(v-for='(row, index) in treatmentPlan' :key='`plan-print-${index}`')
          tr(v-for='(treatment, treatmentIndex) in row.Tratamiento' :key='`plan-print-${index}-${treatmentIndex}`')
            td {{ row.Pieza }}
            td {{ row.Diagnostico }}
            td {{ treatment.Tratamiento }}
            td {{ treatment.Fecha }}
            td {{ Number(treatment.Precio || 0).toFixed(2) }}
            td {{ Number(treatment.Acuenta || 0).toFixed(2) }}
            td {{ (Number(treatment.Precio || 0) - Number(treatment.Acuenta || 0)).toFixed(2) }}
            td {{ treatment.Observacion }}
</template>
<style lang="sass" scoped>
.clinical-tools
  margin-top: 1rem
  padding: 1.1rem
  border: 1px solid #dce6f3
  border-radius: 18px
  background: white
  box-shadow: 0 8px 24px rgba(34, 61, 92, .04)
.tools-heading
  display: flex
  align-items: flex-end
  justify-content: space-between
  gap: 1rem
  margin-bottom: .9rem
  h2
    margin: .15rem 0 0
    color: #102a56
    font-size: 1.15rem
  small
    color: #68758a
    text-align: right
.tools-grid
  display: grid
  grid-template-columns: repeat(4, minmax(0, 1fr))
  gap: .7rem
.tool-button
  display: flex
  min-height: 76px
  align-items: center
  gap: .75rem
  padding: .8rem
  border: 1px solid #dce6f3
  border-radius: 14px
  background: #fbfdff
  color: #17365f
  text-align: left
  transition: border-color .15s ease, background .15s ease, transform .15s ease
  &:hover
    transform: translateY(-1px)
    border-color: #8ca5c4
    background: #f3f7fc
  > i
    color: #4c5fd5
    font-size: 1.35rem
  span
    display: grid
    gap: .12rem
  strong
    font-size: .88rem
  small
    color: #65738a
    font-size: .75rem
.clinical-overlay
  position: fixed
  z-index: 6000
  inset: 0
  display: grid
  overflow-y: auto
  place-items: center
  padding: 1rem
  background: rgba(7, 27, 64, .68)
  backdrop-filter: blur(3px)
.clinical-dialog
  display: flex
  width: min(620px, 100%)
  max-height: calc(100vh - 2rem)
  flex-direction: column
  overflow: hidden
  border: 1px solid #dce6f3
  border-radius: 20px
  background: white
  box-shadow: 0 24px 70px rgba(7, 27, 64, .3)
  &.wide
    width: min(940px, 100%)
  > header, > footer
    display: flex
    align-items: center
    gap: .75rem
    padding: 1rem 1.25rem
  > header
    justify-content: space-between
    border-bottom: 1px solid #e2e9f2
    h2
      margin: .15rem 0 0
      color: #102a56
      font-size: 1.2rem
  > footer
    justify-content: flex-end
    border-top: 1px solid #e2e9f2
    span
      flex: 1
      color: #16834d
      font-size: .82rem
    span.error
      color: #b42318
.dialog-body
  overflow-y: auto
  padding: 1.25rem
.form-stack
  display: grid
  gap: .9rem
  label, .plan-row label
    display: grid
    gap: .35rem
    > span
      color: #526179
      font-size: .78rem
      font-weight: 700
.readonly-message
  margin: 0
  padding: .75rem
  border-radius: 10px
  background: #eef3f8
  color: #53657d
  font-size: .85rem
.attachment-picker
  display: grid
  gap: .35rem
  > label, h3
    margin: 0
    color: #526179
    font-size: .82rem
    font-weight: 700
  > small
    color: #68758a
    font-size: .75rem
.attachments-list
  overflow-x: auto
  h3
    margin: 0 0 .5rem
    color: #17365f
    font-size: .95rem
  > p
    margin: 0
    color: #68758a
    font-size: .82rem
  table
    margin: 0
  .attachment-action
    min-width: 112px
    text-align: right
.plan-list
  display: grid
  gap: .75rem
.catalog-notice
  display: flex
  align-items: center
  gap: .6rem
  margin-bottom: .75rem
  padding: .7rem .8rem
  border: 1px solid #cfe2f7
  border-radius: 10px
  color: #36516f
  background: #eef6ff
  font-size: .78rem
  button
    margin-left: auto
.plan-row
  display: grid
  gap: .75rem
  padding: .85rem
  border: 1px solid #e0e8f2
  border-radius: 12px
  > label
    display: grid
    gap: .35rem
    > span
      color: #526179
      font-size: .78rem
      font-weight: 700
.planned-treatment-list
  display: grid
  gap: .6rem
.planned-treatment-row
  display: grid
  grid-template-columns: minmax(150px, 2fr) repeat(4, minmax(90px, 1fr)) auto
  align-items: end
  gap: .6rem
  padding: .75rem
  border: 1px solid #e0e8f2
  border-radius: 10px
  background: #fbfdff
  label
    display: grid
    gap: .3rem
    > span
      color: #526179
      font-size: .75rem
      font-weight: 700
  output
    min-height: 38px
    padding: .45rem .65rem
    color: #17365f
    text-align: right
.treatment-date-input
  appearance: auto
  -webkit-appearance: auto
  cursor: pointer
.treatment-overview
  margin-top: 1rem
  padding: 1rem
  border: 1px solid #dce6f3
  border-radius: 14px
  background: #fbfdff
.treatment-overview-heading
  display: flex
  align-items: center
  justify-content: space-between
  gap: .75rem
  margin-bottom: .7rem
  h3
    margin: 0
    color: #17365f
    font-size: 1rem
  small, .empty-plan
    color: #68758a
    font-size: .78rem
.treatment-summary-table
  white-space: nowrap
.treatment-total-row
  border-top: 2px solid #dce6f3
  color: #17365f
.empty-plan
  margin: .5rem 0
  color: #68758a
  font-size: .85rem
.attend-heading
  display: flex
  flex-wrap: wrap
  justify-content: space-between
  gap: .5rem 1rem
  margin-bottom: 1rem
  h3
    margin: 0
    color: #17365f
    font-size: 1rem
.attend-treatment-list
  display: grid
  gap: .75rem
.attend-treatment-row
  display: grid
  gap: .6rem
  padding: .85rem
  border: 1px solid #e0e8f2
  border-radius: 12px
  strong
    color: #17365f
  label
    display: grid
    gap: .3rem
    > span
      color: #526179
      font-size: .78rem
      font-weight: 700
.summary-content
  display: grid
  gap: 1rem
.patient-summary
  display: grid
  gap: .2rem
  strong
    color: #17365f
    font-size: 1.05rem
  span
    color: #65738a
.summary-table-wrap
  overflow-x: auto
.summary-table
  margin: 0
  font-size: .84rem
  th
    color: #17365f
    background: #f2f6fb
.print-sheet
  display: none
.eyebrow
  color: #6d5ce7
  font-size: .72rem
  font-weight: 800
  letter-spacing: .08em
  text-transform: uppercase

@media (max-width: 760px)
  .tools-heading
    align-items: flex-start
    flex-direction: column
    small
      text-align: left
  .tools-grid
    grid-template-columns: repeat(2, minmax(0, 1fr))
  .plan-row
    grid-template-columns: 1fr
  .planned-treatment-row
    grid-template-columns: repeat(2, minmax(0, 1fr))
    > button
      justify-self: end
  .catalog-notice
    align-items: flex-start
    flex-wrap: wrap
    button
      margin-left: 0
  .clinical-dialog.wide
    max-height: calc(100vh - 1rem)

@media (max-width: 420px)
  .clinical-tools
    padding: .8rem
  .tools-grid
    grid-template-columns: 1fr
  .tool-button
    min-height: 62px

@media print
  @page
    size: A4 portrait
    margin: 12mm
  :global(body *)
    visibility: hidden !important
  :global(body)
    background: white !important
  .print-sheet, .print-sheet *
    visibility: visible !important
  .print-sheet
    position: absolute
    top: 0
    left: 0
    display: block !important
    width: 100%
    color: #111
    font: 10pt Arial, sans-serif
  .print-header
    margin-bottom: 1rem
    text-align: center
    h1
      margin: 0 0 .35rem
      font-size: 15pt
    p
      margin: 0
  .print-patient
    display: grid
    grid-template-columns: 1fr 1fr
    gap: .35rem 1rem
    margin-bottom: .8rem
  .print-sheet
    h2
      margin: .9rem 0 .4rem
      font-size: 12pt
  :deep(.nts-odontogram)
    break-inside: avoid
    box-shadow: none
    .normative-header
      padding: .45rem
    .color-key, .symbol-catalog
      display: none !important
    .chart-scroll
      padding: .5rem
    .arch-row
      grid-template-columns: repeat(var(--tooth-count), minmax(0, 1fr))
    :deep(.nts-tooth)
      max-width: 42px
  .summary-table
    width: 100%
    border-collapse: collapse
    th, td
      padding: .35rem
      border: 1px solid #999
      color: #111
      background: white
  .print-additional, .print-sheet > div
    break-inside: avoid
</style>
