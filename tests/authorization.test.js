import test from 'node:test'
import assert from 'node:assert/strict'
import {
  canAccessModule,
  canUseVoice,
  enabledModuleIds,
  normalizeFeaturePermissions,
  normalizeModuleAssignments
} from '../packages/platform/src/authorization.js'
import { MODULE_IDS } from '../packages/platform/src/modules.js'

test('mantiene Odontología para cuentas heredadas', () => {
  const modules = normalizeModuleAssignments({ rol: 'odontologo' })
  assert.equal(modules[MODULE_IDS.DENTISTRY], true)
  assert.equal(modules[MODULE_IDS.ADMINISTRATION], false)
  assert.equal(modules[MODULE_IDS.SMART_AGENDA], false)
  assert.equal(modules[MODULE_IDS.SERVE_AI], false)
})

test('mantiene Administración para administradores heredados', () => {
  const modules = normalizeModuleAssignments({ rol: 'admin' })
  assert.equal(modules[MODULE_IDS.ADMINISTRATION], true)
})

test('una asignación explícita reemplaza la compatibilidad heredada', () => {
  const modules = normalizeModuleAssignments({
    rol: 'admin',
    modules: {
      [MODULE_IDS.DENTISTRY]: { enabled: false },
      [MODULE_IDS.SMART_AGENDA]: { enabled: true }
    }
  })
  const access = { modules }

  assert.equal(canAccessModule(access, MODULE_IDS.DENTISTRY), false)
  assert.equal(canAccessModule(access, MODULE_IDS.ADMINISTRATION), false)
  assert.deepEqual(enabledModuleIds(access), [MODULE_IDS.SMART_AGENDA])
})

test('la membresía de organización prevalece sobre el perfil', () => {
  const modules = normalizeModuleAssignments(
    { modules: { [MODULE_IDS.DENTISTRY]: true } },
    { modules: { [MODULE_IDS.SMART_AGENDA]: true } }
  )

  assert.equal(modules[MODULE_IDS.DENTISTRY], false)
  assert.equal(modules[MODULE_IDS.SMART_AGENDA], true)
})

test('permite asignar QUIRU Serve AI explícitamente desde Administración', () => {
  const modules = normalizeModuleAssignments({
    modules: { [MODULE_IDS.SERVE_AI]: { enabled: true } }
  })
  assert.equal(modules[MODULE_IDS.SERVE_AI], true)
  assert.equal(canAccessModule({ modules }, MODULE_IDS.SERVE_AI), true)
})

test('el permiso de voz es independiente del acceso a los módulos', () => {
  const denied = normalizeFeaturePermissions({ modules: { [MODULE_IDS.SMART_AGENDA]: true } })
  const allowed = normalizeFeaturePermissions({ features: { voice: { enabled: true } } })
  const organization = normalizeFeaturePermissions(
    { features: { voice: true } },
    { features: { voice: { enabled: false } } }
  )

  assert.equal(canUseVoice({ features: denied }), false)
  assert.equal(canUseVoice({ features: allowed }), true)
  assert.equal(canUseVoice({ features: organization }), false)
})
