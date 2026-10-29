import type { IDisposable, UniverInstanceType } from '@univerjs/core'
import type { Observable } from 'rxjs'
import { createIdentifier, Disposable } from '@univerjs/core'
import { Subject } from 'rxjs'

export enum UploadNotificationState {
  UPLOADING,
  SUCCESS,
  ERROR
}

export interface ILinkList {
  link: string
  name: string
  type: UniverInstanceType
}

export interface IUploadNotificationService extends IDisposable {
  visible$: Observable<boolean>

  state$: Observable<UploadNotificationState>

  list$: Observable<ILinkList[]>

  /**
   * Show upload notification
   */
  show(): void

  /**
   * Hide upload notification
   */
  hide(): void

  /**
   * Update upload notification state
   * @param state
   */
  updateState(state: UploadNotificationState): void

  /**
   * Push link to upload notification
   * @param link
   */
  pushLink(link: ILinkList): void
}

export const IUploadNotificationService = createIdentifier<IUploadNotificationService>(
  'univer-pro.exchange-client.upload-notification.service'
)

export class UploadNotificationService extends Disposable implements IUploadNotificationService {
  private readonly _visible$ = new Subject<boolean>()
  private readonly _state$ = new Subject<UploadNotificationState>()
  private readonly _list$ = new Subject<ILinkList[]>()

  readonly visible$ = this._visible$.asObservable()
  readonly state$ = this._state$.asObservable()
  readonly list$ = this._list$.asObservable()

  private _list: ILinkList[] = []

  constructor() {
    super()
  }

  override dispose(): void {
    super.dispose()
    this._visible$.complete()
    this._state$.complete()
    this._list$.complete()
    this._list = []
  }

  show() {
    this._visible$.next(true)
  }

  hide() {
    this._visible$.next(false)
  }

  updateState(state: UploadNotificationState) {
    this._state$.next(state)
  }

  pushLink(link: ILinkList) {
    this._list.unshift(link)
    this._list$.next(this._list)
  }
}
