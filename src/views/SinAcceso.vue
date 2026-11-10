<script setup>
import { cerrarSesion } from '../store/sesion'

const portalUrl = import.meta.env.VITE_PORTAL_URL || (
  import.meta.env.DEV ? `http://${window.location.hostname}:4170/` : ''
)
</script>

<template>
  <main class="access-page">
    <section class="access-card">
      <p class="eyebrow">Acceso restringido</p>
      <h1>Odontología no está habilitada</h1>
      <p>Tu cuenta es válida, pero no tiene acceso al producto QUIRU Dent.</p>
      <div class="actions">
        <a v-if="portalUrl" class="btn btn-primary" :href="portalUrl">Ir al portal de productos</a>
        <button class="btn btn-secondary" type="button" @click="cerrarSesion">Cerrar sesión</button>
      </div>
    </section>
  </main>
</template>

<style scoped>
.access-page { min-height: 100vh; display: grid; place-items: center; padding: 1.5rem; }
.access-card { width: min(100%, 34rem); padding: 2rem; background: white; border: 1px solid var(--color-border); border-radius: var(--radius-card); box-shadow: var(--shadow-card); }
.actions { display: flex; flex-wrap: wrap; gap: .75rem; margin-top: 1.5rem; }
</style>
