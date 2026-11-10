import { computed, ref } from 'vue';
import { alertMensaje } from './helper.js'
import { convertToText } from "./numeroLetras.js"
import router from '../config/router'
import comandosDeVoz from './comandosDeVoz';
import { item as itemodontograma } from './formodontograma';
import { guardarEnDiccionario } from './formodontograma';
import '../assets/annyang.min.js'
const { push } = router;
export const isSpeech = ref(false);
let flagAnnyang;
const annyangInstance = typeof window !== 'undefined' ? window.annyang : null;
export const resizeWindow = ref(1366)
export const verOdontograma = ref(true)
export let flagLimpiar = ref(false)
export const textoEscuchado = ref()
export const speechError = ref('')
export const paginaOdontograma = ref(false);
export const listaDeDientes = [
    [[[{ diente: '18', clase: "raiz-3 " }, { diente: "17", clase: "raiz-3" }, { diente: "16", clase: "raiz-3" }, { diente: "15", clase: "raiz-1" }, { diente: "14", clase: "raiz-2" }, { diente: "13", clase: "raiz-1 toCenter" }, { diente: "12", clase: "raiz-1 toCenter" }, { diente: "11", clase: "raiz-1 toCenter" }], [{ diente: "21", clase: "raiz-1 toLeft toCenter" }, { diente: "22", clase: "raiz-1 toLeft toCenter" }, { diente: "23", clase: "raiz-1 toLeft toCenter" }, { diente: "24", clase: "raiz-2 toLeft" }, { diente: "25", clase: "raiz-1  toLeft" }, { diente: "26", clase: "raiz-3  toLeft" }, { diente: "27", clase: "raiz-3  toLeft" }, { diente: "28", clase: "raiz-3  toLeft" },]],
    [[{ diente: "55", clase: "raiz-3 " }, { diente: "54", clase: "raiz-3" }, { diente: "53", clase: "raiz-1 toCenter" }, { diente: "52", clase: "raiz-1 toCenter" }, { diente: "51", clase: "raiz-1 toCenter" }], [{ diente: "61", clase: "raiz-1 toLeft toCenter" }, { diente: "62", clase: "raiz-1 toLeft toCenter" }, { diente: "63", clase: "raiz-1 toLeft toCenter" }, { diente: "64", clase: "raiz-3 toLeft" }, { diente: "65", clase: "raiz-3 toLeft" }]]],
    [[[{ diente: "85", clase: "raiz-2 toDown" }, { diente: "84", clase: "raiz-2 toDown" }, { diente: "83", clase: "raiz-1 toDown toCenter" }, { diente: "82", clase: "raiz-1 toDown toCenter" }, { diente: "81", clase: "raiz-1 toDown toCenter" }], [{ diente: "71", clase: "raiz-1 toDown toLeft toCenter" }, { diente: "72", clase: "raiz-1 toDown toLeft toCenter" }, { diente: "73", clase: "raiz-1 toDown toLeft toCenter" }, { diente: "74", clase: "raiz-2 toDown toLeft" }, { diente: "75", clase: "raiz-2 toDown toLeft" }]],
    [[{ diente: "48", clase: "raiz-2 toDown" }, { diente: "47", clase: "raiz-2 toDown" }, { diente: "46", clase: "raiz-2 toDown" }, { diente: "45", clase: "raiz-1 toDown" }, { diente: "44", clase: "raiz-1 toDown" }, { diente: "43", clase: "raiz-1 toDown toCenter" }, { diente: "42", clase: "raiz-1 toDown toCenter" }, { diente: "41", clase: "raiz-1 toDown toCenter" }], [{ diente: "31", clase: "raiz-1 toDown toLeft toCenter" }, { diente: "32", clase: "raiz-1 toDown toLeft toCenter" }, { diente: "33", clase: "raiz-1 toDown toLeft toCenter" }, { diente: "34", clase: "raiz-1 toDown toLeft" }, { diente: "35", clase: "raiz-1 toDown toLeft" }, { diente: "36", clase: "raiz-2 toDown toLeft" }, { diente: "37", clase: "raiz-2 toDown toLeft" }, { diente: "38", clase: "raiz-2 toDown toLeft" }]]],
];

