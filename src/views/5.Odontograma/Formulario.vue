<script setup>
import { onMounted, onUnmounted, watch, computed, ref } from "vue";
import OdonOficial from "./2.impresion.vue";
import { limpiarSinVoz } from "../../store/comandosDeVoz";
import { obtenerTodoDiccionario, obtenerTodoPieza, obtenerTodoHallazgo, obtenerTodoCaries, } from "../../store/odonto";
import { detenerVoz, activarVoz, isSpeech, speechError, Hallazgo, item, paginaOdontograma, textoEscuchado, resizeWindow, } from "../../store/odontograma";
import { actualizarDetalle, leerEnRegistro, item as itemodontograma, agregarLista, mensajeExistePieza, getItemEnRegistro, validaDoble } from '../../store/formodontograma';
import { VerFormato } from "../../store/Canvas";
import { useRoute, useRouter } from "vue-router";
import { listaDeDientesCombo, listaDeHallazgos as _Hallazgos } from '../../config/Parametros';
import vSelect from "vue-select"
import { voiceAccessEnabled } from '../../store/sesion'

const route = useRoute();
const listaDiccionario = obtenerTodoDiccionario();
const listaPieza = obtenerTodoPieza();
const listaHallazgo = obtenerTodoHallazgo();
const listaCaries = obtenerTodoCaries();
const { push } = useRouter()
leerEnRegistro(route.params.idOdontograma);
let temList = [];
let wakeLock = null;
const _tipoOdonto = ref(route.params.tipoOdonto)
const _listaDeHallazgos = computed(() => {
  return _Hallazgos.filter((elem) => elem.label != "").map(({ label, value }) => ({ label, value }))
});
onMounted(() => {
  paginaOdontograma.value = true;
  _tipoOdonto.value = route.params.tipoOdonto;
})

onUnmounted(() => {
  paginaOdontograma.value = false;
  detenerVoz();
})

