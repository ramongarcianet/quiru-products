<script setup>
import { computed, onBeforeUnmount, reactive, ref } from 'vue'
import { actualizar, guardar, obtenerTodos, registro } from '../store/precios'

const blankTreatment = () => ({
  id: '', codigo: '', nombre: '', categoria: '', especialidad: '', descripcion: '',
  precio: 0, costoReferencial: 0, duracionMinutos: 30, moneda: 'PEN',
  requierePieza: true, activo: true,
})

const form = reactive(blankTreatment())
const search = ref('')
const saving = ref(false)
const message = ref('')
const error = ref('')
const unsubscribe = obtenerTodos()

const filteredTreatments = computed(() => {
  const term = search.value.trim().toLocaleLowerCase('es')
  if (!term) return registro.value
  return registro.value.filter(treatment => [treatment.nombre, treatment.tipo, treatment.codigo,
    treatment.categoria, treatment.especialidad].filter(Boolean).join(' ').toLocaleLowerCase('es').includes(term))
})

const money = treatment => new Intl.NumberFormat('es-PE', {
  style: 'currency', currency: treatment.moneda || 'PEN', minimumFractionDigits: 2,
}).format(Number(treatment.precio || 0))

function resetForm() {
  Object.assign(form, blankTreatment())
  error.value = ''
}

