<script setup>
import { ref, reactive, watch, onMounted } from 'vue'
import '@fullcalendar/core/vdom'
import fullcalendar from '@fullcalendar/vue3'
import { Calendar } from '@fullcalendar/core';
import dayGrigPlugin from '@fullcalendar/daygrid'
import timeGrigPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin from '@fullcalendar/interaction'
import esLocale from '@fullcalendar/core/locales/es';
import bootstrap5Plugin from '@fullcalendar/bootstrap5';
//import 'bootstrap/dist/css/bootstrap.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import { useRoute, useRouter } from 'vue-router';
import { obtenerTodos, registro, cita, guardarCita, actualizar, _event, eliminar } from "../../store/citas";
import { obtenerTodos as obtenerTodosPaciente, leer as leerPaciente, registro as RegPaciente, item as itemPaciente, leerDniRegistro, guardar as guardarPaciente, leerEnRegistro as leerEnRegistroPac } from "../../store/paciente";
import { item as ItemUsuario, leer as LeerUser, registro as RegistroUsuario, leerEnRegistro } from '../../store/usuario'
import { miUsuario, item as itemUser, voiceAccessEnabled } from '../../store/sesion'
import { esLetra, esNumero } from '../../config/libreria'
import VoiceAppointmentAssistant from '../../components/citas/VoiceAppointmentAssistant.vue'
const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const maxDocumento = ref(9);
const { push, back } = useRouter();
const route = useRoute()
obtenerTodos()
const _obtenerRegistro = obtenerTodos();
const _obtenerTodosPaciente = obtenerTodosPaciente();
const NombreDoctor = ref("");
const isChecked= ref(false);
const scheduleModalVisible = ref(false);
const mensajeWhatsApp = ref('');
const brandGradientFallback = '#eef3ff';
let itemSelect = {};
let EventSelect = {};
onMounted(() => {
  LeerUser(miUsuario().uid);
});
function openScheduleModal() {
  mensajeWhatsApp.value = '';
  scheduleModalVisible.value = true;
  document.body.classList.add('modal-open');
}
function closeScheduleModal() {
  scheduleModalVisible.value = false;
  document.body.classList.remove('modal-open');
}
watch(
  () => RegistroUsuario.value,
  () => {
    let valores = RegistroUsuario.value.find(item => item.idUsuario == miUsuario().uid)
    if (valores != undefined) {
      leerEnRegistro(miUsuario().uid);
      NombreDoctor.value = ItemUsuario.nombre + " " + ItemUsuario.apellidoPaterno
    }
  }
);

const id = ref(10)
const mostrar = ref(false);
function createEvent(item) {
  itemSelect = item
  let horadiotext = ""
  const startDate = new Date(item.start);
  const endDate = new Date(item.end);
  startDate.setTime(startDate.getTime() + (5 * 60 * 60 * 1000));
  endDate.setTime(endDate.getTime() + (5 * 60 * 60 * 1000));

  let newTimeStart = startDate.toLocaleTimeString('es-ES');
  let startStr = newTimeStart.substr(0, 5)
  let newTimeEnd = endDate.toLocaleTimeString('es-ES');
  let endStr = newTimeEnd.substr(0, 5)
  const opciones = { weekday: 'long', month: 'long', day: 'numeric' };
  itemPaciente.value = {}
  horadiotext = startDate.toLocaleDateString('es-ES', opciones) + '     ' + startStr + " - " + endStr;
  cita.value = {
    idPaciente: '',
    start: item.start.toISOString(),
    end: item.end.toISOString(),
    title: item.title,
    borderColor: "#0dcaf0",
    backgroundColor: brandGradientFallback,
    textColor: "#fff",
    timedisplay: horadiotext,    
    fechaDeCreacion: new Date().toISOString().slice(0, 10),
    UserId: ItemUsuario.id,
    timeStart: startStr,
    timeEnd: endStr
  };
  openScheduleModal();
}
function updateEvent(arg) {
  let horadiotext = ""
  let newTimeStart = arg.start.toLocaleTimeString('es-ES');
  let startStr = newTimeStart.substr(0, 5)
  let newTimeEnd = arg.end.toLocaleTimeString('es-ES');
  let endStr = newTimeEnd.substr(0, 5)

  const opciones = { weekday: 'long', month: 'long', day: 'numeric' };
  itemPaciente.value = {}
  horadiotext = arg.start.toLocaleDateString('es-ES', opciones) + '     ' + startStr + " - " + endStr;
  let _item = {
    id: arg.id,
    start: arg.start.toISOString(),
    end: arg.end.toISOString(),
    timedisplay: horadiotext
  }
  actualizar(_item)
}
function addHoursToDate(date, hours) {
  return new Date(new Date(date).setHours(date.getHours() + hours));
}

