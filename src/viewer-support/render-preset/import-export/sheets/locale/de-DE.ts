import type enUS from './en-US.js'

const locale: typeof enUS = {
  'custom-import-export': {
    uploading: 'Wird hochgeladen',
    uploadSuccess: 'Datei erfolgreich hochgeladen',
    uploadSuccessTip: '{0} Datei(en) erfolgreich hochgeladen',
    downloading: 'Wird heruntergeladen',
    downloadSuccess: 'Download erfolgreich',

    unknownMistake: 'Unbekannter Fehler',
    networkError: 'Netzwerkfehler',
    tooLarge: 'Daten sind zu groß',
    internalError: 'Interner unbekannter Fehler',
    interrupt: 'Die Netzwerkverbindung wurde unterbrochen und der Datei-Upload ist fehlgeschlagen',
    fileTypeError: 'Die ausgewählte Datei [{0}] wird für den Upload nicht unterstützt',

    wait: 'Bitte warten...',
    cancel: 'Abbrechen',
    confirm: 'Bestätigen',
    uploadAgain: 'Erneut hochladen',

    file: 'Datei',
    upload: 'Öffnen (Datei)',
    download: 'Speichern unter'
  }
}

export default locale
