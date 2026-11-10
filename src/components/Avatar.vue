<script setup>
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Modal from 'bootstrap/js/dist/modal'
import { item, leer, registro, leerEnRegistro, actualizar } from '../store/usuario'
import { cerrarSesion, miUsuario } from '../store/sesion'

const { push } = useRouter()
const modalElement = ref()
const cerrandoSesion = ref(false)
let modalInstance
const opinionDefaults = {
  recomendacion: "",
  tuvoError: "",
  comentario: "",
}

const formItem = computed(() => {
  if (!item.value || typeof item.value !== "object") {
    item.value = { ...opinionDefaults }
  }

  return item.value
})

const asegurarCamposOpinion = () => {
  if (!item.value || typeof item.value !== "object") {
    item.value = {}
  }

  if (item.value.recomendacion === undefined || item.value.recomendacion === null) {
    item.value.recomendacion = opinionDefaults.recomendacion
  }
  if (item.value.tuvoError === undefined || item.value.tuvoError === null) {
    item.value.tuvoError = opinionDefaults.tuvoError
  }
  if (item.value.comentario === undefined || item.value.comentario === null) {
    item.value.comentario = opinionDefaults.comentario
  }
}

onMounted(() => {
  leer(miUsuario().uid)
  asegurarCamposOpinion()

  if (modalElement.value) {
    modalInstance = new Modal(modalElement.value)
  }
})

onBeforeUnmount(() => {
  modalInstance?.dispose?.()
})

watch(
  () => registro.value,
  () => {
    const valores = registro.value.find((registroItem) => registroItem.idUsuario == miUsuario().uid)
    if (valores != undefined) {
      leerEnRegistro(miUsuario().uid)
      asegurarCamposOpinion()
    }
  }
)

const adios = () => {
  push({ name: 'iniciar-sesion' })
}

const dejaOpinion = () => {
  asegurarCamposOpinion()
  return actualizar(item.value)
}

const cerrar = () => {
  modalInstance?.hide()
}

const abrirOpinion = () => {
  asegurarCamposOpinion()
  modalInstance?.show()
}

const salirSesion = async () => {
  if (cerrandoSesion.value) return

  cerrandoSesion.value = true
  try {
    await cerrarSesion()
    await push({ name: 'iniciar-sesion' })
  } catch (error) {
    console.error('No fue posible cerrar la sesión', error)
  } finally {
    cerrandoSesion.value = false
  }
}
</script>

<template lang="pug">
teleport(to='body')
  #exampleModal.modal.fade(ref='modalElement' tabindex='-1')
    .modal-dialog.modal-dialog-centered
      .modal-content
        Form(:onPromise='() => dejaOpinion()' :onSuccess='() => cerrar()')
          .modal-header
            h2.primary-text Déjanos tu opinión
            button.btn-close(type='button' @click='cerrar()')
          .modal-body
            p ¿Qué tan probable es que recomiendes QUIRU Dent AI a un amigo o colega?*
            .btn-group(role='group')
              input#btnradio0.btn-check(type='radio' name='btnradio' autocomplete='off' value='0' v-model="formItem.recomendacion")
              label.btn.btn-outline-primary(for='btnradio0') 0
              input#btnradio1.btn-check(type='radio' name='btnradio' autocomplete='off' value='1' v-model="formItem.recomendacion")
              label.btn.btn-outline-primary(for='btnradio1') 1
              input#btnradio2.btn-check(type='radio' name='btnradio' autocomplete='off' value='2' v-model="formItem.recomendacion")
              label.btn.btn-outline-primary(for='btnradio2') 2
              input#btnradio3.btn-check(type='radio' name='btnradio' autocomplete='off' value='3' v-model="formItem.recomendacion")
              label.btn.btn-outline-primary(for='btnradio3') 3
              input#btnradio4.btn-check(type='radio' name='btnradio' autocomplete='off' value='4' v-model="formItem.recomendacion")
              label.btn.btn-outline-primary(for='btnradio4') 4
              input#btnradio5.btn-check(type='radio' name='btnradio' autocomplete='off' value='5' v-model="formItem.recomendacion")
              label.btn.btn-outline-primary(for='btnradio5') 5
              input#btnradio6.btn-check(type='radio' name='btnradio' autocomplete='off' value='6' v-model="formItem.recomendacion")
              label.btn.btn-outline-primary(for='btnradio6') 6
              input#btnradio7.btn-check(type='radio' name='btnradio' autocomplete='off' value='7' v-model="formItem.recomendacion")
              label.btn.btn-outline-primary(for='btnradio7') 7
              input#btnradio8.btn-check(type='radio' name='btnradio' autocomplete='off' value='8' v-model="formItem.recomendacion")
              label.btn.btn-outline-primary(for='btnradio8') 8
              input#btnradio9.btn-check(type='radio' name='btnradio' autocomplete='off' value='9' v-model="formItem.recomendacion")
              label.btn.btn-outline-primary(for='btnradio9') 9
              input#btnradio10.btn-check(type='radio' name='btnradio' autocomplete='off' value='10' v-model="formItem.recomendacion")
              label.btn.btn-outline-primary(for='btnradio10') 10
            p.mt-3 ¿Tuviste algún problema en el uso de la aplicación?
              .form-check.form-check-inline
                input#inlineRadio1.form-check-input(type='radio' name='inlineRadioOptions' value='SiError' v-model="formItem.tuvoError")
                label.form-check-label(for='inlineRadio1') Si
              .form-check.form-check-inline
                input#inlineRadio2.form-check-input(type='radio' name='inlineRadioOptions' value='NoError' v-model="formItem.tuvoError")
                label.form-check-label(for='inlineRadio2') No
            .siHayError(v-if="formItem.tuvoError == 'SiError'")
              label.form-label Cuéntanos cuál fue el error
              .input-group
                textarea.form-control(v-model="formItem.comentario")
            label.form-label Déjanos un comentario sobre qué podríamos mejorar
            .input-group
              textarea.form-control(v-model="formItem.comentario")
            .modal-footer
              button.btn.btn-secondary(type='button' @click='cerrar()') Cerrar
              button.btn.btn-primary(type='submit') Enviar

.session-actions
  button.header-action.feedback-action(type='button' @click='abrirOpinion()')
    i.bi.bi-emoji-smile
    span.d-none.d-md-inline Opinión
  button.header-action(type='button' :disabled='cerrandoSesion' @click='salirSesion()')
    i.bi.bi-box-arrow-right
    span {{ cerrandoSesion ? 'Cerrando…' : 'Salir' }}
</template>

<style lang="sass" scoped>
.session-actions
  display: flex
  align-items: center
  justify-content: flex-end
  gap: .55rem

.header-action
  display: inline-flex
  align-items: center
  gap: .45rem
  min-height: 40px
  padding: .55rem .85rem
  border: 1px solid rgba(255,255,255,.24)
  border-radius: 10px
  color: white
  background: rgba(255,255,255,.08)
  font-weight: 700
  &:hover
    background: rgba(255,255,255,.16)
  &:disabled
    opacity: .65

@media (max-width: 575px)
  .header-action
    padding-inline: .65rem
  .feedback-action
    width: 40px
    justify-content: center
</style>