function deleteEvent(id) {
  eliminar(id)
}
function applyBrandGradientToLegacyGreenEvent(arg) {
  const color = String(arg.event.backgroundColor || arg.el.style.backgroundColor || '')
    .toLowerCase()
    .replace(/\s/g, '');
  const usesLegacyGreen = color === '#37dfbb' || color === 'rgb(55,223,187)';
  const usesBrandFallback = color === brandGradientFallback;
  if (!usesLegacyGreen && !usesBrandFallback) return;

  arg.el.style.setProperty('background', 'linear-gradient(135deg, rgba(0, 102, 255, 0.05), rgba(100, 59, 255, 0.07))', 'important');
  arg.el.style.setProperty('border-color', 'rgba(0, 102, 255, 0.18)', 'important');
  arg.el.style.setProperty('color', '#071b40', 'important');
}
function viewEvents(_id) {
  let item_data = registro.value.find(item => item.id == _id)
  if (item_data.title !="Disponible"){
    leerEnRegistroPac(item_data.idPaciente);
  }
  cita.value = {
    idPaciente: item_data.idPaciente,
    start: item_data.start,
    end: item_data.end,
    title: item_data.title,
    borderColor: item_data.borderColor,
    textColor : item_data.textColor,
    backgroundColor: item_data.backgroundColor,
    timedisplay: item_data.timedisplay,
    fechaDeCreacion: new Date().toISOString().slice(0, 10),
    UserId: item_data.UserId,
    id: item_data.id,
    Mensaje: item_data.Mensaje,
  };

  openScheduleModal();
}
const options = reactive({
  timeZone: userTimeZone,
  longPressDelay: 200,
  editable: true,
  selectable: true,
  weekends: true,
  plugins: [dayGrigPlugin, timeGrigPlugin, listPlugin, interactionPlugin, bootstrap5Plugin],
  locale: esLocale,
  nowIndicator: true,
  initialView: 'timeGridWeek',
  timeFormat: 'h(:mm)t',
  dayMaxEvents: true,
  datesAboveResources: true,
  themeSystem: 'bootstrap5',
  slotLabelFormat: { hour: 'numeric', minute: '2-digit', omitZeroMinute: true, hour24: true },
  slotMinTime: '08:00:00',
  slotMaxTime: '22:00:00',
  allDaySlot: false,
  //height: '100%',
  contentHeight: 'auto',
  headerToolbar: {
    left: 'prev,today',
    center: 'title',
    right: 'dayGridMonth,timeGridWeek,timeGridDay,next'
  },
  views: {
    dayGridMonth: {
      titleFormat: { month: 'long' }
    },
    timeGridWeek: {
      titleFormat: {
        month: 'long'
      },
      dayHeaderFormat: {
      weekday: 'short', 
      day: 'numeric'  
    }
    },
    listDay: {
      titleFormat: {
        month: 'short', day: 'numeric'
      }
    }
  },
  select: (arg) => {
    id.value = id.value + 1
    const cal = arg.view.calendar
    cal.unselect()
    if(isChecked.value){
      let event = {
        id: "0",
        title: "Disponible",
        start: arg.start,
        end: arg.end
      }     
      createEventDisponible(event);
    }
    else{
      createEvent(
      {
        id: "0",
        title: "",
        start: arg.start,
        end: arg.end
      })
    }
    
  },
  events: registro.value,
  eventAdd: (arg) => {
    createEvent({
        id: arg.event.id,
        title: arg.event.title,
        start: arg.event.start,
        end: arg.event.end
      })
  },
  eventChange: (arg) => {
    updateEvent(
      {
        id: arg.event.id,
        start: arg.event.start,
        end: arg.event.end,
      }
    )
  },
  eventRemove: (arg) => {
    deleteEvent(
      {

      }, arg.event.id
    )
  },
  eventClick: (arg) => {
    viewEvents(arg.event.id)
  },
  eventDidMount: applyBrandGradientToLegacyGreenEvent,
})
watch(
  () => registro.value,
  () => {
    let valores = registro.value.find(item => item.UserId == miUsuario().uid)
    if (valores != undefined) {
      options.events = [];
      options.events = registro.value;
    }
  }
);
const guardarAmbas = () => {
  if (mostrar.value == true) {
    return new Promise(resolve => guardarPaciente(itemPaciente.value)
      .then(idPaciente => guardarCitaCompleta(idPaciente)
        .then(() => resolve())))
  }
  else {
    return guardarCitaCompleta()
  }
}
const guardarCitaCompleta = (idPaciente) => {
  cita.value.idPaciente = idPaciente || itemPaciente.value.id;
  cita.value.email = "" || itemPaciente.value.email;
  cita.value.location = "" || ItemUsuario.value.nombreconsultorio + " - " + ItemUsuario.value.direccion;
  let index = registro.value?.findIndex(i => i.id == cita.value.id);
  if (index == -1 || index == undefined) {
    return guardarCita(cita.value)
  }
  else {
    return actualizar(cita.value);
  }
};

