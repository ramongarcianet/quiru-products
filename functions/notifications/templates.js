const config = require('./config')

function offsetLabel(minutes) {
  if (minutes % 1440 === 0) return minutes === 1440 ? '24 horas' : `${minutes / 1440} días`
  if (minutes % 60 === 0) return minutes === 60 ? '1 hora' : `${minutes / 60} horas`
  return `${minutes} minutos`
}

class NotificationTemplateResolver {
  resolve(job) {
    const isDent = job.product === config.products.DENT
    const link = isDent ? `${config.dentUrl}/dashboard/citas` : config.agendaUrl
    const templates = {
      [config.types.APPOINTMENT_CREATED]: {
        title: isDent ? 'Cita odontológica registrada' : 'Nueva cita',
        body: isDent ? 'Se registró una nueva cita odontológica.' : 'Se registró una nueva cita en tu agenda.'
      },
      [config.types.APPOINTMENT_UPDATED]: {
        title: isDent ? 'Cita odontológica modificada' : 'Cita modificada',
        body: isDent ? 'Se actualizó la fecha u hora de una cita odontológica.' : 'Se actualizó la fecha u hora de una cita.'
      },
      [config.types.APPOINTMENT_CANCELLED]: {
        title: isDent ? 'Cita odontológica cancelada' : 'Cita cancelada',
        body: isDent ? 'Se canceló una cita odontológica.' : 'Se canceló una cita de tu agenda.'
      },
      [config.types.APPOINTMENT_REMINDER]: {
        title: isDent ? 'Próxima cita odontológica' : 'Próxima cita',
        body: isDent
          ? `Tienes una cita programada en ${offsetLabel(Number(job.payload?.offsetMinutes || 0))}.`
          : `Tienes una cita en ${offsetLabel(Number(job.payload?.offsetMinutes || 0))}.`
      }
    }
    const template = templates[job.type]
    if (!template) throw new Error(`Template no soportado: ${job.type}`)
    return { ...template, link, locale: job.payload?.locale || 'es-PE' }
  }

  test(product) {
    const isDent = product === config.products.DENT
    return {
      title: isDent ? 'QUIRU Dent AI' : 'QUIRU Agenda',
      body: isDent
        ? 'Las notificaciones de QUIRU Dent AI están funcionando.'
        : 'Las notificaciones de QUIRU Agenda están funcionando.',
      link: isDent ? `${config.dentUrl}/dashboard/citas` : config.agendaUrl,
      locale: 'es-PE'
    }
  }
}

module.exports = { NotificationTemplateResolver, offsetLabel }
