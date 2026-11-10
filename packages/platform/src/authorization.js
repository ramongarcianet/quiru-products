import { MODULE_IDS } from './modules.js'

const enabled = value => value === true || value?.enabled === true

export const normalizeFeaturePermissions = (profile = {}, membership = null) => {
  const source = membership?.features || profile?.features || {}
  return { voice: enabled(source.voice) }
}

export const normalizeModuleAssignments = (profile = {}, membership = null) => {
  const source = membership?.modules || profile?.modules

  if (source && typeof source === 'object') {
    return {
      [MODULE_IDS.ADMINISTRATION]: enabled(source[MODULE_IDS.ADMINISTRATION]),
      [MODULE_IDS.DENTISTRY]: enabled(source[MODULE_IDS.DENTISTRY]),
      [MODULE_IDS.SMART_AGENDA]: enabled(source[MODULE_IDS.SMART_AGENDA]),
      [MODULE_IDS.SERVE_AI]: enabled(source[MODULE_IDS.SERVE_AI])
    }
  }

  return {
    [MODULE_IDS.ADMINISTRATION]: profile?.rol === 'admin',
    [MODULE_IDS.DENTISTRY]: true,
    [MODULE_IDS.SMART_AGENDA]: false,
    [MODULE_IDS.SERVE_AI]: false
  }
}

export const canAccessModule = (access, moduleId) =>
  access?.modules?.[moduleId] === true

export const enabledModuleIds = access =>
  Object.entries(access?.modules || {})
    .filter(([, isEnabled]) => isEnabled)
    .map(([moduleId]) => moduleId)

export const canUseVoice = access => access?.features?.voice === true
