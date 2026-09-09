import { blockOverlapsOthers, derivedStatus, sortBlocks, subtaskProgress } from '../lib/planner';
import { THEME_PRESETS, TOKEN_FIELDS } from '../lib/themes';
import {
	DURATION_CHIPS,
	blockDurationMinutes,
	formatDisplayTime,
	formatDuration,
	formatLongDate,
	formatMonth,
	isToday,
	MINUTES_IN_DAY,
	minutesToHours,
	nowMinutes,
	pad2,
	parseHHmm,
	splitTime,
	todayISO,
} from '../lib/time';
import type { EditTarget, PlannerView, Subtask, TimeBlock } from '../lib/types';
import { attr, esc } from './html';
import type { AppState } from './store';
import {
	EVENT_PALETTE,
	MONTH_EVENT_LIMIT,
	PX_PER_HOUR,
	eventColor,
	formatHourLabel,
	layoutOverlaps,
	monthGrid,
	weekdayLabels,
} from '../lib/calendar';

function hourOptions(selected: number, hour12: boolean, allowMidnightEnd = false): string {
	if (hour12) {
		return Array.from({ length: 12 }, (_, i) => i + 1)
			.map((hour) => `<option value="${hour}" ${hour === selected ? 'selected' : ''}>${hour}</option>`)
			.join('');
	}
	const hours = Array.from({ length: 24 }, (_, i) => i);
	if (allowMidnightEnd) hours.push(24);
	return hours
		.map((hour) => `<option value="${hour}" ${hour === selected ? 'selected' : ''}>${pad2(hour)}</option>`)
		.join('');
}

function timeField(options: {
	name: string;
	value: string;
	hour12: boolean;
	blockId?: string;
	allowMidnightEnd?: boolean;
	focus?: string;
}): string {
	const parts = splitTime(options.value, options.hour12);
	const blockAttr = options.blockId ? `data-block-id="${attr(options.blockId)}"` : '';
	const focusAttr = options.focus ? `data-focus="${attr(options.focus)}"` : '';
	return `
		<div class="time-field" data-time-field="${attr(options.name)}" ${blockAttr} ${focusAttr} tabindex="-1">
			<select class="select select-sm time-hour" data-part="hour" aria-label="Hour">
				${hourOptions(parts.hour, options.hour12, options.allowMidnightEnd)}
			</select>
			<span class="time-sep" aria-hidden="true">:</span>
			<input
				class="input input-sm time-minute"
				data-part="minute"
				value="${pad2(parts.minute)}"
				inputmode="numeric"
				maxlength="2"
				aria-label="Minute"
			/>
			${
				options.hour12
					? `<select class="select select-sm time-period" data-part="period" aria-label="AM or PM">
						<option value="AM" ${parts.period === 'AM' ? 'selected' : ''}>AM</option>
						<option value="PM" ${parts.period === 'PM' ? 'selected' : ''}>PM</option>
					</select>`
					: ''
			}
		</div>
	`;
}

function renderNowLabeled(hour12: boolean): string {
	const current = nowMinutes();
	const hhmm = `${pad2(Math.floor(current / 60))}:${pad2(current % 60)}`;
	return `
		<div class="now-row" role="status">
			<span class="now-label caption-mono">Now</span>
			<span class="now-line"></span>
			<span class="now-time tabular">${esc(formatDisplayTime(hhmm, hour12))}</span>
		</div>
	`;
}

function shouldShowNowBefore(blocks: TimeBlock[], current: number): boolean {
	if (blocks.length === 0) return false;
	const first = parseHHmm(blocks[0].startTime);
	return first != null && current < first;
}

function shouldShowNowAfter(blocks: TimeBlock[], current: number): boolean {
	if (blocks.length === 0) return false;
	const last = parseHHmm(blocks[blocks.length - 1].endTime);
	return last != null && current >= last;
}

function shouldShowNowAfterBlock(
	block: TimeBlock,
	next: TimeBlock | undefined,
	current: number,
): boolean {
	const end = parseHHmm(block.endTime);
	const nextStart = next ? parseHHmm(next.startTime) : null;
	if (end == null || nextStart == null) return false;
	return current >= end && current < nextStart;
}

