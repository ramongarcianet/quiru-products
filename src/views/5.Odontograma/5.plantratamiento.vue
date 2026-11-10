<script setup>
import { ref, watch, computed, onMounted, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { leerEnRegistro, actualizar, leerOdonto, item } from "../../store/formodontograma";
import { progressFile } from '../../store/storage.js';
import { listaDeTratamientos as _Hallazgos } from '../../config/Parametros';
import { esLetra, esNumero } from '../../config/libreria'
import vSelect from "vue-select"
//import { item as itemusuario, actualizar as actualizarUser, leer } from '../../store/usuario'
import { miUsuario } from '../../store/sesion'
import { registroParametro, actualizar as actualizarParametro, guardar as GuardarParametro, obtenerTodos, itemParam } from "../../store/parametros";
import { registro as catalogoTratamientos, obtenerTodos as obtenerPrecios } from '../../store/precios'
const { push, back } = useRouter();
const registro = ref([])
const registroTratamiento = ref([])
const registroActualizado = ref([]);
const registroSeleccionado = ref({})
const mensajePlanificacion = ref('')
let detenerPrecios = () => {}
const registroRevertido = computed(() => registro.value.slice().reverse());
const tratamientosDe = (diagnostico) => Array.isArray(diagnostico?.Tratamiento) ? diagnostico.Tratamiento : []
const totalTratamientos = (diagnostico, campo) => tratamientosDe(diagnostico)
  .reduce((total, tratamiento) => total + Number(tratamiento?.[campo] || 0), 0)
const route = useRoute()
const guardarTratamiento = () => {
  registro.value.push({
    Pieza: '',
    Atendido: false,
    Diagnostico: 'Sin diagnóstico',
    Tratamiento: []
  })
}
const nuevoTratamiento = () => ({
  Tratamiento: '',
  Fecha: '',
  Precio: 0.0,
  Acuenta: 0.0,
  Resto: 0,
  Observacion: "",
  Receta: ""
})
const AgregarTratamiento = (diagnostico = registroSeleccionado.value) => {
  if (!Array.isArray(diagnostico.Tratamiento)) {
    diagnostico.Tratamiento = []
  }
  diagnostico.Tratamiento.push(nuevoTratamiento())
}
const prepararPlanificacion = () => {
  mensajePlanificacion.value = ''
  registro.value.forEach(diagnostico => {
    if (!Array.isArray(diagnostico.Tratamiento)) {
      diagnostico.Tratamiento = []
    }
    if (diagnostico.Tratamiento.length === 0) {
      diagnostico.Tratamiento.push(nuevoTratamiento())
    }
  })
}
const agregarTratamientoSinDiagnostico = () => {
  registro.value.push({
    Pieza: '',
    Atendido: false,
    Diagnostico: 'Sin diagnóstico',
    Tratamiento: [nuevoTratamiento()],
    Observación: ''
  })
}
watch(registroActualizado, (newValue) => {
  registro.value = newValue
}, { deep: true })
if (route.params.idOdontograma) {
  leerOdonto(route.params.idOdontograma)
}
leerEnRegistro(route.params.idOdontograma);
const _listaDeHallazgos = computed(() => {
  return _Hallazgos.filter((elem) => elem.label != "").map(({ label, value }) => ({ label, value }))
});
/*const _listaDeHallazgosManuales = ref([]);
watch(
  () => itemusuario.value?.Diagnosticos,
  () => {
    _listaDeHallazgosManuales.value = itemusuario.value?.Diagnosticos
  }
);*/
const _listaTratamientos = ref([]);

watch(
  () => item.value?.hallazgos,
  () => {
    let planTrata = (item.value?.planTrata != undefined) ? item.value?.planTrata.length : 0;
    if (item.value?.hallazgos.length > 0 && planTrata == 0) {
      item.value?.hallazgos.forEach(element => {
        let pz = element.dienteAlterno != "" ? " - " + element.dienteAlterno : "";
        let dg = element.ubicacion != '' ? ' - ' + element.ubicacion : element.ubicacion
        let sg = element.sigla != '' ? ' - ' + element.sigla : '';
        let fila = {
          hallazgo:element.hallazgo,
          Pieza: element.diente + pz,
          Diagnostico: element.descripcion + dg + sg,
          Tratamiento: [],
          Observación: "",
          Atendido: element.Atendido !== undefined ? element.Atendido : false
        }
        registro.value.push(fila)
      });
    }
    else if (planTrata > 0) {
      item.value?.planTrata.forEach(element => {
        let fila = {
          hallazgo:element.hallazgo || element.Diagnostico,
          Pieza: element.Pieza,
          Diagnostico: element.Diagnostico,
          Tratamiento: Array.isArray(element.Tratamiento) ? element.Tratamiento : [],
          Observación: element.Observación,
          Atendido: element.Atendido
        }
        registro.value.push(fila)
      });
    }
  },
  { deep: true }
)
const borrar = (item) => {
  const index = registro.value.indexOf(item)
  if (index !== -1) {
    registro.value.splice(index, 1)
    return actualizar(route.params.idOdontograma)
  }
}
const mensaje = ref('')
const hayError = ref(false)
const crear_ = () => new Promise(async (resolve, reject) => {
  try {
    registro.value.forEach(item => {
      if (item.Atendido === undefined) {
        item.Atendido = false;
      }
      if (item.Diagnostico === undefined) {
        item.Diagnostico = "Sin diagnóstico";
      }
      if (item.Observación === undefined) {
        item.Observación = "";
      }
    });
    item.value.planTrata = registro.value

    await actualizar(route.params.idOdontograma)
    progressFile.value = 0
    hayError.value = false
    resolve()
  }
  catch (e) {
    hayError.value = true
    reject(e)
  }
})
function esNumeroGuion($event) {
  var patron = /^[0-9\s-]+$/;
  if (patron.test($event.key)) {
    return true;
  } else {
    $event.preventDefault();
  }
}
/*const guardarOActualizar = () => {
  return actualizarUser(itemusuario.value)
}*/
onMounted(() => {
  //leer(miUsuario().uid);
  obtenerTodos();
  detenerPrecios = obtenerPrecios()
});
onUnmounted(() => detenerPrecios?.())
function verDiagnostico(fila) {
  if (!Array.isArray(fila.Tratamiento)) {
    fila.Tratamiento = []
  }
  registroSeleccionado.value = fila
  registroTratamiento.value = fila.Tratamiento;
}
watch(
  () => registroParametro.value,
  () => {
    if (registroParametro.value[0]?.Tratamientos != undefined) {
      registroParametro.value[0]?.Tratamientos.forEach(item => {
        _listaTratamientos.value.push(item);
      })
    }
  }
);
const _listaTratamientos1 = computed(() => {
  itemParam.value = registroParametro.value[0] || [];
  return itemParam.value?.Tratamientos?.filter((elem) => elem.label != "").map(({ label, value }) => ({ label, value }))
});
const opcionesTratamiento = computed(() => {
  const catalogo = catalogoTratamientos.value
    .filter(tratamiento => tratamiento.activo !== false)
    .map(tratamiento => ({
      id: tratamiento.id,
      label: tratamiento.nombre || tratamiento.tipo,
      value: tratamiento.nombre || tratamiento.tipo,
      precio: Number(tratamiento.precio || 0),
      codigo: tratamiento.codigo || '',
      categoria: tratamiento.categoria || '',
      especialidad: tratamiento.especialidad || '',
      duracionMinutos: Number(tratamiento.duracionMinutos || 0),
      requierePieza: tratamiento.requierePieza !== false,
    }))
  const nombres = new Set(catalogo.map(tratamiento => String(tratamiento.label).trim().toLocaleLowerCase('es')))
  const heredados = (_listaTratamientos1.value || []).filter(tratamiento =>
    !nombres.has(String(tratamiento.label || '').trim().toLocaleLowerCase('es')))
  return [...catalogo, ...heredados]
})
const seleccionarTratamiento = (tratamiento, seleccionado) => {
  if (!seleccionado || typeof seleccionado !== 'object') return
  tratamiento.Tratamiento = seleccionado
  tratamiento.catalogoId = seleccionado.id || ''
  tratamiento.Codigo = seleccionado.codigo || ''
  tratamiento.Categoria = seleccionado.categoria || ''
  tratamiento.Especialidad = seleccionado.especialidad || ''
  tratamiento.DuracionMinutos = Number(seleccionado.duracionMinutos || 0)
  if (seleccionado.precio !== undefined) tratamiento.Precio = Number(seleccionado.precio || 0)
}
async function crearPT() {
  mensajePlanificacion.value = ''
  try {
    item.value.planTrata = registro.value
    const tratamientosPlanificados = registro.value.flatMap(fila => fila.Tratamiento || [])
    //Guardar parametros
    if (registroParametro.value != undefined && registroParametro.value?.Tratamientos == undefined) {
      itemParam.value = registroParametro.value[0];
    }
    if (itemParam.value != undefined && itemParam.value?.Tratamientos == undefined) {
      itemParam.value.Tratamientos = []
    }
    if (itemParam.value != undefined && itemParam.value?.Tratamientos != undefined) {
      tratamientosPlanificados.forEach(_item => {
        let filt = _item.Tratamiento?.label || _item.Tratamiento;
        let _Tratamientos = itemParam.value?.Tratamientos.filter((elem) => elem.label == filt);
        if (_Tratamientos.length == 0) {
          itemParam.value?.Tratamientos.push({
            label: filt,
            value: filt
          })
        }
      })
      await actualizarParametro(itemParam.value)
    }
    else {
      itemParam.value = {
        UserId: miUsuario().uid,
        Tratamientos: []
      }
      tratamientosPlanificados.forEach(_item => {
        let filt = _item.Tratamiento?.label || _item.Tratamiento;
        itemParam.value?.Tratamientos.push({
          label: filt,
          value: filt
        })
      })
      await GuardarParametro(itemParam.value)
    }
    registroParametro.value[0] = itemParam.value
    await actualizar(route.params.idOdontograma)
    progressFile.value = 0
    hayError.value = false
    mensajePlanificacion.value = 'Datos actualizados correctamente'
  }
  catch (e) {
    hayError.value = true
    mensajePlanificacion.value = 'No se pudieron actualizar los datos'
  }
}
const borrarPP = (item, diagnostico = registroSeleccionado.value) => {
  const tratamientos = diagnostico.Tratamiento || []
  const index = tratamientos.indexOf(item)

  if (index !== -1) {
    tratamientos.splice(index, 1)
    if (tratamientos.length === 0 && diagnostico.Diagnostico === 'Sin diagnóstico' && !diagnostico.Pieza) {
      const diagnosticoIndex = registro.value.indexOf(diagnostico)
      if (diagnosticoIndex !== -1) {
        registro.value.splice(diagnosticoIndex, 1)
      }
    }
    item.value.planTrata = registro.value
    actualizar(route.params.idOdontograma)
  }
}

function crearPT2() {
  try {
    registro.value.forEach(_item => {
      if (registroSeleccionado.value.Pieza == _item.Pieza && registroSeleccionado.value.Diagnostico == _item.Diagnostico) {
        registroSeleccionado.value.Tratamiento = registroTratamiento.value;
        _item.Tratamiento = registroSeleccionado.value.Tratamiento;
      }
    });
    item.value.planTrata = registro.value
    //Guardar parametros
    if (registroParametro.value != undefined && registroParametro.value?.Tratamientos == undefined) {
      itemParam.value = registroParametro.value[0];
    }

    registroParametro.value[0] = itemParam.value
    actualizar(route.params.idOdontograma)
    progressFile.value = 0
    hayError.value = false
  }
  catch (e) {
    hayError.value = true
  }
}


</script>
<template lang="pug">
.row
  .col-7.col-md-9
    h1.my-0(style="color: var(--brand-navy); font-size: 1.5em") Plan de
    h1(style="color: var(--brand-blue); font-weight:bold; font-size: 1.5em") Tratamiento
    button.btn.btn-outline-primary.border-0(@click="back()" )
      i.bi.bi-arrow-left.fs-3
  .col-5.col-md-3.mt-5
    .row.align-items-center.p-1
      .d-flex.gap-2.justify-content-end
        button.btn.btn-primary(@click="guardarTratamiento()")
          i.bi.bi-plus-circle.me-2
          span Agregar
        button.btn.btn-primary(type='button' data-bs-toggle='modal' data-bs-target='#tratamientosModal' @click='prepararPlanificacion()')
          i.bi.bi-list-ul.me-2
          span Planificar
.row
  .col.m-2
    Form( :onPromise="() => crear_(item)" :onSuccess='()=>mensaje= "Actualizado con éxito"' :onCatch='(e) => mensaje = e') 
      .row
        .card.treatment-table-heading.d-none.d-md-block.mx-1
          .row.align-items-center.p-1(style="color:var(--brand-navy);font-weight: bold;")
            .col-2 Pieza
            .col-5 Diagnóstico
            .col-1 Precio
            .col-1 A cuenta
            .col-1 Resto
            .col-md-1.d-none.d-md-block Atender
        .card.treatment-row.mt-2(v-for="item of registroRevertido")
          .row.p-1.m-1
            .col-4.d-md-none.mt-1
              p(style="font-size: 0.89rem;") Pieza:
            .col-8.col-md-2.ps-1(v-if="item.Pieza.length <= 5 && item.Diagnostico == 'Sin diagnóstico' && !item.Tratamiento?.label")
              input.form-control(v-model="item.Pieza" @keypress="esNumeroGuion($event)" type="text" maxlength="7")
            .col-8.col-md-2.ps-1(v-else) {{ item.Pieza }}
            .col-4.d-md-none.mt-1
              p(style="font-size: 0.89rem;") Diagnóstico:
            .col-8.col-md-5.ps-1 {{ item.Diagnostico }}
            .col-4.d-md-none.mt-1
              p(style="font-size: 0.89rem;") Precio:
            .col-8.col-md-1.ps-1 {{ totalTratamientos(item, 'Precio') }}
            .col-4.d-md-none.mt-1
              p(style="font-size: 0.89rem;") A cuenta:
            .col-8.col-md-1.ps-1 {{ totalTratamientos(item, 'Acuenta') }}
            .col-4.d-md-none.mt-1
              p(style="font-size: 0.89rem;") Resto:
            .col-8.col-md-1.ps-1 {{ totalTratamientos(item, 'Precio') - totalTratamientos(item, 'Acuenta') }}
            .col-4.d-md-none.mt-1
              p(style="font-size: 0.89rem;") Atender:
            .col-8.col-md-1.ps-1
              button.text-white.text-start.btn.btn-primary.d-flex.justify-content-between.px-3.align-items-center(@click="verDiagnostico(item)" type='button' data-bs-toggle='modal', data-bs-target='#tratamientosAtModal')
                i.bi.bi-journal-medical
            .col-4.d-md-none.mt-1
              p(style="font-size: 0.89rem;") Eliminar:
            .col-8.col-md-1.ps-1
              BotonSeguro.mt-0( :onSuccess= '() => borrar(item)' )
                i.bi.bi-trash
        .card.treatment-total.mt-2
          .row.p-2(style="color:var(--brand-navy);font-weight: bold;")
            .col-md-7.col-6.d-none.d-md-block Total:
            .col-6.d-md-none.mt-1
              p(style="font-size: 0.89rem;") Total Precio:
            .col-6.col-md-1.ps-1 {{ registro.reduce((total, diagnostico) => total + totalTratamientos(diagnostico, 'Precio'), 0) }}
            .col-6.d-md-none.mt-1
              p(style="font-size: 0.89rem;") Total a Cuenta:
            .col-6.col-md-1.ps-1 {{ registro.reduce((total, diagnostico) => total + totalTratamientos(diagnostico, 'Acuenta'), 0) }}
            .col-6.d-md-none.mt-1
              p(style="font-size: 0.89rem;") Total Resto:
            .col-6.col-md-1.ps-1 {{ registro.reduce((total, diagnostico) => total + totalTratamientos(diagnostico, 'Precio'), 0) - registro.reduce((total, diagnostico) => total + totalTratamientos(diagnostico, 'Acuenta'), 0) }}
      .row.mt-2
        .alert.alert-dismissible( v-if='mensaje' role='alert' :class='hayError? "alert-danger" : "alert-success" ' ) 
          strong {{mensaje}}
          button.btn-close(type='button' data-bs-dismiss='alert')
      .d-flex.mt-2.mb-5
        button.ms-auto.btn.btn-primary(type="submit") Guardar

  Teleport(to='body')
    #tratamientosModal.modal.fade(tabindex='-1')
      .modal-dialog.modal-xl.modal-dialog-scrollable
        .modal-content
          .modal-header
            h2.primary-text.fw-bold Generar plan de tratamiento
            button.btn-close(type='button' data-bs-dismiss='modal')
          .modal-body
            .d-flex.justify-content-between.align-items-center.mb-3
              h5.mb-0 Tratamientos planificados
              button.btn.btn-primary(type='button' @click='agregarTratamientoSinDiagnostico()')
                i.bi.bi-plus-circle.me-2
                span Agregar tratamiento
            .text-center.py-4(v-if='registroRevertido.length === 0') No hay diagnósticos para planificar.
            .card.treatment-table-heading.d-none.d-md-block.mx-1(v-if='registroRevertido.length')
              .row.p-2(style="color:var(--brand-navy);font-weight: bold")
                .col-md-1 Pieza
                .col-md-2 Diagnóstico
                .col-md-2 Tratamiento
                .col-md-2 Fecha
                .col-md-1 Precio
                .col-md-1 A cuenta
                .col-md-1 Resto
                .col-md-1 Eliminar
            template(v-for="(diagnostico, diagnosticoIndex) of registroRevertido" :key="`${diagnostico.Pieza}-${diagnostico.Diagnostico}-${diagnosticoIndex}`")
              .card.treatment-row.mt-2(v-for="(tratamiento, tratamientoIndex) of tratamientosDe(diagnostico)" :key="`${diagnosticoIndex}-${tratamientoIndex}`")
                .row.p-2.align-items-center
                  .col-4.d-md-none.mt-2 Pieza
                  .col-8.col-md-1
                    input.form-control(v-if="diagnostico.Diagnostico === 'Sin diagnóstico'" v-model='diagnostico.Pieza' type='text' maxlength='7' placeholder='Pieza')
                    span(v-else) {{ diagnostico.Pieza }}
                  .col-4.d-md-none.mt-2 Diagnóstico
                  .col-8.col-md-2 {{ diagnostico.Diagnostico }}
                  .col-4.d-md-none.mt-2 Tratamiento
                  .col-8.col-md-2
                    v-select(v-model='tratamiento.Tratamiento' :options='opcionesTratamiento' placeholder='Seleccione/Agregue' taggable @option:selected='seleccionarTratamiento(tratamiento, $event)')
                  .col-4.d-md-none.mt-2 Fecha
                  .col-8.col-md-2
                    input.form-control(v-model='tratamiento.Fecha' type='datetime-local')
                  .col-4.d-md-none.mt-2 Precio
                  .col-8.col-md-1
                    input.form-control.text-end(v-model='tratamiento.Precio' maxlength='7' type='number' min='0.00' max='10000.00' step='0.01')
                  .col-4.d-md-none.mt-2 A cuenta
                  .col-8.col-md-1
                    input.form-control.text-end(v-model='tratamiento.Acuenta' maxlength='7' type='number' min='0.00' max='10000.00' step='0.01')
                  .col-4.d-md-none.mt-2 Resto
                  .col-8.col-md-1.text-end {{ Number(tratamiento.Precio || 0) - Number(tratamiento.Acuenta || 0) }}
                  .col-4.d-md-none.mt-2 Eliminar
                  .col-8.col-md-1
                    BotonSeguro.mt-0(:onSuccess='() => borrarPP(tratamiento, diagnostico)')
                      i.bi.bi-trash
            .card.treatment-total.mt-2(v-if='registroRevertido.length')
              .row.p-2(style="color:var(--brand-navy);font-weight: bold;")
                .col-md-7.col-6 Total:
                .col-md-1.col-6 {{ registro.reduce((total, diagnostico) => total + totalTratamientos(diagnostico, 'Precio'), 0) }}
                .col-6.d-block.d-md-none A cuenta:
                .col-md-1.col-3 {{ registro.reduce((total, diagnostico) => total + totalTratamientos(diagnostico, 'Acuenta'), 0) }}
                .col-6.d-block.d-md-none Resta:
                .col-md-1.col-3 {{ registro.reduce((total, diagnostico) => total + totalTratamientos(diagnostico, 'Precio'), 0) - registro.reduce((total, diagnostico) => total + totalTratamientos(diagnostico, 'Acuenta'), 0) }}
            .alert.mt-3.mb-0(v-if='mensajePlanificacion' role='alert' :class='hayError ? "alert-danger" : "alert-success"')
              i.me-2(:class='hayError ? "bi bi-exclamation-circle" : "bi bi-check-circle"')
              span {{ mensajePlanificacion }}
          .modal-footer
            button.btn.btn-secondary(type='button', data-bs-dismiss='modal') Cancelar
            button.btn.btn-primary(type='button'  @click="crearPT()") Grabar

  Teleport(to='body')
    #tratamientosAtModal.modal.fade(tabindex='-1')
      .modal-dialog.modal-lg
        .modal-content
          .modal-header
            h2.primary-text.fw-bold Atender
            button.btn-close(type='button' data-bs-dismiss='modal')
          .modal-body
            form
              .row.mb-3
                .col-12.col-md-6
                  h4.dark-text Diagnóstico:  {{registroSeleccionado.Diagnostico}}
                .col-12.col-md-6
                  h4.dark-text Pieza: {{registroSeleccionado.Pieza}}
              .row.mb-3
                .card.treatment-table-heading.d-none.d-md-block.mx-1
                  .row.p-1(style="color:var(--brand-navy);font-weight: bold;")
                    .col-md-3.col-lg-3 Tratamiento
                    .col-md-4.col-lg-4 Comentarios
                .card.treatment-row.mt-2(v-for="item of registroTratamiento")
                  .row.p-1.m-1
                    .col-md-3.col-lg-3 {{item.Tratamiento.label}}
                    .col-md-4.col-lg-8
                      textarea.form-control( rows="2" v-model="item.Observación" placeholder='Comentarios')
          .modal-footer
            button.btn.btn-secondary(type='button', data-bs-dismiss='modal') Cancelar
            button.btn.btn-primary(type='button'  @click="crearPT2()") Grabar

</template>

<style lang="sass" scoped>
.treatment-table-heading, .treatment-total
  color: var(--brand-navy)
  background: #eef4ff !important
  border: 1px solid var(--color-border)
  border-radius: 12px
  box-shadow: none
  font-weight: 700

.treatment-row
  border: 1px solid var(--color-border)
  border-radius: 12px
  box-shadow: none
  transition: border-color .18s ease, background-color .18s ease
  &:hover
    border-color: rgba(var(--brand-blue-rgb), .28)
    background: #f7faff

.opciones
  margin-left: auto
  margin-right: auto
  display: flex
  flex-direction: column
  justify-content: center
  align-items: center
  width: 100%
  height: auto
  .outline-quiru
    width: 100%
    height: 75px
    border-radius: 50px
    border: 1px solid var(--color-primary)
    background-color: transparent
    display: flex
    flex-direction: row
    justify-content: space-around
    align-items: center
    &.solid
      background-color: var(--color-primary)
    &.disabled
      border: none
      background-color: gray
      
    .contenido
      display: flex
      flex-direction: column
      align-items: start
      justify-content: start
      width: 150px
      .title
        font-weight: 700
        color: var(--color-primary)

        &.light-quiru
          color: var(--color-white)
          background: transparent
      .subtitle
        font-weight: 400
        color: var(--color-primary)
        &.light-quiru
          color: var(--color-white)
    .icono
      font-size: 26px
      color: var(--color-primary)
      &.light-quiru
        color: var(--color-white)

#myCanvas
  border: 1px solid #212529

</style>
