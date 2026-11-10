<script setup>
import AuthGate from '../../packages/platform/src/components/AuthGate.vue'
import { MODULE_IDS } from '../../packages/platform/src/modules.js'
import SmartAgendaWorkspace from './src/components/SmartAgendaWorkspace.vue'

const portalUrl = import.meta.env.VITE_PORTAL_URL || (
  import.meta.env.DEV ? `http://${window.location.hostname}:4170/` : ''
)
</script>

<template>
  <AuthGate v-slot="{ access, logout, user }" :portal-url="portalUrl" :required-module="MODULE_IDS.SMART_AGENDA">
    <SmartAgendaWorkspace :access="access" :user="user" :logout="logout" :portal-url="portalUrl" />
  </AuthGate>
</template>