function editTreatment(treatment) {
  Object.assign(form, blankTreatment(), treatment, {
    nombre: treatment.nombre || treatment.tipo || '',
    precio: Number(treatment.precio || 0),
  })
  message.value = ''
  error.value = ''
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

async function saveTreatment() {
  message.value = ''
  error.value = ''
  const price = Number(form.precio)
  const cost = Number(form.costoReferencial || 0)
  const duration = Number(form.duracionMinutos || 0)
  if (!form.nombre.trim()) return (error.value = 'Ingresa el nombre del tratamiento.')
  if (![price, cost, duration].every(Number.isFinite) || price < 0 || cost < 0 || duration < 0) {
    return (error.value = 'Precio, costo y duración deben ser valores válidos.')
  }
  saving.value = true
  try {
    const payload = {
      ...form, nombre: form.nombre.trim(), tipo: form.nombre.trim(), codigo: form.codigo.trim(),
      categoria: form.categoria.trim(), especialidad: form.especialidad.trim(),
      descripcion: form.descripcion.trim(), precio: price, costoReferencial: cost, duracionMinutos: duration,
    }
    if (form.id) await actualizar(payload)
    else await guardar(payload)
    const action = form.id ? 'actualizado' : 'registrado'
    resetForm()
    message.value = `Tratamiento ${action} correctamente.`
  } catch (cause) {
    console.error(cause)
    error.value = 'No se pudo guardar el tratamiento. Revisa tu conexión o permisos.'
  } finally {
    saving.value = false
  }
}

async function toggleTreatment(treatment) {
  try {
    await actualizar({ ...treatment, activo: treatment.activo === false })
  } catch (cause) {
    console.error(cause)
    error.value = 'No se pudo cambiar el estado del tratamiento.'
  }
}

onBeforeUnmount(() => unsubscribe?.())
</script>

<template lang="pug">
.treatment-catalog
  .catalog-heading
    div
      span.eyebrow CATÁLOGO CLÍNICO
      h1 Tratamientos y precios
      p Registra los servicios que podrás seleccionar al generar un plan de tratamiento.
    button.btn.btn-outline-primary(type='button' @click='resetForm')
      i.bi.bi-plus-circle.me-2
      span Nuevo tratamiento

  form.catalog-form(@submit.prevent='saveTreatment')
    .form-heading
      div
        h2 {{ form.id ? 'Editar tratamiento' : 'Registrar tratamiento' }}
        p Costo, duración y especialidad permitirán ampliar los reportes más adelante.
      span.status-pill(:class='{ inactive: !form.activo }') {{ form.activo ? 'Activo' : 'Inactivo' }}
    .form-grid
      label
        span Nombre del tratamiento*
        input.form-control(v-model.trim='form.nombre' maxlength='100' required placeholder='Ej. Profilaxis dental')
      label
        span Código interno
        input.form-control(v-model.trim='form.codigo' maxlength='30' placeholder='Ej. PREV-001')
      label
        span Categoría
        input.form-control(v-model.trim='form.categoria' maxlength='60' placeholder='Ej. Prevención')
      label
        span Especialidad
        input.form-control(v-model.trim='form.especialidad' maxlength='60' placeholder='Ej. Odontología general')
      label
        span Precio de venta*
        .input-group
          span.input-group-text {{ form.moneda === 'USD' ? '$' : 'S/' }}
          input.form-control(v-model.number='form.precio' type='number' min='0' max='999999' step='0.01' required)
      label
        span Costo referencial
        .input-group
          span.input-group-text {{ form.moneda === 'USD' ? '$' : 'S/' }}
          input.form-control(v-model.number='form.costoReferencial' type='number' min='0' max='999999' step='0.01')
      label
        span Duración estimada (minutos)
        input.form-control(v-model.number='form.duracionMinutos' type='number' min='0' max='480' step='5')
      label
        span Moneda
        select.form-select(v-model='form.moneda')
          option(value='PEN') PEN — Sol peruano
          option(value='USD') USD — Dólar estadounidense
      label.wide
        span Descripción / alcance
        textarea.form-control(v-model.trim='form.descripcion' rows='3' maxlength='500' placeholder='Materiales, condiciones o alcance del tratamiento')
    .form-checks
      label.form-check
        input.form-check-input(v-model='form.requierePieza' type='checkbox')
        span.form-check-label Requiere asociar una pieza dental
      label.form-check
        input.form-check-input(v-model='form.activo' type='checkbox')
        span.form-check-label Disponible para nuevos planes
    .alert.alert-danger.mt-3.mb-0(v-if='error' role='alert') {{ error }}
    .alert.alert-success.mt-3.mb-0(v-if='message' role='status') {{ message }}
    .form-actions
      button.btn.btn-outline-secondary(v-if='form.id' type='button' @click='resetForm') Cancelar edición
      button.btn.btn-primary(type='submit' :disabled='saving') {{ saving ? 'Guardando…' : (form.id ? 'Actualizar tratamiento' : 'Registrar tratamiento') }}

  section.catalog-list
    .list-heading
      div
        h2 Catálogo registrado
        p {{ registro.length }} tratamientos en total
      .search-box
        i.bi.bi-search
        input.form-control(v-model='search' type='search' placeholder='Buscar tratamiento, código o categoría')
    .empty-state(v-if='!filteredTreatments.length')
      i.bi.bi-journal-plus
      strong No hay tratamientos para mostrar
      p Registra el primero o cambia el término de búsqueda.
    .catalog-table(v-else)
      .catalog-row.catalog-row-head
        span Tratamiento
        span Categoría
        span Duración
        span Precio
        span Estado
        span Acciones
      .catalog-row(v-for='treatment in filteredTreatments' :key='treatment.id')
        .treatment-name
          strong {{ treatment.nombre || treatment.tipo }}
          small {{ treatment.codigo || 'Sin código' }} · {{ treatment.especialidad || 'Sin especialidad' }}
        span {{ treatment.categoria || 'Sin categoría' }}
        span {{ Number(treatment.duracionMinutos || 0) ? `${treatment.duracionMinutos} min` : 'Sin definir' }}
        strong.price {{ money(treatment) }}
        span.status-pill(:class='{ inactive: treatment.activo === false }') {{ treatment.activo === false ? 'Inactivo' : 'Activo' }}
        .row-actions
          button.btn.btn-sm.btn-outline-primary(type='button' @click='editTreatment(treatment)' aria-label='Editar tratamiento')
            i.bi.bi-pencil
          button.btn.btn-sm(type='button' :class='treatment.activo === false ? "btn-outline-success" : "btn-outline-secondary"' @click='toggleTreatment(treatment)') {{ treatment.activo === false ? 'Activar' : 'Desactivar' }}
</template>

<style lang="sass" scoped>
.treatment-catalog
  display: grid
  gap: 1.25rem
.catalog-heading, .form-heading, .list-heading
  display: flex
  justify-content: space-between
  align-items: flex-start
  gap: 1rem
  h1, h2
    color: var(--brand-navy)
    font-weight: 800
  h1
    margin: .15rem 0 .3rem
    font-size: clamp(1.5rem, 3vw, 2rem)
  h2
    margin: 0
    font-size: 1.05rem
  p
    margin: .2rem 0 0
    color: var(--text-secondary)
    font-size: .82rem
.eyebrow
  color: var(--brand-blue)
  font-size: .68rem
  font-weight: 800
  letter-spacing: .12em
.catalog-form, .catalog-list
  padding: 1.25rem
  border: 1px solid var(--color-border)
  border-radius: 16px
  background: #fff
  box-shadow: var(--shadow-soft)
.form-grid
  display: grid
  grid-template-columns: repeat(4, minmax(0, 1fr))
  gap: 1rem
  margin-top: 1.15rem
  label
    display: grid
    align-content: start
    gap: .4rem
    color: var(--brand-navy)
    font-size: .78rem
    font-weight: 700
  .wide
    grid-column: 1 / -1
.form-checks, .form-actions, .row-actions
  display: flex
  align-items: center
  gap: 1rem
.form-checks
  margin-top: 1rem
.form-actions
  justify-content: flex-end
  margin-top: 1rem
.status-pill
  display: inline-flex
  width: fit-content
  padding: .3rem .6rem
  border-radius: 999px
  color: #14724e
  background: #e6f7ef
  font-size: .68rem
  font-weight: 800
  &.inactive
    color: #6c7786
    background: #edf0f4
.search-box
  position: relative
  width: min(340px, 100%)
  i
    position: absolute
    top: 50%
    left: .8rem
    color: #7b8798
    transform: translateY(-50%)
  input
    padding-left: 2.25rem
.catalog-table
  margin-top: 1rem
  overflow-x: auto
.catalog-row
  display: grid
  grid-template-columns: minmax(220px, 2fr) minmax(130px, 1fr) 90px 100px 80px minmax(150px, auto)
  align-items: center
  gap: .8rem
  min-width: 850px
  padding: .8rem .5rem
  border-bottom: 1px solid #edf0f4
  color: #52657f
  font-size: .8rem
.catalog-row-head
  color: var(--brand-navy)
  background: #f6f9fc
  font-size: .72rem
  font-weight: 800
.treatment-name
  display: grid
  strong
    color: var(--brand-navy)
  small
    color: #7b8798
.price
  color: var(--brand-navy)
.empty-state
  display: grid
  justify-items: center
  gap: .35rem
  padding: 2.5rem 1rem
  color: var(--text-secondary)
  text-align: center
  i
    color: var(--brand-blue)
    font-size: 1.8rem
  p
    margin: 0
@media (max-width: 991px)
  .form-grid
    grid-template-columns: repeat(2, minmax(0, 1fr))
@media (max-width: 640px)
  .catalog-heading, .form-heading, .list-heading
    display: grid
  .form-grid
    grid-template-columns: 1fr
    .wide
      grid-column: auto
  .form-checks
    display: grid
  .search-box
    width: 100%
</style>
