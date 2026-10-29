import type enUS from './en-US.js'

const locale: typeof enUS = {
  'custom-docs-import-export': {
    uploading: '上传中',
    uploadSuccess: '文件上传成功',
    uploadSuccessTip: '{0}个文件上传成功',
    downloading: '下载中',
    downloadSuccess: '下载成功',

    unknownMistake: '未知错误',
    networkError: '网络异常',
    tooLarge: '数据流过大',
    internalError: '内部未知错误',
    interrupt: '网络连接中断，文件上传失败',
    fileTypeError: '所选文件 [{0}] 不支持上传',

    wait: '请稍等...',
    cancel: '取消',
    confirm: '确认',
    uploadAgain: '再次上传',

    file: '文件',
    upload: '打开（文件）',
    download: '另存为'
  }
}

export default locale
