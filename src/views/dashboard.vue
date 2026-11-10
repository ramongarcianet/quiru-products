<script setup>
import { alertMensaje } from "../store/helper";
import { computed, ref, watch } from "vue";
import Nav from "../components/Nav.vue";
import Avatar from "../components/Avatar.vue";
import BrandLogo from "../components/BrandLogo.vue";
import { item } from '../store/usuario'

const verDialog = ref(false);
const profile = computed(() => {
  const value = item?.value
  return value && typeof value === 'object' ? value : {}
})
const logoLoadFailed = ref(false)
const logoUrl = computed(() => profile.value?.linkLogo || '')
const consultationName = computed(() => profile.value?.nombreconsultorio || 'Mi consultorio')
const normalizeName = value => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .replace(/\s+/g, ' ')
  .toLocaleLowerCase('es')

const userFullName = computed(() => {
  const name = String(profile.value?.nombre || '').trim().replace(/\s+/g, ' ')
  const normalizedName = ` ${normalizeName(name)} `
  const missingSurnames = [profile.value?.apellidoPaterno, profile.value?.apellidoMaterno]
    .map(value => String(value || '').trim().replace(/\s+/g, ' '))
    .filter(value => value && !normalizedName.includes(` ${normalizeName(value)} `))

  return [name, ...missingSurnames].filter(Boolean).join(' ') || 'Usuario'
})

watch(logoUrl, () => {
  logoLoadFailed.value = false
})

watch(
  () => alertMensaje.value,
  () => {
    verDialog.value = true;
  }
);
</script>

<template lang="pug">
Dialog(v-model='verDialog')
  template(#title) QUIRU Dent AI
  template(#body) {{ alertMensaje }}
  template(#footer)
    button.btn.btn-primary(type='button' data-bs-dismiss='modal') Aceptar

.dashboard-page
  .dashboard-glow.dashboard-glow-a
  .dashboard-glow.dashboard-glow-b
  header.product-header
    .header-inner
      .header-identities
        .brand-block
          BrandLogo(inverse)
        .identity-separator(aria-hidden='true')
        .account-lockup
          span.account-mark(:class='{ empty: !logoUrl || logoLoadFailed }' aria-hidden='true')
            img(v-if='logoUrl && !logoLoadFailed' :src='logoUrl' alt='' @error='logoLoadFailed = true')
          span.account-title
            strong {{ consultationName }}
            span {{ userFullName }}
      .hero-side
        Avatar
  Nav
  .workspace-content
    .dashboard-shell
      #body
        .content-card
          router-view(:key="$route.name === 'atencion-ai' ? $route.fullPath : undefined")
</template>

<style lang="sass" scoped>
.dashboard-page
  min-height: 100vh
  position: relative
  isolation: isolate
  overflow-x: hidden

.dashboard-glow
  position: fixed
  z-index: 0
  border-radius: 50%
  filter: blur(24px)
  pointer-events: none
  opacity: 0.34
  &.dashboard-glow-a
    width: 18rem
    height: 18rem
    top: -5rem
    left: -4rem
    background: rgba(var(--color-primary-rgb), 0.14)
  &.dashboard-glow-b
    width: 16rem
    height: 16rem
    top: 10rem
    right: -4rem
    background: rgba(var(--color-secondary-rgb), 0.12)

.dashboard-shell
  position: relative
  z-index: 1

.product-header
  position: relative
  z-index: 2
  color: white
  background: var(--brand-navy)

.header-inner
  width: min(1240px, calc(100% - 36px))
  min-height: 76px
  margin: 0 auto
  display: flex
  align-items: center
  justify-content: space-between
  gap: 1.25rem
  padding: .8rem 0

.header-identities
  display: flex
  align-items: center
  min-width: 0
  gap: 1.25rem

.brand-block
  display: flex
  align-items: center
  flex: 0 0 auto

.identity-separator
  width: 1px
  height: 2.25rem
  flex: 0 0 auto
  background: rgba(255, 255, 255, 0.18)

.hero-side
  display: flex
  align-items: flex-end

.account-lockup
  display: inline-flex
  align-items: center
  min-width: 0
  gap: 0.75rem

.account-mark
  display: grid
  place-items: center
  flex: 0 0 auto
  width: 2.75rem
  height: 2.75rem
  padding: 0
  overflow: hidden
  border: 1px solid rgba(255, 255, 255, 0.22)
  border-radius: 0.9rem
  background: rgba(255, 255, 255, 0.12)
  img
    display: block
    width: 100%
    height: 100%
    object-fit: cover
  &.empty
    background: transparent

.account-title
  display: flex
  flex-direction: column
  gap: 0.3rem
  line-height: 1
  strong
    color: white
    white-space: nowrap
    font-size: 1.12rem
    font-weight: 600
    letter-spacing: -0.025em
  span
    color: rgba(255, 255, 255, 0.7)
    font-size: 0.68rem
    font-weight: 700
    letter-spacing: 0.08em
    text-transform: uppercase

.workspace-content
  position: relative
  z-index: 1
  width: min(1240px, calc(100% - 36px))
  margin: 0 auto
  padding: 26px 0 50px

#body
  min-height: calc(100vh - 10.5rem)
  width: 100%
  overflow-y: auto

.content-card
  min-height: 100%
  padding: 1.25rem
  background: rgba(255,255,255,0.96)
  border: 1px solid var(--color-border)
  border-radius: var(--radius-card)
  box-shadow: var(--shadow-card)

@media (max-width: 767px)
  .header-inner
    width: calc(100% - 24px)
    min-height: 64px
    gap: .6rem
  .header-identities
    gap: .6rem
  .identity-separator
    height: 2rem
  .hero-side
    align-items: flex-end
  .account-title
    display: none
  .workspace-content
    width: calc(100% - 24px)
    padding-top: 16px
  .content-card
    padding: 1rem
</style>
