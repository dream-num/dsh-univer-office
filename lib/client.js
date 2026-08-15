window.__ModuleLoader__.load({
	id: "@univer-cli/dsh-univer-plugin",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region card css
		const css = ".unvT_card{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);border-radius:12px;margin:8px 0 4px;overflow:hidden}.unvT_head{box-sizing:border-box;padding:10px 12px;cursor:pointer}.unvT_head:hover{background:var(--dsw-alias-interactive-bg-subtle)}.unvT_titleRow{align-items:center;gap:8px;display:flex;min-width:0}.unvT_title{color:var(--dsw-alias-label-primary);align-items:center;gap:6px;min-width:0;font-size:14px;font-weight:600;line-height:22px;display:flex;flex:1}.unvT_file{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.unvT_wt{color:var(--dsw-alias-label-tertiary);flex:none;font-size:11px;font-variant-numeric:tabular-nums;background:var(--dsw-alias-interactive-bg-subtle);border-radius:999px;padding:1px 8px}.unvT_path{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}.unvT_dot{box-sizing:border-box;cursor:default;flex:none;width:10px;height:10px;border-radius:50%;padding:0;border:1px solid var(--dsw-alias-border-l2);background:#c4c9d2;display:inline-block}.unvT_dot[data-daemon=running]{background:#22a06b;border-color:#22a06b}.unvT_dot[data-daemon=stopped]{background:#d9a13b;border-color:#d9a13b;cursor:pointer}.unvT_dot[data-daemon=checking]{background:transparent;border-color:var(--dsw-alias-border-l2);border-top-color:#22a06b;animation:unvT_spin 0.9s linear infinite}@keyframes unvT_spin{to{transform:rotate(360deg)}}.unvT_cliMissing{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;margin-top:2px}.unvT_chip{color:var(--dsw-alias-label-secondary);cursor:pointer;background:var(--dsw-alias-interactive-bg-subtle);border:none;border-radius:999px;align-items:center;gap:4px;padding:2px 10px;font-family:inherit;font-size:12px;line-height:18px;display:inline-flex}.unvT_chip:hover{background:var(--dsw-alias-interactive-bg-hover)}.unvT_chip[data-active]{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover-solid)}.unvT_actions{align-items:center;gap:8px;margin-left:auto;display:flex;flex:none}.unvT_expandBtn{box-sizing:border-box;cursor:pointer;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-subtle);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;align-items:center;gap:5px;padding:4px 12px;font-family:inherit;font-size:13px;font-weight:500;line-height:20px;display:inline-flex;white-space:nowrap}.unvT_expandBtn:hover{background:var(--dsw-alias-interactive-bg-hover)}.unvT_overlay{z-index:1000;justify-content:center;align-items:center;display:flex;position:fixed;inset:0}.unvT_mask{background:var(--dsw-alias-bg-mask-1);backdrop-filter:var(--dsw-mask-blur);position:absolute;inset:0}.unvT_panel{z-index:1;background:var(--dsw-alias-bg-layer-2);width:min(1280px,calc(100vw - 48px));height:min(860px,calc(100vh - 64px));box-shadow:var(--dsw-shadow-lv3);border-radius:16px;flex-direction:column;display:flex;position:relative;overflow:hidden}.unvT_panelHead{box-sizing:border-box;border-bottom:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);flex:none;align-items:center;gap:10px;min-height:48px;padding:8px 12px 8px 16px;display:flex}.unvT_panelTitle{color:var(--dsw-alias-label-primary);align-items:center;gap:8px;min-width:0;font-size:14px;font-weight:600;line-height:22px;display:flex;flex:1}.unvT_panelFile{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.unvT_panelWt{color:var(--dsw-alias-label-tertiary);flex:none;font-size:11px;font-variant-numeric:tabular-nums;background:var(--dsw-alias-interactive-bg-subtle);border-radius:999px;padding:1px 8px}.unvT_panelActions{align-items:center;gap:6px;display:flex;flex:none}.unvT_panelTool{cursor:pointer;height:28px;color:var(--dsw-alias-label-primary);background:0 0;border:none;border-radius:8px;align-items:center;gap:5px;padding:0 10px;font-family:inherit;font-size:13px;line-height:20px;display:inline-flex}.unvT_panelTool:hover{background:var(--dsw-alias-interactive-bg-hover)}.unvT_frame{flex:1;min-height:0;width:100%;border:0;background:#fff}";
		const tagId = "@univer-cli/dsh-univer-plugin/card.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@univer-cli/dsh-univer-plugin";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		const cardCss = {
			"card": "unvT_card",
			"head": "unvT_head",
			"titleRow": "unvT_titleRow",
			"title": "unvT_title",
			"file": "unvT_file",
			"wt": "unvT_wt",
			"path": "unvT_path",
			"chip": "unvT_chip",
			"actions": "unvT_actions",
			"expandBtn": "unvT_expandBtn",
			"dot": "unvT_dot",
			"cliMissing": "unvT_cliMissing",
			"overlay": "unvT_overlay",
			"mask": "unvT_mask",
			"panel": "unvT_panel",
			"panelHead": "unvT_panelHead",
			"panelTitle": "unvT_panelTitle",
			"panelFile": "unvT_panelFile",
			"panelWt": "unvT_panelWt",
			"panelActions": "unvT_panelActions",
			"panelTool": "unvT_panelTool",
			"frame": "unvT_frame"
		};
		//#endregion
		//#region config
		/** Preview gateway base URL (overridable via localStorage "dsh.univerPreview"). */
		const DEFAULT_GATEWAY = "http://127.0.0.1:8000";
		function readGateway() {
			try {
				const raw = localStorage.getItem("dsh.univerPreview");
				if (raw) {
					const parsed = JSON.parse(raw);
					if (typeof parsed.gateway === "string" && parsed.gateway !== "") return parsed.gateway;
				}
			} catch (error) {
				/* malformed stored config falls back to the default */
			}
			return DEFAULT_GATEWAY;
		}
		function viewerUrl(target, gatewayOverride) {
			const gateway = (gatewayOverride || (target === null || target === void 0 ? null : target.gateway) || readGateway()).replace(/\/+$/, "");
			return gateway + "/?file=" + encodeURIComponent(target.file) + (target.worktree ? "&worktree=" + encodeURIComponent(target.worktree) : "");
		}
		/** Call the node half's loopback API route. */
		async function univerApi(path, options) {
			const res = await fetch(path, options);
			if (!res.ok) throw new Error("univer api " + res.status);
			return res.json();
		}
		//#endregion
		//#region extraction
		/** Absolute file paths and worktree ids found in one bash tool call. */
		function extractTargets(command, workdir) {
			const targets = [];
			if (typeof command !== "string") return targets;
			// A file token must not start with "." (rejects a bare ".univer").
			const fileRe = /([^.\s"'`][^\s"'`]*\.univer\b)/g;
			let match;
			while ((match = fileRe.exec(command)) !== null) {
				let file = match[1];
				// Remote URLs (univer import https://…) are not local preview targets.
				if (/^https?:\/\//i.test(file)) continue;
				if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(file) && workdir) {
					file = workdir.replace(/\/+$/, "") + "/" + file.replace(/^\.\//, "");
				}
				const after = command.slice(match.index + match[0].length);
				const wt = /^\s*--worktree\s+([A-Za-z0-9_-]+)/.exec(after);
				targets.push({ file, worktree: wt === null ? null : wt[1] });
			}
			return targets;
		}
		/** Working directory a command changes into itself ("cd /abs/path && univer ..."). */
		function commandWorkdirOf(command) {
			if (typeof command !== "string") return null;
			const match = /(?:^|[;&|]{1,2})\s*cd\s+([^;&|]+)/.exec(command);
			if (match === null) return null;
			const dir = match[1].trim().replace(/^["']|["']$/g, "").trim();
			return dir === "" ? null : dir;
		}
		/** First http(s) origin mentioned in a tool result body ("Open URL: ..."). */
		function extractGateway(text) {
			const match = /https?:\/\/[^\s"'`]+/.exec(text);
			if (match === null) return null;
			const raw = match[0].replace(/[),;。，、]+$/, "");
			try {
				return new URL(raw).origin;
			} catch (error) {
				return null;
			}
		}
		/** Worktree ids mentioned in a tool result body. */
		function extractWorktrees(text) {
			const found = [];
			const re = /wt-[A-Za-z0-9_-]{6,}/g;
			let match;
			while ((match = re.exec(text)) !== null) found.push(match[0]);
			return found;
		}
		/** Absolute .univer target lines in a tool result body ("Target: /path/x.univer"). */
		function extractResultFiles(text) {
			const found = [];
			const re = /(?:Target|target|file)\s*[:：]\s*([^\s"'`]+\.univer)/gi;
			let match;
			while ((match = re.exec(text)) !== null) found.push(match[1]);
			return found;
		}
		/** Flatten tool-result content blocks to one text string. */
		function flattenContent(content) {
			if (!Array.isArray(content)) return "";
			return content.map((block) => {
				if (block === null || typeof block !== "object") return "";
				const text = block.text;
				return typeof text === "string" ? text : "";
			}).join("\n");
		}
		/** Dedupe targets by (file, worktree), last write wins. */
		function mergeTargets(previous, additions) {
			const out = [...previous];
			for (const addition of additions) {
				const index = out.findIndex((target) => target.file === addition.file);
				if (index === -1) out.push(addition);
				else out[index] = addition;
			}
			return out;
		}
		/** Drop bogus targets: a file token that is not a real file name (".univer"). */
		function cleanTargets(targets) {
			return targets.filter((target) => {
				const base = basenameOf(target.file);
				return base !== ".univer" && !base.startsWith(".") && base !== "";
			});
		}
		function basenameOf(path) {
			const at = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
			return at === -1 ? path : path.slice(at + 1);
		}
		//#endregion
		//#region turn data
		/**
		* Turn-local accumulator: univer CLI targets (file + worktree) seen in this
		* turn's bash tool calls and results. Publishes no view node; consumers read
		* it through `owner.turn.data.get("univerPreview")`.
		*/
		const univerPreviewDefinition = {
			kind: "univerPreview",
			match: (event) => {
				if (event.type === "turn/start") return {
					id: String(event.data.turn),
					role: "start"
				};
				if (event.type === "tool/call" || event.type === "tool/result") return {
					id: String(event.data.turn),
					role: "update"
				};
				return null;
			},
			start: (_context, match) => {
				if (match.event.type !== "turn/start") throw new Error("univerPreview start requires turn/start");
				return { turn: match.event.data.turn, targets: [] };
			},
			update: (context, match) => {
				if (match.event.type === "tool/call") {
					if (match.event.data.name !== "bash") return context.state;
					let args;
					try {
						args = JSON.parse(match.event.data.arguments);
					} catch (error) {
						return context.state;
					}
					const command = typeof args.command === "string" ? args.command : "";
					if (!/\buniver\b/.test(command)) return context.state;
					const workdir = typeof args.workdir === "string" && args.workdir !== ""
						? args.workdir
						: typeof args.cwd === "string" && args.cwd !== ""
							? args.cwd
							: commandWorkdirOf(command) ?? "";
					const targets = cleanTargets(extractTargets(command, workdir));
					return targets.length === 0 ? context.state : {
						...context.state,
						targets: mergeTargets(context.state.targets, targets)
					};
				}
				if (match.event.type !== "tool/result") return context.state;
				if (match.event.data.message.content[0]?.isError === true) return context.state;
				const text = flattenContent(match.event.data.message.content);
				if (text === "" || !(/\buniver\b/.test(text) || /wt-[A-Za-z0-9_-]{6,}/.test(text))) return context.state;
				const worktrees = extractWorktrees(text);
				const resultFiles = extractResultFiles(text);
				const gateway = extractGateway(text);
				let targets = context.state.targets;
				let changed = false;
				// Backfill worktrees and gateways onto targets captured without them.
				if (worktrees.length > 0 || gateway !== null) {
					targets = targets.map((target) => {
						if (target.worktree !== null && (gateway === null || target.gateway !== void 0)) return target;
						changed = true;
						return {
							...target,
							...target.worktree === null ? { worktree: worktrees.length > 0 ? worktrees[worktrees.length - 1] : target.worktree } : {},
							...gateway !== null ? { gateway } : {}
						};
					});
				}
				// Targets named by the CLI itself (absolute paths), matched to the
				// worktree the same result named when no explicit flag was used.
				const additions = resultFiles.map((file) => ({
					file,
					worktree: worktrees.length > 0 ? worktrees[worktrees.length - 1] : null,
					...gateway !== null ? { gateway } : {}
				}));
				if (additions.length > 0) {
					const merged = cleanTargets(mergeTargets(targets, additions));
					changed = changed || merged.length !== targets.length || merged.some((target, index) => target.worktree !== targets[index]?.worktree);
					targets = merged;
				}
				return changed ? { ...context.state, targets } : context.state;
			},
			buildLocationData: (context, scope) => scope !== "turn" || context.state === void 0 ? null : {
				kind: "turn",
				turn: context.state.turn,
				key: "univerPreview",
				value: { targets: context.state.targets }
			}
		};
		//#endregion
		//#region selector
		/** Claim the turn-tail chain only when this turn ran univer CLI commands. */
		function selectUniverPreview(owner) {
			const data = owner.turn.data.get("univerPreview");
			if (data === void 0 || !Array.isArray(data.targets) || data.targets.length === 0) return null;
			return { targets: data.targets };
		}
		//#endregion
		//#region component
		function basename(path) {
			const at = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
			return at === -1 ? path : path.slice(at + 1);
		}
		/** Spreadsheet glyph, drawn inline so the bundle needs no icon package. */
		function GridIcon({ size }) {
			return (0, react_jsx_runtime.jsx)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 16 16",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 1.2,
				"aria-hidden": true,
				children: [
					(0, react_jsx_runtime.jsx)("rect", { x: 2, y: 2, width: 5, height: 5, rx: 1 }),
					(0, react_jsx_runtime.jsx)("rect", { x: 9, y: 2, width: 5, height: 5, rx: 1 }),
					(0, react_jsx_runtime.jsx)("rect", { x: 2, y: 9, width: 5, height: 5, rx: 1 }),
					(0, react_jsx_runtime.jsx)("rect", { x: 9, y: 9, width: 5, height: 5, rx: 1 })
				]
			});
		}
		/** Turn-tail preview card: one per turn that touched the univer CLI. */
		function UniverPreviewCard({ matched, t }) {
			const targets = matched.targets;
			const [selected, setSelected] = react.useState(0);
			const [open, setOpen] = react.useState(false);
			const [frameKey, setFrameKey] = react.useState(0);
			const closeRef = react.useRef(null);
			const [daemon, setDaemon] = react.useState("checking");
			const [starting, setStarting] = react.useState(false);
			const [gatewayOverride, setGatewayOverride] = react.useState(null);
			const [cliOk, setCliOk] = react.useState(true);
			react.useEffect(() => {
				if (selected >= targets.length) setSelected(0);
			}, [targets.length, selected]);
			react.useEffect(() => {
				let alive = true;
				(async () => {
					try {
						const status = await univerApi("/univer-api/status");
						if (!alive) return;
						setDaemon(status.daemon.running ? "running" : "stopped");
						if (status.daemon.running && status.daemon.gateway) setGatewayOverride(status.daemon.gateway);
						setCliOk(status.cli.ok !== false);
					} catch (error) {
						if (alive) setDaemon("unknown");
					}
				})();
				return () => {
					alive = false;
				};
			}, []);
			const startDaemon = async (event) => {
				event.stopPropagation();
				if (starting) return;
				setStarting(true);
				try {
					const result = await univerApi("/univer-api/ensure-daemon", { method: "POST" });
					if (result.ok) {
						setDaemon("running");
						if (result.gateway) setGatewayOverride(result.gateway);
					} else {
						setDaemon("stopped");
					}
				} catch (error) {
					setDaemon("unknown");
				}
				setStarting(false);
			};
			// Focus the close button so Escape bubbles to this document (the
			// cross-origin iframe would otherwise swallow the key once clicked).
			react.useEffect(() => {
				if (open && closeRef.current !== null) closeRef.current.focus();
			}, [open]);
			react.useEffect(() => {
				if (!open) return;
				const onKey = (event) => {
					if (event.key === "Escape") setOpen(false);
				};
				window.addEventListener("keydown", onKey);
				return () => {
					window.removeEventListener("keydown", onKey);
				};
			}, [open]);			const active = targets[Math.min(selected, targets.length - 1)];
			const url = active === void 0 ? null : viewerUrl(active, gatewayOverride);
			return (0, react_jsx_runtime.jsxs)("div", {
				className: cardCss.card,
				children: [
					(0, react_jsx_runtime.jsxs)("div", {
						className: cardCss.head,
						onClick: () => {
							setOpen((value) => !value);
						},
						children: [
							(0, react_jsx_runtime.jsxs)("div", {
								className: cardCss.titleRow,
								children: [
									(0, react_jsx_runtime.jsx)("span", {
										className: cardCss.dot,
										"data-daemon": daemon === "checking" && starting ? "checking" : daemon,
										title: daemon === "stopped" ? t("daemon.stopped") : daemon === "running" ? t("daemon.running") : daemon === "checking" ? t("daemon.checking") : t("daemon.unknown"),
										onClick: daemon === "stopped" ? startDaemon : void 0
									}),
									(0, react_jsx_runtime.jsx)("span", {
										className: cardCss.title,
										children: [
											(0, react_jsx_runtime.jsx)(GridIcon, { size: 16 }),
											(0, react_jsx_runtime.jsx)("span", {
												className: cardCss.file,
												children: active === void 0 ? "" : basename(active.file)
											}),
											active !== void 0 && active.worktree !== null && (0, react_jsx_runtime.jsx)("span", {
												className: cardCss.wt,
												children: active.worktree
											})
										]
									}),
									targets.length > 1 && (0, react_jsx_runtime.jsx)("span", {
										children: targets.map((target, index) => (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: cardCss.chip,
											"data-active": index === Math.min(selected, targets.length - 1) || void 0,
											onClick: (event) => {
												event.stopPropagation();
												setSelected(index);
											},
											children: basename(target.file)
										}, index))
									}),
									(0, react_jsx_runtime.jsx)("span", {
										className: cardCss.actions,
										children: (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: cardCss.expandBtn,
											"aria-label": t(open ? "collapse" : "expand"),
											onClick: (event) => {
												event.stopPropagation();
												setOpen((value) => !value);
											},
											children: [t(open ? "collapse" : "expand"), " ", open ? "▴" : "▾"]
										})
									})
								]
							}),
							active !== void 0 && (0, react_jsx_runtime.jsx)("div", {
								className: cardCss.path,
								children: active.file
							}),
							!cliOk && (0, react_jsx_runtime.jsx)("div", {
								className: cardCss.cliMissing,
								children: t("cliMissing")
							})
						]
					}),
					open && url !== null && (0, react_jsx_runtime.jsxs)("div", {
						className: cardCss.overlay,
						children: [
							(0, react_jsx_runtime.jsx)("div", {
								className: cardCss.mask,
								onClick: () => {
									setOpen(false);
								}
							}),
							(0, react_jsx_runtime.jsxs)("div", {
								className: cardCss.panel,
								children: [
									(0, react_jsx_runtime.jsxs)("div", {
										className: cardCss.panelHead,
										children: [
											(0, react_jsx_runtime.jsx)("span", {
												className: cardCss.panelTitle,
												children: [
													(0, react_jsx_runtime.jsx)(GridIcon, { size: 16 }),
													(0, react_jsx_runtime.jsx)("span", {
														className: cardCss.panelFile,
														children: active === void 0 ? "" : basename(active.file)
													}),
													active !== void 0 && active.worktree !== null && (0, react_jsx_runtime.jsx)("span", {
														className: cardCss.panelWt,
														children: active.worktree
													})
												]
											}),
											(0, react_jsx_runtime.jsxs)("span", {
												className: cardCss.panelActions,
												children: [
													(0, react_jsx_runtime.jsx)("button", {
														type: "button",
														className: cardCss.panelTool,
														"aria-label": t("refresh"),
														title: t("refresh"),
														onClick: () => {
															setFrameKey((key) => key + 1);
														},
														children: "⟳"
													}),
													(0, react_jsx_runtime.jsx)("button", {
														type: "button",
														ref: closeRef,
														className: cardCss.panelTool,
														"aria-label": t("collapse"),
														title: t("collapse"),
														onClick: () => {
															setOpen(false);
														},
														children: "✕"
													})
												]
											})
										]
									}),
									(0, react_jsx_runtime.jsx)("iframe", {
										key: frameKey,
										className: cardCss.frame,
										src: url,
										title: t("title"),
										onLoad: () => {
											if (closeRef.current !== null) closeRef.current.focus();
										}
									})
								]
							})
						]
					})
				]
			});
		}
		//#endregion
		//#region locales
		/** `univer` namespace dictionaries (the zh key set is the source of truth). */
		const zh = {
			"title": "表格预览",
			"expand": "展开预览",
			"collapse": "收起预览",
			"refresh": "刷新",
			"daemon.running": "univer daemon 运行中",
			"daemon.stopped": "univer daemon 未运行，点击启动",
			"daemon.checking": "正在检查 univer daemon…",
			"daemon.unknown": "无法获取 daemon 状态",
			"cliMissing": "未检测到 univer CLI，请先安装 univer-cli"
		};
		const en = {
			"title": "Spreadsheet Preview",
			"expand": "Expand preview",
			"collapse": "Collapse preview",
			"refresh": "Refresh",
			"daemon.running": "univer daemon running",
			"daemon.stopped": "univer daemon stopped — click to start",
			"daemon.checking": "Checking univer daemon…",
			"daemon.unknown": "Cannot reach daemon status",
			"cliMissing": "univer CLI not detected; install univer-cli first"
		};
		//#endregion
		//#region index
		/** Dictionary namespace owned by this plugin. */
		const NS = "univer";
		/** Services required by the turn-tail preview plugin. */
		const inject = ["slots", "locale", "conversationEvents"];
		/** Register the turn-data accumulator and the turn-tail preview card. */
		function apply(ctx) {
			try {
				ctx.conversationEvents.register(univerPreviewDefinition);
			} catch (error) {
				// Idempotent under plugin reloads: a same-kind registration from an
				// earlier apply of this plugin is fine — the definition is identical.
				if (!String(error.message).includes("already registered")) throw error;
			}
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "univer: dictionaries");
			ctx.effect(() => ctx.slots.inject("conversation.chat.turnTail", () => ctx.slots.register({
				name: "conversation.chat.turnTail",
				id: "univer",
				priority: -10,
				locale: NS,
				select: selectUniverPreview,
				inject: () => ({})
			}, UniverPreviewCard)), "univer: turn tail card");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
