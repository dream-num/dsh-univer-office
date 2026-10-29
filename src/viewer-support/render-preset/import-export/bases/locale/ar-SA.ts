import type enUS from './en-US.js'

const locale: typeof enUS = {
  'custom-bases-import-export': {
    uploading: 'جارٍ الرفع',
    uploadSuccess: 'تم رفع الملف بنجاح',
    uploadSuccessTip: 'تم رفع {0} ملف/ملفات بنجاح',
    downloading: 'جارٍ التحميل',
    downloadSuccess: 'تم التحميل بنجاح',

    unknownMistake: 'خطأ غير معروف',
    networkError: 'خطأ في الشبكة',
    tooLarge: 'البيانات كبيرة جداً',
    internalError: 'خطأ داخلي غير معروف',
    interrupt: 'تمت مقاطعة الاتصال بالشبكة وفشل رفع الملف',
    fileTypeError: 'نوع الملف المحدد [{0}] غير مدعوم للرفع',

    wait: 'يرجى الانتظار...',
    cancel: 'إلغاء',
    confirm: 'تأكيد',
    uploadAgain: 'إعادة الرفع',

    file: 'ملف',
    upload: 'فتح (ملف)',
    download: 'حفظ باسم'
  }
}

export default locale