function subtaskItem(block: TimeBlock, subtask: Subtask, state: AppState): string {
	const editing =
		state.ui.editing?.type === 'subtask' &&
		state.ui.editing.blockId === block.id &&
		state.ui.editing.subtaskId === subtask.id;
	const dragOver = state.ui.dragOverSubtaskId === subtask.id;
	const title = subtask.title.trim() === '' ? 'Subtask' : subtask.title;

	return `
		<li
			class="subtask ${subtask.completed ? 'is-done' : ''} ${dragOver ? 'is-dragover' : ''}"
			data-subtask-id="${attr(subtask.id)}"
			data-block-id="${attr(block.id)}"
		>
			<button
				type="button"
				class="grip"
				draggable="true"
				data-drag="subtask"
				aria-label="Reorder subtask"
				title="Drag to reorder"
			>
				<span></span><span></span>
			</button>
			<label class="check">
				<input
					type="checkbox"
					class="check-input"
					data-action="toggle-subtask"
					data-block-id="${attr(block.id)}"
					data-subtask-id="${attr(subtask.id)}"
					${subtask.completed ? 'checked' : ''}
				/>
				<span class="check-box" aria-hidden="true"></span>
				<span class="sr-only">Complete ${esc(title)}</span>
			</label>
			${
				editing
					? `<input
						class="input input-sm subtask-input"
						data-action="subtask-title"
						data-block-id="${attr(block.id)}"
						data-subtask-id="${attr(subtask.id)}"
						data-focus="subtask-${attr(subtask.id)}"
						value="${attr(subtask.title)}"
						placeholder="Subtask"
					/>`
					: `<button
						type="button"
						class="subtask-title"
						data-action="edit-subtask"
						data-block-id="${attr(block.id)}"
						data-subtask-id="${attr(subtask.id)}"
					>${subtask.title.trim() ? esc(subtask.title) : '<span class="placeholder">Subtask</span>'}</button>`
			}
			<button
				type="button"
				class="icon-btn"
				data-action="delete-subtask"
				data-block-id="${attr(block.id)}"
				data-subtask-id="${attr(subtask.id)}"
				aria-label="Delete subtask"
			>×</button>
		</li>
	`;
}

function colorPicker(blockId: string, selectedId: string): string {
	return `
		<div class="color-picker" role="radiogroup" aria-label="Task color">
			${EVENT_PALETTE.map(
				(item) => `
					<button
						type="button"
						role="radio"
						class="color-dot ${item.id === selectedId ? 'is-selected' : ''}"
						style="--swatch:${item.bg}"
						data-action="set-block-color"
						data-block-id="${attr(blockId)}"
						data-color="${item.id}"
						aria-label="${esc(item.label)}"
						aria-checked="${item.id === selectedId ? 'true' : 'false'}"
						title="${esc(item.label)}"
					></button>
				`,
			).join('')}
		</div>
	`;
}

