import type Database from "libsql";
import { UniverType } from "@univerjs/protocol";
import { runUniverfileSQLiteTransaction } from "../connection.js";

const APPLY_BASE_JSON1_MUTATION_ID = "base.mutation.apply-base-json1";
const SET_SUPER_TABLE_MUTATION_ID = "formula.mutation.set-super-table";
const BASE_RECORD_ID_FIELD_ID = "__record_id";
const BINARY_TAG = "__univerCollaborationBinary";
const LEGACY_BASE_SCHEMA_VERSION = 1;
const CURRENT_BASE_SCHEMA_VERSION = 2;

type JsonRecord = Record<string, unknown>;
type JsonPath = Array<string | number>;

interface PayloadRow {
  readonly payload_json: string;
}

interface TrunkSnapshotRow extends PayloadRow {
  readonly unit_id: string;
  readonly revision: number;
}

interface TrunkChangesetRow extends PayloadRow {
  readonly unit_id: string;
  readonly revision: number;
}

interface TrunkBlockRow extends PayloadRow {
  readonly unit_id: string;
  readonly block_id: string;
}

interface WorktreePayloadRow extends PayloadRow {
  readonly worktree_id: string;
  readonly unit_id: string;
}

interface WorktreeChangesetRow extends WorktreePayloadRow {
  readonly revision: number;
  readonly source: string;
}

interface WorktreeSnapshotRow {
  readonly worktree_id: string;
  readonly unit_id: string;
  readonly source: string;
  readonly snapshot_json: string;
  readonly sheet_blocks_json: string | null;
}

interface BaseBlockPlan {
  readonly rowId: Readonly<Record<string, string>>;
}

interface SnapshotMigration {
  readonly snapshot: JsonRecord;
  readonly sourceSchemaVersion: number;
  readonly blockPlans: ReadonlyMap<string, BaseBlockPlan>;
}

/**
 * Upgrades only legacy Base content while a storage-v0/v1 file is still a candidate.
 * The storage-v2 schema itself deliberately remains unchanged.
 */
export function migrateLegacyBaseContentToV2(database: Database.Database): void {
  runUniverfileSQLiteTransaction(database, () => {
    const trunkLegacyUnits = migrateTrunkSnapshots(database);
    migrateTrunkChangesets(database, trunkLegacyUnits);
    migrateWorktreeContent(database, trunkLegacyUnits);
  });
}

function migrateTrunkSnapshots(database: Database.Database): ReadonlySet<string> {
  const rows = database
    .prepare(
      `SELECT snapshots.unit_id, snapshots.revision, snapshots.payload_json
       FROM collaboration_snapshots AS snapshots
       JOIN collaboration_units AS units ON units.unit_id = snapshots.unit_id
       WHERE units.type = ?
       ORDER BY snapshots.unit_id, snapshots.revision`,
    )
    .all(UniverType.UNIVER_BASE) as unknown as TrunkSnapshotRow[];
  const updateSnapshot = database.prepare(
    `UPDATE collaboration_snapshots
     SET payload_json = ?
     WHERE unit_id = ? AND revision = ?`,
  );
  const schemasByUnit = new Map<string, Set<number>>();
  const blockPlansByUnit = new Map<string, Map<string, BaseBlockPlan>>();

  for (const row of rows) {
    const migration = migrateBaseSnapshot(decode<JsonRecord>(row.payload_json));
    addSchemaVersion(schemasByUnit, row.unit_id, migration.sourceSchemaVersion);
    if (migration.sourceSchemaVersion !== LEGACY_BASE_SCHEMA_VERSION) continue;
    updateSnapshot.run(encode(migration.snapshot), row.unit_id, row.revision);
    const plans = blockPlansByUnit.get(row.unit_id) ?? new Map<string, BaseBlockPlan>();
    for (const [blockId, plan] of migration.blockPlans) {
      const existing = plans.get(blockId);
      if (existing && JSON.stringify(existing.rowId) !== JSON.stringify(plan.rowId)) {
        throw new Error(`Base block ${blockId} has conflicting table layouts across snapshots`);
      }
      plans.set(blockId, plan);
    }
    blockPlansByUnit.set(row.unit_id, plans);
  }

  assertNoMixedBaseSchemas(schemasByUnit, "trunk Unit");
  migrateTrunkBlocks(database, blockPlansByUnit);
  return new Set(
    [...schemasByUnit].flatMap(([unitId, versions]) =>
      versions.has(LEGACY_BASE_SCHEMA_VERSION) ? [unitId] : [],
    ),
  );
}

