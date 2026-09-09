import {
	createBlock,
	createSubtask,
	duplicateBlock,
	endFromStartAndHours,
	findNextFreeSlot,
	reorderBlocks,
	reorderSubtasks,
	sortBlocks,
	validateHoursAndStart,
	validateRange,
	withUpdatedBlock,
	suggestedStartTime,
} from '../lib/planner';
import { createId } from '../lib/ids';
import { buildExport, emptyDay, parseImportedExport } from '../lib/storage';
import { applyTheme, currentTokensSnapshot } from '../lib/themes';
import {
	addDays,
	addMonths,
	blockDurationMinutes,
	DEFAULT_DURATION_HOURS,
	diffDays,
	formatDisplayTime,
	formatHHmm,
	joinTime,
	MIN_DURATION_MINUTES,
	MINUTES_IN_DAY,
	minutesToHours,
	nowMinutes,
	parseHoursInput,
	todayISO,
} from '../lib/time';
import type { DayPlan, PlannerView, ThemeTokens, TimeBlock } from '../lib/types';
import { applyFocus, applyCalendarScroll, applySelectionVisibility, renderApp } from './view';
import { closedComposer, createStore, initialUi, type AppState, type Store } from './store';
import { minutesFromCanvasY, snapMinutes, isEventColorId } from '../lib/calendar';

function planOf(state: AppState): DayPlan {
	return state.plans[state.date] ?? emptyDay(state.date);
}

function writePlan(state: AppState, plan: DayPlan): AppState {
	return {
		...state,
		plans: { ...state.plans, [state.date]: plan },
	};
}

function updateBlock(state: AppState, blockId: string, patch: Partial<TimeBlock>): AppState {
	return writePlan(state, withUpdatedBlock(planOf(state), blockId, patch));
}

function moveBlock(state: AppState, blockId: string, direction: 'up' | 'down'): AppState {
	const plan = planOf(state);
	const sorted = sortBlocks(plan.blocks);
	const index = sorted.findIndex((block) => block.id === blockId);
	if (index === -1) return state;
	const targetIndex = direction === 'up' ? index - 1 : index + 1;
	if (targetIndex < 0 || targetIndex >= sorted.length) return state;
	const beforeId = direction === 'up' ? sorted[targetIndex].id : (sorted[targetIndex + 1]?.id ?? null);
	return writePlan(state, { ...plan, blocks: reorderBlocks(plan.blocks, blockId, beforeId) });
}

type EditStep =
	| { type: 'task'; focus: string }
	| { type: 'subtask'; subtaskId: string; focus: string };

function editSequence(block: TimeBlock): EditStep[] {
	const steps: EditStep[] = [{ type: 'task', focus: `task-${block.id}` }];
	const sorted = [...block.subtasks].sort((a, b) => a.order - b.order);
	for (const subtask of sorted) {
		steps.push({ type: 'subtask', subtaskId: subtask.id, focus: `subtask-${subtask.id}` });
	}
	return steps;
}

function navigateEditField(store: Store, blockId: string, fromIndex: number, direction: 1 | -1) {
	const block = planOf(store.get()).blocks.find((item) => item.id === blockId);
	if (!block) return;
	const steps = editSequence(block);
	const nextIndex = fromIndex + direction;
	if (nextIndex < 0 || nextIndex >= steps.length) return;
	const step = steps[nextIndex];
	store.set((state) => ({
		...state,
		ui: {
			...state.ui,
			editing:
				step.type === 'task'
					? { type: 'task', blockId }
					: { type: 'subtask', blockId, subtaskId: step.subtaskId },
			focus: step.focus,
			selectedBlockId: blockId,
			menuBlockId: null,
		},
	}));
}

function downloadJson(data: unknown, filename: string) {
	const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	link.remove();
	URL.revokeObjectURL(url);
}

function isTypingTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	const tag = target.tagName;
	if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
	return target.isContentEditable;
}

function readTimeField(field: HTMLElement, hour12: boolean): string | null {
	const hour = Number(field.querySelector<HTMLSelectElement>('[data-part="hour"]')?.value);
	const minute = Number(field.querySelector<HTMLInputElement>('[data-part="minute"]')?.value);
	const period = (field.querySelector<HTMLSelectElement>('[data-part="period"]')?.value as 'AM' | 'PM') ?? 'AM';
	if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
	return joinTime({ hour, minute, period }, hour12);
}

function closestAction(target: EventTarget | null): HTMLElement | null {
	if (!(target instanceof Element)) return null;
	return target.closest<HTMLElement>('[data-action]');
}

function openComposer(state: AppState): AppState {
	const plan = planOf(state);
	return {
		...state,
		ui: {
			...state.ui,
			composer: {
				open: true,
				hours: String(DEFAULT_DURATION_HOURS),
				startTime: suggestedStartTime(plan.blocks, state.settings.dayStart),
				error: null,
			},
			menuBlockId: null,
			editing: null,
			focus: 'composer-hours',
			settingsOpen: false,
			selectedBlockId: null,
		},
	};
}