function renderBlock(
	block: TimeBlock,
	state: AppState,
	next?: TimeBlock,
	isFirst = false,
	isLast = false,
): string {
	const hour12 = state.settings.hour12;
	const status = derivedStatus(block, state.date, todayISO(), state.ui.nowMinutes);
	const editing = state.ui.editing;
	const selected = state.ui.selectedBlockId === block.id;
	const menuOpen = state.ui.menuBlockId === block.id;
	const progress = subtaskProgress(block);
	const duration = blockDurationMinutes(block.startTime, block.endTime);
	const hours = minutesToHours(duration);
	const allSubtasksDone = progress.total > 0 && progress.done === progress.total;
	const sortedSubtasks = [...block.subtasks].sort((a, b) => a.order - b.order);
	const taskEditing = editing?.type === 'task' && editing.blockId === block.id;
	const startEditing = editing?.type === 'start' && editing.blockId === block.id;
	const endEditing = editing?.type === 'end' && editing.blockId === block.id;
	const hoursEditing = editing?.type === 'hours' && editing.blockId === block.id;
	const overlaps = blockOverlapsOthers(state.plans[state.date]?.blocks ?? [], block);
	const color = eventColor(block);

	return `
		<article
			class="block ${status === 'completed' ? 'is-completed' : ''} ${status === 'in-progress' ? 'is-active' : ''} ${selected ? 'is-selected' : ''} ${startEditing || endEditing ? 'is-editing-time' : ''} ${state.ui.dragOverBlockId === block.id ? 'is-dragover' : ''}"
			style="--event-bg:${color.bg};--event-fg:${color.fg}"
			data-block-id="${attr(block.id)}"
			data-action="select-block"
		>
			<div class="block-time">
				<button
					type="button"
					class="grip grip-block"
					draggable="true"
					data-drag="block"
					aria-label="Reorder time block"
					title="Drag to move"
				>
					<span></span><span></span>
				</button>
				${
					startEditing
						? timeField({
								name: 'block-start',
								value: block.startTime,
								hour12,
								blockId: block.id,
								focus: `start-${block.id}`,
							})
						: `<button type="button" class="time-read tabular" data-action="edit-start" data-block-id="${attr(block.id)}">${esc(formatDisplayTime(block.startTime, hour12))}</button>`
				}
				<div class="time-rail" aria-hidden="true"></div>
				${
					endEditing
						? timeField({
								name: 'block-end',
								value: block.endTime,
								hour12,
								blockId: block.id,
								allowMidnightEnd: true,
								focus: `end-${block.id}`,
							})
						: `<button type="button" class="time-read tabular" data-action="edit-end" data-block-id="${attr(block.id)}">${esc(formatDisplayTime(block.endTime, hour12))}</button>`
				}
			</div>

			<div class="block-task">
				<div class="task-toolbar">
					<label class="check complete-task">
						<input
							type="checkbox"
							class="check-input"
							data-action="toggle-block"
							data-block-id="${attr(block.id)}"
							${block.status === 'completed' ? 'checked' : ''}
						/>
						<span class="check-box" aria-hidden="true"></span>
						<span>Complete</span>
					</label>
					${status === 'in-progress' ? '<span class="badge now-badge">Now</span>' : ''}
					<div class="reorder-group">
						<button
							type="button"
							class="icon-btn icon-btn-xs"
							data-action="move-block-up"
							data-block-id="${attr(block.id)}"
							aria-label="Move task up"
							title="Move up"
							${isFirst ? 'disabled' : ''}
						>↑</button>
						<button
							type="button"
							class="icon-btn icon-btn-xs"
							data-action="move-block-down"
							data-block-id="${attr(block.id)}"
							aria-label="Move task down"
							title="Move down"
							${isLast ? 'disabled' : ''}
						>↓</button>
					</div>
					<div class="menu-wrap">
						<button
							type="button"
							class="icon-btn"
							data-action="toggle-menu"
							data-block-id="${attr(block.id)}"
							aria-haspopup="true"
							aria-expanded="${menuOpen ? 'true' : 'false'}"
							aria-label="Block actions"
						>⋮</button>
						${
							menuOpen
								? `<div class="menu" role="menu">
									<button type="button" role="menuitem" data-action="edit-start" data-block-id="${attr(block.id)}">Edit time</button>
									<button type="button" role="menuitem" data-action="duplicate-block" data-block-id="${attr(block.id)}">Duplicate</button>
									<div class="menu-divider" role="none"></div>
									<div class="menu-color-row" role="none">
										<span class="menu-label">Color</span>
										${colorPicker(block.id, color.id)}
									</div>
									<div class="menu-divider" role="none"></div>
									<button type="button" role="menuitem" class="danger" data-action="ask-delete-block" data-block-id="${attr(block.id)}">Delete</button>
								</div>`
								: ''
						}
					</div>
				</div>
				${
					taskEditing
						? `<input
							class="input task-input"
							data-action="task-title"
							data-block-id="${attr(block.id)}"
							data-focus="task-${attr(block.id)}"
							value="${attr(block.task)}"
							placeholder="What do you want to accomplish?"
						/>`
						: `<button type="button" class="task-title" data-action="edit-task" data-block-id="${attr(block.id)}">${
								block.task.trim()
									? esc(block.task)
									: '<span class="placeholder">What do you want to accomplish?</span>'
							}</button>`
				}
				<div class="task-meta">
					${
						hoursEditing
							? `<input
								class="input input-sm hours-input"
								data-action="block-hours"
								data-block-id="${attr(block.id)}"
								data-focus="hours-${attr(block.id)}"
								value="${attr(String(hours))}"
								inputmode="decimal"
								aria-label="Duration in hours"
							/>`
							: `<button type="button" class="duration-chip" data-action="edit-hours" data-block-id="${attr(block.id)}">${esc(formatDuration(duration))}</button>`
					}
					${progress.total > 0 ? `<span class="progress">${progress.done} / ${progress.total}</span>` : ''}
					${overlaps ? '<span class="hint">Overlaps</span>' : ''}
					${allSubtasksDone && block.status !== 'completed' ? '<span class="hint">All subtasks done</span>' : ''}
				</div>
			</div>

			<div class="block-subtasks">
				${
					sortedSubtasks.length === 0
						? '<p class="empty-subtasks">No subtasks yet</p>'
						: `<ul class="subtask-list">${sortedSubtasks.map((item) => subtaskItem(block, item, state)).join('')}</ul>`
				}
				<button
					type="button"
					class="text-btn"
					data-action="add-subtask"
					data-block-id="${attr(block.id)}"
				>+ Add subtask</button>
			</div>
		</article>
		${
			isToday(state.date) && shouldShowNowAfterBlock(block, next, state.ui.nowMinutes)
				? renderNowLabeled(hour12)
				: ''
		}
	`;
}

