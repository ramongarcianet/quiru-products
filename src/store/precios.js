import { ref } from 'vue';
import { addDoc, collection, onSnapshot, getDoc, doc, updateDoc, deleteDoc, query, where } from 'firebase/firestore'
import {firestore} from '../config/firebase'
import {usuario} from '../store/sesion'
const item = ref ({})
const stamp = () => new Date().toISOString()

const guardar = item => {
    const referencia = collection(firestore, 'listaprecios')
    return addDoc(referencia, {
        ...item,
        idOdontologo: usuario.value.uid,
        activo: item.activo !== false,
        creadoEn: item.creadoEn || stamp(),
        actualizadoEn: stamp(),
    })
}

const actualizar = (item) => {
    const referencia = doc(firestore, 'listaprecios', item.id)
    return updateDoc(referencia, { ...item, actualizadoEn: stamp() })
}

const eliminar = (id) => {
    const referencia = doc(firestore, 'listaprecios', id)
    return deleteDoc(referencia)
}

const registro = ref([])
const obtenerTodos = () => {
    const referencia = collection(firestore, 'listaprecios')
    const referenciaOrden = query(referencia, where('idOdontologo', '==', usuario.value.uid))
    return onSnapshot(
        referenciaOrden,
        collection => registro.value = collection.docs
            .map(doc => ({ ...doc.data(), id: doc.id }))
            .sort((a, b) => String(a.nombre || a.tipo || '').localeCompare(String(b.nombre || b.tipo || ''), 'es'))
    )
}

const leer = id => {
    const referencia = doc(firestore, 'listaprecios', id)
    return getDoc( referencia ).then( doc => item.value = doc.data())
}

const leerEnRegistro = id => {
    return item.value = registro.value.find( item  => item.id == id )
}
const limpiar=()=> {
    item.value = {}
}

export {
    registro,
    item,
    guardar,
    obtenerTodos,
    leer,
    leerEnRegistro,
    actualizar,
    eliminar,
    limpiar,
}
