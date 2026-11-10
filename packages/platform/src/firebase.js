import { getApp, getApps, initializeApp } from 'firebase/app'
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getFunctions } from 'firebase/functions'
import { getStorage } from 'firebase/storage'

const env = import.meta.env

// Los fallbacks conservan el proyecto productivo actual durante la migración.
// Las nuevas instalaciones deben configurar todos los valores VITE_FIREBASE_*.
export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || 'AIzaSyCmuv9CEw64vyP6RMNBje3X-feEsbdg4Lw',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || 'quiru-prod.firebaseapp.com',
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'quiru-prod',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || 'quiru-prod.appspot.com',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '605281793847',
  appId: env.VITE_FIREBASE_APP_ID || '1:605281793847:web:7635e785fb4472e24b0cb2',
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID || 'G-32SFW0E4RR'
}

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig)
export const firestore = getFirestore(app)
export const auth = getAuth(app)
export const storage = getStorage(app)
export const functions = getFunctions(app)

let appCheck
const isBrowser = typeof window !== 'undefined'
const isLocalDevelopment = import.meta.env.DEV && isBrowser &&
  ['localhost', '127.0.0.1'].includes(window.location.hostname)
const appCheckSiteKey = import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY

if (isBrowser && (isLocalDevelopment || appCheckSiteKey)) {
  if (isLocalDevelopment) {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN =
      import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN || true
  }

  appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey || 'debug-mode'),
    isTokenAutoRefreshEnabled: true
  })
}

export const iniciarFirebase = () => ({ app, appCheck, auth, firestore, functions, storage })
export { appCheck }
