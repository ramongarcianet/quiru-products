<script setup>
import { computed, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { firestore } from '../config/firebase'
import { miUsuario, usuario } from '../store/sesion'
import { item as clinicProfile } from '../store/usuario'
import { normalizeWhatsAppNumber, patientsWithUpcomingBirthdays } from '../services/patientEngagement'

const { push } = useRouter()
const patients = ref([])
const attentions = ref([])
const aiAttentions = ref([])
const appointments = ref([])
const errors = ref([])
const loaded = ref({ patients: false, attentions: false, aiAttentions: false, appointments: false })
const unsubscribers = []

const userId = miUsuario()?.uid || usuario.value.uid
const isLoading = computed(() => !Object.values(loaded.value).every(Boolean))

const asDate = value => {
  if (!value) return null
  if (typeof value.toDate === 'function') return value.toDate()
  if (value.seconds) return new Date(value.seconds * 1000)
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const isCurrentMonth = value => {
  const date = asDate(value)
  const now = new Date()
  return date && date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
}

const planRows = attention => Array.isArray(attention?.planTrata)
  ? attention.planTrata
  : Array.isArray(attention?.treatmentPlan) ? attention.treatmentPlan : []
const plannedTreatments = attention => planRows(attention)
  .flatMap(diagnosis => (Array.isArray(diagnosis?.Tratamiento) ? diagnosis.Tratamiento : [])
    .map(treatment => ({ diagnosis, treatment })))

const activePatients = computed(() => patients.value.filter(patient => patient.estado !== false))
const treatmentSources = computed(() => [...attentions.value, ...aiAttentions.value])
const treatmentPlans = computed(() => treatmentSources.value.filter(attention => plannedTreatments(attention).length > 0))
const newPatientsThisMonth = computed(() => activePatients.value.filter(patient => isCurrentMonth(patient.fechaIngreso)).length)
const attentionsThisMonth = computed(() => treatmentSources.value
  .filter(attention => isCurrentMonth(attention.fechaRegistro || attention.createdAt)).length)

const patientAttentionCounts = computed(() => treatmentSources.value.reduce((counts, attention) => {
  const patientId = attention.idPaciente || attention.patientId
  if (patientId) counts[patientId] = (counts[patientId] || 0) + 1
  return counts
}, {}))

const recurringPatients = computed(() => Object.values(patientAttentionCounts.value).filter(count => count > 1).length)
const recurringRate = computed(() => activePatients.value.length
  ? Math.round((recurringPatients.value / activePatients.value.length) * 100)
  : 0)

const allPlannedTreatments = computed(() => treatmentSources.value.flatMap(plannedTreatments))
const pendingTreatments = computed(() => allPlannedTreatments.value
  .filter(({ diagnosis, treatment }) => diagnosis.Atendido !== true && treatment.Atendido !== true))

const plannedProduction = computed(() => allPlannedTreatments.value.reduce(
  (total, { treatment }) => total + Number(treatment.Precio || 0), 0))
const collectedAmount = computed(() => allPlannedTreatments.value.reduce(
  (total, { treatment }) => total + Number(treatment.Acuenta || 0), 0))

const pendingBalance = computed(() => pendingTreatments.value.reduce((total, { treatment }) => {
  return total + Math.max(Number(treatment.Precio || 0) - Number(treatment.Acuenta || 0), 0)
}, 0))
const monthlyProjection = computed(() => pendingTreatments.value
  .filter(({ treatment }) => isCurrentMonth(treatment.Fecha))
  .reduce((total, { treatment }) => total + Math.max(
    Number(treatment.Precio || 0) - Number(treatment.Acuenta || 0), 0), 0))
const collectionRate = computed(() => plannedProduction.value > 0
  ? Math.min(100, Math.round((collectedAmount.value / plannedProduction.value) * 100))
  : 0)

const upcomingAppointments = computed(() => {
  const now = new Date()
  const limit = new Date(now)
  limit.setDate(limit.getDate() + 7)
  return appointments.value.filter(appointment => {
    if (appointment.estado === false) return false
    const date = asDate(appointment.start)
    return date && date >= now && date <= limit
  }).length
})

const upcomingBirthdays = computed(() => patientsWithUpcomingBirthdays(activePatients.value))
const birthdayDiscount = computed(() => Number(clinicProfile.value?.descuentoCumpleanos || 0))
const clinicName = computed(() => clinicProfile.value?.nombreconsultorio || 'nuestro consultorio dental')
const birthdayDate = value => new Intl.DateTimeFormat('es-PE', {
  day: '2-digit', month: 'long', timeZone: 'UTC',
}).format(value)
const birthdayTiming = days => days === 0 ? 'Cumple años hoy' : days === 1 ? 'Cumple años mañana' : `Faltan ${days} días`

const sendBirthdayPromotion = patient => {
  if (birthdayDiscount.value <= 0) {
    window.alert('Configura primero el porcentaje de descuento por cumpleaños.')
    return
  }
  const phone = normalizeWhatsAppNumber(patient.telefono || patient.numeroTlf)
  if (!phone) {
    window.alert('El paciente no tiene un número de celular válido registrado.')
    return
  }
  const firstName = String(patient.nombre || patient.fullName || 'paciente').trim().split(/\s+/)[0]
  const message = [
    `Hola ${firstName},`,
    `en ${clinicName.value} queremos celebrar tu cumpleaños contigo.`,
    `Por tu mes de cumpleaños tienes un ${birthdayDiscount.value}% de descuento especial en tratamientos seleccionados.`,
    '',
    'Escríbenos para conocer las condiciones y reservar tu cita. ¡Feliz cumpleaños!',
  ].join('\n')
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')
}

const money = value => new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
  maximumFractionDigits: 0,
}).format(value || 0)