function createFromComposer(state: AppState): AppState {
	const hours = parseHoursInput(state.ui.composer.hours);
	if (hours == null) {
		return {
			...state,
			ui: { ...state.ui, composer: { ...state.ui.composer, error: 'Enter a duration in hours.' } },
		};
	}
	const plan = planOf(state);
	const error = validateHoursAndStart(plan.blocks, hours, state.ui.composer.startTime);
	if (error) {
		return { ...state, ui: { ...state.ui, composer: { ...state.ui.composer, error } } };
	}
	const endTime = endFromStartAndHours(state.ui.composer.startTime, hours);
	if (!endTime) {
		return {
			...state,
			ui: {
				...state.ui,
				composer: { ...state.ui.composer, error: 'This block would extend past midnight.' },
			},
		};
	}
	const block = createBlock({ startTime: state.ui.composer.startTime, endTime });
	const nextPlan: DayPlan = { date: state.date, blocks: [...plan.blocks, block] };
	return {
		...writePlan(state, nextPlan),
		ui: {
			...state.ui,
			composer: closedComposer(nextPlan, state.settings.dayStart),
			selectedBlockId: block.id,
			editing: { type: 'task', blockId: block.id },
			focus: `task-${block.id}`,
			menuBlockId: null,
			notice: null,
		},
	};
}

function changeDate(state: AppState, date: string): AppState {
	const plan = state.plans[date] ?? emptyDay(date);
	return {
		...state,
		date,
		ui: {
			...state.ui,
			selectedBlockId: null,
			menuBlockId: null,
			editing: null,
			dialog: null,
			focus: null,
			notice: null,
			composer: closedComposer(plan, state.settings.dayStart),
		},
	};
}

function setView(state: AppState, view: PlannerView): AppState {
	if (state.settings.view === view) return state;
	return {
		...state,
		settings: { ...state.settings, view },
		ui: { ...state.ui, menuBlockId: null, notice: null },
	};
}

function applyBlockTimes(
	state: AppState,
	blockId: string,
	startTime: string,
	endTime: string,
	options?: { closeEditing?: boolean },
): AppState {
	const plan = planOf(state);
	const error = validateRange(plan.blocks, startTime, endTime, blockId);
	if (error) {
		return {
			...state,
			ui: { ...state.ui, notice: error },
		};
	}
	const close = options?.closeEditing === true;
	return {
		...updateBlock(state, blockId, { startTime, endTime }),
		ui: {
			...state.ui,
			notice: null,
			editing: close ? null : state.ui.editing,
			focus: close ? null : state.ui.focus,
		},
	};
}

