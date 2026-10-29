import type enUS from './en-US.js'

const locale: typeof enUS = {
  'custom-import-export': {
    uploading: '업로드 중',
    uploadSuccess: '파일이 성공적으로 업로드되었습니다',
    uploadSuccessTip: '{0}개의 파일이 성공적으로 업로드되었습니다',
    downloading: '다운로드 중',
    downloadSuccess: '다운로드가 완료되었습니다',

    unknownMistake: '알 수 없는 오류',
    networkError: '네트워크 오류',
    tooLarge: '데이터가 너무 큽니다',
    internalError: '내부 오류가 발생했습니다',
    interrupt: '네트워크 연결이 중단되어 파일 업로드에 실패했습니다',
    fileTypeError: '선택한 파일 [{0}]은(는) 업로드가 지원되지 않습니다',

    wait: '잠시만 기다려 주세요...',
    cancel: '취소',
    confirm: '확인',
    uploadAgain: '다시 업로드',

    file: '파일',
    upload: '열기(파일)',
    download: '다른 이름으로 저장'
  }
}

export default locale
