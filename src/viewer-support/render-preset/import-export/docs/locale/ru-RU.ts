import type enUS from './en-US.js'

const locale: typeof enUS = {
  'custom-docs-import-export': {
    uploading: 'Загрузка',
    uploadSuccess: 'Файл успешно загружен',
    uploadSuccessTip: '{0} файл(ов) успешно загружен(о)',
    downloading: 'Скачивание',
    downloadSuccess: 'Скачивание успешно',

    unknownMistake: 'Неизвестная ошибка',
    networkError: 'Сетевая ошибка',
    tooLarge: 'Данные слишком большие',
    internalError: 'Внутренняя неизвестная ошибка',
    interrupt: 'Сетевое соединение было прервано, и загрузка файла не удалась',
    fileTypeError: 'Выбранный файл [{0}] не поддерживается для загрузки',

    wait: 'Пожалуйста, подождите...',
    cancel: 'Отмена',
    confirm: 'Подтвердить',
    uploadAgain: 'Загрузить снова',

    file: 'Файл',
    upload: 'Открыть(Файл)',
    download: 'Сохранить как'
  }
}

export default locale