function migrateTrunkBlocks(
  database: Database.Database,
  blockPlansByUnit: ReadonlyMap<string, ReadonlyMap<string, BaseBlockPlan>>,
): void {
  const rows = database
    .prepare(
      `SELECT blocks.unit_id, blocks.block_id, blocks.payload_json
       FROM collaboration_sheet_blocks AS blocks
       JOIN collaboration_units AS units ON units.unit_id = blocks.unit_id
       WHERE units.type = ?`,
    )
    .all(UniverType.UNIVER_BASE) as unknown as TrunkBlockRow[];
  const update = database.prepare(
    `UPDATE collaboration_sheet_blocks
     SET payload_json = ?
     WHERE unit_id = ? AND block_id = ?`,
  );
  for (const row of rows) {
    const plan = blockPlansByUnit.get(row.unit_id)?.get(row.block_id);
    if (!plan) continue;
    update.run(
      encode(migrateBaseSheetBlock(decode<JsonRecord>(row.payload_json), plan)),
      row.unit_id,
      row.block_id,
    );
  }
}

function migrateTrunkChangesets(
  database: Database.Database,
  legacyUnitIds: ReadonlySet<string>,
): void {
  if (legacyUnitIds.size === 0) return;
  const rows = database
    .prepare(
      `SELECT changesets.unit_id, changesets.revision, changesets.payload_json
       FROM collaboration_changesets AS changesets
       JOIN collaboration_units AS units ON units.unit_id = changesets.unit_id
       WHERE units.type = ?
       ORDER BY changesets.unit_id, changesets.revision`,
    )
    .all(UniverType.UNIVER_BASE) as unknown as TrunkChangesetRow[];
  const update = database.prepare(
    `UPDATE collaboration_changesets
     SET payload_json = ?
     WHERE unit_id = ? AND revision = ?`,
  );
  for (const row of rows) {
    if (!legacyUnitIds.has(row.unit_id)) continue;
    update.run(
      encode(migrateBaseChangeset(decode<JsonRecord>(row.payload_json))),
      row.unit_id,
      row.revision,
    );
  }
}

function migrateWorktreeContent(
  database: Database.Database,
  trunkLegacyUnitIds: ReadonlySet<string>,
): void {
  const legacyWorktreeUnits = new Set<string>();
  migrateWorktreeSnapshots(database, "collaboration_worktree_unit_seeds", legacyWorktreeUnits);
  migrateWorktreeSnapshots(
    database,
    "collaboration_worktree_unit_merge_artifacts",
    legacyWorktreeUnits,
  );

  const rows = database
    .prepare(
      `SELECT changesets.worktree_id, changesets.unit_id, changesets.revision,
              changesets.payload_json, units.source
       FROM collaboration_worktree_changesets AS changesets
       JOIN collaboration_worktree_units AS units
         ON units.worktree_id = changesets.worktree_id
        AND units.unit_id = changesets.unit_id
       WHERE units.type = ?
       ORDER BY changesets.worktree_id, changesets.unit_id, changesets.revision`,
    )
    .all(UniverType.UNIVER_BASE) as unknown as WorktreeChangesetRow[];
  const update = database.prepare(
    `UPDATE collaboration_worktree_changesets
     SET payload_json = ?
     WHERE worktree_id = ? AND unit_id = ? AND revision = ?`,
  );
  for (const row of rows) {
    const inheritsLegacyTrunk = row.source === "trunk" && trunkLegacyUnitIds.has(row.unit_id);
    if (!inheritsLegacyTrunk && !legacyWorktreeUnits.has(worktreeUnitKey(row))) continue;
    update.run(
      encode(migrateBaseChangeset(decode<JsonRecord>(row.payload_json))),
      row.worktree_id,
      row.unit_id,
      row.revision,
    );
  }
}

