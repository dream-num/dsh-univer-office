/** Univer Office card aligned with DSH's built-in plugin configuration cards. */
export const settingsStyles = `
.uvf_settingsCard{list-style:none;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-3);transition:border-color .16s,background .16s}
.uvf_settingsCard:hover{border-color:var(--dsw-alias-label-dimmed)}
.uvf_settingsCard_open{border-color:var(--dsw-alias-label-dimmed);background:var(--dsw-alias-bg-layer-2)}
.uvf_settingsHeader{display:flex;width:100%;align-items:center;gap:12px;padding:14px 16px;appearance:none;border:0;border-radius:12px;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer}
.uvf_settingsHeader:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.uvf_settingsHeadText{display:flex;min-width:0;flex:1;flex-direction:column;gap:4px}
.uvf_settingsName{font-size:15px;font-weight:600;line-height:1.4;color:var(--dsw-alias-label-primary)}
.uvf_settingsDescription{font-size:13px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}
.uvf_settingsPending{flex:none;padding:1px 8px;border-radius:999px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);font-size:11px;font-weight:500;line-height:17px;white-space:nowrap}
.uvf_settingsChevron{flex:none;color:var(--dsw-alias-label-tertiary);transition:transform .16s}
.uvf_settingsChevron_open{transform:rotate(180deg)}
.uvf_settingsBody{margin:0 16px;padding-bottom:8px;border-top:1px solid var(--dsw-alias-border-l2)}
.uvf_settingsReadOnly{margin:12px 0 0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5}
.uvf_settingsField{display:flex;flex-direction:column;gap:6px;padding:12px 0}
.uvf_settingsFieldHead{display:flex;align-items:center;gap:8px}
.uvf_settingsLabel{min-width:0;flex:1;color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:1.5}
.uvf_settingsFieldActions,.uvf_settingsBadges{display:inline-flex;align-items:center;gap:8px}
.uvf_settingsBadge{padding:1px 8px;border-radius:999px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);font-size:11px;font-weight:500;line-height:17px;white-space:nowrap}
.uvf_settingsReset{padding:0;border:0;background:none;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:1.5;cursor:pointer}
.uvf_settingsReset:hover:not(:disabled){color:var(--dsw-alias-label-primary)}
.uvf_settingsReset:disabled{cursor:default}
.uvf_settingsSwitch{box-sizing:border-box;position:relative;width:36px;height:20px;flex:0 0 auto;padding:2px;border:0;border-radius:10px;background:var(--dsw-alias-border-l3);cursor:pointer}
.uvf_settingsSwitch_on{background:var(--dsw-alias-brand-primary)}
.uvf_settingsSwitch:disabled{cursor:default;opacity:.5}
.uvf_settingsSwitch:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.uvf_settingsSwitchThumb{display:block;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-label-primary-foreground);transition:transform 120ms ease}
.uvf_settingsSwitch_on .uvf_settingsSwitchThumb{transform:translateX(16px)}
.uvf_settingsHint{margin:0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5}
.uvf_settingsFooter{display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:12px 0 4px;border-top:1px solid var(--dsw-alias-border-l2)}
.uvf_settingsFailed{min-width:0;flex:1;margin:0;color:var(--dsw-alias-label-error);font-size:12px;line-height:1.5}
.uvf_settingsDiscard,.uvf_settingsSave{padding:5px 14px;appearance:none;border:1px solid transparent;border-radius:8px;font:inherit;font-size:13px;line-height:1.5;cursor:pointer}
.uvf_settingsDiscard{border-color:var(--dsw-alias-border-l2);background:none;color:var(--dsw-alias-label-secondary)}
.uvf_settingsDiscard:hover:not(:disabled){border-color:var(--dsw-alias-label-dimmed);color:var(--dsw-alias-label-primary)}
.uvf_settingsSave{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}
.uvf_settingsDiscard:disabled,.uvf_settingsSave:disabled{cursor:default;opacity:.4}
.uvf_settingsDiscard:focus-visible,.uvf_settingsSave:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
@media (prefers-reduced-motion:reduce){.uvf_settingsCard,.uvf_settingsChevron,.uvf_settingsSwitchThumb{transition:none}}
`