function renderComposer(state: AppState): string {
	const { composer } = state.ui;
	if (!composer.open) {
		return `
			<div class="add-row">
				<button type="button" class="btn btn-primary" data-action="open-composer">+ Add Time Block</button>
			</div>
		`;
	}

	const hoursValue = Number(composer.hours);
	const previewEnd =
		Number.isFinite(hoursValue) && hoursValue > 0
			? (() => {
					const start = parseHHmm(composer.startTime);
					if (start == null) return null;
					const end = start + Math.round(hoursValue * 60);
					if (end > 24 * 60) return 'Past midnight';
					const hh = Math.floor(end / 60);
					const mm = end % 60;
					const value = hh >= 24 && mm === 0 ? '24:00' : `${pad2(hh)}:${pad2(mm)}`;
					return formatDisplayTime(value, state.settings.hour12);
				})()
			: null;

	return `
		<form class="composer card" data-composer>
			<p class="caption-mono">New time block</p>
			<div class="composer-grid">
				<div>
					<label class="label" for="composer-hours">Hours</label>
					<input
						id="composer-hours"
						class="input"
						data-action="composer-hours"
						data-focus="composer-hours"
						value="${attr(composer.hours)}"
						inputmode="decimal"
						placeholder="0.5"
					/>
					<div class="chip-row">
						${DURATION_CHIPS.map(
							(chip) =>
								`<button type="button" class="chip ${String(chip.hours) === composer.hours ? 'is-active' : ''}" data-action="composer-chip" data-hours="${chip.hours}">${esc(chip.label)}</button>`,
						).join('')}
					</div>
				</div>
				<div>
					<label class="label">Start time</label>
					${timeField({
						name: 'composer-start',
						value: composer.startTime,
						hour12: state.settings.hour12,
						focus: 'composer-start',
					})}
					<p class="composer-end">${previewEnd ? `Ends ${esc(previewEnd)}` : 'Enter hours to see the end time'}</p>
				</div>
			</div>
			${composer.error ? `<p class="field-error" role="alert">${esc(composer.error)}</p>` : ''}
			<div class="composer-actions">
				<button type="button" class="btn btn-ghost" data-action="close-composer">Cancel</button>
				<button type="submit" class="btn btn-primary">Create block</button>
			</div>
		</form>
	`;
}

function swatch(themeId: string, selected: boolean, label: string, colors: [string, string]): string {
	return `
		<button
			type="button"
			class="theme-swatch ${selected ? 'is-selected' : ''}"
			data-action="set-theme"
			data-theme-id="${attr(themeId)}"
			aria-pressed="${selected ? 'true' : 'false'}"
		>
			<span class="swatch-chips" aria-hidden="true">
				<span style="background:${colors[0]}"></span>
				<span style="background:${colors[1]}"></span>
			</span>
			${esc(label)}
		</button>
	`;
}

function renderThemeEditor(state: AppState): string {
	const editor = state.ui.themeEditor;
	if (!editor) return '';
	return `
		<div class="theme-editor">
			<h3>${editor.mode === 'create' ? 'Create theme' : 'Edit theme'}</h3>
			<label class="label" for="theme-name">Name</label>
			<input id="theme-name" class="input" data-action="theme-name" value="${attr(editor.name)}" placeholder="My theme" />
			<div class="token-grid">
				${TOKEN_FIELDS.map(
					(field) => `
					<label class="token-field">
						<span>${esc(field.label)}</span>
						<input type="color" data-action="theme-token" data-token="${field.key}" value="${attr(editor.tokens[field.key])}" />
					</label>
				`,
				).join('')}
			</div>
			<div class="composer-actions">
				<button type="button" class="btn btn-ghost" data-action="close-theme-editor">Cancel</button>
				${editor.mode === 'edit' ? '<button type="button" class="btn btn-ghost" data-action="delete-custom-theme">Delete</button>' : ''}
				<button type="button" class="btn btn-primary" data-action="save-custom-theme">Save theme</button>
			</div>
		</div>
	`;
}

