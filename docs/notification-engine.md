# QUIRU Notification Engine

Motor compartido de notificaciones para QUIRU Agenda y QUIRU Dent AI. Esta entrega deja el código, configuración e índices preparados, pero **no despliega recursos**.

## Arquitectura

1. La cita se guarda primero en el modelo propio del producto.
2. Un trigger Firestore normaliza el cambio y crea trabajos idempotentes en `notificationJobs`.
3. Un scheduler central toma únicamente trabajos vencidos (`PENDING` y `processAt <= now`) en lotes de 100.
4. El dispatcher resuelve una plantilla por producto y envía un mensaje de datos mediante FCM.
5. El service worker compartido muestra la notificación en segundo plano; con la aplicación abierta, Vue muestra un aviso interno.

No se recorren colecciones de citas para buscar recordatorios. Los trabajos se generan al crear, reprogramar o cancelar una cita.

## Integración de productos

- Agenda: `businesses/{businessId}/appointments/{appointmentId}`. El destinatario es `createdBy`; usa `startAt`, `status`, `timeZone` y la URL de Agenda.
- Odontología: `citas/{appointmentId}`. El destinatario es `UserId`; usa `start`, `estado` y abre `/dashboard/citas`.
- Los flujos manuales, por voz y desde planes de tratamiento ya convergen en estas escrituras, por lo que no se duplicó lógica en cada formulario.
- Las plantillas odontológicas no incluyen nombre de paciente, diagnóstico, tratamiento ni otro dato clínico.

## Colecciones

### `notificationJobs/{jobId}`

Campos principales: `product`, `type`, `recipientId`, `scheduledAt`, `processAt`, `status`, `channels`, `reference`, `referenceKey`, `templateId`, `payload`, `idempotencyKey`, `appointmentVersion`, `attempts`, `nextAttemptAt`, `leaseExpiresAt`, `lastError`, `createdAt`, `updatedAt`, `expiresAt`.

Estados: `PENDING`, `PROCESSING`, `SENT`, `FAILED`, `CANCELLED`. Los trabajos usan una clave determinista por producto, cita, destinatario, tipo y anticipación. El bloqueo transaccional evita que dos ejecuciones procesen el mismo trabajo simultáneamente.

### `usuario/{uid}/notificationTokens/{tokenHash}`

Guarda `token`, `platform`, `enabled`, `products` y marcas de tiempo. El identificador es un hash SHA-256; se admiten varios dispositivos. FCM invalida automáticamente tokens no registrados o incorrectos.

### `usuario/{uid}/notificationPreferences/{product}`

Guarda `pushEnabled`, `appointmentReminders` y `reminderOffsetsMinutes`. Push inicia desactivado y solo se habilita después de una acción explícita del usuario. El provider vuelve a comprobar esta preferencia justo antes de enviar.

## Functions preparadas

- `getNotificationPreferences`
- `saveNotificationPreferences`
- `registerNotificationToken`
- `sendTestNotification`
- `syncAgendaAppointmentNotifications`
- `syncDentAppointmentNotifications`
- `processNotificationJobs`

Las callables exigen autenticación y App Check, y comprueban acceso al producto. El scheduler corre cada cinco minutos de forma predeterminada (`NOTIFICATION_SCHEDULE` permite cambiarlo), recupera locks vencidos y aplica reintentos a los 5, 30 y 120 minutos, hasta tres intentos.

## Configuración pendiente antes de publicar

1. En Firebase Console, abrir Project settings > Cloud Messaging > Web Push certificates y crear o reutilizar la clave pública VAPID.
2. Copiar solo la clave pública en cada entorno:

   ```env
   VITE_FIREBASE_VAPID_KEY=clave_publica_vapid
   ```

