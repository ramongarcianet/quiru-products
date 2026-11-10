// Compatibilidad para el módulo odontológico existente.
// La inicialización canónica vive ahora en el paquete compartido de plataforma.
export {
  app,
  appCheck,
  auth,
  firestore,
  iniciarFirebase,
  storage
} from '../../packages/platform/src/firebase.js'