function renderSettings(state: AppState): string {
	if (!state.ui.settingsOpen) return '';
	const themeId = state.settings.themeId;
	return `
		<div class="drawer-backdrop" data-action="close-settings"></div>
		<aside class="drawer" role="dialog" aria-label="Appearance and settings">
			<div class="drawer-head">
				<h2>Settings</h2>
				<button type="button" class="icon-btn" data-action="close-settings" aria-label="Close settings">×</button>
			</div>
			<section>
				<h3>Time format</h3>
				<div class="segmented">
					<button type="button" class="${state.settings.hour12 ? 'is-active' : ''}" data-action="set-hour12" data-value="true">12-hour</button>
					<button type="button" class="${!state.settings.hour12 ? 'is-active' : ''}" data-action="set-hour12" data-value="false">24-hour</button>
				</div>
			</section>
			<section>
				<h3>Themes</h3>
				<div class="theme-grid">
					${swatch('system', themeId === 'system', 'System', ['#fafafa', '#0a0a0a'])}
					${swatch('light', themeId === 'light', 'Light', ['#ffffff', '#171717'])}
					${swatch('dark', themeId === 'dark', 'Dark', ['#0a0a0a', '#ededed'])}
					${THEME_PRESETS.map((preset) =>
						swatch(preset.id, themeId === preset.id, preset.name, [
							preset.tokens.canvasSoft,
							preset.tokens.primary,
						]),
					).join('')}
				</div>
			</section>
			<section>
				<h3>Your themes</h3>
				${
					state.settings.customThemes.length === 0
						? '<p class="muted">None yet. Create one from the current colors.</p>'
						: `<div class="theme-grid">${state.settings.customThemes
								.map((theme) =>
									swatch(`custom:${theme.id}`, themeId === `custom:${theme.id}`, theme.name, [
										theme.tokens.canvasSoft,
										theme.tokens.primary,
									]),
								)
								.join('')}</div>`
				}
				<div class="composer-actions">
					<button type="button" class="btn btn-secondary btn-sm" data-action="create-theme">Create theme</button>
					${themeId.startsWith('custom:') ? '<button type="button" class="btn btn-ghost btn-sm" data-action="edit-current-theme">Edit selected</button>' : ''}
				</div>
				${renderThemeEditor(state)}
			</section>
			<p class="muted drawer-note">Schedules are saved on this device only.</p>
		</aside>
	`;
}

function renderShortcuts(state: AppState): string {
	if (!state.ui.shortcutsOpen) return '';
	const groups: { title: string; rows: [string, string][] }[] = [
		{
			title: 'Navigate',
			rows: [
				['←  →', 'Previous / next day (or month)'],
				['↑  ↓', 'Select previous / next block'],
				['T', 'Jump to today'],
				['Ctrl/⌘ L', 'Switch to list view'],
				['Ctrl/⌘ D', 'Switch to day view'],
				['Ctrl/⌘ M', 'Switch to month view'],
				['Click a date', 'Open the date picker'],
			],
		},
		{
			title: 'Edit',
			rows: [
				['N', 'Add a new time block'],
				['Enter', 'Edit the selected block’s task'],
				['↑ ↓ ← →', 'While editing, move between the task and its subtasks'],
				['Enter (editing task)', 'Save and stop editing'],
				['Enter (editing subtask)', 'Save and add another subtask'],
				['Delete / Backspace', 'Delete the selected block'],
				['Esc', 'Close editing, menus, or dialogs'],
			],
		},
		{
			title: 'Other',
			rows: [
				['?', 'Toggle this shortcuts panel'],
				['Drag the grip', 'Reorder blocks or subtasks'],
				['Ctrl/⌘ Z', 'Undo'],
				['Ctrl/⌘ Y or Ctrl/⌘ Shift Z', 'Redo'],
			],
		},
	];
	return `
		<div class="modal-backdrop" data-action="close-shortcuts"></div>
		<div class="modal card shortcuts-modal" role="dialog" aria-labelledby="shortcuts-title" aria-modal="true">
			<div class="drawer-head">
				<h2 id="shortcuts-title">Keyboard shortcuts</h2>
				<button type="button" class="icon-btn" data-action="close-shortcuts" aria-label="Close shortcuts">×</button>
			</div>
			${groups
				.map(
					(group) => `
					<div class="shortcuts-group">
						<h3>${esc(group.title)}</h3>
						<dl class="shortcuts-list">
							${group.rows
								.map(
									([keys, description]) => `
										<div class="shortcuts-row">
											<dt><kbd>${esc(keys)}</kbd></dt>
											<dd>${esc(description)}</dd>
										</div>
									`,
								)
								.join('')}
						</dl>
					</div>
				`,
				)
				.join('')}
		</div>
	`;
}

function renderDialog(state: AppState): string {
	if (state.ui.dialog?.type !== 'delete-block') return '';
	return `
		<div class="modal-backdrop" data-action="cancel-dialog"></div>
		<div class="modal card" role="dialog" aria-labelledby="delete-title" aria-modal="true">
			<h2 id="delete-title">Delete this time block?</h2>
			<p>This will also delete its subtasks.</p>
			<div class="composer-actions">
				<button type="button" class="btn btn-ghost" data-action="cancel-dialog">Cancel</button>
				<button type="button" class="btn btn-danger" data-action="confirm-delete">Delete</button>
			</div>
		</div>
	`;
}

