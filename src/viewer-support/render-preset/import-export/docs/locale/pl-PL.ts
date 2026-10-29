import type enUS from './en-US.js'

const locale: typeof enUS = {
  'custom-docs-import-export': {
    uploading: 'Przesyłanie',
    uploadSuccess: 'Plik przesłany pomyślnie',
    uploadSuccessTip: 'Pomyślnie przesłano {0} plik(ów)',
    downloading: 'Pobieranie',
    downloadSuccess: 'Pobieranie zakończone sukcesem',

    unknownMistake: 'Nieznany błąd',
    networkError: 'Błąd sieci',
    tooLarge: 'Dane są zbyt duże',
    internalError: 'Wewnętrzny nieznany błąd',
    interrupt: 'Połączenie sieciowe zostało przerwane i przesyłanie pliku nie powiodło się',
    fileTypeError: 'Wybrany plik [{0}] nie jest obsługiwany do przesyłania',

    wait: 'Proszę czekać...',
    cancel: 'Anuluj',
    confirm: 'Potwierdź',
    uploadAgain: 'Prześlij ponownie',

    file: 'Plik',
    upload: 'Otwórz (plik)',
    download: 'Zapisz jako'
  }
}

export default locale
