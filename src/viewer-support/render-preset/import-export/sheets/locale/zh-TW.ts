import type enUS from './en-US.js'

const locale: typeof enUS = {
  'custom-import-export': {
    uploading: '上傳中',
    uploadSuccess: '檔案上傳成功',
    uploadSuccessTip: '{0}個檔案上傳成功',
    downloading: '下載中',
    downloadSuccess: '下載成功',

    unknownMistake: '未知錯誤',
    networkError: '網路異常',
    tooLarge: '資料流過大',
    internalError: '內部未知錯誤',
    interrupt: '網路連線中斷，檔案上傳失敗',
    fileTypeError: '所選檔案 [{0}] 不支援上傳',

    wait: '請稍等...',
    cancel: '取消',
    confirm: '確認',
    uploadAgain: '再次上傳',

    file: '檔案',
    upload: '開啟（檔案）',
    download: '另存為'
  }
}

export default locale
