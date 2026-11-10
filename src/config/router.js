import { createRouter, createWebHistory } from 'vue-router'
import { obtenerEstadoDeAutentificacion } from '../store/sesion'
import { auth } from './firebase'
import { loadUserAccess } from '../../packages/platform/src/access.js'
import { canAccessModule } from '../../packages/platform/src/authorization.js'
import { MODULE_IDS } from '../../packages/platform/src/modules.js'
const routes = [
    {
      path: '/',
      component: ()=>import('../views/6. Sesion/index.vue'),
      children: [
        /*{
            path:'la',
            name: 'landing',
            component: ()=>import('../views/6. Sesion/3. Landing.vue'),

        },*/
        {
            path:':codigo?',
            name: 'landingConCodigo',
            component: ()=>import('../views/6. Sesion/3. Landing.vue'),

        },
        {
            path:'demo/:codigo?',
            name: 'demo',
            component: ()=>import('../views/6. Sesion/2. Demo.vue'),
        },
        {
            path:'inscripcion/:codigo?',
            name: 'inscripcion',
            component: ()=>import('../views/6. Sesion/4. Inscripcion.vue'),
        },
        {
            path: '',
            component: ()=>import('../views/6. Sesion/1. Sesion.vue'),
            children: [
                {
                    path: '',
                    name: 'iniciar-sesion',
                    component: ()=>import('../views/6. Sesion/1.1 IniciarSesion.vue')
                },
                {
                    path: 'registro',
                    name: 'registro',
                    component: ()=>import('../views/6. Sesion/1.2 Registro.vue')
                },
                {
                    path: 'reset-contrasena',
                    name: 'reset-contrasena',
                    component: ()=>import('../views/6. Sesion/1.3 ResetContraseña.vue')
                },
                {
                    path: 'politica-privacidad',
                    name: 'politica-privacidad',
                    component: ()=>import('../views/6. Sesion/0. Politica.vue')
                },
            ]
        },
      ]
    },
    {
        path:'/dashboard',
        component: ()=>import('../views/dashboard.vue'),
        meta: { requiereAuth: true, module: MODULE_IDS.DENTISTRY },
        children:[
            {
                path: '',
                name: 'reporte',
                component: ()=>import('../views/Reporte.vue')
            },
            {
                path: 'usuarios',
                name: 'usuarios',
                component: ()=>import('../views/2.Usuarios/usuarios.vue')
            },
            {
                path: 'usuario/:idUsuario?',
                name: 'usuario',
                component: ()=>import('../views/2.Usuarios/usuario.vue')
            },
            {
                path: 'pacientes',
                name: 'pacientes',
                component: ()=>import('../views/3.Paciente/pacientes.vue')
            },
            {
                path: 'paciente/:idPaciente?',
                name: 'paciente',
                component: ()=>import('../views/3.Paciente/paciente.vue')
            },
            {
                path: 'pacientes/:idPaciente/atencion-ai',
                name: 'atencion-ai',
                component: ()=>import('../views/5.OdontogramaAI/AtencionAI.vue')
            },
            {
                path: 'paciente-informacion/:idPaciente?',
                component: ()=> import('../views/5.Odontograma/InformacionPaciente.vue'),
                children: [
                    {
                        path: 'pacienteVer',
                        name: 'pacienteVer',
                        component: ()=>import('../views/3.Paciente/pacienteVer.vue')
                    },
                    {
                        path: 'Detalle/:idOdontograma?',
                        name: 'Detalle',
                        component: ()=>import('../views/5.Odontograma/1.AsistenteDeVoz.vue')
                    }, 
                    {
                        path: 'Admision',
                        name: 'Admision',
                        component: ()=>import('../views/1.Admision/Admision.vue')
                    },
                ]
            },
            
            {
                path: 'diccionarios',
                name: 'diccionarios',
                component: ()=>import('../views/4.Diccionario/diccionarios.vue')
            },
            {
                path: 'diccionario/:idDiccionario?',
                name: 'diccionario',
                component: ()=>import('../views/4.Diccionario/diccionario.vue')
            },
            
            {
                path: 'impresion/:idOdontograma?/:idPaciente?',
                name: 'impresion',
                component: ()=>import('../views/5.Odontograma/2.impresion.vue')
            },
            {
                path: 'adicionales/:idOdontograma?/:idPaciente?',
                name: 'adicionales',
                component: ()=>import('../views/5.Odontograma/3.adicionales.vue')
            },
            {
                path: 'plantratamiento/:idOdontograma?/:idPaciente?',
                name: 'plantratamiento',
                component: ()=>import('../views/5.Odontograma/5.plantratamiento.vue')
            },
            {
                path: 'estadisticas',
                name: 'estadisticas',
                component: ()=>import('../views/7.Estadisticas/Estadistica.vue')
            },
            {
                path: 'cotizacion/:idOdontograma?/:idPaciente?',
                name: 'cotizacion',
                component: ()=>import('../views/5.Odontograma/4.cotizacion.vue')
            },
            {
                path: 'citas',
                name: 'citas',
                component: ()=>import('../views/10.Citas/citas.vue')
            },
            {
                path: 'tratamientos',
                name: 'tratamientos',
                component: ()=>import('../views/Tratamientos.vue')
            },
            {
                path: 'notificaciones',
                name: 'notificaciones',
                component: ()=>import('../views/Notificaciones.vue')
            },
            {
                path: 'administracion/:idUsuario?',
                name: 'admin',
                component: ()=> import('../views/5.Odontograma/0.Admin.vue'),
            }
        ]
    },
    {
        path: '/sin-acceso',
        name: 'sin-acceso',
        component: () => import('../views/SinAcceso.vue'),
        meta: { requiereAuth: true }
    }
]

const router = createRouter({
    history: createWebHistory(),
    routes,

})

router.beforeEach( async (to, from, next) => {
    const requiereAutentificacion = to.matched.some(route => route.meta.requiereAuth)
    const moduloRequerido = [...to.matched].reverse().find(route => route.meta.module)?.meta.module

    // Las pantallas públicas no necesitan bloquearse esperando la restauración
    // de Firebase Auth. La suscripción global de sesión redirige después si ya
    // existe un usuario autenticado.
    if (!requiereAutentificacion && !moduloRequerido) {
      next()
      return
    }

    const hayUsuario = await obtenerEstadoDeAutentificacion()
    if (requiereAutentificacion && !hayUsuario) {
      next({ name: 'iniciar-sesion' })
      return
    }

    if (hayUsuario && moduloRequerido) {
      try {
        const access = await loadUserAccess(auth.currentUser.uid)
        if (!canAccessModule(access, moduloRequerido)) {
          next({ name: 'sin-acceso' })
          return
        }
      } catch (error) {
        console.error('No fue posible validar el acceso al módulo', error)
        next({ name: 'sin-acceso' })
        return
      }
    }

    next()
})

export default router
