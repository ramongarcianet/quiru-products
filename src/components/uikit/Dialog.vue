<script setup>
import { onBeforeUnmount, onMounted, watch, ref } from 'vue'
import Modal from 'bootstrap/js/dist/modal'

const props = defineProps(["modelValue"]);
const emit = defineEmits(["update:modelValue"]);
const dialog = ref();
let modalInstance
let stopWatching

const handleHidden = () => {
  if (props.modelValue) emit('update:modelValue', false)
}

onMounted(() => {
  modalInstance = Modal.getOrCreateInstance(dialog.value)
  dialog.value.addEventListener('hidden.bs.modal', handleHidden)
  stopWatching = watch(
    () => props.modelValue,
    () => {
      if (props.modelValue) modalInstance.show()
      else modalInstance.hide()
    },
    { immediate: true }
  )
})

onBeforeUnmount(() => {
  stopWatching?.()
  dialog.value?.removeEventListener('hidden.bs.modal', handleHidden)
  modalInstance?.dispose()
})
</script>

<template lang="pug">
teleport(to='body')
  .modal.fade( ref='dialog' tabindex="-1" aria-hidden="true")
    .modal-dialog.modal-dialog-centered
      .modal-content
        .modal-header
          h5.modal-title
              slot(name='title') 
          button.btn-close(type="button" @click='$emit("update:modelValue", false)' aria-label="Close")
        .modal-body
          slot(name='body')
        .modal-footer
          slot(name='footer')
        
</template>