function viewSwitcher(view: PlannerView): string {
	const buttons: { id: PlannerView; label: string }[] = [
		{ id: 'list', label: 'List' },
		{ id: 'day', label: 'Day' },
		{ id: 'month', label: 'Month' },
	];
	return `
		<div class="segmented view-switcher" role="tablist" aria-label="Planner view">
			${buttons
				.map(
					(button) =>
						`<button type="button" role="tab" aria-selected="${view === button.id ? 'true' : 'false'}" class="${view === button.id ? 'is-active' : ''}" data-action="set-view" data-view="${button.id}">${button.label}</button>`,
				)
				.join('')}
		</div>
	`;
}

function renderDayView(state: AppState, planBlocks: TimeBlock[]): string {
	const hour12 = state.settings.hour12;
	const today = isToday(state.date);
	const range = { start: 0, end: MINUTES_IN_DAY };
	const span = Math.max(60, range.end - range.start);
	const height = (span / 60) * PX_PER_HOUR;
	const hours: number[] = [];
	for (let hour = range.start / 60; hour <= range.end / 60; hour++) hours.push(hour);
	const laidOut = layoutOverlaps(planBlocks);
	const selected = planBlocks.find((block) => block.id === state.ui.selectedBlockId);

	return `
		<section class="day-view" aria-label="Day calendar">
			${
				planBlocks.length === 0
					? '<p class="cal-hint">Click the timeline to add a block. Overlapping times sit side by side.</p>'
					: '<p class="cal-hint">Overlapping blocks sit side by side. Click one to edit it below.</p>'
			}
			<div class="day-scroll">
				<div class="day-grid" style="height:${height}px">
					${hours
						.map((hour) => {
							const top = ((hour * 60 - range.start) / span) * 100;
							return `
								<div class="day-hour" style="top:${top}%">
									<span class="day-hour-label tabular">${esc(formatHourLabel(hour, hour12))}</span>
									<div class="day-hour-line"></div>
								</div>
							`;
						})
						.join('')}
					<div
						class="day-canvas"
						data-action="day-canvas"
						data-range-start="${range.start}"
						data-px-per-hour="${PX_PER_HOUR}"
						style="height:${height}px"
					>
						${laidOut
							.map((item) => {
								const color = eventColor(item.block);
								const top = ((item.start - range.start) / span) * 100;
								const blockHeight = ((item.end - item.start) / span) * 100;
								const width = 100 / item.colCount;
								const left = item.col * width;
								const status = derivedStatus(item.block, state.date, todayISO(), state.ui.nowMinutes);
								const title = item.block.task.trim() || 'Untitled';
								const selectedClass = state.ui.selectedBlockId === item.block.id ? 'is-selected' : '';
								return `
									<button
										type="button"
										class="cal-event ${status === 'completed' ? 'is-completed' : ''} ${status === 'in-progress' ? 'is-active' : ''} ${selectedClass}"
										style="top:${top}%;height:${blockHeight}%;left:calc(${left}% + 3px);width:calc(${width}% - 6px);--event-bg:${color.bg};--event-fg:${color.fg}"
										data-action="select-block"
										data-block-id="${attr(item.block.id)}"
										title="${attr(`${formatDisplayTime(item.block.startTime, hour12)} – ${formatDisplayTime(item.block.endTime, hour12)} ${title}`)}"
									>
										<span class="cal-event-time">${esc(formatDisplayTime(item.block.startTime, hour12))}</span>
										<span class="cal-event-title">${esc(title)}</span>
									</button>
								`;
							})
							.join('')}
						${
							today && state.ui.nowMinutes >= range.start && state.ui.nowMinutes <= range.end
								? `<div class="cal-now" style="top:${((state.ui.nowMinutes - range.start) / span) * 100}%"><span>Now</span></div>`
								: ''
						}
					</div>
				</div>
			</div>
			${
				selected
					? `<div class="cal-detail">${renderBlock(
							selected,
							state,
							undefined,
							planBlocks[0]?.id === selected.id,
							planBlocks[planBlocks.length - 1]?.id === selected.id,
						)}</div>`
					: ''
			}
			${renderComposer(state)}
		</section>
	`;
}

