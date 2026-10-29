import type enUS from './en-US.js'

const locale: typeof enUS = {
  'custom-import-export': {
    uploading: 'Téléchargement en cours',
    uploadSuccess: 'Fichier téléchargé avec succès',
    uploadSuccessTip: '{0} fichier(s) téléchargé(s) avec succès',
    downloading: 'Téléchargement',
    downloadSuccess: 'Téléchargement réussi',

    unknownMistake: 'Erreur inconnue',
    networkError: 'Erreur réseau',
    tooLarge: 'Les données sont trop volumineuses',
    internalError: 'Erreur interne inconnue',
    interrupt: 'La connexion réseau a été interrompue et le téléchargement du fichier a échoué',
    fileTypeError: "Le fichier sélectionné [{0}] n'est pas pris en charge pour le téléchargement",

    wait: 'Veuillez patienter...',
    cancel: 'Annuler',
    confirm: 'Confirmer',
    uploadAgain: 'Télécharger à nouveau',

    file: 'Fichier',
    upload: 'Ouvrir (Fichier)',
    download: 'Enregistrer sous'
  }
}

export default locale