const metrics = computed(() => [
  { label: 'Clientes activos', value: activePatients.value.length, detail: `${newPatientsThisMonth.value} nuevos este mes`, icon: 'bi bi-people', tone: 'blue' },
  { label: 'Atenciones', value: treatmentSources.value.length, detail: `${attentionsThisMonth.value} registradas este mes`, icon: 'bi bi-clipboard2-pulse', tone: 'purple' },
  { label: 'Planes de tratamiento', value: treatmentPlans.value.length, detail: `${pendingTreatments.value.length} tratamientos por completar`, icon: 'bi bi-journal-medical', tone: 'cyan' },
  { label: 'Próximas citas', value: upcomingAppointments.value, detail: 'Programadas para los próximos 7 días', icon: 'bi bi-calendar2-check', tone: 'green' },
])

const subscribe = (collectionName, field, target, key) => {
  const reference = query(collection(firestore, collectionName), where(field, '==', userId))
  const unsubscribe = onSnapshot(reference, snapshot => {
    target.value = snapshot.docs.map(document => ({ ...document.data(), id: document.id }))
    loaded.value = { ...loaded.value, [key]: true }
  }, cause => {
    console.error(`No se pudo cargar ${collectionName}.`, cause)
    errors.value = [...errors.value, collectionName]
    loaded.value = { ...loaded.value, [key]: true }
  })
  unsubscribers.push(unsubscribe)
}

if (userId) {
  subscribe('paciente', 'idOdontologo', patients, 'patients')
  subscribe('odontograma', 'userId', attentions, 'attentions')
  subscribe('odontogramaAiSessions', 'userId', aiAttentions, 'aiAttentions')
  subscribe('citas', 'UserId', appointments, 'appointments')
} else {
  errors.value = ['sesión']
  loaded.value = { patients: true, attentions: true, aiAttentions: true, appointments: true }
}

onUnmounted(() => unsubscribers.forEach(unsubscribe => unsubscribe()))
</script>