function migrateWorktreeSnapshots(
  database: Database.Database,
  tableName: "collaboration_worktree_unit_seeds" | "collaboration_worktree_unit_merge_artifacts",
  legacyWorktreeUnits: Set<string>,
): void {
  const rows = database
    .prepare(
      `SELECT snapshots.worktree_id, snapshots.unit_id, snapshots.snapshot_json,
              snapshots.sheet_blocks_json, units.source
       FROM ${tableName} AS snapshots
       JOIN collaboration_worktree_units AS units
         ON units.worktree_id = snapshots.worktree_id
        AND units.unit_id = snapshots.unit_id
       WHERE units.type = ?`,
    )
    .all(UniverType.UNIVER_BASE) as unknown as WorktreeSnapshotRow[];
  const update = database.prepare(
    `UPDATE ${tableName}
     SET snapshot_json = ?, sheet_blocks_json = ?
     WHERE worktree_id = ? AND unit_id = ?`,
  );
  for (const row of rows) {
    const migration = migrateBaseSnapshot(decode<JsonRecord>(row.snapshot_json));
    if (migration.sourceSchemaVersion !== LEGACY_BASE_SCHEMA_VERSION) continue;
    const blocks = row.sheet_blocks_json
      ? decode<JsonRecord[]>(row.sheet_blocks_json).map((block) => {
          const blockId = readRequiredString(block.id, "Base Worktree block id");
          const plan = migration.blockPlans.get(blockId);
          return plan ? migrateBaseSheetBlock(block, plan) : block;
        })
      : null;
    update.run(
      encode(migration.snapshot),
      blocks === null ? null : encode(blocks),
      row.worktree_id,
      row.unit_id,
    );
    legacyWorktreeUnits.add(worktreeUnitKey(row));
  }
}

function migrateBaseSnapshot(snapshot: JsonRecord): SnapshotMigration {
  const workbook = asRecord(snapshot.workbook, "Base snapshot workbook");
  const baseMeta = decodeJsonBytes(workbook.originalMeta, "Base workbook originalMeta");
  const sourceSchemaVersion = readSchemaVersion(baseMeta.schemaVersion);
  if (sourceSchemaVersion === CURRENT_BASE_SCHEMA_VERSION) {
    return { snapshot, sourceSchemaVersion, blockPlans: new Map() };
  }
  if (sourceSchemaVersion !== LEGACY_BASE_SCHEMA_VERSION) {
    throw new Error(`unsupported Base schema version ${sourceSchemaVersion}`);
  }

  const sheets = asRecord(workbook.sheets, "Base snapshot workbook.sheets");
  const blockMeta = asOptionalRecord(workbook.blockMeta);
  const blockPlans = new Map<string, BaseBlockPlan>();
  const migratedSheets = Object.fromEntries(
    Object.entries(sheets).map(([tableId, value]) => {
      const sheet = asRecord(value, `Base sheet ${tableId}`);
      const table = decodeJsonBytes(sheet.originalMeta, `Base table ${tableId} originalMeta`);
      const migratedTable = migrateLegacyBaseTable(table);
      const meta = asOptionalRecord(blockMeta?.[tableId]);
      const blockIds = Array.isArray(meta?.blocks) ? meta.blocks : [];
      for (const blockId of blockIds) {
        if (typeof blockId !== "string" || blockId.length === 0) {
          throw new Error(`Base table ${tableId} contains an invalid block id`);
        }
        blockPlans.set(blockId, { rowId: readStringMap(migratedTable.rowId) });
      }
      const columnCount = readNonNegativeInteger(sheet.columnCount, 0);
      return [
        tableId,
        {
          ...sheet,
          columnCount: columnCount + 1,
          originalMeta: encodeJsonBytes(migratedTable),
        },
      ];
    }),
  );

  return {
    sourceSchemaVersion,
    blockPlans,
    snapshot: {
      ...snapshot,
      workbook: {
        ...workbook,
        sheets: migratedSheets,
        originalMeta: encodeJsonBytes({
          ...baseMeta,
          schemaVersion: CURRENT_BASE_SCHEMA_VERSION,
        }),
      },
    },
  };
}

