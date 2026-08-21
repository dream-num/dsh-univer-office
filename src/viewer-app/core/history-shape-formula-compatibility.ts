import {
  FormulaCacheEligibilityService,
  FormulaLastValuePersistenceService,
  HostExternalReferenceModel,
  UniverProFormulaEnginePlugin,
} from "@univerjs-pro/engine-formula";
import { UniverShapePlugin } from "@univerjs-pro/engine-shape";
import { UniverLicensePlugin } from "@univerjs-pro/license";
import { UniverShapeEditorPlugin } from "@univerjs-pro/shape-editor";
import {
  DependentOn,
  Injector,
  Plugin,
  UniverInstanceType,
  setDependencies,
} from "@univerjs/core";

/**
 * The published history loader registers the core formula plugin before its Shape plugins. Because
 * the Pro formula plugin shares that plugin name, ShapeEditor's dependency is then considered
 * satisfied without registering HostExternalReferenceModel in the nested history Univer.
 */
class HistoryShapeFormulaModelPlugin extends Plugin {
  static override type = UniverInstanceType.UNIVER_UNKNOWN;
  static override pluginName = "DSH_HISTORY_SHAPE_FORMULA_MODEL_PLUGIN";
  static override packageName = "dsh-univer-office";

  constructor(protected override _injector: Injector) {
    super();
  }

  override onStarting(): void {
    if (!this._injector.has(HostExternalReferenceModel)) {
      this._injector.add([HostExternalReferenceModel]);
    }
    if (!this._injector.has(FormulaCacheEligibilityService)) {
      this._injector.add([FormulaCacheEligibilityService]);
    }
    if (!this._injector.has(FormulaLastValuePersistenceService)) {
      this._injector.add([FormulaLastValuePersistenceService]);
    }
  }
}

setDependencies(HistoryShapeFormulaModelPlugin, [Injector]);

let installed = false;

export function installHistoryShapeFormulaCompatibility(): void {
  if (installed) {
    return;
  }
  installed = true;
  DependentOn(
    UniverLicensePlugin,
    UniverProFormulaEnginePlugin,
    UniverShapePlugin,
    HistoryShapeFormulaModelPlugin,
  )(UniverShapeEditorPlugin);
}
