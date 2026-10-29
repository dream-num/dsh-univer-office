import type enUS from './en-US.js'

const locale: typeof enUS = {
  'custom-import-export': {
    uploading: 'Đang tải lên',
    uploadSuccess: 'Tải lên tệp thành công',
    uploadSuccessTip: '{0} tệp đã được tải lên thành công',
    downloading: 'Đang tải xuống',
    downloadSuccess: 'Tải xuống thành công',

    unknownMistake: 'Lỗi không xác định',
    networkError: 'Lỗi mạng',
    tooLarge: 'Luồng dữ liệu quá lớn',
    internalError: 'Lỗi không xác định bên trong',
    interrupt: 'Kết nối mạng bị gián đoạn, tải lên tệp thất bại',
    fileTypeError: 'Tệp được chọn [{0}] không được hỗ trợ để tải lên',

    wait: 'Vui lòng đợi...',
    cancel: 'Hủy bỏ',
    confirm: 'Xác nhận',
    uploadAgain: 'Tải lên lại',
    file: 'Tệp',
    upload: 'Mở (Tệp)',
    download: 'Lưu dưới dạng'
  }
}

export default locale