export function mountPlanner(root: HTMLElement): void {
	const store = createStore();

	function render() {
		const state = store.get();
		root.innerHTML = renderApp(state);
		applyFocus(root, state.ui.focus, state.ui.editing);
		applyCalendarScroll(root, state.settings.view);
		applySelectionVisibility(root, state.settings.view, state.ui.selectedBlockId);
	}

	store.subscribe(render);
	render();

	const tick = window.setInterval(() => {
		const current = nowMinutes();
		store.set((state) => {
			if (state.ui.nowMinutes === current) return state;
			if (state.ui.editing || state.ui.composer.open) return state;
			return { ...state, ui: { ...state.ui, nowMinutes: current } };
		});
	}, 30_000);

	root.addEventListener('click', (event) => {
		const actionEl = closestAction(event.target);
		if (!actionEl) {
			if (event.target instanceof Element && !event.target.closest('.menu, .menu-wrap, .header-menu-wrap')) {
				store.set((state) =>
					state.ui.menuBlockId || state.ui.headerMenu
						? { ...state, ui: { ...state.ui, menuBlockId: null, headerMenu: null } }
						: state,
				);
			}
			return;
		}

		const action = actionEl.dataset.action;
		const blockId = actionEl.dataset.blockId;
		const subtaskId = actionEl.dataset.subtaskId;

		if (action === 'pick-date') return;

		if (action === 'export-data') {
			store.set((current) =>
				current.ui.headerMenu ? { ...current, ui: { ...current.ui, headerMenu: null } } : current,
			);
			const state = store.get();
			const plan = state.plans[state.date] ?? emptyDay(state.date);
			downloadJson(buildExport({ [state.date]: plan }, state.settings), `planner-export-${state.date}.json`);
			return;
		}

		if (action === 'trigger-import') {
			store.set((current) =>
				current.ui.headerMenu ? { ...current, ui: { ...current.ui, headerMenu: null } } : current,
			);
			root.querySelector<HTMLInputElement>('[data-action="import-file-input"]')?.click();
			return;
		}

		if (action === 'day-canvas') {
			if (event.target instanceof Element && event.target.closest('.cal-event')) return;
			const rangeStart = Number(actionEl.dataset.rangeStart);
			const pxPerHour = Number(actionEl.dataset.pxPerHour);
			if (!Number.isFinite(rangeStart) || !Number.isFinite(pxPerHour)) return;
			const rect = actionEl.getBoundingClientRect();
			const y = event.clientY - rect.top;
			const snapped = snapMinutes(minutesFromCanvasY(y, rangeStart, pxPerHour));
			const start = Math.max(0, Math.min(MINUTES_IN_DAY - MIN_DURATION_MINUTES, snapped));
			const startTime = formatHHmm(start);
			store.set((state) => {
				if (state.ui.composer.open) {
					return {
						...state,
						ui: {
							...state.ui,
							composer: { ...state.ui.composer, startTime, error: null },
						},
					};
				}
				const opened = openComposer(state);
				return {
					...opened,
					ui: {
						...opened.ui,
						composer: { ...opened.ui.composer, startTime, error: null },
					},
				};
			});
			return;
		}

		if (action === 'select-block' && event.target instanceof Element) {
			if (event.target.closest('select, input, textarea, .time-field, .grip, button, label, a, .menu')) {
				store.set((state) => {
					if (!blockId || (state.ui.selectedBlockId === blockId && !state.ui.menuBlockId)) return state;
					return { ...state, ui: { ...state.ui, selectedBlockId: blockId, menuBlockId: null } };
				});
				return;
			}
		}

		if (action === 'open-date-picker') {
			const input = root.querySelector<HTMLInputElement>('[data-action="pick-date"]');
			if (input) {
				if (typeof input.showPicker === 'function') input.showPicker();
				else input.click();
			}
			return;
		}

		store.set((state) => handleClick(state, action, blockId, subtaskId, actionEl));
	});

	root.addEventListener('input', (event) => {
		const target = event.target;
		if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLSelectElement)) return;
		handleInput(store, target);
	});

	root.addEventListener('change', (event) => {
		const target = event.target;
		if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLSelectElement)) return;

		if (target.dataset.action === 'pick-date' && target.value) {
			store.set((state) => changeDate(state, target.value));
			return;
		}

		if (target instanceof HTMLInputElement && target.dataset.action === 'import-file-input') {
			const file = target.files?.[0];
			target.value = '';
			if (!file) return;
			void handleImportFile(store, file);
			return;
		}

		const field = target.closest<HTMLElement>('[data-time-field]');
		if (field) {
			handleTimeField(store, field);
			return;
		}

		if (target.dataset.action === 'theme-token') {
			const key = target.dataset.token as keyof ThemeTokens | undefined;
			if (!key) return;
			store.set((state) => {
				if (!state.ui.themeEditor) return state;
				return {
					...state,
					ui: {
						...state.ui,
						themeEditor: {
							...state.ui.themeEditor,
							tokens: { ...state.ui.themeEditor.tokens, [key]: target.value },
						},
					},
				};
			});
		}
	});

	root.addEventListener('keydown', (event) => {
		handleLocalKey(store, event);
	});

	root.addEventListener('focusout', (event) => {
		const target = event.target;
		if (!(target instanceof HTMLElement)) return;
		if (target.dataset.action === 'task-title' || target.dataset.action === 'subtask-title' || target.dataset.action === 'block-hours') {
			const next = event.relatedTarget;
			if (next instanceof HTMLElement && root.contains(next) && next.dataset.action === target.dataset.action) {
				return;
			}
			store.set((state) => ({ ...state, ui: { ...state.ui, editing: null, focus: null } }));
			return;
		}
		const field = target.closest<HTMLElement>('[data-time-field]');
		if (field && (field.dataset.timeField === 'block-start' || field.dataset.timeField === 'block-end')) {
			const next = event.relatedTarget;
			if (next instanceof HTMLElement && field.contains(next)) return;
			window.setTimeout(() => {
				if (!field.isConnected) return;
				const active = document.activeElement;
				if (active instanceof HTMLElement && field.contains(active)) return;
				const invalid = field.dataset.invalid;
				store.set((state) => {
					const editing = state.ui.editing;
					if (editing?.type !== 'start' && editing?.type !== 'end') return state;
					if (editing.blockId !== field.dataset.blockId) return state;
					return {
						...state,
						ui: {
							...state.ui,
							editing: null,
							focus: null,
							notice: invalid || state.ui.notice,
						},
					};
				});
			}, 0);
		}
	});

	root.addEventListener('submit', (event) => {
		if (!(event.target instanceof HTMLFormElement) || !event.target.hasAttribute('data-composer')) return;
		event.preventDefault();
		store.set(createFromComposer);
	});

	bindDrag(root, store);

	document.addEventListener('keydown', (event) => {
		const mod = event.ctrlKey || event.metaKey;
		if (mod && !event.shiftKey && (event.key === 'z' || event.key === 'Z')) {
			event.preventDefault();
			store.undo();
			return;
		}
		if (mod && ((event.key === 'y' || event.key === 'Y') || (event.shiftKey && (event.key === 'z' || event.key === 'Z')))) {
			event.preventDefault();
			store.redo();
			return;
		}
		if (mod && (event.key === 'l' || event.key === 'L')) {
			event.preventDefault();
			store.set((state) => setView(state, 'list'));
			return;
		}
		if (mod && (event.key === 'd' || event.key === 'D')) {
			event.preventDefault();
			store.set((state) => setView(state, 'day'));
			return;
		}
		if (mod && (event.key === 'm' || event.key === 'M')) {
			event.preventDefault();
			store.set((state) => setView(state, 'month'));
			return;
		}
		if (isTypingTarget(event.target)) return;
		if (event.key === 'n' || event.key === 'N') {
			event.preventDefault();
			store.set(openComposer);
			return;
		}
		if (event.key === '?') {
			event.preventDefault();
			store.set((state) => ({ ...state, ui: { ...state.ui, shortcutsOpen: !state.ui.shortcutsOpen } }));
			return;
		}
		if (event.key === 'Enter') {
			const state = store.get();
			if (state.ui.dialog?.type === 'delete-block') {
				event.preventDefault();
				store.set(confirmDelete);
				return;
			}
			if (state.ui.editing || state.ui.composer.open || state.ui.dialog || state.ui.settingsOpen || state.ui.shortcutsOpen) {
				return;
			}
			const selected = state.ui.selectedBlockId;
			if (!selected) return;
			event.preventDefault();
			store.set((current) => ({
				...current,
				ui: { ...current.ui, editing: { type: 'task', blockId: selected }, focus: `task-${selected}`, menuBlockId: null },
			}));
			return;
		}
		if (event.key === 't' || event.key === 'T') {
			event.preventDefault();
			store.set((state) => changeDate(state, todayISO()));
			return;
		}
		if (event.key === 'ArrowLeft') {
			event.preventDefault();
			store.set((state) =>
				changeDate(
					state,
					state.settings.view === 'month' ? addMonths(state.date, -1) : addDays(state.date, -1),
				),
			);
			return;
		}
		if (event.key === 'ArrowRight') {
			event.preventDefault();
			store.set((state) =>
				changeDate(
					state,
					state.settings.view === 'month' ? addMonths(state.date, 1) : addDays(state.date, 1),
				),
			);
			return;
		}
		if (event.key === 'Escape') {
			store.set((state) => ({
				...state,
				ui: {
					...state.ui,
					editing: null,
					menuBlockId: null,
					headerMenu: null,
					dialog: null,
					settingsOpen: false,
					shortcutsOpen: false,
					themeEditor: null,
					composer: state.ui.composer.open
						? closedComposer(planOf(state), state.settings.dayStart)
						: state.ui.composer,
					focus: null,
				},
			}));
			return;
		}
		if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
			if (store.get().settings.view === 'month') return;
			event.preventDefault();
			const direction = event.key === 'ArrowDown' ? 1 : -1;
			store.set((state) => {
				const blocks = sortBlocks(planOf(state).blocks);
				if (blocks.length === 0) return state;
				const currentIndex = blocks.findIndex((block) => block.id === state.ui.selectedBlockId);
				const nextIndex = currentIndex === -1 ? (direction === 1 ? 0 : blocks.length - 1) : currentIndex + direction;
				if (nextIndex < 0 || nextIndex >= blocks.length) return state;
				return {
					...state,
					ui: { ...state.ui, selectedBlockId: blocks[nextIndex].id, menuBlockId: null },
				};
			});
			return;
		}
		if (event.key === 'Delete' || event.key === 'Backspace') {
			const selected = store.get().ui.selectedBlockId;
			if (!selected) return;
			event.preventDefault();
			store.set((state) => ({
				...state,
				ui: { ...state.ui, dialog: { type: 'delete-block', blockId: selected }, menuBlockId: null },
			}));
		}
	});

	window.addEventListener('beforeunload', () => window.clearInterval(tick));
}

