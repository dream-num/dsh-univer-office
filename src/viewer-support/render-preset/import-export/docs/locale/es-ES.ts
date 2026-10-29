import type enUS from './en-US.js'

const locale: typeof enUS = {
  'custom-docs-import-export': {
    uploading: 'Subiendo',
    uploadSuccess: 'Archivo subido exitosamente',
    uploadSuccessTip: '{0} archivo(s) subido(s) exitosamente',
    downloading: 'Descargando',
    downloadSuccess: 'Descarga exitosa',

    unknownMistake: 'Error desconocido',
    networkError: 'Error de red',
    tooLarge: 'Los datos son demasiado grandes',
    internalError: 'Error interno desconocido',
    interrupt: 'La conexión de red se interrumpió y la carga del archivo falló',
    fileTypeError: 'El archivo seleccionado [{0}] no es compatible para subir',

    wait: 'Espere...',
    cancel: 'Cancelar',
    confirm: 'Confirmar',
    uploadAgain: 'Subir de nuevo',

    file: 'Archivo',
    upload: 'Abrir(Archivo)',
    download: 'Guardar como'
  }
}

export default locale
