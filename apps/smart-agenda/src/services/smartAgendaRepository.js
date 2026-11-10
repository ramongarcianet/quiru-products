import {
  Timestamp,
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  writeBatch
} from 'firebase/firestore'
import { firestore } from '../../../../packages/platform/src/firebase.js'
import { appointmentEnd, appointmentLockIds, localDateTime } from '../domain/booking.js'

const businessRef = businessId => doc(firestore, 'businesses', businessId)
const nestedCollection = (businessId, name) => collection(businessRef(businessId), name)

export function subscribeBusiness(businessId, callback, onError) {
  return onSnapshot(businessRef(businessId), snapshot => {
    callback(snapshot.exists() ? { ...snapshot.data(), id: snapshot.id } : { id: businessId })
  }, onError)
}

export function subscribeCollection(businessId, name, callback, onError) {
  return onSnapshot(nestedCollection(businessId, name), snapshot => {
    callback(snapshot.docs.map(item => ({ ...item.data(), id: item.id })))
  }, onError)
}

export async function saveBusiness(businessId, values, actorId) {
  await setDoc(businessRef(businessId), {
    ...values,
    id: businessId,
    updatedAt: serverTimestamp(),
    updatedBy: actorId
  }, { merge: true })
}

export async function createCatalogItem(businessId, collectionName, values, actorId) {
  const itemRef = doc(nestedCollection(businessId, collectionName))
  const auditRef = doc(nestedCollection(businessId, 'auditEvents'))
  const batch = writeBatch(firestore)
  batch.set(itemRef, {
    ...values,
    businessId,
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: actorId
  })
  batch.set(auditRef, {
    action: `${collectionName}.created`,
    objectId: itemRef.id,
    actorId,
    source: 'manual',
    createdAt: serverTimestamp()
  })
  await batch.commit()
  return itemRef.id
}

export async function updateCatalogItem(businessId, collectionName, itemId, values, actorId) {
  const itemRef = doc(nestedCollection(businessId, collectionName), itemId)
  const auditRef = doc(nestedCollection(businessId, 'auditEvents'))
  const batch = writeBatch(firestore)
  batch.update(itemRef, {
    ...values,
    updatedAt: serverTimestamp(),
    updatedBy: actorId
  })
  batch.set(auditRef, {
    action: `${collectionName}.updated`,
    objectId: itemId,
    actorId,
    source: 'manual',
    after: values,
    createdAt: serverTimestamp()
  })
  await batch.commit()
}

export async function archiveCatalogItem(businessId, collectionName, itemId, actorId) {
  return updateCatalogItem(businessId, collectionName, itemId, { active: false }, actorId)
}

export async function createAppointment(businessId, input, actorId) {
  const start = localDateTime(input.date, input.time)
  if (start.getTime() < Date.now() - 60000) throw new Error('No se puede reservar una cita en el pasado.')
  const end = appointmentEnd(start, input.durationMinutes)
  const lockIds = appointmentLockIds(input.professionalId, start, end)
  const appointmentRef = doc(nestedCollection(businessId, 'appointments'))
  const auditRef = doc(nestedCollection(businessId, 'auditEvents'))
  const customerRef = doc(nestedCollection(businessId, 'customers'), input.customerId)
  const professionalRef = doc(nestedCollection(businessId, 'professionals'), input.professionalId)
  const serviceRef = doc(nestedCollection(businessId, 'services'), input.serviceId)
  const lockRefs = lockIds.map(lockId => doc(nestedCollection(businessId, 'appointmentLocks'), lockId))

  await runTransaction(firestore, async transaction => {
    const [customer, professional, service, ...locks] = await Promise.all([
      transaction.get(customerRef),
      transaction.get(professionalRef),
      transaction.get(serviceRef),
      ...lockRefs.map(lockRef => transaction.get(lockRef))
    ])
    if (!customer.exists() || customer.data().active === false) throw new Error('El cliente ya no está disponible.')
    if (!professional.exists() || professional.data().active === false) throw new Error('El profesional ya no está disponible.')
    if (!service.exists() || service.data().active === false) throw new Error('El servicio ya no está disponible.')
    if (locks.some(lock => lock.exists())) throw new Error('Ese profesional ya tiene una cita en el horario seleccionado.')

    const payload = {
      businessId,
      branchId: input.branchId || 'main',
      customerId: input.customerId,
      customerName: customer.data().name,
      customerPhone: customer.data().phone || '',
      professionalId: input.professionalId,
      professionalName: professional.data().name,
      serviceId: input.serviceId,
      serviceName: service.data().name,
      durationMinutes: Number(input.durationMinutes),
      price: Number(service.data().price || 0),
      startAt: Timestamp.fromDate(start),
      endAt: Timestamp.fromDate(end),
      timeZone: input.timeZone || 'America/Lima',
      status: input.status || 'confirmed',
      notes: String(input.notes || '').trim(),
      source: input.source || 'manual',
      idempotencyKey: input.idempotencyKey || globalThis.crypto?.randomUUID?.() || `${actorId}-${Date.now()}`,
      lockIds,
      createdBy: actorId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }
    transaction.set(appointmentRef, payload)
    lockRefs.forEach(lockRef => transaction.set(lockRef, {
      appointmentId: appointmentRef.id,
      professionalId: input.professionalId,
      startAt: Timestamp.fromDate(start),
      endAt: Timestamp.fromDate(end)
    }))
    transaction.set(auditRef, {
      action: 'appointments.created',
      objectId: appointmentRef.id,
      actorId,
      source: payload.source,
      after: payload,
      createdAt: serverTimestamp()
    })
  })
  return appointmentRef.id
}

export async function updateAppointmentStatus(businessId, appointment, status, actorId) {
  const appointmentRef = doc(nestedCollection(businessId, 'appointments'), appointment.id)
  const auditRef = doc(nestedCollection(businessId, 'auditEvents'))
  const lockRefs = (appointment.lockIds || []).map(lockId =>
    doc(nestedCollection(businessId, 'appointmentLocks'), lockId))
  await runTransaction(firestore, async transaction => {
    const current = await transaction.get(appointmentRef)
    if (!current.exists()) throw new Error('La cita ya no existe.')
    transaction.update(appointmentRef, {
      status,
      updatedAt: serverTimestamp(),
      updatedBy: actorId,
      ...(status === 'cancelled' ? { cancelledAt: serverTimestamp() } : {})
    })
    if (['cancelled', 'completed', 'no_show'].includes(status)) {
      lockRefs.forEach(lockRef => transaction.delete(lockRef))
    }
    transaction.set(auditRef, {
      action: `appointments.${status}`,
      objectId: appointment.id,
      actorId,
      before: { status: current.data().status },
      after: { status },
      createdAt: serverTimestamp()
    })
  })
}