3. Confirmar que `QUIRU_AGENDA_URL` y `QUIRU_DENT_URL` corresponden a los dominios definitivos. Si no se declaran, se usan los valores por defecto definidos en `functions/notifications/config.js`.
4. Fusionar `firestore.notification-rules.fragment` con las reglas productivas reales. El repositorio no tenía el archivo de reglas activo, por lo que el fragmento no se vinculó automáticamente para evitar reemplazarlas.
5. Revisar y publicar los índices de `firestore.indexes.json`.
6. Habilitar TTL sobre `expiresAt` para el grupo `notificationJobs` (requiere permisos y revisión del proyecto):

   ```powershell
   gcloud firestore fields ttls update expiresAt --collection-group=notificationJobs --enable-ttl --project=quiru-prod
   ```

7. Confirmar que Cloud Messaging, Cloud Scheduler y las Functions de segunda generación están habilitados y que el plan del proyecto soporta esos servicios.

El service worker se emite como `/firebase-messaging-sw.js` durante los builds de Agenda y Odontología. El permiso del navegador solo se solicita al pulsar **Activar notificaciones**. Push web exige HTTPS, excepto en `localhost`.

## Comandos de validación

```powershell
npm test
npm run build:smart-agenda
npm run build:dentistry
npm run build:all
```

Antes de un despliegue autorizado, revisar los cambios y luego ejecutar de forma selectiva los comandos apropiados. Esta implementación no ejecutó `firebase deploy`.

## Costos y escala aproximada

Para 1,000 citas futuras con tres avisos configurados se crearían hasta 4,000 trabajos: un evento inmediato y tres recordatorios. Si solo se cuentan los recordatorios, son 3,000 trabajos. La última prueba local generó 3,000 claves únicas en 6.94 ms, modeló 3,000 escrituras iniciales, 3,000 lecturas de resultados vencidos, 30 lotes de 100 y 3,000 envíos. Es una simulación determinista en memoria, no una medición facturada de Firebase; la duración varía según el equipo. Cada trabajo real implica además, normalmente, dos actualizaciones de estado (`PROCESSING` y `SENT`) y lecturas de tokens/preferencias. El scheduler consulta únicamente trabajos vencidos; no escanea las 1,000 citas.

El costo real depende de reprogramaciones, cancelaciones, cantidad de dispositivos y reintentos. TTL elimina trabajos terminales después de 30 días y limita el crecimiento de almacenamiento.

## Límites conocidos

- No se crean recordatorios retroactivos para citas ya existentes cuando el usuario activa push por primera vez; aplican a creaciones o cambios posteriores.
- El destinatario actual es el usuario interno que creó/administra la cita, no el paciente o cliente.
- La entrega push depende del navegador, sistema operativo y políticas de ahorro de batería; FCM no garantiza una hora exacta al segundo.
- Un lote con éxito parcial se considera enviado para evitar duplicar avisos en dispositivos que ya lo recibieron; los tokens inválidos sí quedan deshabilitados.
- `EMAIL`, `WHATSAPP` y `SMS` están reservados en el contrato para futuros providers, pero esta versión implementa solamente `PUSH`.

## Solución de problemas

- **Falta `VITE_FIREBASE_VAPID_KEY`:** crear la clave Web Push pública y reconstruir ambas aplicaciones.
- **`permission-denied` o `unauthenticated`:** confirmar sesión, asignación del módulo y perfil `usuario/{uid}`.
- **App Check rechazado:** configurar `VITE_FIREBASE_APPCHECK_SITE_KEY`; para desarrollo local usar el token de depuración, nunca en producción.
- **Índice requerido:** publicar los índices preparados en `firestore.indexes.json` antes de habilitar el scheduler.
- **No llega la prueba:** verificar permiso del navegador, HTTPS, token habilitado y preferencia `pushEnabled` del producto.
- **Notificación bloqueada:** habilitar permisos desde la configuración del sitio y recargar; la aplicación no vuelve a abrir el popup automáticamente.
- **Job en `PROCESSING`:** el scheduler recupera el lock cuando vence `leaseExpiresAt`.
- **Job `FAILED`:** revisar `lastError` sanitizado y los logs por `product` y `type`; nunca copiar tokens en logs.