function handleClick(
	state: AppState,
	action: string | undefined,
	blockId: string | undefined,
	subtaskId: string | undefined,
	el: HTMLElement,
): AppState {
	switch (action) {
		case 'open-composer':
			return openComposer(state);
		case 'close-composer':
			return {
				...state,
				ui: { ...state.ui, composer: closedComposer(planOf(state), state.settings.dayStart), focus: null },
			};
		case 'create-block':
			return createFromComposer(state);
		case 'composer-chip': {
			const hours = el.dataset.hours ?? String(DEFAULT_DURATION_HOURS);
			return {
				...state,
				ui: {
					...state.ui,
					composer: { ...state.ui.composer, hours, error: null },
					focus: 'composer-hours',
				},
			};
		}
		case 'prev-day':
			return changeDate(
				state,
				state.settings.view === 'month' ? addMonths(state.date, -1) : addDays(state.date, -1),
			);
		case 'next-day':
			return changeDate(
				state,
				state.settings.view === 'month' ? addMonths(state.date, 1) : addDays(state.date, 1),
			);
		case 'go-today':
			return changeDate(state, todayISO());
		case 'set-view': {
			const view = el.dataset.view;
			if (view !== 'list' && view !== 'day' && view !== 'month') return state;
			return setView(state, view);
		}
		case 'open-day': {
			const date = el.dataset.date;
			if (!date) return state;
			return setView(changeDate(state, date), 'day');
		}
		case 'open-day-block': {
			const date = el.dataset.date;
			if (!date || !blockId) return state;
			const next = setView(changeDate(state, date), 'day');
			return { ...next, ui: { ...next.ui, selectedBlockId: blockId } };
		}
		case 'set-hour12':
			return { ...state, settings: { ...state.settings, hour12: el.dataset.value === 'true' } };
		case 'open-settings':
			return { ...state, ui: { ...state.ui, settingsOpen: true, menuBlockId: null, headerMenu: null } };
		case 'close-settings':
			return { ...state, ui: { ...state.ui, settingsOpen: false, themeEditor: null } };
		case 'open-shortcuts':
			return { ...state, ui: { ...state.ui, shortcutsOpen: true, menuBlockId: null, headerMenu: null } };
		case 'close-shortcuts':
			return { ...state, ui: { ...state.ui, shortcutsOpen: false } };
		case 'toggle-io-menu':
			return { ...state, ui: { ...state.ui, headerMenu: state.ui.headerMenu === 'io' ? null : 'io', menuBlockId: null } };
		case 'toggle-theme-menu':
			return {
				...state,
				ui: { ...state.ui, headerMenu: state.ui.headerMenu === 'theme' ? null : 'theme', menuBlockId: null },
			};
		case 'set-theme': {
			const themeId = el.dataset.themeId ?? 'system';
			const next = { ...state, settings: { ...state.settings, themeId }, ui: { ...state.ui, headerMenu: null } };
			queueMicrotask(() => applyTheme(themeId, next.settings.customThemes));
			return next;
		}
		case 'create-theme':
			return {
				...state,
				ui: {
					...state.ui,
					themeEditor: {
						mode: 'create',
						name: 'Custom theme',
						tokens: currentTokensSnapshot(state.settings),
					},
				},
			};
		case 'edit-current-theme': {
			const id = state.settings.themeId.replace(/^custom:/, '');
			const theme = state.settings.customThemes.find((item) => item.id === id);
			if (!theme) return state;
			return {
				...state,
				ui: {
					...state.ui,
					themeEditor: { mode: 'edit', id: theme.id, name: theme.name, tokens: { ...theme.tokens } },
				},
			};
		}
		case 'close-theme-editor':
			return { ...state, ui: { ...state.ui, themeEditor: null } };
		case 'save-custom-theme':
			return saveCustomTheme(state);
		case 'delete-custom-theme':
			return deleteCustomTheme(state);
		case 'set-block-color': {
			if (!blockId) return state;
			const color = el.dataset.color;
			if (!isEventColorId(color)) return state;
			return {
				...updateBlock(state, blockId, { color }),
				ui: { ...state.ui, selectedBlockId: blockId, menuBlockId: null },
			};
		}
		case 'select-block':
			if (!blockId) return state;
			if (state.ui.selectedBlockId === blockId && !state.ui.menuBlockId) return state;
			return { ...state, ui: { ...state.ui, selectedBlockId: blockId, menuBlockId: null } };
		case 'move-block-up':
			if (!blockId) return state;
			return moveBlock(state, blockId, 'up');
		case 'move-block-down':
			if (!blockId) return state;
			return moveBlock(state, blockId, 'down');
		case 'toggle-menu':
			if (!blockId) return state;
			return {
				...state,
				ui: {
					...state.ui,
					menuBlockId: state.ui.menuBlockId === blockId ? null : blockId,
					selectedBlockId: blockId,
				},
			};
		case 'edit-task':
			if (!blockId) return state;
			return {
				...state,
				ui: { ...state.ui, editing: { type: 'task', blockId }, focus: `task-${blockId}`, menuBlockId: null, selectedBlockId: blockId },
			};
		case 'edit-start':
			if (!blockId) return state;
			return {
				...state,
				ui: { ...state.ui, editing: { type: 'start', blockId }, focus: `start-${blockId}`, menuBlockId: null, selectedBlockId: blockId },
			};
		case 'edit-end':
			if (!blockId) return state;
			return {
				...state,
				ui: { ...state.ui, editing: { type: 'end', blockId }, focus: `end-${blockId}`, menuBlockId: null, selectedBlockId: blockId },
			};
		case 'edit-hours':
			if (!blockId) return state;
			return {
				...state,
				ui: { ...state.ui, editing: { type: 'hours', blockId }, focus: `hours-${blockId}`, selectedBlockId: blockId },
			};
		case 'edit-subtask':
			if (!blockId || !subtaskId) return state;
			return {
				...state,
				ui: {
					...state.ui,
					editing: { type: 'subtask', blockId, subtaskId },
					focus: `subtask-${subtaskId}`,
					selectedBlockId: blockId,
				},
			};
		case 'toggle-subtask':
			if (!blockId || !subtaskId) return state;
			return toggleSubtask(state, blockId, subtaskId);
		case 'toggle-block':
			if (!blockId) return state;
			return toggleBlock(state, blockId);
		case 'add-subtask':
			if (!blockId) return state;
			return addSubtask(state, blockId);
		case 'delete-subtask':
			if (!blockId || !subtaskId) return state;
			return deleteSubtask(state, blockId, subtaskId);
		case 'duplicate-block':
			if (!blockId) return state;
			return duplicateSelected(state, blockId);
		case 'ask-delete-block':
			if (!blockId) return state;
			return { ...state, ui: { ...state.ui, dialog: { type: 'delete-block', blockId }, menuBlockId: null } };
		case 'cancel-dialog':
			return { ...state, ui: { ...state.ui, dialog: null } };
		case 'confirm-delete':
			return confirmDelete(state);
		default:
			return state;
	}
}

