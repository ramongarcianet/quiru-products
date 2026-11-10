import { ref, watch } from 'vue';
import { addDoc, collection, onSnapshot, getDoc, doc, updateDoc, deleteDoc, orderBy, query, where, getDocs } from 'firebase/firestore'
import { firestore } from '../config/firebase'
import { usuario } from '../store/sesion'

const dialog = ref(false)

const item = ref({
    tipoDocumento: 'DNI',
    sexo: '',
    fechaNacimiento: new Date().toISOString().slice(0, 10),
    fechaIngreso: new Date().toISOString().slice(0, 10),
    constancia: 'N',
    estado: true,
    centroLaboral: '',
    ocupacion: '',
    askHCG1: '',
    askHCG2: '',
    askHCG3: '',
    askHCG4: '',
    askHCG5: '',
    askHCG6: '',
    askHCG7: '',
    askHCG8: '',
    askHCG9: '',
    askHCG0: 'No',
    visto: 0
})
const revisarDNI = (item) => new Promise((resolve) => {
    try {
        return getDocs(
            query(
                collection(firestore, "paciente"),
                where("numeroDocumento", "==", item.numeroDocumento)
            )
        )
            .then(resultado => {
                if (resultado.empty) resolve(true)
                else resolve(false)
            })
    }
    catch (e) {
    }
})

const guardar = item => new Promise((resolve) => {
    const referencia = collection(firestore, 'paciente')

    return addDoc(referencia, {
        ...item, idOdontologo: usuario.value.uid,//"CZA4iXlwYgd4phRmo3VOFg19US73",//
        estado: true, visto: 0
    }).then(doc => resolve(doc.id))
})

const actualizar = (item) => {
    const referencia = doc(firestore, 'paciente', item.id)
    return updateDoc(referencia, item)
}

const updateEstado = (item) => {
    const referencia = doc(firestore, 'paciente', item.id)
    return updateDoc(referencia, { estado: false })
}

const eliminar = (id) => {
    const referencia = doc(firestore, 'paciente', id)
    return deleteDoc(referencia)
}

const registro = ref([])
const verEliminados = ref(false)
export const errorPacientes = ref('')
export const cargandoPacientes = ref(true)
export const registroPacienteTodo = ref([])

const obtenerTodos = () => {
    let detenerSnapshot = () => {}
    const detenerObservador = watch(
        [() => usuario.value.uid, () => verEliminados.value],
        ([uid, mostrarEliminados]) => {
            detenerSnapshot()
            registro.value = []
            errorPacientes.value = ''
            cargandoPacientes.value = true
            if (!uid) return

            const referencia = collection(firestore, 'paciente')
            const referenciaOrden = !mostrarEliminados
                ? query(referencia, where('idOdontologo', '==', uid), where('estado', '==', true))
                : query(referencia, where('idOdontologo', '==', uid), orderBy('fechaIngreso', 'desc'))

            detenerSnapshot = onSnapshot(
                referenciaOrden,
                collection => {
                    registro.value = collection.docs.map(documento => ({ ...documento.data(), id: documento.id }))
                    cargandoPacientes.value = false
                },
                cause => {
                    console.error('No fue posible obtener los pacientes.', cause)
                    errorPacientes.value = 'No fue posible obtener los pacientes. Actualiza la página o revisa tus permisos.'
                    cargandoPacientes.value = false
                }
            )
        },
        { immediate: true }
    )

    return () => {
        detenerObservador()
        detenerSnapshot()
    }
}
const obtenerTodosDni = () => {
    const referencia = collection(firestore, 'paciente')
    const referenciaOrden = !verEliminados.value
        ? query(referencia, where('idOdontologo', '==', usuario.value.uid), where('estado', '==', true))
        : query(referencia, where('idOdontologo', '==', usuario.value.uid), orderBy("fechaIngreso", "desc"))
    return onSnapshot(
        referenciaOrden,
        collection => {
            registro.value = collection.docs.map(doc => ({ ...doc.data(), dni: doc.dni }))
        }
    )
}

const leer = id => {
    const referencia = doc(firestore, 'paciente', id)
    return getDoc(referencia).then(snapshot => {
        item.value = snapshot.exists()
            ? { ...snapshot.data(), id: snapshot.id }
            : null
        return item.value
    })
}

const leerEnRegistro = id => {
    return item.value = registro.value.find(item => item.id == id)
}
const leerDniRegistro = dni => {
    try {
        item.value = registro.value.find(item => item.numeroDocumento == dni)
    }
    catch (e) {
        item.value = {
            tipoDocumento: 'DNI',
            sexo: '',
            fechaNacimiento: new Date().toISOString().slice(0, 10),
            fechaIngreso: new Date().toISOString().slice(0, 10),
            constancia: 'N',
            estado: true,
            visto: 0,
            numeroDocumento: dni
        }
    }
    if(item.value==undefined){
        item.value = {
            tipoDocumento: 'DNI',
            sexo: '',
            fechaNacimiento: new Date().toISOString().slice(0, 10),
            fechaIngreso: new Date().toISOString().slice(0, 10),
            constancia: 'N',
            estado: true,
            visto: 0,
            numeroDocumento: dni
        }
        alert("El DNI ingresado no existe, seleccione el check para registrar un nuevo paciente")
    }
    return
}
const limpiar = () => {
    item.value = {
        tipoDocumento: 'DNI',
        sexo: '',
        fechaNacimiento: new Date().toISOString().slice(0, 10),
        fechaIngreso: new Date().toISOString().slice(0, 10),
        constancia: 'N',
        centroLaboral: '',
        ocupacion: '',
        askHCG1: '',
        askHCG2: '',
        askHCG3: '',
        askHCG4: '',
        askHCG5: '',
        askHCG6: '',
        askHCG7: '',
        askHCG8: '',
        askHCG9: '',
        askHCG0: 'No',
    }
}

export {
    registro,
    item,
    guardar,
    obtenerTodos,
    leer,
    leerEnRegistro,
    obtenerTodosDni,
    leerDniRegistro,
    actualizar,
    eliminar,
    limpiar,
    updateEstado,
    dialog,
    verEliminados,
    revisarDNI,
}
