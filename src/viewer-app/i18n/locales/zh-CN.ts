import type { Messages } from "./en-US";

/**
 * Chinese shell copy. This table defines the `Messages` shape; en-US must mirror it exactly.
 * Entries that need interpolation or language-specific word order are functions.
 */
export const ZH_CN_MESSAGES: Messages = {
  app: {
    title: "协同查看器"
  },
  boot: {
    noFileTitle: "未指定要查看的文件",
    noFileBody: "在地址栏加上 <code>?file=&lt;.univer 的绝对路径&gt;</code>,例如:",
    noFileHint: "查看某个修改:再加 <code>&amp;worktree=&lt;worktreeId&gt;</code>。",
    notFoundTitle: "univerfile 不存在",
    notFoundBody: "这个 <code>.univer</code> 文件不存在,服务不会自动创建。",
    notFoundHint: (command: string): string => `先建 univerfile:<code>${command}</code>`,
    fatal: (error: string): string => `启动失败:${error}`
  },
  viewer: {
    loading: "正在加载…",
    loadFailed: (error: string): string => `加载失败:${error}`,
    previewComputeFailed: "预览计算失败",
    previewUnitUnrenderable: "此文件在合并预览中不可渲染",
    previewLoadFailed: (error: string): string => `预览加载失败:${error}`,
    worktreeReadOnly: "这是 AI 修改的只读预览。如需调整，请让 AI 助手继续修改。",
    mergePreviewReadOnly:
      "这是只读的合并预览，无法直接编辑。如需调整，可让 AI 继续修改；也可以先合并，再自行编辑。",
    currentVersionReadOnly: "当前版本暂时只读。点击上方「仍要编辑」后可以继续修改。"
  },
  toast: {
    worktreeGone: "该修改已不存在,已切回当前版本",
    agentReset: "AI 撤回了上一步,正在刷新…",
    workDone: (name: string): string => `「${name}」改完了,待你确认`,
    readyChanged: "这处修改在确认期间又有更新。请查看最新改动后重新提交确认。",
    mergedElsewhere: "这处修改已合入当前版本",
    discardedElsewhere: "这处修改已丢弃",
    previewRefreshed: "最新版本有更新,已刷新合并预览",
    readyFailed: (error: string): string => `提交确认失败:${error}`,
    merged: "已合入当前版本",
    mergeFailed: (error: string): string => `合入失败:${error}`,
    discardFailed: (error: string): string => `丢弃失败:${error}`,
    conflictsCannotMerge: "存在冲突,无法合入"
  },
  sidebar: {
    files: "文件",
    inProgress: "正在进行的修改",
    awaitingConfirm: "等待确认的修改",
    none: "暂无",
    noFiles: "暂无文件",
    collapse: "收起侧边栏",
    expand: "展开侧边栏",
    tailReady: "待确认",
    tailDraft: "进行中",
    worktreeRowSub: (when: string, tail: string): string =>
      `AI 助手${when ? ` · ${when}` : ""} · ${tail}`
  },
  status: {
    draft: "修改中",
    ready: "待确认",
    merged: "已合入",
    discarded: "已丢弃"
  },
  change: {
    modified: "改",
    added: "新",
    deleted: "删",
    conflict: "冲突",
    updated: "已更新"
  },
  topbar: {
    currentVersion: "当前版本",
    fallbackWorktreeName: "一处修改",
    submitForReview: "提交确认",
    mergeToCurrent: "合入当前版本",
    discard: "丢弃",
    previewUnavailable: "合并预览不可用 · 正在看原始修改",
    conflictCount: (n: number): string => `${n} 处冲突,无法自动合并`,
    divergedShowingPreview: "最新版本有改动 · 已显示合并后效果",
    divergedShowingOriginal: "最新版本有改动 · 正在看原始修改",
    segPreview: "合并预览",
    segOriginal: "原始修改",
    readOnlyPreview: "只读预览",
    viewOnly: "仅查看",
    editable: "可编辑",
    editingPending: (n: number): string => `编辑中 · ${n} 处未合入`,
    lockedPending: (n: number): string => `已锁定 · ${n} 处未合入`,
    stopEditing: "停止编辑",
    editAnyway: "仍要编辑"
  },
  settings: {
    title: "设置",
    appearance: "外观",
    light: "浅色",
    dark: "深色",
    language: "语言",
    loadingLanguage: "正在加载语言…",
    languageLoadFailed: "无法加载该语言"
  },
  modal: {
    cancel: "取消",
    gotIt: "知道了",
    conflictTitle: "无法自动合入",
    conflictBody: (unitHtml: string): string =>
      `文件「<strong>${unitHtml}</strong>」在别处也被改过,当前版本已经更新,这处修改没法自动合并进去。<br><span class="muted">这处修改已原样保留为「待确认」,当前版本没有任何改动。可以让 AI 助手按最新版本调整后重试,或直接丢弃。</span>`,
    readyTitle: "提交这处修改等待确认?",
    readyBody: (name: string): string =>
      `「${name}」会进入<strong>等待确认</strong>,之后可以合入或丢弃。显式恢复编辑前,它将无法继续修改。`,
    readyConfirm: "确认提交",
    mergeTitle: "合入这处修改?",
    mergeBody: (name: string): string =>
      `「${name}」会合并到<strong>当前版本</strong>。合入后,大家在当前版本看到的就是这处修改后的数据。`,
    mergeConfirm: "确认合入",
    discardTitle: "丢弃这处修改?",
    discardBody: (name: string): string =>
      `「${name}」会被<strong>永久删除,无法恢复</strong>。当前版本不受任何影响。`,
    discardChip: "AI 助手的全部改动将清空",
    discardConfirm: "确认丢弃",
    trunkEditTitle: "在有未合入修改时直接编辑?",
    trunkEditBody: (n: number): string =>
      `当前有 <strong>${n} 处</strong>未合入的修改(AI 助手正在改或等待确认)。你现在直接编辑<strong>当前版本</strong>没问题,但如果改到它们正在改的地方,这些修改稍后<strong>合入时可能冲突</strong>、需要重做或手动解决。`,
    trunkEditChip: "更稳妥:先合入或丢弃这些修改,再编辑当前版本",
    trunkEditConfirm: "仍要编辑"
  },
  time: {
    justNow: "刚刚",
    minutesAgo: (n: number): string => `${n} 分钟前`,
    hoursAgo: (n: number): string => `${n} 小时前`,
    daysAgo: (n: number): string => `${n} 天前`
  },
  content: {
    emptyTitle: "空文件",
    emptyHint: "从左侧选择一个文件开始查看,或等待 AI 助手的修改完成确认。"
  },
  summary: {
    modified: (n: number): string => `改 ${n}`,
    added: (n: number): string => `新增 ${n}`,
    deleted: (n: number): string => `删 ${n}`,
    noChanges: "暂无改动"
  }
};