function handleInput(store: Store, target: HTMLInputElement | HTMLSelectElement) {
	const action = target.dataset.action;
	if (action === 'composer-hours') {
		store.set(
			(state) => ({
				...state,
				ui: { ...state.ui, composer: { ...state.ui.composer, hours: target.value, error: null } },
			}),
			{ silent: true },
		);
		const end = target.closest('[data-composer]')?.querySelector('.composer-end');
		const state = store.get();
		const hours = parseHoursInput(target.value);
		const endTime = hours ? endFromStartAndHours(state.ui.composer.startTime, hours) : null;
		if (end instanceof HTMLElement) {
			end.textContent = endTime
				? `Ends ${formatDisplayTime(endTime, state.settings.hour12)}`
				: hours
					? 'This block would extend past midnight.'
					: 'Enter hours to see the end time';
		}
		return;
	}

	if (action === 'task-title' && target.dataset.blockId) {
		const blockId = target.dataset.blockId;
		store.set((state) => updateBlock(state, blockId, { task: target.value }), { silent: true });
		return;
	}

	if (action === 'subtask-title' && target.dataset.blockId && target.dataset.subtaskId) {
		const { blockId, subtaskId } = target.dataset;
		store.set((state) => {
			const plan = planOf(state);
			const block = plan.blocks.find((item) => item.id === blockId);
			if (!block) return state;
			return updateBlock(state, blockId, {
				subtasks: block.subtasks.map((item) =>
					item.id === subtaskId ? { ...item, title: target.value } : item,
				),
			});
		}, { silent: true });
		return;
	}

	if (action === 'theme-name') {
		store.set((state) => {
			if (!state.ui.themeEditor) return state;
			return {
				...state,
				ui: { ...state.ui, themeEditor: { ...state.ui.themeEditor, name: target.value } },
			};
		}, { silent: true });
		return;
	}

	const timeField = target.closest<HTMLElement>('[data-time-field]');
	if (timeField && target instanceof HTMLInputElement && target.dataset.part === 'minute') {
		handleTimeField(store, timeField);
	}
}