watch(
  () => route.params.tipoOdonto,
  () => {
    if (route.params.tipoOdonto != undefined)
      _tipoOdonto.value = route.params.tipoOdonto;
  }
)
watch(
  () => item.value.diente,
  () => {
    item.value.hallazgos = [];
    VisibleDiente();
  }

)
watch(
  () => Hallazgo.value?.value,
  () => {
    VisibleDiente();
  }
)
watch(
  () => itemodontograma.value?.hallazgos,
  (registro) => {
    let idOdontograma = route.params.idOdontograma
    VerFormato((itemodontograma.value?.hallazgos?.length > 0) ? itemodontograma.value?.hallazgos : [])
    limpiarSinVoz()
  },
  { deep: true }
)
watch(
  () => {
    const mensaje = getMensajeElement();
    if (mensajeExistePieza.value != '') {
      if (!mensaje) return;
      mensaje.style.display = "block"
      mensaje.innerHTML = [
        `<div class="alert alert-danger alert-dismissible fade show" role="alert">`,
        `   <div>${mensajeExistePieza.value}</div>`,
        '   <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>',
        '</div>'
      ].join('')
    }
  }
)
function getMensajeElement() {
  return document.getElementById('mensaje');
}
const borrar = ({ diente, hallazgo, ubicacion }) => {
  const index = itemodontograma.value?.hallazgos?.findIndex(i => i.diente == diente && i.hallazgo == hallazgo && i.ubicacion == ubicacion)
  if (index > -1) {
    itemodontograma.value?.hallazgos.splice(index, 1)
    actualizarDetalle(itemodontograma.value.id, (itemodontograma.value?.hallazgos.length > 0) ? itemodontograma.value?.hallazgos : [])
  }
}
function LimpiarMensaje() {
  const mensaje = getMensajeElement();
  if (!mensaje) return;
  mensaje.style.display = "none"
  mensaje.innerHTML = [''].join('')
}
function limpiarHallazgoDiente() {
  LimpiarMensaje();
  limpiarSinVoz();
  Hallazgo.value = ""
  VisibleDiente();
}
function ordenarAsc(listado, p_key) {
  listado.sort(function (a, b) {
    return b[p_key] - a[p_key];
  });
}
function ordenarDesc(listado, p_key) {
  ordenarAsc(listado, p_key);
  return listado.reverse();
}
watch(
  () => window.annyang?.isListening?.(),
  () => {
    if (!window.annyang) return;
  }

)
watch(
  () => {
    resizeWindow.value = window.innerWidth
    window.addEventListener('resize', function () {
      resizeWindow.value = window.innerWidth
    });
  }
)
function AgregarHallazgo() {
  LimpiarMensaje();
  mensajeExistePieza.value = '';
  if (Hallazgo.value == '') {
    mensajeExistePieza.value = 'Seleccione un Hallazgo'
    return false

  }
  if (item.value?.diente == '') {
    mensajeExistePieza.value = 'Seleccione una pieza'
    return false
  }
  if (Hallazgo.value != '' && item.value?.diente != '') {
    const index = listaDeDientesCombo?.findIndex(i => i.value == item.value.diente?.value)
    if (index < 0) {
      mensajeExistePieza.value = 'La pieza seleccionada no existe'
      return false
    }
    const indexHgo = _Hallazgos?.findIndex(i => i.value == Hallazgo.value.value)
    if (indexHgo < 0) {
      mensajeExistePieza.value = 'El Hallazgo seleccionado no existe'
      return false
    }
    const hzgoMatriz = _Hallazgos.filter((elem) => elem.value == Hallazgo.value?.value && elem.label != "");
    if (hzgoMatriz.length > 0) {
      if (hzgoMatriz[0]?.esDirecto == "SI" && hzgoMatriz[0]?.Replicable_Intermedio != "RE") {
        let fila = {
          diente: item.value.diente.value,
          hallazgo: hzgoMatriz[0]?.value, ubicacion: "",
          sigla: hzgoMatriz[0]?.sigla, posicion: "",
          dienteAlterno: (item.value.dienteAlterno == undefined) ? "" : item.value.dienteAlterno.value
        }
        if (!validaDoble(fila)) {
          mensajeExistePieza.value = 'Solo puede seleccionar una pieza adyacente para este hallazgo'
          return false
        }
        item.value.hallazgos.push({
          diente: item.value.diente.value,
          hallazgo: hzgoMatriz[0]?.value,
          ubicacion: "", sigla: hzgoMatriz[0]?.sigla, posicion: "", dienteAlterno: (item.value.dienteAlterno == undefined) ? "" : item.value.dienteAlterno.value,
          descripcion: hzgoMatriz[0]?.text
        })
      };
      if (hzgoMatriz[0]?.esDirecto == "SI" && hzgoMatriz[0]?.EsMultiple == "SI") {
        if (item.value.dienteAlterno == undefined) {
          mensajeExistePieza.value = 'Debe seleccionar una segunda pieza'
          return false
        }
        const indexAlt = listaDeDientesCombo?.findIndex(i => i.value == item.value.dienteAlterno.value)
        if (indexAlt < 0) {
          mensajeExistePieza.value = 'Debe seleccionar una segunda pieza'
          return false
        }
      }
      if (hzgoMatriz[0]?.esDirecto == "SI" && hzgoMatriz[0]?.EsMultiple == "SI" && hzgoMatriz[0]?.Replicable_Intermedio == "RE") {
        const indexAlt = listaDeDientesCombo?.findIndex(i => i.value == item.value.dienteAlterno.value)
        if (indexAlt < 0) {
          mensajeExistePieza.value = 'La segunda pieza seleccionada no existe'
          return false
        }

        const _dienteSelect = listaDeDientesCombo.filter((elem) => elem.value == item.value.diente.value);
        let dienteAlterno = listaDeDientesCombo.filter((elem) => elem.value == item.value.dienteAlterno.value);
        let dientesReplicables = listaDeDientesCombo.filter((elem) => elem.grupo == _dienteSelect[0]?.grupo && elem.indice >= _dienteSelect[0]?.indice && elem.indice <= dienteAlterno[0]?.indice);
        dientesReplicables.forEach(element => {
          item.value.hallazgos.push({
            diente: element.value,
            hallazgo: hzgoMatriz[0]?.value,
            ubicacion: "",
            sigla: hzgoMatriz[0]?.sigla,
            posicion: "",
            dienteAlterno: "",
            descripcion: hzgoMatriz[0]?.text
          })
        })
      }
      if (hzgoMatriz[0]?.esDirecto == "NO") {
        if (item.value.hallazgos.length == 0) {
          mensajeExistePieza.value = 'El hallazgo ' + hzgoMatriz[0]?.text + ', requiere seleccionar la zona o superficie del diente, vuelve a intentarlo'
          return false
        }
      }
    }
  };
  var VistaDiente = document.getElementById("VistaDiente");
  var spanPiezaAl = document.getElementById("spanPiezaAl");
  VistaDiente.style.display = "none"
  spanPiezaAl.style.display = "none"
  Hallazgo.value = ""
  agregarLista(route.params.idOdontograma, item.value);
}
function ListaAlterna(seleccionado) {
  let grupo = listaDeDientesCombo.filter((elem) => elem.value == seleccionado);
  if (grupo.length == 0) return false;
  let ListaDientesAlternos = listaDeDientesCombo.filter((elem) => elem.grupo == grupo[0].grupo);
  let str = "";
  ListaDientesAlternos.forEach(element => {
    if (element.indice > grupo[0].indice) {
      str += '<option value="' + element.value + '" />';
    }
  });
  var my_list = document.getElementById("listaDeDientesAl");
  my_list.innerHTML = str;
}
function VisibleDiente() {
  const hzgoMatriz = _Hallazgos.filter((elem) => elem.value == Hallazgo.value?.value);
  var VistaDiente = document.getElementById("VistaDiente");
  var spanPiezaAl = document.getElementById("spanPiezaAl");
  if (hzgoMatriz.length > 0) {
    if (hzgoMatriz[0]?.esDirecto == "SI") {
      VistaDiente.style.display = "none"
      if (hzgoMatriz[0]?.EsMultiple == "SI") {
        if (spanPiezaAl != null) {
          spanPiezaAl.style.display = "block"
        }
      }
      else {
        if (spanPiezaAl != null) {
          spanPiezaAl.style.display = "none"
        }
      }
    }
    else {
      if (spanPiezaAl != null) {
        VistaDiente.style.display = "block"
      }
    }
  }
  else {
    if (spanPiezaAl != null) {
      spanPiezaAl.style.display = "none"
    }
  }
}
const idRelacionados_ = computed((() => id => getItemEnRegistro(id)?.idRelacionados))