function migrateLegacyBaseTable(table: JsonRecord): JsonRecord {
  const fields = asRecord(table.fields, `Base table ${String(table.id)} fields`);
  if (isCurrentRecordIdField(fields[BASE_RECORD_ID_FIELD_ID])) return table;
  const fieldOrder = readStringArray(table.fieldOrder, "Base table fieldOrder");
  const records = asRecord(table.records, "Base table records");
  const rowId = readStringMap(table.rowId);
  const migratedRecords = Object.fromEntries(
    Object.entries(records).map(([recordId, value]) => {
      const record = asRecord(value, `Base record ${recordId}`);
      const stableRecordId = readRequiredString(record.id, `Base record ${recordId} id`);
      return [
        recordId,
        {
          ...record,
          values: {
            ...asOptionalRecord(record.values),
            [BASE_RECORD_ID_FIELD_ID]: stableRecordId,
          },
        },
      ];
    }),
  );
  const migratedFieldOrder = [
    BASE_RECORD_ID_FIELD_ID,
    ...fieldOrder.filter((fieldId) => fieldId !== BASE_RECORD_ID_FIELD_ID),
  ];
  const views = asRecord(table.views, "Base table views");
  const migratedViews = Object.fromEntries(
    Object.entries(views).map(([viewId, value]) => [
      viewId,
      migrateLegacyBaseView(asRecord(value, `Base view ${viewId}`)),
    ]),
  );
  return {
    ...table,
    fieldOrder: migratedFieldOrder,
    fields: {
      ...fields,
      [BASE_RECORD_ID_FIELD_ID]: createRecordIdField(),
    },
    records: migratedRecords,
    colIndex: Object.fromEntries(migratedFieldOrder.map((fieldId, index) => [fieldId, index])),
    colId: Object.fromEntries(migratedFieldOrder.map((fieldId, index) => [String(index), fieldId])),
    cellData: migrateCellMatrix(asOptionalRecord(table.cellData) ?? {}, rowId, 0),
    views: migratedViews,
  };
}

function migrateLegacyBaseView(view: JsonRecord): JsonRecord {
  const fieldOrder = readStringArray(view.fieldOrder, "Base view fieldOrder");
  return {
    ...view,
    fieldOrder: [
      BASE_RECORD_ID_FIELD_ID,
      ...fieldOrder.filter((fieldId) => fieldId !== BASE_RECORD_ID_FIELD_ID),
    ],
    fieldSettings: {
      ...asOptionalRecord(view.fieldSettings),
      [BASE_RECORD_ID_FIELD_ID]: { hidden: true },
    },
  };
}

function migrateBaseChangeset(changeset: JsonRecord): JsonRecord {
  const mutations = changeset.mutations;
  if (!Array.isArray(mutations)) return changeset;
  return {
    ...changeset,
    mutations: mutations.map((value) => {
      const mutation = asRecord(value, "Base changeset mutation");
      if (mutation.id === APPLY_BASE_JSON1_MUTATION_ID) {
        const params = parseMutationData(mutation.data, APPLY_BASE_JSON1_MUTATION_ID);
        return {
          ...mutation,
          data: JSON.stringify({ ...params, op: migrateLegacyBaseJson1Op(params.op) }),
        };
      }
      if (mutation.id === SET_SUPER_TABLE_MUTATION_ID) {
        const params = parseMutationData(mutation.data, SET_SUPER_TABLE_MUTATION_ID);
        const reference = asOptionalRecord(params.reference);
        const range = asOptionalRecord(reference?.range);
        if (range && Number.isSafeInteger(range.endColumn)) {
          return {
            ...mutation,
            data: JSON.stringify({
              ...params,
              reference: {
                ...reference,
                range: { ...range, endColumn: (range.endColumn as number) + 1 },
              },
            }),
          };
        }
      }
      return mutation;
    }),
  };
}