export const registro_ = computed(() =>
    listaDeDientes.map(rows =>
        rows.map(row =>
            row.map(col =>
                col.map(({ diente, clase }) => ({
                    diente,
                    clase,
                    hallazgos: (itemodontograma.value.hallazgos) ? itemodontograma.value.hallazgos.filter(i => i.diente == diente).map(({ hallazgo, ubicacion }) => ({ hallazgo, ubicacion })) : null
                }))
            )
        )
    )
)
export const Hallazgo = ref("")
export const item = ref({
    diente: '',
    hallazgos: []
})

function startAnnyang(paused = false) {
    if (!annyangInstance) return false;
    try {
        annyangInstance.start({
            autoRestart: true,
            continuous: true,
            paused
        });
        speechError.value = '';
        return true;
    } catch (error) {
        console.error('No se pudo iniciar annyang', error);
        speechError.value = 'No se pudo iniciar el micrófono';
        return false;
    }
}

if (annyangInstance) {

    annyangInstance.setLanguage("es-MX");

    annyangInstance.addCallback('result', function (frase) {
        if (isSpeech.value) {
            textoEscuchado.value = frase[0];
        }
    })
    /*
    annyang.addCallback('soundstart', function () {
        if (!isSpeech.value) {
            detenerVozAutomat()
        }
    });
    */
    annyangInstance.addCallback('resultMatch', function (e) {
        if (isSpeech.value) {
            guardarEnDiccionario(e)
        }
    });
    annyangInstance.addCallback('resultNoMatch', function (e) {
        if (isSpeech.value) {
            //guardarEnDiccionario(e);
        }
    });
    annyangInstance.addCallback('error', function (e) {
        speechError.value = e?.error || 'Error de reconocimiento de voz';
        if (e.error == 'aborted') {
            annyangInstance.abort()
            startAnnyang(!isSpeech.value)
        }

    });
    annyangInstance.addCallback('errorNetwork', function () {
        speechError.value = 'Error de red del reconocimiento de voz';
        detenerVozAutomat()
    });
    annyangInstance.addCallback('errorPermissionBlocked', function () {
        speechError.value = 'Permiso de micrófono bloqueado';
        detenerVozAutomat()
    });
    annyangInstance.addCallback('errorPermissionDenied', function () {
        speechError.value = 'Permiso de micrófono denegado';
       /* if (resizeWindow.value < 500)
            console.log('Reconectando al micrófono')*/
    });
    annyangInstance.getSpeechRecognizer()?.grammars?.addFromString(comandosDeVoz?.gramatica, 1);
    annyangInstance.addCommands(comandosDeVoz.conVozApagada)
} 
//--fin speech recognition
export function escucharInicializarVoz() {
    if (!annyangInstance) return;
    annyangInstance.resume();
}
export function detenerInicializarVoz() {
    if (!annyangInstance) return;
    annyangInstance.abort();
}

export function activarVoz() {
    if (!annyangInstance) {
        speechError.value = 'Este navegador no soporta reconocimiento de voz';
        return;
    }
    annyangInstance.removeCommands();
    annyangInstance.addCommands(comandosDeVoz.conVozEncendida)
    isSpeech.value = true;
    startAnnyang(false);
    setTimeout(() => {
        if (isSpeech.value) {
            comandosDeVoz.saludar()
        }
    }, 250);
}
export function reactivarVoz() {
    if (annyangInstance && paginaOdontograma.value) {
        annyangInstance.removeCommands();
        annyangInstance.addCommands(comandosDeVoz.conVozEncendida)
        isSpeech.value = true;
        startAnnyang(false);
    }
}
export function detenerVoz() {
    if (!annyangInstance) return;
    annyangInstance.removeCommands();
    annyangInstance.addCommands(comandosDeVoz.conVozApagada)
    isSpeech.value = false;//stop
    textoEscuchado.value = '';
    item.value = {
        diente: '',
        hallazgos: []
    }
    // pause() mantiene vivo el SpeechRecognition interno y puede retener el
    // micrófono al abrir Atención AI. abort() libera el dispositivo por completo.
    annyangInstance.abort();
}
export function detenerVozAutomat() {
    if (!annyangInstance) return;
    annyangInstance.removeCommands();
    annyangInstance.addCommands(comandosDeVoz.conVozApagada)
    isSpeech.value = false;//stop
    textoEscuchado.value = '';
    annyangInstance.abort();
}
let synth = window.speechSynthesis;

