# Arquitectura modular de QUIRU LABS

La plataforma contiene cinco aplicaciones compilables y desplegables de forma independiente:

| Aplicación | Carpeta | Salida |
|---|---|---|
| Portal de productos | `apps/portal` | `dist/portal` |
| Administración | `apps/administration` | `dist/administration` |
| Odontología | `apps/dentistry` + `src` heredado | `dist/dentistry` |
| Agenda inteligente | `apps/smart-agenda` | `dist/smart-agenda` |
| QUIRU Serve AI | `apps/serve-ai` | `dist/serve-ai` |

El código transversal está en `packages/platform`: Firebase, autenticación, autorización,
registro de productos y estilos base.

## Accesos

Las asignaciones se guardan inicialmente en `usuario/{uid}.modules`:

```json
{
  "modules": {
    "user-admin": { "enabled": true },
    "dentistry": { "enabled": true },
    "smart-agenda": { "enabled": false },
    "serve-ai": { "enabled": false }
  }
}
```

Si el usuario tiene `activeOrganizationId`, la plataforma busca primero
`organizations/{organizationId}/members/{uid}.modules`. Esto permite migrar gradualmente a
membresías multiempresa sin romper las cuentas existentes.

Una cuenta heredada sin `modules` conserva acceso a Odontología. Si además tiene `rol: admin`,
conserva acceso a Administración. Al guardar desde Administración la asignación pasa a ser
explícita.

En desarrollo local, `.env.development` habilita temporalmente todos los módulos para permitir la
configuración inicial. El bypass está condicionado también a `import.meta.env.DEV`, por lo que no
puede activarse dentro de una compilación de producción.

## Desarrollo y compilación

```bash
npm run dev:portal
npm run dev:administration
npm run dev:dentistry
npm run dev:smart-agenda
npm run dev:serve-ai
npm run build:all
```

Los puertos locales son 4170, 4171, 4172, 4173 y 4174 respectivamente. Cada hosting debe recibir las
variables `VITE_*_URL` con las URLs reales de los otros productos.

## Firebase Hosting

El target existente `app` despliega Odontología. Antes de desplegar los otros productos se deben
crear sus sitios en el proyecto Firebase del ambiente y asociarlos una sola vez:

```bash
firebase target:apply hosting portal <SITE_ID_PORTAL>
firebase target:apply hosting administration <SITE_ID_ADMIN>
firebase target:apply hosting smart-agenda <SITE_ID_AGENDA>
firebase target:apply hosting serve-ai <SITE_ID_SERVE_AI>
```

Después se puede desplegar cada aplicación por separado:

```bash
firebase deploy --only hosting:portal
firebase deploy --only hosting:administration
firebase deploy --only hosting:app
firebase deploy --only hosting:smart-agenda
firebase deploy --only hosting:serve-ai
```

Firebase Auth conserva una sesión por origen. Las aplicaciones administrativas comparten usuarios, pero el
SSO entre dominios se implementará como una capacidad posterior del portal.

QUIRU Serve AI no exige autenticación al consumidor en modo mesa/online. Su target está preparado,
pero debe vincularse y desplegarse solamente con autorización explícita.

## Agenda inteligente implementada

El MVP web se encuentra en `apps/smart-agenda` e incluye:

- configuración de negocio y zona horaria;
- clientes, profesionales y servicios;
- agenda diaria y próximas citas;
- creación manual y conversacional con Gemini;
- estados `pending`, `confirmed`, `completed`, `cancelled` y `no_show`;
- bloqueos transaccionales de 15 minutos por profesional para evitar cruces;
- auditoría de altas y cambios de estado;
- aislamiento de datos bajo `businesses/{businessId}`.

Las colecciones utilizadas son `customers`, `professionals`, `services`, `appointments`,
`appointmentLocks` y `auditEvents`. El empaquetado Android con Capacitor, recordatorios externos,
pagos y Gemini Live audio-a-audio permanecen como fases posteriores.
