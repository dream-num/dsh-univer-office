import type enUS from './en-US.js'

const locale: typeof enUS = {
  'custom-bases-import-export': {
    uploading: 'アップロード中',
    uploadSuccess: 'ファイルが正常にアップロードされました',
    uploadSuccessTip: '{0} 個のファイルが正常にアップロードされました',
    downloading: 'ダウンロード中',
    downloadSuccess: 'ダウンロードが完了しました',

    unknownMistake: '不明なエラー',
    networkError: 'ネットワークエラー',
    tooLarge: 'データが大きすぎます',
    internalError: '内部エラーが発生しました',
    interrupt: 'ネットワーク接続が中断され、ファイルのアップロードに失敗しました',
    fileTypeError: '選択されたファイル [{0}] はアップロードがサポートされていません',

    wait: 'お待ちください...',
    cancel: 'キャンセル',
    confirm: '確認',
    uploadAgain: '再度アップロード',

    file: 'ファイル',
    upload: '開く(ファイル)',
    download: '名前を付けて保存'
  }
}

export default locale