let voices = synth.getVoices();
const convertirEnPalabra = num => convertToText(num.toString())
const preferredSpanishVoices = ['es-MX', 'es-US', 'es-419', 'es-PE', 'es-AR', 'es-CL', 'es'];
const preferredFemaleVoiceNames = [
    'sabina', 'dalia', 'monica', 'paulina', 'helena', 'elvira', 'paloma',
    'ximena', 'luciana', 'laura', 'sofia', 'catalina', 'carolina',
    'victoria', 'gabriela', 'google espanol'
];

function isPreferredFemaleVoice(voice) {
    const normalizedName = voice.name
        ?.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') || '';

    return preferredFemaleVoiceNames.some(name => normalizedName.includes(name));
}

function getPreferredVoice() {
    voices = synth.getVoices();
    for (const lang of preferredSpanishVoices) {
        const match = voices.find(voice =>
            voice.lang?.toLowerCase() === lang.toLowerCase() && isPreferredFemaleVoice(voice)
        );
        if (match) return match;
    }
    for (const lang of preferredSpanishVoices) {
        const match = voices.find(voice =>
            voice.lang?.toLowerCase().startsWith(lang.toLowerCase()) && isPreferredFemaleVoice(voice)
        );
        if (match) return match;
    }
    for (const lang of preferredSpanishVoices) {
        const match = voices.find(voice => voice.lang?.toLowerCase() === lang.toLowerCase());
        if (match) return match;
    }
    for (const lang of preferredSpanishVoices) {
        const match = voices.find(voice => voice.lang?.toLowerCase().startsWith(lang.toLowerCase()));
        if (match) return match;
    }
    return voices.find(voice => voice.lang?.toLowerCase().startsWith('es')) || voices[0];
}

if (typeof speechSynthesis !== 'undefined') {
    speechSynthesis.onvoiceschanged = () => {
        voices = synth.getVoices();
    };
}

export function speak(pHablar, options = {}) {

    if (synth.speaking) {
        synth.cancel();
    }
    if (pHablar !== '') {
        const arregloDePalabras = pHablar.split(" ")
        const frase = arregloDePalabras.map(item => !Number(item) ? item : convertirEnPalabra(Number(item))).join(" ")
        const shouldPauseRecognition = options.manageRecognition !== false && !isSpeech.value;
        const tiempoEnPausa = frase.length / 2 * 150
        if (shouldPauseRecognition) {
            detenerInicializarVoz()
            setTimeout(() => escucharInicializarVoz(), tiempoEnPausa);
        }
        let utterThis = new SpeechSynthesisUtterance(pHablar);
        utterThis.lang = 'es-MX';
        utterThis.voice = getPreferredVoice();
        utterThis.pitch = Number(options.pitch || 1);
        utterThis.rate = Number(options.rate || 1);
        return new Promise(resolve => {
            let settled = false;
            let started = false;
            let monitor;
            let safetyTimer;
            const finish = () => {
                if (settled) return;
                settled = true;
                clearInterval(monitor);
                clearTimeout(safetyTimer);
                resolve();
            };
            utterThis.onstart = () => { started = true; };
            utterThis.onend = finish;
            utterThis.onerror = finish;
            synth.speak(utterThis);

            // Algunos navegadores reproducen la frase pero no emiten onend.
            // Detectamos que la cola terminó y liberamos el siguiente turno de escucha.
            monitor = setInterval(() => {
                if (started && !synth.speaking && !synth.pending) finish();
            }, 250);
            safetyTimer = setTimeout(() => {
                if (synth.speaking || synth.pending) synth.cancel();
                finish();
            }, Math.min(15000, Math.max(3000, pHablar.length * 110)));
        });

    }
    return Promise.resolve();
}


export function volver() {
    push({ name: 'odontograma' })
}

export function activarMicro() {
    return activarMicro = function () {
        if (navigator.getUserMedia) {
            navigator.getUserMedia(
                { audio: true },//permitir solo audio
                function (stream) {

                },
                function (e) {

                }
            );

        } else { }
    }();

}