<template lang="pug">
.report-page
  .report-heading
    div
      span.eyebrow RESUMEN DEL CONSULTORIO
      h1 Reporte general
      p Indicadores clínicos y oportunidades para tomar mejores decisiones.
    .report-actions
      button.btn.btn-outline-primary(type='button' @click="push({ name: 'pacientes' })") Ver pacientes
      button.btn.btn-primary(type='button' @click="push({ name: 'citas' })") Gestionar citas

  .report-state(v-if='isLoading')
    span.spinner-border.spinner-border-sm(role='status' aria-hidden='true')
    span Cargando indicadores…

  .report-alert(v-if='errors.length && !isLoading' role='alert')
    i.bi.bi-exclamation-triangle
    span Algunos indicadores no pudieron cargarse. Revisa la conexión o los permisos de acceso.

  template(v-if='!isLoading')
    .metric-grid
      article.metric-card(v-for='metric in metrics' :key='metric.label' :class='`tone-${metric.tone}`')
        .metric-icon
          i(:class='metric.icon')
        .metric-copy
          span {{ metric.label }}
          strong {{ metric.value }}
          small {{ metric.detail }}

    .value-grid
      article.value-card
        .value-card-heading
          div
            span.eyebrow OPORTUNIDAD ECONÓMICA
            h2 Saldo pendiente estimado
          i.bi.bi-graph-up-arrow
        strong.value-amount {{ money(pendingBalance) }}
        p Corresponde al saldo registrado en tratamientos aún no marcados como atendidos.
        button.text-action(type='button' @click="push({ name: 'pacientes' })")
          span Revisar pacientes y planes
          i.bi.bi-arrow-right

      article.value-card
        .value-card-heading
          div
            span.eyebrow FIDELIZACIÓN
            h2 Pacientes recurrentes
          i.bi.bi-person-check
        .retention-value
          strong {{ recurringRate }}%
          span {{ recurringPatients }} pacientes con más de una atención
        .progress-track(aria-hidden='true')
          span(:style='{ width: `${Math.min(recurringRate, 100)}%` }')
        p Una mayor recurrencia ayuda a sostener tratamientos preventivos y continuidad clínica.

    section.birthday-panel
      .birthday-heading
        div
          span.eyebrow FIDELIZACIÓN
          h2 Próximos cumpleaños
          p Pacientes que cumplen años durante los próximos 15 días.
        .birthday-summary
          strong {{ upcomingBirthdays.length }}
          span pacientes
      .discount-warning(v-if='birthdayDiscount <= 0')
        i.bi.bi-info-circle
        span Configura el porcentaje de descuento para habilitar los mensajes promocionales.
        button.btn.btn-sm.btn-outline-primary(type='button' @click="push({ name: 'usuario' })") Ir a configuración
      .birthday-empty(v-if='!upcomingBirthdays.length')
        i.bi.bi-balloon
        span No hay cumpleaños registrados en los próximos 15 días.
      .birthday-list(v-else)
        article.birthday-item(v-for='patient in upcomingBirthdays' :key='patient.id')
          .birthday-avatar(aria-hidden='true') {{ patient.fullName.charAt(0).toUpperCase() }}
          .birthday-patient
            strong {{ patient.fullName }}
            span {{ birthdayDate(patient.nextBirthday) }} · {{ birthdayTiming(patient.daysUntilBirthday) }}
          .birthday-contact
            small {{ patient.telefono || patient.numeroTlf || 'Sin celular registrado' }}
            button.btn.whatsapp-button(type='button' :disabled='birthdayDiscount <= 0 || !(patient.telefono || patient.numeroTlf)' @click='sendBirthdayPromotion(patient)')
              i.bi.bi-whatsapp.me-2
              span Enviar promoción {{ birthdayDiscount > 0 ? `(${birthdayDiscount}%)` : '' }}

    section.financial-panel
      .financial-heading
        div
          span.eyebrow GESTIÓN FINANCIERA
          h2 Producción, cobranza y proyección
          p Calculado con los precios y abonos registrados en los planes de tratamiento.
        .collection-rate
          strong {{ collectionRate }}%
          span cobrado sobre lo planificado
      .financial-grid
        article.financial-metric
          i.bi.bi-clipboard-data
          span Producción planificada
          strong {{ money(plannedProduction) }}
          small Valor total de los tratamientos incluidos en planes.
        article.financial-metric
          i.bi.bi-cash-coin
          span Abonos registrados
          strong {{ money(collectedAmount) }}
          small Monto ingresado en el campo “A cuenta”.
        article.financial-metric
          i.bi.bi-hourglass-split
          span Cobranza pendiente
          strong {{ money(pendingBalance) }}
          small Saldo de tratamientos que aún no están atendidos.
        article.financial-metric
          i.bi.bi-calendar3
          span Proyección del mes
          strong {{ money(monthlyProjection) }}
          small Saldo de tratamientos pendientes programados este mes.
      .progress-track.financial-progress(aria-hidden='true')
        span(:style='{ width: `${collectionRate}%` }')