function migrateLegacyBaseJson1Op(value: unknown): unknown {
  if (!Array.isArray(value)) throw new Error("legacy Base JSON1 mutation has an invalid op");
  return migrateJson1Node(value, []);
}

function migrateJson1Node(node: readonly unknown[], parentPath: JsonPath): unknown[] {
  const path = [...parentPath];
  return node.map((part) => {
    if (typeof part === "string" || typeof part === "number") {
      const migrated = migrateJson1PathPart(path, part);
      path.push(part);
      return migrated;
    }
    if (Array.isArray(part)) return migrateJson1Node(part, path);
    if (part !== null && typeof part === "object") {
      return migrateJson1Component(part as JsonRecord, path);
    }
    return part;
  });
}

function migrateJson1PathPart(path: JsonPath, part: string | number): string | number {
  if (!isNonNegativeIndex(part)) return part;
  const shiftsFieldOrder =
    (path.length === 3 && path[0] === "tables" && path[2] === "fieldOrder") ||
    (path.length === 5 && path[0] === "tables" && path[2] === "views" && path[4] === "fieldOrder");
  const shiftsCellColumn = path.length === 4 && path[0] === "tables" && path[2] === "cellData";
  const shiftsColumnId = path.length === 3 && path[0] === "tables" && path[2] === "colId";
  if (!shiftsFieldOrder && !shiftsCellColumn && !shiftsColumnId) return part;
  return typeof part === "number" ? part + 1 : String(Number(part) + 1);
}

function migrateJson1Component(component: JsonRecord, path: JsonPath): JsonRecord {
  const migrated = { ...component };
  for (const key of ["i", "r"] as const) {
    if (!Object.prototype.hasOwnProperty.call(component, key)) continue;
    migrated[key] = migrateJson1Value(path, component[key]);
  }
  return migrated;
}