function handleTimeField(store: Store, field: HTMLElement) {
	const name = field.dataset.timeField;
	const hour12 = store.get().settings.hour12;
	const value = readTimeField(field, hour12);
	if (!value) return;

	if (name === 'composer-start') {
		store.set(
			(state) => ({
				...state,
				ui: { ...state.ui, composer: { ...state.ui.composer, startTime: value, error: null } },
			}),
			{ silent: true },
		);
		const hours = parseHoursInput(store.get().ui.composer.hours);
		const endTime = hours ? endFromStartAndHours(value, hours) : null;
		const end = field.closest('[data-composer]')?.querySelector('.composer-end');
		if (end instanceof HTMLElement) {
			end.textContent = endTime
				? `Ends ${formatDisplayTime(endTime, hour12)}`
				: hours
					? 'This block would extend past midnight.'
					: 'Enter hours to see the end time';
		}
		return;
	}

	const blockId = field.dataset.blockId;
	if (!blockId) return;
	const block = planOf(store.get()).blocks.find((item) => item.id === blockId);
	if (!block) return;

	if (name === 'block-start') {
		const duration = blockDurationMinutes(block.startTime, block.endTime);
		const endTime = endFromStartAndHours(value, minutesToHours(duration));
		if (!endTime) return;
		const error = validateRange(planOf(store.get()).blocks, value, endTime, blockId);
		if (error) {
			field.dataset.invalid = error;
			return;
		}
		delete field.dataset.invalid;
		store.set((state) => applyBlockTimes(state, blockId, value, endTime), { silent: true });
		const endRead = field.closest('.block-time')?.querySelector('[data-action="edit-end"]');
		if (endRead) endRead.textContent = formatDisplayTime(endTime, hour12);
		return;
	}

	if (name === 'block-end') {
		const error = validateRange(planOf(store.get()).blocks, block.startTime, value, blockId);
		if (error) {
			field.dataset.invalid = error;
			return;
		}
		delete field.dataset.invalid;
		store.set((state) => applyBlockTimes(state, blockId, block.startTime, value), { silent: true });
	}
}

function handleLocalKey(store: Store, event: KeyboardEvent) {
	const target = event.target;
	if (!(target instanceof HTMLInputElement)) return;

	if (event.key === 'Escape') {
		event.stopPropagation();
		store.set((state) => ({ ...state, ui: { ...state.ui, editing: null, focus: null } }));
		return;
	}

	const isNavKey =
		event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowRight';
	if (isNavKey && (target.dataset.action === 'task-title' || target.dataset.action === 'subtask-title')) {
		const blockId = target.dataset.blockId;
		if (!blockId) return;
		const block = planOf(store.get()).blocks.find((item) => item.id === blockId);
		if (!block) return;
		const steps = editSequence(block);
		const currentIndex =
			target.dataset.action === 'task-title'
				? 0
				: steps.findIndex((step) => step.type === 'subtask' && step.subtaskId === target.dataset.subtaskId);
		if (currentIndex === -1) return;

		if (event.key === 'ArrowDown') {
			event.preventDefault();
			navigateEditField(store, blockId, currentIndex, 1);
			return;
		}
		if (event.key === 'ArrowUp') {
			event.preventDefault();
			navigateEditField(store, blockId, currentIndex, -1);
			return;
		}
		const atStart = target.selectionStart === 0 && target.selectionEnd === 0;
		const atEnd = target.selectionStart === target.value.length && target.selectionEnd === target.value.length;
		if (event.key === 'ArrowRight' && atEnd) {
			event.preventDefault();
			navigateEditField(store, blockId, currentIndex, 1);
			return;
		}
		if (event.key === 'ArrowLeft' && atStart) {
			event.preventDefault();
			navigateEditField(store, blockId, currentIndex, -1);
			return;
		}
		return;
	}

	if (target.dataset.action === 'composer-hours' && event.key === 'Enter') {
		event.preventDefault();
		store.set((state) => ({ ...state, ui: { ...state.ui, focus: 'composer-start' } }));
		return;
	}

	if (target.dataset.action === 'task-title' && event.key === 'Enter') {
		event.preventDefault();
		store.set((state) => ({ ...state, ui: { ...state.ui, editing: null, focus: null } }));
		return;
	}

	if (target.dataset.action === 'subtask-title' && event.key === 'Enter') {
		event.preventDefault();
		const blockId = target.dataset.blockId;
		if (!blockId) return;
		store.set((state) => addSubtask({ ...state, ui: { ...state.ui, editing: null } }, blockId));
		return;
	}

	if (target.dataset.action === 'block-hours' && (event.key === 'Enter' || event.key === 'Tab')) {
		if (event.key === 'Enter') event.preventDefault();
		const blockId = target.dataset.blockId;
		if (!blockId) return;
		const hours = parseHoursInput(target.value);
		store.set((state) => {
			const block = planOf(state).blocks.find((item) => item.id === blockId);
			if (!block || hours == null) {
				return { ...state, ui: { ...state.ui, editing: null, focus: null } };
			}
			const endTime = endFromStartAndHours(block.startTime, hours);
			if (!endTime) {
				return {
					...state,
					ui: {
						...state.ui,
						composer: { ...state.ui.composer, error: 'This block would extend past midnight.' },
						editing: null,
						focus: null,
					},
				};
			}
			return applyBlockTimes(state, blockId, block.startTime, endTime, { closeEditing: true });
		});
	}
}

