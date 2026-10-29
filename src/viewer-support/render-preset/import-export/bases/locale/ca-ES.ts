import type enUS from './en-US.js'

const locale: typeof enUS = {
  'custom-bases-import-export': {
    uploading: 'Pujant',
    uploadSuccess: 'Fitxer pujat correctament',
    uploadSuccessTip: '{0} fitxer(s) pujat(s) correctament',
    downloading: 'Descarregant',
    downloadSuccess: 'Descàrrega correcta',

    unknownMistake: 'Error desconegut',
    networkError: 'Error de xarxa',
    tooLarge: 'Les dades són massa grans',
    internalError: 'Error intern desconegut',
    interrupt: "La connexió de xarxa s'ha interromput i la pujada del fitxer ha fallat",
    fileTypeError: 'El fitxer seleccionat [{0}] no és compatible per pujar',

    wait: 'Espereu...',
    cancel: 'Cancel·lar',
    confirm: 'Confirmar',
    uploadAgain: 'Tornar a pujar',

    file: 'Fitxer',
    upload: 'Obrir(Fitxer)',
    download: 'Anomena i desa'
  }
}

export default locale