</template>

<style lang="sass" scoped>
.report-page
  display: grid
  gap: 1.4rem

.report-heading
  display: flex
  justify-content: space-between
  align-items: flex-start
  gap: 1rem
  h1
    margin: .15rem 0 .25rem
    color: var(--brand-navy)
    font-size: clamp(1.55rem, 3vw, 2rem)
    font-weight: 800
  p
    margin: 0
    color: var(--text-secondary)

.eyebrow
  color: var(--brand-blue)
  font-size: .68rem
  font-weight: 800
  letter-spacing: .12em

.report-actions
  display: flex
  gap: .6rem
  white-space: nowrap

.report-state, .report-alert
  display: flex
  align-items: center
  gap: .7rem
  padding: 1rem
  border-radius: 12px

.report-state
  color: var(--text-secondary)
  background: #f5f8fc

.report-alert
  color: #8a5700
  background: #fff5dc
  border: 1px solid #f3d48f

.metric-grid
  display: grid
  grid-template-columns: repeat(4, minmax(0, 1fr))
  gap: 1rem

.metric-card
  display: flex
  gap: .85rem
  min-width: 0
  padding: 1.1rem
  border: 1px solid var(--color-border)
  border-radius: 16px
  background: white
  box-shadow: var(--shadow-soft)

.metric-icon
  display: grid
  place-items: center
  flex: 0 0 auto
  width: 2.6rem
  height: 2.6rem
  border-radius: 12px
  font-size: 1.15rem

.tone-blue .metric-icon
  color: #246fe5
  background: #eaf2ff
.tone-purple .metric-icon
  color: #7147d8
  background: #f0ebff
.tone-cyan .metric-icon
  color: #008ba2
  background: #e4f8fb
.tone-green .metric-icon
  color: #18845b
  background: #e6f7ef

.metric-copy
  display: grid
  min-width: 0
  span
    color: var(--text-secondary)
    font-size: .78rem
    font-weight: 700
  strong
    margin: .08rem 0
    color: var(--brand-navy)
    font-size: 1.75rem
    line-height: 1.1
  small
    color: #718096
    font-size: .7rem
    line-height: 1.35

.value-grid
  display: grid
  grid-template-columns: repeat(2, minmax(0, 1fr))
  gap: 1rem

