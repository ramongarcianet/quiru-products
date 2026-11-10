<script setup>
import { computed, reactive, ref } from 'vue'
import { APPOINTMENT_STATUSES, formatAppointmentRange } from '../domain/booking.js'
import VoiceBookingAssistant from './VoiceBookingAssistant.vue'

const props = defineProps({
  appointments: { type: Array, default: () => [] },
  customers: { type: Array, default: () => [] },
  professionals: { type: Array, default: () => [] },
  services: { type: Array, default: () => [] },
  timeZone: { type: String, default: 'America/Lima' },
  voiceEnabled: { type: Boolean, default: false },
  onCreate: { type: Function, required: true },
  onStatus: { type: Function, required: true }
})

const today = new Date()
const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
const selectedDate = ref(localDate)
const busy = ref(false)
const error = ref('')
const success = ref('')
const form = reactive({ customerId: '', professionalId: '', serviceId: '', date: localDate, time: '09:00', durationMinutes: 30, notes: '' })

const active = values => values.filter(item => item.active !== false)
const selectedService = computed(() => props.services.find(item => item.id === form.serviceId))
const dayAppointments = computed(() => props.appointments
  .filter(appointment => {
    const start = appointment.startAt?.toDate?.() || new Date(appointment.startAt)
    const date = new Date(start.getTime() - start.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
    return date === selectedDate.value
  })
  .sort((left, right) => (left.startAt?.toMillis?.() || 0) - (right.startAt?.toMillis?.() || 0)))

function selectService() {
  form.durationMinutes = Number(selectedService.value?.durationMinutes || 30)
}

async function submit() {
  busy.value = true
  error.value = ''
  success.value = ''
  try {
    await props.onCreate({ ...form })
    success.value = 'Cita registrada correctamente.'
    selectedDate.value = form.date
    form.notes = ''
  } catch (cause) {
    error.value = cause?.message || 'No se pudo registrar la cita.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="booking-layout">
    <form class="panel stack booking-form" @submit.prevent="submit">
      <div><p class="eyebrow">Nueva cita</p><h2>Reserva manual</h2><p class="muted">Registra una cita verificando disponibilidad.</p></div>
      <VoiceBookingAssistant v-if="voiceEnabled" :customers="customers" :professionals="professionals" :services="services" :time-zone="timeZone" :on-create="onCreate" />
      <label>Cliente<select v-model="form.customerId" class="field" required><option value="" disabled>Selecciona</option><option v-for="item in active(customers)" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
      <label>Servicio<select v-model="form.serviceId" class="field" required @change="selectService"><option value="" disabled>Selecciona</option><option v-for="item in active(services)" :key="item.id" :value="item.id">{{ item.name }} · {{ item.durationMinutes }} min</option></select></label>
      <label>Profesional<select v-model="form.professionalId" class="field" required><option value="" disabled>Selecciona</option><option v-for="item in active(professionals)" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
      <div class="form-row"><label>Fecha<input v-model="form.date" class="field" type="date" required></label><label>Hora<input v-model="form.time" class="field" type="time" required></label></div>
      <label>Duración (minutos)<input v-model.number="form.durationMinutes" class="field" type="number" min="15" max="480" step="15" required></label>
      <label>Notas<input v-model="form.notes" class="field" type="text"></label>
      <p v-if="error" class="error" role="alert">{{ error }}</p><p v-if="success" class="success">{{ success }}</p>
      <button class="button primary" :disabled="busy" type="submit">{{ busy ? 'Validando…' : 'Crear cita' }}</button>
    </form>

    <section class="agenda-day">
      <header class="day-header"><div><p class="eyebrow">Agenda diaria</p><h2>{{ dayAppointments.length }} cita(s)</h2></div><input v-model="selectedDate" class="field date-filter" type="date"></header>
      <article v-for="appointment in dayAppointments" :key="appointment.id" class="appointment-card" :class="`status-${appointment.status}`">
        <div class="appointment-time">{{ formatAppointmentRange(appointment, timeZone) }}</div>
        <div class="appointment-main"><h3>{{ appointment.customerName }}</h3><p>{{ appointment.serviceName }} · {{ appointment.professionalName }}</p><small v-if="appointment.notes">{{ appointment.notes }}</small></div>
        <div class="appointment-actions">
          <span class="status-pill">{{ APPOINTMENT_STATUSES[appointment.status] || appointment.status }}</span>
          <select v-if="!['cancelled','completed','no_show'].includes(appointment.status)" class="field" :value="appointment.status" @change="onStatus(appointment, $event.target.value)">
            <option value="pending">Pendiente</option><option value="confirmed">Confirmada</option><option value="completed">Completada</option><option value="no_show">No asistió</option><option value="cancelled">Cancelada</option>
          </select>
        </div>
      </article>
      <div v-if="!dayAppointments.length" class="empty-state">No hay citas para este día.</div>
    </section>
  </section>
</template>

<style scoped>
.booking-layout { display: grid; grid-template-columns: minmax(300px, 400px) 1fr; gap: 20px; }
.booking-form { width: 100%; align-self: start; }
.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.agenda-day { display: grid; align-content: start; gap: 12px; }
.day-header { display: flex; justify-content: space-between; align-items: end; gap: 16px; }
.date-filter { width: auto; }
.appointment-card { display: grid; grid-template-columns: 150px 1fr auto; align-items: center; gap: 18px; padding: 18px; background: white; border: 1px solid #e2e8f0; border-left: 4px solid #0066ff; border-radius: 16px; }
.status-cancelled, .status-no_show { opacity: .65; border-left-color: #9aa8ba; }
.status-completed { border-left-color: #138a5b; }
.appointment-time { color: #0066ff; font-size: 13px; font-weight: 800; }
.appointment-main h3, .appointment-main p { margin-bottom: 4px; }
.appointment-main p, .appointment-main small { color: #52657f; }
.appointment-actions { display: grid; justify-items: end; gap: 8px; }
.appointment-actions .field { min-height: 36px; padding: 6px 9px; }
.status-pill { padding: 5px 9px; border-radius: 999px; background: #eaf2ff; font-size: 11px; font-weight: 800; }
.empty-state { padding: 32px; text-align: center; color: #52657f; background: white; border: 1px dashed #c8d3e2; border-radius: 16px; }
@media (max-width: 920px) { .booking-layout { grid-template-columns: 1fr; } }
@media (max-width: 640px) { .appointment-card { grid-template-columns: 1fr; } .appointment-actions { justify-items: start; } }
</style>
