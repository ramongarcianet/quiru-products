# QUIRU LABS Platform

Monorepositorio modular de QUIRU LABS. Contiene aplicaciones Vue 3 compilables por separado que
comparten Firebase, autorización y componentes base cuando el producto lo necesita:

- Portal de productos (`apps/portal`)
- Administración de usuarios y accesos (`apps/administration`)
- Odontología, incluida su agenda clínica (`apps/dentistry` + `src`)
- Agenda inteligente para cualquier negocio (`apps/smart-agenda`)
- QUIRU Serve AI para restaurantes (`apps/serve-ai`)

## Comandos

```bash
npm run dev:portal
npm run dev:administration
npm run dev:dentistry
npm run dev:smart-agenda
npm run dev:serve-ai
npm run build:all
npm test
```

## QUIRU Serve AI

QUIRU Serve AI es el producto conversacional para restaurantes: permite explorar un menú, personalizar
productos, preparar un carrito mediante interacción manual o por voz, confirmar un pedido persistente y
seguir su estado. El consumidor no necesita autenticarse; la configuración y la cocina se protegen con
el acceso administrativo de la plataforma.

### Arquitectura

- `apps/serve-ai/config`: catálogo inicial importable y el identificador público del restaurante, sin secretos.
- `src/repositories`: repositorios JSON para desarrollo y repositorio Firebase Functions para producción.
- `src/domain/orderRulesEngine.js`: disponibilidad, cantidades, variantes, extras, ingredientes,
  modificaciones y validación final.
- `src/domain/money.js`: precios y totales en céntimos de PEN, sin coma flotante ni cálculos del LLM.
- `QuiruAssistant.vue`: voz del navegador, Firebase AI Logic, tool calling y contexto corto. Solo envía
  a Gemini productos relevantes; nunca el menú completo.
- `telemetry.js`: eventos y métricas técnicas en `sessionStorage`, sin audio ni conversación completa.

La IA interpreta. `OrderRulesEngine` valida en el cliente y el servidor vuelve a comprobar productos,
disponibilidad, modificadores y precios. Tras la segunda confirmación por voz o la confirmación manual,
el pedido se guarda en `serveRestaurants/{restaurantId}/orders/{orderId}` y aparece en Cocina.

La gestión del establecimiento asignado está disponible en `/manage` dentro de QUIRU Serve AI. El usuario necesita el módulo `serve-ai` y el campo `serveRestaurantId`; desde allí puede configurar datos del local, carta, precios, combos, disponibilidad y pedidos. El acceso a voz de los usuarios se guarda en `features.voice.enabled` y se administra desde Administración.

Administración incluye restaurantes, categorías, productos, modificadores, disponibilidad, importación
del catálogo inicial y el tablero de cocina con estados Recibido, Preparando, Listo y Entregado.

### Ejecución y pruebas

```bash
npm run dev:serve-ai
npm run build:serve-ai
npm test
```

El modo mesa acepta `?table=12`. Si la voz o Firebase AI Logic no están disponibles, menú, carrito y
confirmación manual continúan funcionando. Si el backend no responde, el carrito se conserva y nunca se
muestra una confirmación falsa. App Check usa
`VITE_FIREBASE_APPCHECK_SITE_KEY`; nunca debe publicarse un token de depuración.

### Hosting (preparado, no desplegado)

El target `serve-ai` está declarado en `firebase.json`, pero no se vinculó ni desplegó. Cuando se
autorice la publicación:

```bash
firebase target:apply hosting serve-ai quiru-serve --project quiru-b444f
firebase deploy --only hosting:serve-ai --project quiru-b444f
```

Antes del hosting deben publicarse las funciones de `functions/serve.js`, abrir Administración e importar
el catálogo inicial. No se desplegó nada como parte de esta implementación.

Pendiente para una fase posterior: POS, pagos, delivery y WhatsApp.

Consulta [documentos/ARQUITECTURA_MODULAR.md](documentos/ARQUITECTURA_MODULAR.md) para la estructura,
el modelo de accesos y la configuración de despliegues independientes.