.value-card
  padding: 1.25rem
  border: 1px solid var(--color-border)
  border-radius: 16px
  background: linear-gradient(145deg, #fff, #f8fbff)
  h2
    margin: .15rem 0 0
    color: var(--brand-navy)
    font-size: 1rem
    font-weight: 800
  p
    margin: .75rem 0 0
    color: var(--text-secondary)
    font-size: .82rem
    line-height: 1.5

.value-card-heading
  display: flex
  align-items: center
  justify-content: space-between
  gap: 1rem
  > i
    color: var(--brand-blue)
    font-size: 1.35rem

.value-amount
  display: block
  margin-top: 1rem
  color: var(--brand-navy)
  font-size: 2rem

.text-action
  display: flex
  align-items: center
  gap: .5rem
  margin-top: .85rem
  padding: 0
  border: 0
  color: var(--brand-blue)
  background: transparent
  font-size: .8rem
  font-weight: 800

.retention-value
  display: flex
  align-items: baseline
  gap: .75rem
  margin-top: 1rem
  strong
    color: var(--brand-navy)
    font-size: 2rem
  span
    color: var(--text-secondary)
    font-size: .78rem

.progress-track
  height: .5rem
  margin-top: .65rem
  overflow: hidden
  border-radius: 999px
  background: #e4ebf4
  span
    display: block
    height: 100%
    border-radius: inherit
    background: var(--gradient-brand)

.birthday-panel
  padding: 1.25rem
  border: 1px solid var(--color-border)
  border-radius: 16px
  background: white
  box-shadow: var(--shadow-soft)

.birthday-heading
  display: flex
  align-items: flex-start
  justify-content: space-between
  gap: 1rem
  h2
    margin: .15rem 0 .2rem
    color: var(--brand-navy)
    font-size: 1.1rem
    font-weight: 800
  p
    margin: 0
    color: var(--text-secondary)
    font-size: .82rem

.birthday-summary
  display: flex
  align-items: baseline
  gap: .35rem
  color: var(--text-secondary)
  strong
    color: var(--brand-blue)
    font-size: 1.5rem
  span
    font-size: .75rem

.discount-warning
  display: flex
  align-items: center
  gap: .65rem
  margin-top: 1rem
  padding: .75rem
  border-radius: 10px
  color: #76500b
  background: #fff7df
  font-size: .78rem
  button
    margin-left: auto

.birthday-list
  display: grid
  margin-top: 1rem

.birthday-item
  display: grid
  grid-template-columns: auto minmax(0, 1fr) auto
  align-items: center
  gap: .85rem
  padding: .85rem 0
  border-top: 1px solid #edf0f4
  &:first-child
    border-top: 0

.birthday-avatar
  display: grid
  place-items: center
  width: 2.5rem
  height: 2.5rem
  border-radius: 12px
  color: #8b4d00
  background: #fff0d8
  font-weight: 800

.birthday-patient
  display: grid
  min-width: 0
  strong
    overflow: hidden
    color: var(--brand-navy)
    text-overflow: ellipsis
    white-space: nowrap
  span
    color: var(--text-secondary)
    font-size: .75rem

.birthday-contact
  display: flex
  align-items: center
  gap: .8rem
  small
    color: var(--text-secondary)

.whatsapp-button
  color: white
  background: #168c52
  font-size: .78rem
  &:hover, &:focus
    color: white
    background: #117442
  &:disabled
    color: #7d8896
    background: #e9edf1
    border-color: #e9edf1

.birthday-empty
  display: flex
  align-items: center
  justify-content: center
  gap: .6rem
  padding: 2rem 1rem
  color: var(--text-secondary)

.financial-panel
  padding: 1.25rem
  border: 1px solid var(--color-border)
  border-radius: 16px
  background: linear-gradient(145deg, #fff, #f7fbff)
  box-shadow: var(--shadow-soft)

.financial-heading
  display: flex
  align-items: flex-start
  justify-content: space-between
  gap: 1rem
  h2
    margin: .15rem 0 .2rem
    color: var(--brand-navy)
    font-size: 1.1rem
    font-weight: 800
  p
    margin: 0
    color: var(--text-secondary)
    font-size: .82rem

.collection-rate
  display: grid
  justify-items: end
  color: var(--text-secondary)
  strong
    color: var(--brand-blue)
    font-size: 1.5rem
    line-height: 1
  span
    margin-top: .25rem
    font-size: .7rem

.financial-grid
  display: grid
  grid-template-columns: repeat(4, minmax(0, 1fr))
  gap: .8rem
  margin-top: 1rem

.financial-metric
  display: grid
  gap: .25rem
  min-width: 0
  padding: 1rem
  border: 1px solid #e1e9f3
  border-radius: 12px
  background: white
  > i
    margin-bottom: .2rem
    color: var(--brand-blue)
    font-size: 1.15rem
  > span
    color: var(--text-secondary)
    font-size: .72rem
    font-weight: 700
  > strong
    overflow: hidden
    color: var(--brand-navy)
    font-size: 1.25rem
    text-overflow: ellipsis
  > small
    color: #78869a
    font-size: .67rem
    line-height: 1.35

.financial-progress
  margin-top: 1rem

@media (max-width: 991px)
  .metric-grid
    grid-template-columns: repeat(2, minmax(0, 1fr))
  .financial-grid
    grid-template-columns: repeat(2, minmax(0, 1fr))

@media (max-width: 700px)
  .report-heading
    display: grid
  .report-actions
    width: 100%
    button
      flex: 1
  .value-grid
    grid-template-columns: 1fr
  .birthday-item
    grid-template-columns: auto minmax(0, 1fr)
  .birthday-contact
    grid-column: 1 / -1
    justify-content: space-between
  .discount-warning
    align-items: flex-start
    flex-wrap: wrap
    button
      margin-left: 0
  .financial-heading
    display: grid
  .collection-rate
    justify-items: start

@media (max-width: 480px)
  .metric-grid
    grid-template-columns: 1fr
  .financial-grid
    grid-template-columns: 1fr
  .report-actions
    display: grid
</style>