function GetPaciente(val) {
  if (val.target.value == '') {
    return
  }
  try {
    leerDniRegistro(val.target.value);
  }
  catch (e) {
    return
  }

}
const guardarPacienteNuevo = () => {
  guardarPaciente().then((id) => {
    guardarCitaCompleta()
  })
}
function closeEvent() {
  closeScheduleModal();
}
function confirmarCitaWhatsApp() {
  mensajeWhatsApp.value = '';
  const numero = String(itemPaciente.value?.telefono || '').replace(/\D/g, '');
  if (!numero) {
    mensajeWhatsApp.value = 'El paciente no tiene un número de celular registrado.';
    return;
  }

  const nombrePaciente = [
    itemPaciente.value?.nombre,
    itemPaciente.value?.apellidoPaterno,
    itemPaciente.value?.apellidoMaterno
  ].filter(Boolean).join(' ');
  const nombreConsultorio = ItemUsuario.value?.nombreconsultorio;
  const direccion = ItemUsuario.value?.direccion || 'dirección por confirmar';
  const fechaHora = cita.value?.timedisplay || 'fecha y hora por confirmar';
  const mensaje = [
    `Hola${nombrePaciente ? ` ${nombrePaciente}` : ''}, esperamos que se encuentre bien.`,
    '',
    `Le escribimos de ${nombreConsultorio || 'nuestro consultorio odontológico'} para solicitar la confirmación de su cita:`,
    `Fecha y hora: ${fechaHora}`,
    `Dirección: ${direccion}`,
    '',
    'Por favor, confírmenos su asistencia respondiendo a este mensaje. Muchas gracias.'
  ].join('\n');

  const url = `https://api.whatsapp.com/send?phone=${numero}&text=${encodeURIComponent(mensaje)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}
function handleCheckboxChange()
{
  isChecked.value = false;
  var checkbox = document.getElementById("chkDisponibilidad");
    if (checkbox.checked) {
      isChecked.value = true;
    }
}
function createEventDisponible(item) {
  itemSelect = item
  let horadiotext = ""
  const startDate = new Date(item.start);
  const endDate = new Date(item.end);
  startDate.setTime(startDate.getTime() + (5 * 60 * 60 * 1000));
  endDate.setTime(endDate.getTime() + (5 * 60 * 60 * 1000));
  let newTimeStart = startDate.toLocaleTimeString('es-ES');
  let startStr = newTimeStart.substr(0, 5)
  let newTimeEnd = endDate.toLocaleTimeString('es-ES');
  let endStr = newTimeEnd.substr(0, 5)
  const opciones = { weekday: 'long', month: 'long', day: 'numeric' };
  horadiotext = startDate.toLocaleDateString('es-ES', opciones) + '     ' + startStr + " - " + endStr;
  let _location = "" || ItemUsuario.value.nombreconsultorio + " - " + ItemUsuario.value.direccion;      
  cita.value = {
    idPaciente: '',
    email:'',
    location:_location,
    start: item.start.toISOString(),
    end: item.end.toISOString(),
    title: item.title,
    borderColor: "#039be5;",
    backgroundColor: "#f2f2f2",
    textColor:"#039BE5",
    timedisplay: horadiotext,
    fechaDeCreacion: new Date().toISOString().slice(0, 10),
    UserId: ItemUsuario.id,
    timeStart: startStr,
    timeEnd: endStr
  };
  guardarCita(cita.value)
}
</script>

<template lang="pug">
.row.mb-2
  .col-12.citas-page-header
    div
      span.eyebrow Agenda clínica
      h1.page-title Citas
    VoiceAppointmentAssistant(v-if="voiceAccessEnabled")
.row 
  .col-12
    label.form-check-label.availability-toggle(for='chkDisponibilidad')
      input#chkDisponibilidad.form-check-input(type='checkbox' @change='handleCheckboxChange')
      | 
      | Generar disponibilidad
.row.desplazable
  .contenido.calendar-surface
    fullcalendar(v-bind:options='options')
.row(v-if='false')
  .schedule-modal-backdrop(@click='closeScheduleModal()')
  #schedule-add.schedule-modal
    .modal-dialog.modal-dialog-centered.modal-dialog-scrollable(@click.stop)
      .modal-content(style="background-color: var(--color-light) !important")
        Form( :onPromise='()=>guardarAmbas()' :onSuccess='()=>closeEvent()')
          .modal-header
            i.bi.bi-calendar-plus(style="color: var(--color-primary)")
            h3.modal-title Agenda de cita
            button#btnsclose.btn-close(type='button', @click="closeScheduleModal()" aria-label='Close')
          .modal-body
            .input-group.mb-3
            span#basic-addon1.input-group-text
              i.bi.bi-type
            input.form-control(placeholder="Añade un Título", v-model="cita.title", required)       
          .input-group.mb-3
            span#basic-addon1.input-group-text
              i.bi.bi-clock
            input.form-control(v-model="cita.timedisplay" readonly style="font-weight:bold")
          .input-group.mb-3
            span#basic-addon1.input-group-text
              input.form-check-input( type='checkbox' id="checkbox" v-model="mostrar" )
            input.form-control(placeholder='Registrar un nuevo paciente', readonly, style="font-weight:bold")
          .input-group.mb-3(v-if="mostrar == false")
            span#basic-addon1.input-group-text
              i.bi.bi-search
            input.form-control(placeholder='Buscar paciente por documento de identidad' required :maxlength="maxDocumento" @keypress="esNumero($event)" v-model="itemPaciente.numeroDocumento" v-on:focusout="GetPaciente($event)")
          .input-group.mb-3(v-if="mostrar == false")
            span#basic-addon1.input-group-text
              i.bi.bi-person-vcard
            input.form-control(placeholder='Nombre Paciente', required, v-model="itemPaciente.nombre" readonly )
            input.form-control(placeholder='Apellido Paciente', required, v-model="itemPaciente.apellidoPaterno" readonly)
          .pacienteNuevo(v-if="mostrar == true")
            .input-group.mb-3
              span#basic-addon1.input-group-text 
                i.bi.bi-person
              input.form-control(placeholder='Nombre Paciente', required, v-model="itemPaciente.nombre" )
              input.form-control(placeholder='Apellido Paciente', required, v-model="itemPaciente.apellidoPaterno" )
              input.form-control(placeholder='Apellido Paciente', required, v-model="itemPaciente.apellidoMaterno" )
            .input-group.mb-3
              span#basic-addon1.input-group-text
                i.bi.bi-person-vcard
              select.form-select(v-model="itemPaciente.tipoDocumento")
                option(value="DNI" selected) DNI
                option(value="CE") CARNET DE EXTRANJERIA
              input.form-control(placeholder='DNI/CE. Paciente', required, :maxlength="maxDocumento" @keypress="esNumero($event)" v-model="itemPaciente.numeroDocumento")
            .input-group.mb-3
              span#basic-addon1.input-group-text
                i.bi.bi-at
              input.form-control(placeholder='Email', type="email" required, v-model="itemPaciente.email")
              input.form-control(placeholder='Celular' required @keypress="esNumero($event)" minlength="9" maxlength="12" v-model="itemPaciente.telefono")
          .input-group.mb-3(hidden="true")
            span#basic-addon1.input-group-text
              i.bi.bi-person-badge
            input.form-control(v-model="ItemUsuario.nombre", readonly, style="font-weight:bold")
          .input-group
            span#basic-addon1.input-group-text 
              i.bi.bi-brush
            span#basic-addon1.input-group-text.brand-gradient-swatch
              input#html(type='radio' name='Quiru' value='#eef3ff' checked v-model="cita.backgroundColor")
            span#basic-addon1.input-group-text(style="background-color: #3f51b5")
              input#html(type='radio' name='Azul' value='#3f51b5' v-model="cita.backgroundColor")
            span#basic-addon1.input-group-text(style="background-color: #d50000")
              input#html(type='radio' name='Rojo' value='#d50000' v-model="cita.backgroundColor")
            span#basic-addon1.input-group-text(style="background-color: #f6bf26")
              input#html(type='radio' name='Amarillo' value='#f6bf26' v-model="cita.backgroundColor")
          .col-md-12.col-sm-12
            label(for='Message') Mesaje para el especialista
            textarea#message.form-control(rows='5', name='message', placeholder='mensaje' v-model="cita.Mensaje")   
          .modal-footer
          button.btn.btn-info(v-if="cita.id" type='button' @click="closeScheduleModal(); push({ name: 'pacienteVer', params: { idPaciente: itemPaciente.id } })") Atender
          button.ms-auto.btn.btn-danger(v-if="cita.id" type='button', @click="closeScheduleModal(); deleteEvent(cita.id)") Borrar
          button.ms-auto.btn.btn-primary(type="submit") Grabar
.schedule-modal-root(v-if='scheduleModalVisible')
  .schedule-modal-backdrop(@click='closeScheduleModal()')
  #schedule-add.schedule-modal
    .modal-dialog.modal-dialog-centered.modal-dialog-scrollable(@click.stop)
      .modal-content(style="background-color: var(--color-light) !important")
        Form(:onPromise='()=>guardarAmbas()' :onSuccess='()=>closeEvent()')
          .modal-header
            i.bi.bi-calendar-plus(style="color: var(--color-primary)")
            h3.modal-title Agenda de cita
            button#btnsclose.btn-close(type='button', @click="closeScheduleModal()" aria-label='Close')
          .modal-body
            .input-group.mb-3
              span#basic-addon1.input-group-text
                i.bi.bi-type
              input.form-control(placeholder="AÃ±ade un TÃ­tulo", v-model="cita.title", required)
            .input-group.mb-3
              span#basic-addon1.input-group-text
                i.bi.bi-clock
              input.form-control(v-model="cita.timedisplay" readonly style="font-weight:bold")
            .input-group.mb-3
              span#basic-addon1.input-group-text
                input.form-check-input(type='checkbox' id="checkbox" v-model="mostrar")
              input.form-control(placeholder='Registrar un nuevo paciente', readonly, style="font-weight:bold")
            .input-group.mb-3(v-if="mostrar == false")
              span#basic-addon1.input-group-text
                i.bi.bi-search
              input.form-control(placeholder='Buscar paciente por documento de identidad' required :maxlength="maxDocumento" @keypress="esNumero($event)" v-model="itemPaciente.numeroDocumento" v-on:focusout="GetPaciente($event)")
            .input-group.mb-3(v-if="mostrar == false")
              span#basic-addon1.input-group-text
                i.bi.bi-person-vcard
              input.form-control(placeholder='Nombre Paciente', required, v-model="itemPaciente.nombre" readonly)
              input.form-control(placeholder='Apellido Paciente', required, v-model="itemPaciente.apellidoPaterno" readonly)
            .pacienteNuevo(v-if="mostrar == true")
              .input-group.mb-3
                span#basic-addon1.input-group-text
                  i.bi.bi-person
                input.form-control(placeholder='Nombre Paciente', required, v-model="itemPaciente.nombre")
                input.form-control(placeholder='Apellido Paciente', required, v-model="itemPaciente.apellidoPaterno")
                input.form-control(placeholder='Apellido Paciente', required, v-model="itemPaciente.apellidoMaterno")
              .input-group.mb-3
                span#basic-addon1.input-group-text
                  i.bi.bi-person-vcard
                select.form-select(v-model="itemPaciente.tipoDocumento")
                  option(value="DNI" selected) DNI
                  option(value="CE") CARNET DE EXTRANJERIA
                input.form-control(placeholder='DNI/CE. Paciente', required, :maxlength="maxDocumento" @keypress="esNumero($event)" v-model="itemPaciente.numeroDocumento")
              .input-group.mb-3
                span#basic-addon1.input-group-text
                  i.bi.bi-at
                input.form-control(placeholder='Email', type="email" required, v-model="itemPaciente.email")
                input.form-control(placeholder='Celular' required @keypress="esNumero($event)" minlength="9" maxlength="12" v-model="itemPaciente.telefono")
            .input-group.mb-3(hidden="true")
              span#basic-addon1.input-group-text
                i.bi.bi-person-badge
              input.form-control(v-model="ItemUsuario.nombre", readonly, style="font-weight:bold")
            .input-group
              span#basic-addon1.input-group-text
                i.bi.bi-brush
              span#basic-addon1.input-group-text.brand-gradient-swatch
                input#html(type='radio' name='Quiru' value='#eef3ff' checked v-model="cita.backgroundColor")
              span#basic-addon1.input-group-text(style="background-color: #3f51b5")
                input#html(type='radio' name='Azul' value='#3f51b5' v-model="cita.backgroundColor")
              span#basic-addon1.input-group-text(style="background-color: #d50000")
                input#html(type='radio' name='Rojo' value='#d50000' v-model="cita.backgroundColor")
              span#basic-addon1.input-group-text(style="background-color: #f6bf26")
                input#html(type='radio' name='Amarillo' value='#f6bf26' v-model="cita.backgroundColor")
            .col-md-12.col-sm-12
              label(for='Message') Mesaje para el especialista
              textarea#message.form-control(rows='5', name='message', placeholder='mensaje' v-model="cita.Mensaje")
            .alert.alert-warning.mt-3.mb-0(v-if='mensajeWhatsApp' role='alert') {{ mensajeWhatsApp }}
          .modal-footer
            button.btn.btn-success(type='button' @click='confirmarCitaWhatsApp()')
              i.bi.bi-whatsapp.me-2
              span Confirmar cita
            button.btn.btn-info(v-if="cita.id" type='button' @click="closeScheduleModal(); push({ name: 'pacienteVer', params: { idPaciente: itemPaciente.id } })") Atender
            button.ms-auto.btn.btn-danger(v-if="cita.id" type='button' @click="closeScheduleModal(); deleteEvent(cita.id)") Borrar
            button.ms-auto.btn.btn-primary(type="submit") Grabar
</template>
<style lang="sass">


.btn-primary
  color:#fff

.page-title
  margin: .55rem 0 0
  color: var(--brand-navy)
  font-size: clamp(1.75rem, 3vw, 2.25rem)
  font-weight: 800

.citas-page-header
  display: flex
  align-items: flex-end
  justify-content: space-between
  gap: .75rem
  flex-wrap: wrap

.citas-page-header .voice-assistant-entry
  margin-bottom: 0

.availability-toggle
  display: inline-flex
  align-items: center
  gap: .65rem
  margin-bottom: .75rem
  color: var(--brand-navy)
  font-weight: 650

.calendar-surface
  width: 100%
  padding: 1rem
  border: 1px solid var(--color-border)
  border-radius: var(--radius-card)
  background: white

.fc
  color: var(--brand-navy)
  .fc-toolbar-title
    font-size: 1.15rem
    font-weight: 750
  .btn-primary
    color: var(--brand-blue)
    background: white
    border-color: var(--color-border)
    box-shadow: none
    &:hover, &:focus, &.active
      color: white
      background: var(--brand-blue)
      border-color: var(--brand-blue)
  .fc-col-header-cell
    background: #f3f7ff
  .fc-theme-standard td, .fc-theme-standard th
    border-color: var(--color-border)

@media (max-width: 767px)
  .citas-page-header
    align-items: center
  .citas-page-header .voice-assistant-entry
    margin-left: auto
  .calendar-surface
    padding: .5rem
  .fc .fc-toolbar
    align-items: stretch
    flex-direction: column
    gap: .65rem

.schedule-modal-backdrop
  position: fixed
  inset: 0
  background: rgba(0, 0, 0, 0.45)
  z-index: 1050

.schedule-modal
  position: fixed
  inset: 0
  z-index: 1055
  display: flex
  align-items: center
  justify-content: center
  padding: 1rem

.schedule-modal .modal-dialog
  width: 100%
  max-width: 700px
  margin: 0

.schedule-modal .modal-content
  max-height: calc(100vh - 2rem)
  overflow: auto

thead
  background: linear-gradient(135deg, rgba(0, 102, 255, 0.05), rgba(100, 59, 255, 0.07))
th
  border-color: white !important

.brand-gradient-swatch
  background: linear-gradient(135deg, rgba(0, 102, 255, 0.05), rgba(100, 59, 255, 0.07)) !important

.desplazable
  display: flex
  flex-direction: row
  height: 80vh
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
