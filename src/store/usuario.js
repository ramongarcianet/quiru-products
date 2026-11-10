import { ref } from 'vue';
import { addDoc, collection, onSnapshot, getDoc,getDocs,doc, updateDoc, deleteDoc, setDoc, query, where } from 'firebase/firestore'
import { firestore } from '../config/firebase'
import { usuario } from '../store/sesion'
const registro = ref([])
const item = ref({
    nombre: '',
    apellidoPaterno: '',
    apellidoMaterno: '',
    tipoDocumento: 'DNI',
    numeroDocumento: '',
    email: '',
    numeroTlf: '',
    sexo: '',
    fechaNacimiento: new Date().toISOString().slice(0, 10),
    fechaIngreso: new Date().toISOString().slice(0, 10),
    tipoConsultorio: '',
    nombreconsultorio: '',
    descuentoCumpleanos: 0,
    direccion: '',
    interesado: '',
    comuna:'',
    region:''
})
const item1 = ref({
    nombre: '',
    apellidoPaterno: '',
    apellidoMaterno: '',
    tipoDocumento: 'DNI',
    numeroDocumento: '',
    email: '',
    numeroTlf: '',
    sexo: '',
    fechaNacimiento: new Date().toISOString().slice(0, 10),
    fechaIngreso: new Date().toISOString().slice(0, 10),
    tipoConsultorio: '',
    nombreconsultorio: '',
    descuentoCumpleanos: 0,
    direccion: '',
    interesado: '',
    comuna:'',
    region:''
})
export const crearUsuarioConId = item => {
    const referencia = doc(firestore, 'usuario', item.id)
    return setDoc(referencia, item)
}

export const crearUsuarioConGoogle = item => {
    const referencia = doc(firestore, 'usuario', item.id)
    return setDoc(referencia, item, { merge: true })
}

export const crearUsuarioConFacebook = item => {
    const referencia = doc(firestore, 'usuario', item.id)
    return setDoc(referencia, item, { merge: true })
}

const actualizar = (item) => {
    const referencia = doc(firestore, 'usuario', item.id)
    return updateDoc(referencia, item)
}

const eliminar = (id) => {
    const referencia = doc(firestore, 'usuario', id)
    return deleteDoc(referencia)
}
export const desactivarUsuario = (id) => {
    const referencia = doc(firestore, 'usuario', id)
    return updateDoc(referencia, {estado: false})
}
export const interesarUsuario = (i) => {
    const referencia = doc(firestore, 'usuario', i)
    return updateDoc(referencia, {interesado: true})
}

const obtenerTodos = () => {
    const referencia = collection(firestore, 'usuario')
    //const referenciaOrden = query(referencia, orderBy("fechaIngreso", "desc"))
    return onSnapshot(
        referencia,
        collection => registro.value = collection.docs.map(doc => ({ ...doc.data(), id: doc.id }))
    )
}

//esta función lee en la base de datos por idUsuario del inicio de sesión (uid)
const leer = idUsuario => {
    const referencia = doc(firestore, 'usuario', idUsuario)
    return getDoc(referencia).then(doc => item.value = doc.exists() ? doc.data() : item1)
}

const leerEnRegistro = id => {
    return item.value = registro.value.find(item => item.idUsuario == id)
}
export const obtenerOdontologo = (idUsuario)=> new Promise(resolve=>{
    const referencia = collection(firestore, 'usuario')
    return getDocs(query(referencia, where("id", "==", idUsuario)))
        .then(coleccion => resolve(coleccion.docs.map( doc => doc.data())))
})
const limpiar = () => {
    item.value = {
        tipoDocumento: 'DNI',
        sexo: '',
        fechaNacimiento: new Date().toISOString().slice(0, 10),
        fechaIngreso: new Date().toISOString().slice(0, 10)

    }
}

export {
    registro,
    item,
    obtenerTodos,
    leer,
    leerEnRegistro,
    actualizar,
    eliminar,
    limpiar,
}

