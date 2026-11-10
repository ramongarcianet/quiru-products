<script setup>
import { injectProp } from '@vue/compiler-core';
import { computed, onUnmounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { obtenerTodos, registro, updateEstado, errorPacientes, cargandoPacientes } from "../../store/paciente";
import { previousPage, nextPage, setList, registro_, search, setListDelete, SetPage } from "../../config/Paginator";
import { registroodonto, obtenerTodos as obtenerOdontograma } from "../../store/formodontograma";
import { miUsuario } from "../../store/sesion";
import { isConversationalOdontogramEnabled } from "../../config/conversationalOdontogram";
const obtenerRegistro = obtenerTodos();
const confirmar = ref(false);
const { push } = useRouter();
const totalRows = ref(0);
const currentPage = ref(1);
const perPage = ref(5);
const pageOptions = ref([5, 10, 15, { value: 100, text: 'Show a lot' }]);
let itemseleccionado = {};
const paginatedData = ref([]);
const showAiAttention = computed(() => isConversationalOdontogramEnabled(miUsuario()?.uid));
onUnmounted(() => obtenerRegistro?.());
watch(
    () => registro.value,
    () => {
        totalRows.value = registro.value.length;
        const startIndex = (currentPage.value - 1) * perPage.value;
        const endIndex = startIndex + perPage.value;
        paginatedData.value = registro.value.slice(startIndex, endIndex);
    }
)


watch([currentPage, perPage], ([newCurrentPage, newPerPage]) => {
  var input, searchValue;
  const startIndex = (newCurrentPage - 1) * newPerPage;
  const endIndex = startIndex + newPerPage;
  input = document.getElementById("SearchInput");
  searchValue = input.value.toUpperCase();  
  if (searchValue != "") {
    let tempData = registro.value;
    let completo = "";
    tempData = tempData.filter((item) => {
            completo = item.tipoDocumento + ' ' + item.numeroDocumento + ' ' + item.nombre + ' ' + item.apellidoPaterno + ' ' + item.apellidoMaterno;
            return completo
                .toUpperCase()
                .includes(searchValue.toUpperCase())
        });
    paginatedData.value = tempData.slice(startIndex, endIndex);
  }else{
    paginatedData.value = registro.value.slice(startIndex, endIndex);
  }  
});

function searchData() {
    var input, searchValue;
    input = document.getElementById("SearchInput");
    searchValue = input.value.toUpperCase();
    let tempData = registro.value;
    let completo = "";
    const currentPageSr = 1;
    if (tempData != undefined) {
        tempData = tempData.filter((item) => {
            completo = item.tipoDocumento + ' ' + item.numeroDocumento + ' ' + item.nombre + ' ' + item.apellidoPaterno + ' ' + item.apellidoMaterno;
            return completo
                .toUpperCase()
                .includes(searchValue.toUpperCase())
        });
        totalRows.value = tempData.length;
        const startIndex = (currentPageSr - 1) * perPage.value;
        const endIndex = startIndex + perPage.value;
        paginatedData.value = tempData.slice(startIndex, endIndex);
    }
   
}
</script>
<template lang="pug">
    <b-container fluid>
    .row
        .col-5.d-none.d-md-block
            b-form-group.mb-0(label='Por página' label-for='per-page-select' label-cols-sm='3' label-cols-md='3' label-cols-lg='3' label-align-sm='right' label-size='mb')
                b-form-select#per-page-select(v-model='perPage' :options='pageOptions' size='mb')
        .col-7.d-none.d-md-block
            input#SearchInput.form-control.mb-2.ms-auto(v-on:keyup='searchData(registro)' placeholder="Buscar por nombre o documento" aria-label='Buscar pacientes')
        .d-block.d-md-none
            input#SearchInput.form-control.mb-2.ms-auto(v-on:keyup='searchData(registro)' placeholder="Buscar por nombre o documento" aria-label='Buscar pacientes')
    .div.mb-5
        .alert.alert-danger(v-if='errorPacientes' role='alert') {{ errorPacientes }}
        .patients-loading(v-else-if='cargandoPacientes' role='status')
            .spinner-border.text-primary(aria-hidden='true')
            span Obteniendo pacientes…
        .card.table-heading.mb-1.d-none.d-md-block
            .row.align-items-center.p-2
                .col-3.ps-4.d-none.d-md-block Doc. Identidad
                .col-3.d-none.d-md-block Nombre
                .col-2.d-none.d-md-block Teléfono
                .col-2.d-none.d-md-block Email
                .col-1
        .card.patient-row.mb-2.p-3.d-block.d-md-none(v-for="item of paginatedData" :key="item.id" :item="item")
            .row.align-items-center.p-1(style="cursor: pointer")
                .col-9(@click="push({ name: 'pacienteVer', params: { idPaciente: item.id } })") {{item.tipoDocumento + ' ' +item.numeroDocumento }}
                .col-3.d-flex.justify-content-end.gap-2(style="max-height: 32px")
                    button.btn.p-0.m-0(title='Atención tradicional' @click="push({ name: 'pacienteVer', params: { idPaciente: item.id } })")
                        i.bi.bi-person
                    button.btn.ai-action.p-0.m-0(v-if="showAiAttention" title='Atención con QUIRU AI' @click="push({ name: 'atencion-ai', params: { idPaciente: item.id } })")
                        i.bi.bi-stars
                .col-12(@click="push({ name: 'pacienteVer', params: { idPaciente: item.id } })") {{ item.nombre + ' ' + item.apellidoPaterno + ' ' + item.apellidoMaterno }}

        .card.patient-row.mb-2.p-2.d-none.d-md-block(v-for="item of paginatedData" :key="item.id" :item="item")
            .row.align-items-center.p-1(style="cursor: pointer")
                .col.ps-3(@click="push({ name: 'pacienteVer', params: { idPaciente: item.id } })") {{item.tipoDocumento}}
                .col-2(@click="push({ name: 'pacienteVer', params: { idPaciente: item.id } })") {{ item.numeroDocumento }}
                .col-3(@click="push({ name: 'pacienteVer', params: { idPaciente: item.id } })") {{ item.nombre + ' ' + item.apellidoPaterno + ' ' + item.apellidoMaterno }} 
                .col-2(@click="push({ name: 'pacienteVer', params: { idPaciente: item.id } })") {{item.telefono}}
                .col-2(@click="push({ name: 'pacienteVer', params: { idPaciente: item.id } })") {{item.email}}
                .col-2.d-flex.justify-content-end.gap-1
                    button.btn(title='Atención tradicional' aria-label='Atención tradicional' @click="push({ name: 'pacienteVer', params: { idPaciente: item.id } })")
                        i.bi.bi-person
                    button.btn.ai-action(v-if="showAiAttention" title='Atención con QUIRU AI' aria-label='Atención con QUIRU AI' @click="push({ name: 'atencion-ai', params: { idPaciente: item.id } })")
                        i.bi.bi-stars
        .empty-state(v-if='!cargandoPacientes && !errorPacientes && paginatedData.length === 0')
            i.bi.bi-people(aria-hidden='true')
            h2 Todavía no tienes pacientes registrados.
            p Registra tu primer paciente para comenzar.
            button.btn.btn-primary(type='button' @click="push({name: 'paciente'})") Nuevo paciente
        b-col.my-1(sm='12' md='12')
            b-pagination.my-0(v-model='currentPage' :total-rows='totalRows' :per-page='perPage' align='center' size='lg')
            
    </b-container>
</template>
<style lang="sass" scoped>
.table-heading
    color: var(--brand-navy)
    background: #eef4ff
    border-radius: 12px
    box-shadow: none
    font-weight: 700

.patient-row
    border-radius: 12px
    box-shadow: none
    transition: border-color .18s ease, background-color .18s ease
    &:hover
        border-color: rgba(var(--brand-blue-rgb), .28)
        background: #f7faff

.ai-action
    color: #6d5ce7
    background: #f3f0ff
    &:hover
        color: #fff
        background: #6d5ce7

.empty-state
    display: flex
    align-items: center
    flex-direction: column
    padding: 3rem 1rem
    text-align: center
    color: var(--text-secondary)
    i
        color: var(--brand-blue)
        font-size: 2.5rem
    h2
        margin: 1rem 0 .35rem
        color: var(--brand-navy)
        font-size: 1.15rem
    p
        margin-bottom: 1.25rem

.patients-loading
    display: flex
    align-items: center
    justify-content: center
    gap: .75rem
    min-height: 180px
    color: var(--text-secondary)
</style>
  
