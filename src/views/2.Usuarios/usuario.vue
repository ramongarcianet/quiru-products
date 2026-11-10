<script setup>
import { onMounted, ref, watch, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { item, actualizar, leer, registro, leerEnRegistro } from '../../store/usuario'
import InputFile from "../../components/FileInput.vue";
import {progressFile, setFile, borrarFile } from '../../store/storage.js';
import { cerrarSesion, miUsuario } from '../../store/sesion'
import { ref as refSt, getDownloadURL, getStorage } from "firebase/storage";
//chile
import darach from '../../config/comunas-regiones.json';
//Peru
/*
import depa from '../../config/departamentos.json';
import prov from '../../config/provincias.json';
import dist from '../../config/distritos.json';
*/
const maxDocumento = ref(8);
const mensajeError = ref('')
const route = useRoute()
const { back } = useRouter()
const usuarioaqui = miUsuario().uid
const storage = getStorage()
const obtenerURLDescarga = async (rutaArchivo) => {
  try {
    const storageRef = refSt(storage, rutaArchivo);
    const downloadURL = await getDownloadURL(storageRef);
    return downloadURL;
  } catch (error) {
    console.error("Error al obtener el enlace de descarga:", error);
    throw error;
  }
}
const guardarOActualizar = async () => {
  try {
    mensajeError.value = ''
    const descuentoCumpleanos = Number(item.value.descuentoCumpleanos || 0)
    if (!Number.isFinite(descuentoCumpleanos) || descuentoCumpleanos < 0 || descuentoCumpleanos > 100) {
      throw new Error('El descuento por cumpleaños debe estar entre 0 y 100%.')
    }
    item.value.descuentoCumpleanos = descuentoCumpleanos
    const keys = Object.keys(item.value);
    for (let key of keys) {
      const isFileList = item.value[key] instanceof FileList;
      if (isFileList && item.value[key].length > 0) {
        const listaDeUrl = [];
        const length = item.value[key].length;
        const listaDeImagenes = [];
        for (let i = 0; i < length; i++) {
          listaDeImagenes.push(item.value[key][i]);
        }
        for await (let item of listaDeImagenes) {
          const url = await setFile(item, usuarioaqui);
          listaDeUrl.push(url);
        }
        item.value[key] = null;
        if (key === 'fotoPerfil') {
          item.value.fotoPerfil = listaDeUrl[0]
          item.value.linkPerfil = await obtenerURLDescarga(listaDeUrl[0])
        } else if (key === 'fotoLogo') {
          item.value.fotoLogo = listaDeUrl[0]
          item.value.linkLogo = await obtenerURLDescarga(listaDeUrl[0])
        }
      }
    }
    await actualizar(item.value);
    progressFile.value = 0;
  } catch (e) {
    console.error(e);
    throw e
  }
}
onMounted(() => {
  leer(miUsuario().uid);
});
function definirMaxLimit(tipoDocumento) {
  item.value.numeroDocumento = '';
  if (tipoDocumento == 'DNI') {
    maxDocumento.value = 8;
  } else {
    maxDocumento.value = 9;
  }
}
watch(
    () => registro.value,
    () => {
        let valores= registro.value.find(item => item.idUsuario == miUsuario().uid)
        if(valores !=undefined) {
            leerEnRegistro(miUsuario().uid);
        }
    }
);
watch(
    () => item.value,
    () => {
      if(item.value.comuna==undefined) {
      item.value.comuna = "" ;
      } 
      if(item.value.region==undefined) {
      item.value.region = "" ;
      }
      if(item.value.departamento==undefined) {
      item.value.departamento = "" ;
      }
    }
);
const adios = ()=> {
  location.replace('https://quiru.app/')
  }
const refresh = () => {
  setTimeout(() => {
    location.reload();
  }, 2000);
}
const mayoriaEdad = () => {
  let currentDay = new Date().getTime()
  let minDay = currentDay - 568036800000
  let otroDia = new Date(minDay).toISOString().slice(0, 10)
  return otroDia
}
//chile
/**/
const filteredComunas = computed(() => {
  let region=item.value.region !=undefined? item.value.region:"";
  const selectedRegionData = darach.regiones.find(q => q.region ===region);
  return selectedRegionData ? selectedRegionData.comunas : [];
});
const filteredRegistros = computed(() => {
  if (!item.value.region && !item.value.comuna) {
    return registro.value;
  }
  if (item.value.comuna) {
    return registro.value.filter(fila => fila.comuna === item.value.comuna);
  }
  return registro.value.filter(fila => fila.region === item.value.region);
});

//peru
/*
const filteredProv = computed(() => {
  const selectedProvData = prov.provincias.filter(q => q.department_id === item.value.departamento);
  return selectedProvData ? selectedProvData : [];
});
const filteredDist = computed(() => {
  const selectedDistData = dist.distritos.filter(q => q.province_id === item.value.region);
  return selectedDistData ? selectedDistData : [];
});
const filteredRegistros = computed(() => {
  if (!item.value.comuna && !item.value.region && !item.value.comuna) {
    // Si no hay región seleccionada, mostrar todos los registros
    return registro.value;
  }
  if (item.value.region  && !item.value.comuna) {
    return registro.value.filter(item => item.region === item.value.region);
  }
  if (item.value.region  && item.value.comuna) {
    return registro.value.filter(item => item.comuna === item.value.comuna);
  }
  if (item.value.region) {
    return registro.value.filter(item => item.region === item.value.region);
  }
  return registro.value.filter(item => item.departamento === item.value.comuna);
});
*/
</script>

<template lang="pug">
.row.mb-3
  .col-10
    h1.my-0(style="color: var(--brand-navy); font-size: 1.5em") Vista de
    h1(style="color: var(--brand-blue); font-weight:bold; font-size: 1.5em") Configuración
    button.btn.btn-outline-primary.border-0(@click="refresh()" )
      i.bi.bi-arrow-left.fs-3
  .col-2

Form( :onPromise="() => guardarOActualizar(item)" :onSuccess='() => refresh()' :onCatch='(e) => mensajeError = e?.message || "No se pudo guardar la configuración"')
  .alert.alert-danger(v-if='mensajeError' role='alert') {{ mensajeError }}
  .row
    .col-12
      label.form-label() Nombre(s) y Apellidos*
      .input-group
        input.form-control(placeholder="Nombre" v-model="item.nombre" required maxlength="30")
        input.form-control(placeholder="Apellido Paterno" v-model="item.apellidoPaterno" maxlength="30")
        input.form-control(placeholder="Apellido Materno" v-model="item.apellidoMaterno" maxlength="30")
  .row
    .col-12.col-md-6
      label.form-label() Documento de identidad*
      .input-group
        select.form-select(placeholder="Tipo Documento" v-model="item.tipoDocumento" required v-on:change="definirMaxLimit(item.tipoDocumento)")
          option(:value="undefined" disabled) SELECCIONE
          option(value="DNI") DNI
          option(value="CE") CARNET DE EXTRANJERÍA
        input.form-control(placeholder="Número Documento" v-model="item.numeroDocumento" required :maxlength="maxDocumento" :minlength="maxDocumento")
    .col-12.col-md-6
      .row
        .col
          label.form-label() Fecha Nac.
          .input-group
            input.form-control(type="date" :max="mayoriaEdad()" v-model="item.fechaNacimiento")
        .col
          label.form-label() Sexo
          .input-group
            select.form-select(placeholder="Sexo" v-model="item.sexo")
              option(:value="undefined" disabled) SELECCIONE
              option(value="M") MASCULINO
              option(value="F") FEMENINO 
  .row
    .col-12.col-md-6
      .row
        .col
          label.form-label() Email*
          .input-group
            input.form-control(placeholder="Correo Electrónico" v-model="item.email" type="email" required maxlength="100" disabled)
        .col
          label.form-label() Teléfono
          .input-group
          input.form-control(placeholder="Número Celular" v-model="item.numeroTlf" :maxlength="9" :minlength="9")
    .col-12.col-md-6
      .row
        //.col-md-4.col-sm-4(style="text-align: left;")
          label( for='select') Departamento
          select.form-control(v-model="item.departamento")
            option(value="" disabled selected) ::Seleccione un departamento::
            option(value="") Todos
            option(v-for="depa in depa.departamentos" :key="depa.id" :value="depa.id") {{ depa.name }}
        //.col-md-4.col-sm-4(style="text-align: left;")
          label( for='select') Provincia
          select.form-control(v-model="item.region")
            option(value="" disabled selected) ::Seleccione una provincia::
            option(value="") Todos
            option(v-for="prov in filteredProv" :key="prov.id" :value="prov.id") {{ prov.name }}
        //.col-md-4.col-sm-4(style="text-align: left;")
          label( for='select') Distrito
          select.form-control(v-model="item.comuna")
            option(value="" disabled selected) ::Seleccione un distrito::
            option(value="") Todos
            option(v-for="q in filteredDist" :key="q.id" :value="q.id") {{ q.name }}
        .col(style="text-align: left;")
          label.form-label( for='select') Region
          .input-group
            select.form-control(v-model="item.region")
              option(value="" disabled selected) ::Seleccione una región::
              option(value="") Todos
              option(v-for="region in darach.regiones" :key="region.region" :value="region.region") {{ region.region }}
        .col(style="text-align: left;")
          label.form-label(for='select') Comuna
          .input-group
            select.form-control(v-model="item.comuna")
              option(value="" disabled selected) ::Seleccione una comuna::
              option(value="") Todos
              option(v-for="comuna in filteredComunas" :key="comuna" :value="comuna") {{ comuna }}
  .row
    .col-12.col-md-6
      label.form-label() Tipo de organización
      .input-group
        select.form-select(placeholder="Tipo" v-model="item.tipoConsultorio")
          option(:value="undefined" disabled) ::Seleccione un tipo:: 
          option(value="Clinica") Cclínica
          option(value="Hospital") Hospital
          option(value="Independiente") Consultorio
        input.form-control(placeholder="Nombre consultorio" v-model="item.nombreconsultorio" maxlength="30")
    .col-12.col-md-6
      label.form-label() Dirección
      .input-group
        input.form-control(placeholder="Ingrese dirección" v-model="item.direccion" maxlength="100")
    .col-12.col-md-6
      label.form-label() Alias para portal
      .input-group
        input.form-control(placeholder="alias" v-model="item.alias" maxlength="60")
    .col-12.col-md-6
      label.form-label() Descuento promocional por cumpleaños (%)
      .input-group
        span.input-group-text %
        input.form-control(v-model.number="item.descuentoCumpleanos" type="number" min="0" max="100" step="1" placeholder="Ej. 15")
      small.form-text.text-muted Se utilizará en el mensaje de fidelización enviado por WhatsApp.
  .row.mt-2
    .col-6
      label.form-label(v-if="!item.linkPerfil") Foto de perfil
      label.form-label(v-else) Cambiar foto de perfil
      InputFile(v-model='item.fotoPerfil')
      Img.m-1(v-if ="item.linkPerfil" :src="item.linkPerfil" height="100")
    .col-6
      label.form-label(v-if="!item.linkLogo") Logo
      label.form-label(v-else) Cambiar logo
      InputFile(v-model='item.fotoLogo')
      Img.m-1(v-if ="item.linkLogo" :src="item.linkLogo" height="100")
  .row 
    label.form-label(for='Message') Resumen personal
      textarea#message.form-control(rows='5', placeholder='Acerca de mí' v-model="item.perfil")  
  .row
    .col-12.col-md-4.mx-auto.mt-3.mb-5
      button#btguardar.w-100.text-white.text-start.btn.btn-primary.d-flex.justify-content-between.px-5.align-items-center( 
        type='submit', style="border-radius: 50px"
        )
        span
          small
          strong Guardar
          p.mb-0 Mis Datos
        i.bi.bi-floppy.fs-4.ms-5(style=" color: white;")
</template>

