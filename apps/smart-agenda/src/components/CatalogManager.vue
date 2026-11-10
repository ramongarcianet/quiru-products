<script setup>
import { computed, reactive, ref } from 'vue'

const props = defineProps({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  items: { type: Array, default: () => [] },
  fields: { type: Array, required: true },
  searchable: { type: Boolean, default: false },
  searchPlaceholder: { type: String, default: 'Buscar por cualquier campo…' },
  onCreate: { type: Function, required: true },
  onUpdate: { type: Function, required: true },
  onArchive: { type: Function, required: true }
})

const form = reactive(Object.fromEntries(props.fields.map(field => [field.key, field.default ?? ''])))
const busy = ref(false)
const error = ref('')
const editingId = ref('')
const search = ref('')

const normalizeSearch = value => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('es')
  .trim()

const activeItems = computed(() => props.items.filter(entry => entry.active !== false))
const filteredItems = computed(() => {
  const query = normalizeSearch(search.value)
  if (!query) return activeItems.value
  return activeItems.value.filter(item => Object.values(item).some(value => {
    if (value == null || typeof value === 'object') return false
    return normalizeSearch(value).includes(query)
  }))
})

function resetForm() {
  props.fields.forEach(field => { form[field.key] = field.default ?? '' })
  editingId.value = ''
  error.value = ''
}

function startEdit(item) {
  props.fields.forEach(field => { form[field.key] = item[field.key] ?? field.default ?? '' })
  editingId.value = item.id
  error.value = ''
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

async function submit() {
  busy.value = true
  error.value = ''
  try {
    if (editingId.value) await props.onUpdate(editingId.value, { ...form })
    else await props.onCreate({ ...form })
    resetForm()
  } catch (cause) {
    error.value = cause?.message || 'No se pudo guardar.'
  } finally {
    busy.value = false
  }
}

function displayValue(field, value) {
  if (!value) return ''
  if (field.type !== 'date') return value
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value))
  if (!match) return value
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12))
  return new Intl.DateTimeFormat('es-PE', { timeZone: 'UTC', day: '2-digit', month: 'long', year: 'numeric' }).format(date)
}

function itemDetails(item) {
  return props.fields.slice(1).map(field => displayValue(field, item[field.key])).filter(Boolean).join(' · ') || 'Sin datos adicionales'
}
</script>

<template>
  <section class="manager-layout">
    <form class="panel stack manager-form" @submit.prevent="submit">
      <div><p class="eyebrow">{{ editingId ? 'Editando registro' : 'Nuevo registro' }}</p><h2>{{ title }}</h2><p class="muted">{{ description }}</p></div>
      <label v-for="field in fields" :key="field.key">
        {{ field.label }}
        <input
          v-model="form[field.key]"
          class="field"
          :type="field.type || 'text'"
          :min="field.min"
          :max="field.max"
          :step="field.step"
          :required="field.required !== false"
        >
      </label>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <div class="form-actions"><button v-if="editingId" class="button secondary" :disabled="busy" type="button" @click="resetForm">Cancelar edición</button><button class="button primary" :disabled="busy" type="submit">{{ busy ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Guardar' }}</button></div>
    </form>

    <section class="catalog-list">
      <label v-if="searchable" class="catalog-search">
        <span>Buscar clientes</span>
        <input v-model="search" class="field" type="search" :placeholder="searchPlaceholder" autocomplete="off">
        <small v-if="search">{{ filteredItems.length }} resultado(s)</small>
      </label>
      <article v-for="item in filteredItems" :key="item.id" class="catalog-card">
        <div><h3>{{ item.name }}</h3><p class="muted">{{ itemDetails(item) }}</p></div>
        <div class="card-actions"><button class="button secondary" type="button" @click="startEdit(item)">Editar</button><button class="button secondary" type="button" @click="onArchive(item)">Desactivar</button></div>
      </article>
      <div v-if="!activeItems.length" class="empty-state">Aún no hay registros.</div>
      <div v-else-if="!filteredItems.length" class="empty-state">No se encontraron clientes con “{{ search }}”.</div>
    </section>
  </section>
</template>

<style scoped>
.manager-layout { display: grid; grid-template-columns: minmax(280px, 380px) 1fr; gap: 20px; }
.manager-form { width: 100%; align-self: start; }
.catalog-list { display: grid; align-content: start; gap: 12px; }
.catalog-search { display: grid; gap: 6px; padding: 16px 18px; background: white; border: 1px solid #d8e2ee; border-radius: 16px; font-weight: 700; }
.catalog-search small { color: #52657f; font-weight: 400; }
.catalog-card { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 18px; background: white; border: 1px solid #e2e8f0; border-radius: 16px; }
.catalog-card h3, .catalog-card p { margin-bottom: 4px; }
.form-actions, .card-actions { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
.empty-state { padding: 30px; text-align: center; color: #52657f; background: white; border: 1px dashed #c8d3e2; border-radius: 16px; }
@media (max-width: 800px) { .manager-layout { grid-template-columns: 1fr; } }
</style>