function migrateJson1Value(path: JsonPath, value: unknown): unknown {
  if (path.length === 2 && path[0] === "tables") {
    return migrateLegacyBaseTable(asRecord(value, "Base JSON1 table"));
  }
  if (path.length === 4 && path[0] === "tables" && path[2] === "records") {
    const record = asRecord(value, "Base JSON1 record");
    const recordId = readRequiredString(record.id, "Base JSON1 record id");
    return {
      ...record,
      values: {
        ...asOptionalRecord(record.values),
        [BASE_RECORD_ID_FIELD_ID]: recordId,
      },
    };
  }
  if (path.length === 3 && path[0] === "tables" && path[2] === "records") {
    const records = asRecord(value, "Base JSON1 records");
    return Object.fromEntries(
      Object.entries(records).map(([recordId, record]) => [
        recordId,
        migrateJson1Value(["tables", path[1]!, "records", recordId], record),
      ]),
    );
  }
  if (path.length === 5 && path[0] === "tables" && path[2] === "records" && path[4] === "values") {
    const values = asRecord(value, "Base JSON1 record values");
    return { ...values, [BASE_RECORD_ID_FIELD_ID]: path[3] };
  }
  if (isFieldOrderPath(path)) {
    return [
      BASE_RECORD_ID_FIELD_ID,
      ...readStringArray(value, "Base JSON1 fieldOrder").filter(
        (fieldId) => fieldId !== BASE_RECORD_ID_FIELD_ID,
      ),
    ];
  }
  if (path.length === 4 && path[0] === "tables" && path[2] === "views") {
    return migrateLegacyBaseView(asRecord(value, "Base JSON1 view"));
  }
  if (path.length === 3 && path[0] === "tables" && path[2] === "views") {
    const views = asRecord(value, "Base JSON1 views");
    return Object.fromEntries(
      Object.entries(views).map(([viewId, view]) => [
        viewId,
        migrateLegacyBaseView(asRecord(view, `Base JSON1 view ${viewId}`)),
      ]),
    );
  }
  if (path.length === 3 && path[0] === "tables" && path[2] === "fields") {
    return {
      ...asRecord(value, "Base JSON1 fields"),
      [BASE_RECORD_ID_FIELD_ID]: createRecordIdField(),
    };
  }
  if (
    path.length === 5 &&
    path[0] === "tables" &&
    path[2] === "views" &&
    path[4] === "fieldSettings"
  ) {
    return {
      ...asRecord(value, "Base JSON1 view fieldSettings"),
      [BASE_RECORD_ID_FIELD_ID]: { hidden: true },
    };
  }
  if (path.length === 3 && path[0] === "tables" && path[2] === "cellData") {
    return migrateCellMatrix(asRecord(value, "Base JSON1 cellData"), {}, 0);
  }
  if (path.length === 4 && path[0] === "tables" && path[2] === "cellData") {
    return shiftCellRow(asRecord(value, "Base JSON1 cellData row"));
  }
  if (path.length === 3 && path[0] === "tables" && path[2] === "colIndex") {
    const colIndex = asRecord(value, "Base JSON1 colIndex");
    return {
      [BASE_RECORD_ID_FIELD_ID]: 0,
      ...Object.fromEntries(
        Object.entries(colIndex).map(([fieldId, index]) => [
          fieldId,
          typeof index === "number" ? index + 1 : index,
        ]),
      ),
    };
  }
  if (
    path.length === 4 &&
    path[0] === "tables" &&
    path[2] === "colIndex" &&
    typeof value === "number"
  ) {
    return value + 1;
  }
  if (path.length === 3 && path[0] === "tables" && path[2] === "colId") {
    return {
      "0": BASE_RECORD_ID_FIELD_ID,
      ...Object.fromEntries(
        Object.entries(asRecord(value, "Base JSON1 colId")).map(([index, fieldId]) => [
          String(Number(index) + 1),
          fieldId,
        ]),
      ),
    };
  }
  return value;
}

function migrateBaseSheetBlock(block: JsonRecord, plan: BaseBlockPlan): JsonRecord {
  if (!(block.data instanceof Uint8Array)) {
    throw new Error(`Base block ${String(block.id)} has invalid binary data`);
  }
  const startRow = readNonNegativeInteger(block.startRow, 0);
  const decoded = JSON.parse(new TextDecoder().decode(block.data)) as unknown;
  const matrix = asRecord(decoded, `Base block ${String(block.id)} data`);
  return {
    ...block,
    data: new TextEncoder().encode(JSON.stringify(migrateCellMatrix(matrix, plan.rowId, startRow))),
  };
}

function migrateCellMatrix(
  matrix: JsonRecord,
  rowId: Readonly<Record<string, string>>,
  startRow: number,
): JsonRecord {
  const numericRows = Object.keys(matrix)
    .filter((key) => /^\d+$/.test(key))
    .map(Number);
  const rowsAreRelative = startRow > 0 && numericRows.some((row) => row < startRow);
  return Object.fromEntries(
    Object.entries(matrix).map(([rowIndex, value]) => {
      const absoluteRow = rowsAreRelative ? startRow + Number(rowIndex) : Number(rowIndex);
      const recordId = rowId[String(absoluteRow)];
      const shifted = shiftCellRow(asRecord(value, `Base cell row ${rowIndex}`));
      return [rowIndex, recordId ? { "0": { v: recordId, t: 1 }, ...shifted } : shifted];
    }),
  );
}

function shiftCellRow(row: JsonRecord): JsonRecord {
  return Object.fromEntries(
    Object.entries(row).map(([columnIndex, cell]) => {
      if (!/^\d+$/.test(columnIndex)) {
        throw new Error(`Base cell data contains invalid column ${columnIndex}`);
      }
      return [String(Number(columnIndex) + 1), cell];
    }),
  );
}