function onKeyDownSoloNumeros(event) {
  var regex = new RegExp('[0-9]+');
  const e = event;
  var key = String.fromCharCode(!e.keyCode ? e.keyCode : e.which);
  if (!regex.test(key)) {
    event.preventDefault()
    return false;
  }
  return true;
}

function onKeyDownSoloLetras(event) {
  var regex = new RegExp('^[a-zA-Z]+$');
  const e = event;
  var key = String.fromCharCode(!e.keyCode ? e.keyCode : e.which);
  if (!regex.test(key)) {
    event.preventDefault()
    return false;
  }
  return true;
}

</script>

<template lang="pug">

.voice-control(v-if="voiceAccessEnabled" :hidden="itemodontograma?.estado === '1' ")#destacarMicrofono
  MicroButton(:class='{ active: isSpeech }' style='--size: 4.75rem' @click="isSpeech ? detenerVoz() : activarVoz()")
  .voice-copy
    strong {{ isSpeech ? 'Escuchando...' : 'Asistente de voz' }}
    span {{ isSpeech ? 'Habla con naturalidad' : 'Activa Voice AI para registrar hallazgos' }}
  p.voice-error(v-if='speechError' role='alert') {{ speechError }}
.row(:hidden="itemodontograma?.estado === '1'")
  p(style="background-color: var(--color-light)!important; margin: 0px !important;") {{ textoEscuchado }}
.row
  .col(:hidden="itemodontograma?.estado === '1'")
    .row(v-if="!isSpeech").inputs-manual
      input#tipoReg(type="hidden", value="0")
      .col-12.col-md-5
        span.input-group-text.m-1(style="padding: .01rem .01rem .01rem .6rem;background-color: transparent; border-width:0px") Hallazgo :
          v-select(style ='width: 100%; padding-left: 0.4rem' v-model='Hallazgo' :options='_listaDeHallazgos' placeholder='Selecciona un Hallazgo' )
      .col-12.col-md-3
        span.input-group-text.m-1(style="padding: .01rem .01rem .01rem .6rem;background-color: transparent; border-width:0px" v-on:keypress='onKeyDownSoloNumeros($event)') Pieza :
          v-select(style ='width: 100%; padding-left: 2.2rem' v-model='item.diente' :options='listaDeDientesCombo' placeholder='Selecciona una pieza')
      .col-12.col-md-4
        span#spanPiezaAl(style="display: none;")
          span.input-group-text.m-1(style="padding: .01rem .01rem .01rem .6rem;background-color: transparent; border-width:0px;") a la :
            v-select(style ='width: 100%; padding-left: 2.9rem' v-model='item.dienteAlterno' :options='listaDeDientesCombo' placeholder='Selecciona una pieza')
    .row#VistaDiente(style="display: none;")
      .col.d-flex.justify-content-center
        Diente(:item='item' style='--size: 12rem;').raiz-0
    .row.mt-2(v-if="!isSpeech")
      .col.d-flex.justify-content-center
        button.btn.btn-primary.m-1(type="submit", @click="AgregarHallazgo" style="width: 7rem;") Agregar
        button.btn.btn-secondary.m-1(type="button" @click="limpiarHallazgoDiente()" style="width: 7rem;") Limpiar
    .row.mt-2(v-if="!isSpeech")
    #mensaje
