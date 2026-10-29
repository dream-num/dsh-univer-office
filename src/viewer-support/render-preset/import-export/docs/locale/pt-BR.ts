import type enUS from './en-US.js'

const locale: typeof enUS = {
  'custom-docs-import-export': {
    uploading: 'Enviando',
    uploadSuccess: 'Arquivo enviado com sucesso',
    uploadSuccessTip: '{0} arquivo(s) enviado(s) com sucesso',
    downloading: 'Baixando',
    downloadSuccess: 'Download concluído com sucesso',

    unknownMistake: 'Erro desconhecido',
    networkError: 'Erro de rede',
    tooLarge: 'Os dados são muito grandes',
    internalError: 'Erro interno desconhecido',
    interrupt: 'A conexão de rede foi interrompida e o envio do arquivo falhou',
    fileTypeError: 'O arquivo selecionado [{0}] não é suportado para envio',

    wait: 'Aguarde...',
    cancel: 'Cancelar',
    confirm: 'Confirmar',
    uploadAgain: 'Enviar novamente',

    file: 'Arquivo',
    upload: 'Abrir (Arquivo)',
    download: 'Salvar Como'
  }
}

export default locale