function createRecordIdField(): JsonRecord {
  return {
    id: BASE_RECORD_ID_FIELD_ID,
    name: "record-id",
    type: "recordId",
    config: {},
    system: true,
    readonly: true,
  };
}

function isCurrentRecordIdField(value: unknown): boolean {
  const field = asOptionalRecord(value);
  return (
    field?.id === BASE_RECORD_ID_FIELD_ID &&
    field.name === "record-id" &&
    field.type === "recordId" &&
    field.system === true &&
    field.readonly === true
  );
}

function isFieldOrderPath(path: JsonPath): boolean {
  return (
    (path.length === 3 && path[0] === "tables" && path[2] === "fieldOrder") ||
    (path.length === 5 && path[0] === "tables" && path[2] === "views" && path[4] === "fieldOrder")
  );
}

function isNonNegativeIndex(value: string | number): boolean {
  return typeof value === "number"
    ? Number.isSafeInteger(value) && value >= 0
    : /^\d+$/.test(value);
}

function parseMutationData(value: unknown, mutationId: string): JsonRecord {
  if (typeof value !== "string") throw new Error(`${mutationId} has non-string data`);
  return asRecord(JSON.parse(value) as unknown, `${mutationId} data`);
}

function readSchemaVersion(value: unknown): number {
  if (!Number.isSafeInteger(value)) throw new Error("Base snapshot has no valid schemaVersion");
  return value as number;
}

function readNonNegativeInteger(value: unknown, fallback: number): number {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : fallback;
}

function readRequiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function readStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${label} must be a string array`);
  }
  return value as string[];
}

function readStringMap(value: unknown): Readonly<Record<string, string>> {
  const record = asRecord(value, "Base rowId");
  if (Object.values(record).some((item) => typeof item !== "string")) {
    throw new Error("Base rowId must map rows to string record ids");
  }
  return record as Readonly<Record<string, string>>;
}

function asRecord(value: unknown, label: string): JsonRecord {
  const record = asOptionalRecord(value);
  if (!record) throw new Error(`${label} must be an object`);
  return record;
}

function asOptionalRecord(value: unknown): JsonRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;
}

function decodeJsonBytes(value: unknown, label: string): JsonRecord {
  const text =
    value instanceof Uint8Array
      ? new TextDecoder().decode(value)
      : typeof value === "string"
        ? value
        : undefined;
  if (text === undefined) throw new Error(`${label} must contain UTF-8 JSON`);
  return asRecord(JSON.parse(text) as unknown, label);
}

function encodeJsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

function addSchemaVersion(
  schemasByUnit: Map<string, Set<number>>,
  unitId: string,
  schemaVersion: number,
): void {
  const versions = schemasByUnit.get(unitId) ?? new Set<number>();
  versions.add(schemaVersion);
  schemasByUnit.set(unitId, versions);
}

function assertNoMixedBaseSchemas(
  schemasByUnit: ReadonlyMap<string, ReadonlySet<number>>,
  label: string,
): void {
  for (const [unitId, versions] of schemasByUnit) {
    if (versions.size > 1) {
      throw new Error(`${label} ${unitId} mixes Base schema versions`);
    }
  }
}

function worktreeUnitKey(value: {
  readonly worktree_id: string;
  readonly unit_id: string;
}): string {
  return `${value.worktree_id}\u0000${value.unit_id}`;
}

function encode(value: unknown): string {
  return JSON.stringify(value, (_key, current: unknown) => {
    if (current instanceof Uint8Array) {
      return { [BINARY_TAG]: Buffer.from(current).toString("base64") };
    }
    return current;
  });
}

function decode<T>(payload: string): T {
  return JSON.parse(payload, (_key, current: unknown) => {
    if (isBinaryEncoding(current)) {
      return Uint8Array.from(Buffer.from(current[BINARY_TAG], "base64"));
    }
    return current;
  }) as T;
}

function isBinaryEncoding(value: unknown): value is Record<typeof BINARY_TAG, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.keys(value).length === 1 &&
    typeof (value as Record<string, unknown>)[BINARY_TAG] === "string"
  );
}
