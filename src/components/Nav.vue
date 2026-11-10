<script setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { item } from '../store/usuario'
const route = useRoute()
const {push} = useRouter()
const routeName = computed(()=>route.name)
const rutas = [
    {name:'Inicio', icono:'bi bi-grid-1x2', ruta:'reporte', routes: ['reporte']},
    {name:'Citas', icono:'bi bi-calendar2-week', ruta:'citas', routes: ['citas']},
    {name:'Pacientes', icono:'bi bi-people', ruta:'pacientes', routes: ['pacientes', 'paciente', 'pacienteVer', 'atencion-ai', 'Detalle', 'Admision']},
    {name:'Tratamientos', icono:'bi bi-journal-medical', ruta:'tratamientos', routes: ['tratamientos', 'plantratamiento']},
    {name:'Configuración', icono:'bi bi-gear', ruta:'usuario', routes: ['usuario']},
]
const isActive = ruta => ruta.routes.includes(routeName.value)
</script>
<template lang="pug">
nav.product-nav(aria-label='Secciones de QUIRU Dent AI')
  ul
    li.list(v-for="ruta of rutas" :key='ruta.ruta' :class="{ active: isActive(ruta) }")
      button.nav-action(type='button' @click="push({name:ruta.ruta})" :aria-current="isActive(ruta) ? 'page' : undefined")
        span.icon
          i(:class= 'ruta.icono')
        span.route {{ruta.name}}
    li.list(v-if="item.rol === 'admin'" :class="{ active: routeName === 'admin' }")
      button.nav-action(type='button' @click="push({name: 'admin' })" :aria-current="'admin' == routeName ? 'page' : undefined" aria-label='Ir a Administrador')
        span.icon
          i(class="bi bi-sliders")
        span.route Administrador
</template>
<style lang="sass" scoped>
.product-nav
  width: 100%
  overflow-x: auto
  background: white
  border-bottom: 1px solid var(--color-border)
  ul
    display: flex
    width: min(1240px, calc(100% - 36px))
    padding: 10px 0
    margin: 0
    margin-inline: auto
    gap: 6px
    li
      list-style: none
      .nav-action
        display: flex
        align-items: center
        gap: 0.5rem
        padding: 10px 14px
        border: 0
        border-radius: 10px
        background: transparent
        color: #52657f
        font-weight: 750
        white-space: nowrap
        transition: background-color .18s ease, color .18s ease
        .route
          color: inherit
          font-size: .9rem
        .icon
          color: inherit
      &.active
        .nav-action
          color: var(--brand-blue)
          background: #eaf2ff
      &:not(.active) .nav-action:hover
        color: var(--brand-navy)
        background: #f3f6fa

@media (max-width: 575px)
  .product-nav ul
    width: max-content
    min-width: 100%
    padding-inline: 12px
</style>