function toggleSubtask(state: AppState, blockId: string, subtaskId: string): AppState {
	const block = planOf(state).blocks.find((item) => item.id === blockId);
	if (!block) return state;
	return updateBlock(state, blockId, {
		subtasks: block.subtasks.map((item) =>
			item.id === subtaskId ? { ...item, completed: !item.completed } : item,
		),
	});
}

function toggleBlock(state: AppState, blockId: string): AppState {
	const block = planOf(state).blocks.find((item) => item.id === blockId);
	if (!block) return state;
	return updateBlock(state, blockId, {
		status: block.status === 'completed' ? 'pending' : 'completed',
	});
}

function addSubtask(state: AppState, blockId: string): AppState {
	const block = planOf(state).blocks.find((item) => item.id === blockId);
	if (!block) return state;
	const order = block.subtasks.length;
	const subtask = createSubtask('', order);
	return {
		...updateBlock(state, blockId, { subtasks: [...block.subtasks, subtask] }),
		ui: {
			...state.ui,
			editing: { type: 'subtask', blockId, subtaskId: subtask.id },
			focus: `subtask-${subtask.id}`,
			selectedBlockId: blockId,
		},
	};
}

function deleteSubtask(state: AppState, blockId: string, subtaskId: string): AppState {
	const block = planOf(state).blocks.find((item) => item.id === blockId);
	if (!block) return state;
	return {
		...updateBlock(state, blockId, {
			subtasks: block.subtasks
				.filter((item) => item.id !== subtaskId)
				.map((item, index) => ({ ...item, order: index })),
		}),
		ui: { ...state.ui, editing: null, focus: null },
	};
}

function duplicateSelected(state: AppState, blockId: string): AppState {
	const plan = planOf(state);
	const source = plan.blocks.find((item) => item.id === blockId);
	if (!source) return state;
	const duration = blockDurationMinutes(source.startTime, source.endTime);
	const slot = findNextFreeSlot(plan.blocks, duration, source.endTime);
	if (!slot) {
		return {
			...state,
			ui: {
				...state.ui,
				menuBlockId: null,
				composer: { ...state.ui.composer, error: 'No free slot remains today for a duplicate of this duration.' },
			},
		};
	}
	const copy = duplicateBlock(source, slot.startTime, slot.endTime);
	const nextPlan = { date: state.date, blocks: [...plan.blocks, copy] };
	return {
		...writePlan(state, nextPlan),
		ui: {
			...state.ui,
			menuBlockId: null,
			selectedBlockId: copy.id,
			composer: { ...state.ui.composer, error: null },
		},
	};
}

function confirmDelete(state: AppState): AppState {
	const dialog = state.ui.dialog;
	if (dialog?.type !== 'delete-block') return state;
	const plan = planOf(state);
	const nextPlan = { date: state.date, blocks: plan.blocks.filter((item) => item.id !== dialog.blockId) };
	return {
		...writePlan(state, nextPlan),
		ui: {
			...state.ui,
			dialog: null,
			selectedBlockId: null,
			menuBlockId: null,
			editing: null,
			composer: closedComposer(nextPlan, state.settings.dayStart),
		},
	};
}

function saveCustomTheme(state: AppState): AppState {
	const editor = state.ui.themeEditor;
	if (!editor) return state;
	const name = editor.name.trim() || 'Custom theme';
	if (editor.mode === 'edit' && editor.id) {
		const customThemes = state.settings.customThemes.map((theme) =>
			theme.id === editor.id ? { ...theme, name, tokens: editor.tokens } : theme,
		);
		const next = {
			...state,
			settings: { ...state.settings, customThemes, themeId: `custom:${editor.id}` },
			ui: { ...state.ui, themeEditor: null },
		};
		queueMicrotask(() => applyTheme(next.settings.themeId, next.settings.customThemes));
		return next;
	}
	const id = createId();
	const customThemes = [...state.settings.customThemes, { id, name, tokens: editor.tokens }];
	const next = {
		...state,
		settings: { ...state.settings, customThemes, themeId: `custom:${id}` },
		ui: { ...state.ui, themeEditor: null },
	};
	queueMicrotask(() => applyTheme(next.settings.themeId, next.settings.customThemes));
	return next;
}

function deleteCustomTheme(state: AppState): AppState {
	const editor = state.ui.themeEditor;
	if (!editor?.id) return state;
	const customThemes = state.settings.customThemes.filter((theme) => theme.id !== editor.id);
	const themeId = state.settings.themeId === `custom:${editor.id}` ? 'system' : state.settings.themeId;
	const next = {
		...state,
		settings: { ...state.settings, customThemes, themeId },
		ui: { ...state.ui, themeEditor: null },
	};
	queueMicrotask(() => applyTheme(next.settings.themeId, next.settings.customThemes));
	return next;
}

