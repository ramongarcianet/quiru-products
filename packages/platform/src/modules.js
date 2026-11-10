export const MODULE_IDS = Object.freeze({
  ADMINISTRATION: 'user-admin',
  DENTISTRY: 'dentistry',
  SMART_AGENDA: 'smart-agenda',
  SERVE_AI: 'serve-ai'
})

export const SERVE_AI_MODULE = Object.freeze({
  id: MODULE_IDS.SERVE_AI,
  name: 'QUIRU Serve AI',
  description: 'Asistente conversacional para explorar menús y preparar pedidos de restaurantes.',
  urlEnv: 'VITE_SERVE_AI_URL',
  accent: 'cyan'
})

export const MODULES = Object.freeze([
  {
    id: MODULE_IDS.DENTISTRY,
    name: 'QUIRU Dent',
    description: 'Gestión odontológica, pacientes, odontograma y citas clínicas.',
    urlEnv: 'VITE_DENTISTRY_URL',
    accent: 'blue'
  },
  {
    id: MODULE_IDS.SMART_AGENDA,
    name: 'QUIRU · Agenda inteligente',
    description: 'Agenda para negocios, clientes, servicios, profesionales y voz.',
    urlEnv: 'VITE_SMART_AGENDA_URL',
    accent: 'cyan'
  },
  {
    id: MODULE_IDS.ADMINISTRATION,
    name: 'Administración',
    description: 'Usuarios, roles y accesos a los productos de QUIRU LABS.',
    urlEnv: 'VITE_ADMINISTRATION_URL',
    accent: 'purple'
  },
  SERVE_AI_MODULE
])

export const moduleById = id => MODULES.find(module => module.id === id)