function renderMonthView(state: AppState): string {
	const hour12 = state.settings.hour12;
	const cells = monthGrid(state.date);
	const today = todayISO();
	const labels = weekdayLabels();

	return `
		<section class="month-view" aria-label="Month calendar">
			<div class="month-board">
			<div class="month-weekdays">
				${labels.map((label) => `<div>${esc(label)}</div>`).join('')}
			</div>
			<div class="month-grid">
				${cells
					.map((cell) => {
						const blocks = sortBlocks(state.plans[cell.date]?.blocks ?? []);
						const visible = blocks.slice(0, MONTH_EVENT_LIMIT);
						const extra = blocks.length - visible.length;
						const isTodayCell = cell.date === today;
						const isSelected = cell.date === state.date;
						return `
							<div class="month-cell ${cell.inMonth ? '' : 'is-outside'} ${isTodayCell ? 'is-today' : ''} ${isSelected ? 'is-selected-day' : ''}" data-action="open-day" data-date="${attr(cell.date)}">
								<button
									type="button"
									class="month-day-num ${isTodayCell ? 'is-today' : ''}"
									data-action="open-day"
									data-date="${attr(cell.date)}"
									aria-label="${attr(formatLongDate(cell.date))}"
								>${cell.day}</button>
								<div class="month-events">
									${visible
										.map((block) => {
											const color = eventColor(block);
											const title = block.task.trim() || 'Untitled';
											return `
												<button
													type="button"
													class="month-event ${block.status === 'completed' ? 'is-completed' : ''}"
													style="--event-bg:${color.bg};--event-fg:${color.fg}"
													data-action="open-day-block"
													data-date="${attr(cell.date)}"
													data-block-id="${attr(block.id)}"
													title="${attr(`${formatDisplayTime(block.startTime, hour12)} ${title}`)}"
												>
													<span class="month-event-time">${esc(formatDisplayTime(block.startTime, hour12))}</span>
													<span class="month-event-title">${esc(title)}</span>
												</button>
											`;
										})
										.join('')}
									${
										extra > 0
											? `<button type="button" class="month-more" data-action="open-day" data-date="${attr(cell.date)}">+ ${extra} more</button>`
											: ''
									}
								</div>
							</div>
						`;
					})
					.join('')}
			</div>
			</div>
			${renderComposer(state)}
		</section>
	`;
}

function renderPlannerBody(state: AppState, planBlocks: TimeBlock[]): string {
	if (state.settings.view === 'day') return renderDayView(state, planBlocks);
	if (state.settings.view === 'month') return renderMonthView(state);

	const today = isToday(state.date);
	const showNow = today && planBlocks.length > 0;

	if (planBlocks.length === 0) {
		return `
			<section class="empty-day card">
				<h2>Your day is empty.</h2>
				<p>Add a time block to start planning.</p>
				${renderComposer(state)}
			</section>
		`;
	}

	return `
		<section class="timeline">
			<div class="timeline-head">
				<span>Time</span>
				<span>Primary task</span>
				<span>Subtasks</span>
			</div>
			${showNow && shouldShowNowBefore(planBlocks, state.ui.nowMinutes) ? renderNowLabeled(state.settings.hour12) : ''}
			${planBlocks
				.map((block, index) =>
					renderBlock(block, state, planBlocks[index + 1], index === 0, index === planBlocks.length - 1),
				)
				.join('')}
			${showNow && shouldShowNowAfter(planBlocks, state.ui.nowMinutes) ? renderNowLabeled(state.settings.hour12) : ''}
			${renderComposer(state)}
		</section>
	`;
}

