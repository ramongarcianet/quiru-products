const birthdayParts = value => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim())
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? { month, day }
    : null
}

const datePartsInTimeZone = (value, timeZone) => Object.fromEntries(
  new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(value).filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)])
)

const birthdayInYear = (parts, year) => {
  const lastDay = new Date(Date.UTC(year, parts.month, 0)).getUTCDate()
  return new Date(Date.UTC(year, parts.month - 1, Math.min(parts.day, lastDay), 12))
}

export const normalizeWhatsAppNumber = (value, defaultCountryCode = '51') => {
  let digits = String(value || '').replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  const countryCode = String(defaultCountryCode || '').replace(/\D/g, '')
  if (digits.length === 9 && countryCode) digits = `${countryCode}${digits}`
  return digits.length >= 10 && digits.length <= 15 ? digits : ''
}

export const patientsWithUpcomingBirthdays = (
  patients = [], now = new Date(), leadDays = 15, timeZone = 'America/Lima'
) => {
  const todayParts = datePartsInTimeZone(now, timeZone)
  const today = new Date(Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day, 12))
  const dayMs = 24 * 60 * 60 * 1000

  return patients.map(patient => {
    const parts = birthdayParts(patient?.fechaNacimiento)
    if (!parts || patient?.estado === false) return null
    let nextBirthday = birthdayInYear(parts, todayParts.year)
    if (nextBirthday < today) nextBirthday = birthdayInYear(parts, todayParts.year + 1)
    const daysUntilBirthday = Math.round((nextBirthday.getTime() - today.getTime()) / dayMs)
    const fullName = [patient.nombre, patient.apellidoPaterno, patient.apellidoMaterno]
      .filter(Boolean).join(' ').trim() || 'Paciente'
    return { ...patient, fullName, nextBirthday, daysUntilBirthday }
  }).filter(Boolean)
    .filter(patient => patient.daysUntilBirthday >= 0 && patient.daysUntilBirthday <= leadDays)
    .sort((a, b) => a.daysUntilBirthday - b.daysUntilBirthday || a.fullName.localeCompare(b.fullName, 'es'))
}