.col.mt-2.d-flex.justify-content.desplazable
  .col.d-flex.justify-content-center.item
    OdonOficial
  .col.item
    .findings-list
      .card.table-heading.mb-1.d-none.d-md-block
        .row.align-items-center.p-2
          .col-1 N°
          .col-2 Pieza
          .col-6 Hallazgo
          .col-2 Sigla
          .col-1
      .card.finding-row.mb-2.p-2(v-for="(hallazgo, index) of itemodontograma?.hallazgos" :key="`${hallazgo.diente}-${hallazgo.hallazgo}-${hallazgo.ubicacion}-${index}`")
        .row.align-items-center.g-2.p-1
          .col-4.d-md-none.finding-label N°
          .col-8.col-md-1 {{ index + 1 }}
          .col-4.d-md-none.finding-label Pieza
          .col-8.col-md-2 {{ hallazgo.diente }} {{ hallazgo.dienteAlterno != "" ? " - " + hallazgo.dienteAlterno : "" }}
          .col-4.d-md-none.finding-label Hallazgo
          .col-8.col-md-6 {{ hallazgo.descripcion }} {{ hallazgo.ubicacion != '' ? ' - ' + hallazgo.ubicacion : hallazgo.ubicacion }}
          .col-4.d-md-none.finding-label Sigla
          .col-6.col-md-2 {{ hallazgo.sigla }}
          .col-2.col-md-1.text-end
            BotonSeguro.mt-0(:onSuccess='() => borrar(hallazgo)' :hidden="itemodontograma?.estado === '1' && !itemodontograma.idRelacionado")
              i.bi.bi-trash(aria-hidden='true')
      .empty-findings(v-if='!itemodontograma?.hallazgos?.length') No hay hallazgos registrados.

</template>
<style lang="sass" scoped>
.findings-list
  width: 100%
  padding: .25rem

.table-heading
  color: var(--brand-navy)
  background: #eef4ff
  border-radius: 12px
  box-shadow: none
  font-weight: 700

.finding-row
  border-radius: 12px
  box-shadow: none
  transition: border-color .18s ease, background-color .18s ease
  &:hover
    border-color: rgba(var(--brand-blue-rgb), .28)
    background: #f7faff

.finding-label
  color: var(--text-secondary)
  font-size: .82rem
  font-weight: 700

.empty-findings
  padding: 2rem 1rem
  color: var(--text-secondary)
  text-align: center

.elevar
  position: relative
  z-index: 3 !important
  background-color: var(--color-white)
.noElevar
  position: relative
  z-index: 0 !important
  background-color: transparent
.desplazable
  display: flex
  flex-direction: row
  height: auto
  width: auto
  overflow: auto
  
  scroll-snap-type: x mandatory
  padding: 10px
  gap: 12px
  scroll-padding: 10px


  justify-content: start
  align-items: center
  padding-bottom: 40px
  &::-webkit-scrollbar-track 
    border-radius: 50px 
    -webkit-box-shadow: inset 0 0 6px rgba(0,0,0,0.1) 
  &::-webkit-scrollbar-thumb 
    background-color: var(--color-primary) 
    outline: 1px solid var(--color-primary)
    border-radius: 50px 
  &::-webkit-scrollbar 
    width: 1em
    height: 10px
.item
  flex: 0 0 100%
  scroll-snap-align: start
  scroll-snap-stop: always
.voice-control
  display: flex
  flex-wrap: wrap
  justify-content: center
  align-items: center
  gap: 1rem
  margin: .75rem 0 1rem
  padding: 1rem
  border: 1px solid rgba(100, 59, 255, .18)
  border-radius: var(--radius-card)
  background: linear-gradient(135deg, rgba(0, 102, 255, .05), rgba(100, 59, 255, .07))
  .voice-copy
    display: flex
    flex-direction: column
    strong
      color: var(--ai-purple)
      font-size: 1rem
    span
      color: var(--text-secondary)
      font-size: .85rem
  .voice-error
    flex-basis: 100%
    margin: 0
    color: var(--color-danger)
    text-align: center

@media (min-width: 800px)
  .desplazable
    display: flex
    flex-direction: row
    height: auto
    width: 100%
    overflow: hidden
    .item
      flex: 0 0 50%
      scroll-snap-align: start
      scroll-snap-stop: always
  .inputs-manual
    display: flex
    justify-content: center
    align-items: center

  </style>
