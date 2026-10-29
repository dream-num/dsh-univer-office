import type enUS from './en-US.js'

const locale: typeof enUS = {
  'custom-bases-import-export': {
    uploading: 'Caricamento in corso',
    uploadSuccess: 'File caricato con successo',
    uploadSuccessTip: '{0} file caricati con successo',
    downloading: 'Download in corso',
    downloadSuccess: 'Download riuscito',

    unknownMistake: 'Errore sconosciuto',
    networkError: 'Errore di rete',
    tooLarge: 'I dati sono troppo grandi',
    internalError: 'Errore interno sconosciuto',
    interrupt: 'La connessione di rete è stata interrotta e il caricamento del file è fallito',
    fileTypeError: 'Il file selezionato [{0}] non è supportato per il caricamento',

    wait: 'Attendi...',
    cancel: 'Annulla',
    confirm: 'Conferma',
    uploadAgain: 'Carica di nuovo',

    file: 'File',
    upload: 'Apri (File)',
    download: 'Salva con nome'
  }
}

export default locale
