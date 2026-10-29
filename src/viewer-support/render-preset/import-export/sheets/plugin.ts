import type { MenuConfig } from '@univerjs/ui'
import { UniverSheetsExchangeClientPlugin } from '@univerjs-pro/sheets-exchange-client'
import {
  DependentOn,
  IConfigService,
  Injector,
  LocaleService,
  LocaleType,
  Plugin,
  registerDependencies,
  setDependencies,
  UniverInstanceType
} from '@univerjs/core'
import { ComponentsController } from './controllers/components.controller.js'
import { ExchangeClientController } from './controllers/exchange.controller.js'
import { SheetsExchangeClientController } from './controllers/sheets-exchange.controller.js'
import arSA from './locale/ar-SA.js'
import caES from './locale/ca-ES.js'
import deDE from './locale/de-DE.js'
import enUS from './locale/en-US.js'
import esES from './locale/es-ES.js'
import faIR from './locale/fa-IR.js'
import frFR from './locale/fr-FR.js'
import idID from './locale/id-ID.js'
import itIT from './locale/it-IT.js'
import jaJP from './locale/ja-JP.js'
import koKR from './locale/ko-KR.js'
import plPL from './locale/pl-PL.js'
import ptBR from './locale/pt-BR.js'
import ruRU from './locale/ru-RU.js'
import skSK from './locale/sk-SK.js'
import viVN from './locale/vi-VN.js'
import zhCN from './locale/zh-CN.js'
import zhHK from './locale/zh-HK.js'
import zhTW from './locale/zh-TW.js'
import { ExchangeOperateService, IExchangeOperateService } from './services/operate.service.js'
import {
  IUploadNotificationService,
  UploadNotificationService
} from './services/upload-notification.service.js'

export interface ICustomImportExportConfig {
  menu?: MenuConfig
}
export class CustomImportExportPlugin extends Plugin {
  static override pluginName = 'CUSTOM_IMPORT_EXPORT_PLUGIN'
  static override type = UniverInstanceType.UNIVER_SHEET

  constructor(
    _config: ICustomImportExportConfig = {},
    protected override readonly _injector: Injector,
    private readonly _localeService: LocaleService,
    private readonly _configService: IConfigService
  ) {
    super()
    this._localeService.load({
      [LocaleType.AR_SA]: arSA,
      [LocaleType.CA_ES]: caES,
      [LocaleType.DE_DE]: deDE,
      [LocaleType.EN_US]: enUS,
      [LocaleType.ES_ES]: esES,
      [LocaleType.FA_IR]: faIR,
      [LocaleType.FR_FR]: frFR,
      [LocaleType.ID_ID]: idID,
      [LocaleType.IT_IT]: itIT,
      [LocaleType.JA_JP]: jaJP,
      [LocaleType.KO_KR]: koKR,
      [LocaleType.PL_PL]: plPL,
      [LocaleType.PT_BR]: ptBR,
      [LocaleType.RU_RU]: ruRU,
      [LocaleType.SK_SK]: skSK,
      [LocaleType.VI_VN]: viVN,
      [LocaleType.ZH_CN]: zhCN,
      [LocaleType.ZH_HK]: zhHK,
      [LocaleType.ZH_TW]: zhTW
    })
    if (_config.menu) {
      this._configService.setConfig('menu', _config.menu, { merge: true })
    }
  }

  override onStarting(): void {
    registerDependencies(this._injector, [
      [IExchangeOperateService, { useClass: ExchangeOperateService }],
      [IUploadNotificationService, { useClass: UploadNotificationService }],
      [ComponentsController],
      [ExchangeClientController],
      [SheetsExchangeClientController]
    ])
  }

  override onReady(): void {
    this.disposeWithMe(this._injector.get(IUploadNotificationService))
    this.disposeWithMe(this._injector.get(IExchangeOperateService))
    this.disposeWithMe(this._injector.get(ComponentsController))
    this.disposeWithMe(this._injector.get(ExchangeClientController))
    this.disposeWithMe(this._injector.get(SheetsExchangeClientController))
  }
}

DependentOn(UniverSheetsExchangeClientPlugin)(CustomImportExportPlugin)
setDependencies(CustomImportExportPlugin, [Injector, LocaleService, IConfigService], 1)