export function renderApp(state: AppState): string {
	const planBlocks = sortBlocks(state.plans[state.date]?.blocks ?? []);
	const today = isToday(state.date);
	const monthView = state.settings.view === 'month';
	const dateLabel = monthView ? formatMonth(state.date) : formatLongDate(state.date);
	const navLabel = monthView ? 'Month' : 'Day';
	const prevLabel = monthView ? 'Previous month' : 'Previous day';
	const nextLabel = monthView ? 'Next month' : 'Next day';

	return `
		<div class="app ${state.settings.view !== 'list' ? 'is-calendar' : ''} is-${state.settings.view}">
			<header class="app-header">
				<div class="container header-row">
					<div class="brand">
						<p class="caption-mono">Time blocking</p>
						<h1>Planner</h1>
					</div>
					<div class="header-actions">
						${viewSwitcher(state.settings.view)}
						<div class="header-menu-wrap">
							<button
								type="button"
								class="icon-btn icon-btn-header"
								data-action="toggle-io-menu"
								aria-haspopup="menu"
								aria-expanded="${state.ui.headerMenu === 'io' ? 'true' : 'false'}"
								aria-label="Import or export data"
								title="Import / export data"
							>↕</button>
							${
								state.ui.headerMenu === 'io'
									? `
								<div class="menu" role="menu">
									<button type="button" role="menuitem" data-action="export-data" title="Export all plans and settings as a JSON file">Export data</button>
									<button type="button" role="menuitem" data-action="trigger-import" title="Import a JSON file (merges plans by date, replaces settings)">Import data</button>
								</div>
							`
									: ''
							}
						</div>
						<input type="file" accept="application/json" class="sr-only" data-action="import-file-input" tabindex="-1" aria-hidden="true" />
						<button type="button" class="icon-btn icon-btn-header" data-action="open-shortcuts" aria-label="Keyboard shortcuts" title="Keyboard shortcuts">⌨</button>
						<div class="header-menu-wrap">
							<button
								type="button"
								class="icon-btn icon-btn-header"
								data-action="toggle-theme-menu"
								aria-haspopup="menu"
								aria-expanded="${state.ui.headerMenu === 'theme' ? 'true' : 'false'}"
								aria-label="Theme"
								title="Theme"
							>☼</button>
							${
								state.ui.headerMenu === 'theme'
									? `
								<div class="menu" role="menu">
									<button type="button" role="menuitem" class="${state.settings.themeId === 'system' ? 'is-active' : ''}" data-action="set-theme" data-theme-id="system">System</button>
									<button type="button" role="menuitem" class="${state.settings.themeId === 'light' ? 'is-active' : ''}" data-action="set-theme" data-theme-id="light">Light</button>
									<button type="button" role="menuitem" class="${state.settings.themeId === 'dark' ? 'is-active' : ''}" data-action="set-theme" data-theme-id="dark">Dark</button>
									<div class="menu-divider"></div>
									<button type="button" role="menuitem" data-action="open-settings">More themes…</button>
								</div>
							`
									: ''
							}
						</div>
						<button type="button" class="icon-btn icon-btn-header" data-action="open-settings" aria-label="Settings" title="Settings">⋯</button>
					</div>
				</div>
			</header>

			<main id="main" class="container planner">
				<nav class="date-nav" aria-label="${navLabel}">
					<button type="button" class="icon-btn nav-arrow" data-action="prev-day" aria-label="${prevLabel}">‹</button>
					<div class="date-center">
						<button type="button" class="date-button" data-action="open-date-picker" aria-label="Choose date">${esc(dateLabel)}</button>
						<input
							class="date-hidden"
							type="date"
							data-action="pick-date"
							value="${attr(state.date)}"
							aria-label="Choose date"
							tabindex="-1"
						/>
					</div>
					<button type="button" class="icon-btn nav-arrow" data-action="next-day" aria-label="${nextLabel}">›</button>
					<button type="button" class="btn btn-secondary btn-sm" data-action="go-today" ${today ? 'disabled' : ''}>Today</button>
				</nav>

				${state.ui.notice ? `<p class="field-error planner-notice" role="alert">${esc(state.ui.notice)}</p>` : ''}
				${renderPlannerBody(state, planBlocks)}
			</main>
			${renderSettings(state)}
			${renderDialog(state)}
			${renderShortcuts(state)}
		</div>
	`;
}

export function applyFocus(root: HTMLElement, focus: string | null, editing: EditTarget | null): void {
	if (!focus) return;
	const el = root.querySelector<HTMLElement>(`[data-focus="${CSS.escape(focus)}"]`);
	if (!el) return;
	el.focus({ preventScroll: true });
	if (el instanceof HTMLInputElement) {
		const shouldSelect = editing?.type === 'task' || editing?.type === 'subtask' || focus === 'composer-hours';
		if (shouldSelect) el.select();
	}
	const scrollTarget = el.closest<HTMLElement>('[data-composer]') ?? el;
	scrollTarget.scrollIntoView({ block: 'nearest', behavior: 'instant' });
}

export function applyCalendarScroll(root: HTMLElement, view: PlannerView): void {
	if (view !== 'day') return;
	const scroller = root.querySelector('.day-scroll');
	const selected = root.querySelector('.cal-event.is-selected');
	const nowLine = root.querySelector('.cal-now');
	const firstEvent = root.querySelector('.cal-event');
	const target = selected ?? nowLine ?? firstEvent;
	if (!(scroller instanceof HTMLElement) || !(target instanceof HTMLElement)) return;

	const align = () => {
		const sRect = scroller.getBoundingClientRect();
		const tRect = target.getBoundingClientRect();
		if (sRect.height < 8) return false;
		scroller.scrollTop += tRect.top + tRect.height / 2 - (sRect.top + sRect.height / 2);
		return true;
	};

	if (align()) return;
	requestAnimationFrame(() => {
		if (align()) return;
		requestAnimationFrame(() => {
			align();
		});
	});
}

export function applySelectionVisibility(
	root: HTMLElement,
	view: PlannerView,
	selectedBlockId: string | null,
): void {
	if (view !== 'list' || !selectedBlockId) return;
	const el = root.querySelector<HTMLElement>(`.block[data-block-id="${CSS.escape(selectedBlockId)}"]`);
	if (!el) return;
	el.scrollIntoView({ block: 'nearest' });
}
