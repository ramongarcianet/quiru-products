<script setup>
import AuthGate from '../../packages/platform/src/components/AuthGate.vue'
import { MODULES } from '../../packages/platform/src/modules.js'

const localUrl = port => import.meta.env.DEV
  ? `http://${window.location.hostname}:${port}/`
  : ''

const managementUrl = base => {
  if (!base) return ''
  const normalized = base.replace(/\/+$/, '')
  return import.meta.env.DEV ? `${normalized}/index.html?mode=manage` : `${normalized}/manage`
}

const urls = {
  dentistry: import.meta.env.VITE_DENTISTRY_URL || localUrl(4172),
  'smart-agenda': import.meta.env.VITE_SMART_AGENDA_URL || localUrl(4173),
  'user-admin': import.meta.env.VITE_ADMINISTRATION_URL || localUrl(4171),
  'serve-ai': managementUrl(import.meta.env.VITE_SERVE_AI_URL || localUrl(4174))
}

const availableModules = access => MODULES.filter(module => access?.modules?.[module.id])
</script>

<template>
  <AuthGate v-slot="{ access, logout, user }">
    <div class="app-shell">
      <header class="topbar">
        <div class="brand">QUIRU <small>BY QUIRU LABS</small></div>
        <button class="button secondary" type="button" @click="logout">Cerrar sesión</button>
      </header>
      <section class="content">
        <p class="eyebrow">Portal de productos</p>
        <h1>Hola, {{ access.profile.nombre || user.displayName || user.email }}</h1>
        <p class="muted">Selecciona uno de los productos habilitados para tu cuenta.</p>

        <div v-if="availableModules(access).length" class="grid">
          <article
            v-for="module in availableModules(access)"
            :key="module.id"
            class="product-card"
            :class="module.accent"
          >
            <p class="eyebrow">Producto habilitado</p>
            <div>
              <h2>{{ module.name }}</h2>
              <p class="muted">{{ module.description }}</p>
            </div>
            <a v-if="urls[module.id]" class="button primary" :href="urls[module.id]">Abrir producto</a>
            <p v-else class="notice">Falta configurar la URL de este producto.</p>
          </article>
        </div>
        <div v-else class="panel">
          <h2>Sin productos asignados</h2>
          <p class="muted">Un administrador debe habilitar al menos un producto para tu cuenta.</p>
        </div>
      </section>
    </div>
  </AuthGate>
</template>