async function handleImportFile(store: Store, file: File): Promise<void> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(await file.text());
	} catch {
		store.set((state) => ({ ...state, ui: { ...state.ui, notice: 'That file is not valid JSON.' } }));
		return;
	}
	const imported = parseImportedExport(parsed);
	if (!imported) {
		store.set((state) => ({ ...state, ui: { ...state.ui, notice: 'That file is not a valid planner export.' } }));
		return;
	}
	if (imported.importedDayCount === 0) {
		store.set((state) => ({
			...state,
			ui: {
				...state.ui,
				notice:
					'No day plans were found in that file. Each date needs a "blocks" array — check the JSON structure.',
			},
		}));
		return;
	}
	const importedDates = Object.keys(imported.plans).sort();
	const isSingleDay = importedDates.length === 1;
	const confirmed = window.confirm(
		isSingleDay
			? `Import this file? It will replace your settings and place that day's plan on the day you're viewing.`
			: `Import this file? It will replace your settings and restore ${imported.importedDayCount} day(s) of plans on their original dates.`,
	);
	if (!confirmed) return;
	store.clearHistory();
	store.set((state) => {
		const latest = importedDates[importedDates.length - 1];
		const shift = isSingleDay && latest ? diffDays(latest, state.date) : 0;
		const shiftedPlans: Record<string, DayPlan> = {};
		for (const originalDate of importedDates) {
			const date = shift ? addDays(originalDate, shift) : originalDate;
			shiftedPlans[date] = { ...imported.plans[originalDate], date };
		}
		const plans = { ...state.plans, ...shiftedPlans };
		const plan = plans[state.date] ?? emptyDay(state.date);
		const firstBlockId = sortBlocks(plan.blocks)[0]?.id ?? null;
		queueMicrotask(() => applyTheme(imported.settings.themeId, imported.settings.customThemes));
		const skippedNote = imported.skippedEntryCount
			? ` (skipped ${imported.skippedEntryCount} invalid entr${imported.skippedEntryCount === 1 ? 'y' : 'ies'})`
			: '';
		return {
			...state,
			plans,
			settings: imported.settings,
			ui: {
				...initialUi(plan, imported.settings.dayStart),
				selectedBlockId: firstBlockId,
				notice: `Imported ${imported.importedDayCount} day(s)${skippedNote}.`,
			},
		};
	});
}

function bindDrag(root: HTMLElement, store: Store) {
	root.addEventListener('dragstart', (event) => {
		const grip = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-drag]') : null;
		if (!grip || !event.dataTransfer) return;
		const kind = grip.dataset.drag;
		if (kind === 'block') {
			const block = grip.closest<HTMLElement>('[data-block-id]');
			const id = block?.dataset.blockId;
			if (!id) return;
			event.dataTransfer.setData('text/plain', `block:${id}`);
			event.dataTransfer.effectAllowed = 'move';
			return;
		}
		if (kind === 'subtask') {
			const row = grip.closest<HTMLElement>('[data-subtask-id]');
			if (!row?.dataset.subtaskId || !row.dataset.blockId) return;
			event.dataTransfer.setData('text/plain', `subtask:${row.dataset.blockId}:${row.dataset.subtaskId}`);
			event.dataTransfer.effectAllowed = 'move';
		}
	});

	root.addEventListener('dragover', (event) => {
		const block = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-block-id]') : null;
		const subtask = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-subtask-id]') : null;
		if (!subtask && !block) return;
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
		const nextBlock = subtask ? null : (block?.dataset.blockId ?? null);
		const nextSub = subtask?.dataset.subtaskId ?? null;
		store.set((state) => {
			if (state.ui.dragOverBlockId === nextBlock && state.ui.dragOverSubtaskId === nextSub) return state;
			return {
				...state,
				ui: {
					...state.ui,
					dragOverBlockId: nextBlock,
					dragOverSubtaskId: nextSub,
				},
			};
		});
	});

	root.addEventListener('drop', (event) => {
		const subtaskRow = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-subtask-id]') : null;
		const blockEl = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-block-id]') : null;
		event.preventDefault();
		const payload = event.dataTransfer?.getData('text/plain') ?? '';
		const subtaskMatch = /^subtask:([^:]+):(.+)$/.exec(payload);
		const blockMatch = /^block:(.+)$/.exec(payload);
		const subtaskId = subtaskMatch?.[2];
		const subtaskBlock = subtaskMatch?.[1];
		const blockId = blockMatch?.[1];

		store.set((state) => {
			const clear = {
				...state.ui,
				dragOverBlockId: null,
				dragOverSubtaskId: null,
			};
			if (subtaskId && subtaskBlock && subtaskRow?.dataset.subtaskId) {
				if (subtaskRow.dataset.blockId !== subtaskBlock) {
					return { ...state, ui: clear };
				}
				const block = planOf(state).blocks.find((item) => item.id === subtaskBlock);
				if (!block) return { ...state, ui: clear };
				return {
					...updateBlock(state, subtaskBlock, {
						subtasks: reorderSubtasks(block.subtasks, subtaskId, subtaskRow.dataset.subtaskId),
					}),
					ui: clear,
				};
			}
			if (blockId && blockEl?.dataset.blockId && blockEl.dataset.blockId !== blockId) {
				const plan = planOf(state);
				return {
					...writePlan(state, {
						date: state.date,
						blocks: reorderBlocks(plan.blocks, blockId, blockEl.dataset.blockId),
					}),
					ui: clear,
				};
			}
			return { ...state, ui: clear };
		});
	});

	root.addEventListener('dragend', () => {
		store.set((state) => ({
			...state,
			ui: { ...state.ui, dragOverBlockId: null, dragOverSubtaskId: null },
		}));
	});
}
