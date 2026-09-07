import { emptyDay, loadPlans, loadSettings, savePlans, saveSettings } from '../lib/storage';
import { applyTheme } from '../lib/themes';
import { DEFAULT_DURATION_HOURS, nowMinutes, todayISO } from '../lib/time';
import { suggestedStartTime } from '../lib/planner';
import type { DayPlan, PlansByDate, Settings, UiState } from '../lib/types';

export interface AppState {
	date: string;
	plans: PlansByDate;
	settings: Settings;
	ui: UiState;
}

export function closedComposer(plan: DayPlan, dayStart: string): UiState['composer'] {
	return {
		open: false,
		hours: String(DEFAULT_DURATION_HOURS),
		startTime: suggestedStartTime(plan.blocks, dayStart),
		error: null,
	};
}

export function initialUi(plan: DayPlan, dayStart: string): UiState {
	return {
		selectedBlockId: null,
		menuBlockId: null,
		editing: null,
		dialog: null,
		settingsOpen: false,
		shortcutsOpen: false,
		headerMenu: null,
		themeEditor: null,
		composer: closedComposer(plan, dayStart),
		focus: null,
		notice: null,
		nowMinutes: nowMinutes(),
		dragOverBlockId: null,
		dragOverSubtaskId: null,
	};
}

export type Store = {
	get: () => AppState;
	plan: () => DayPlan;
	subscribe: (listener: () => void) => () => void;
	set: (updater: (state: AppState) => AppState, options?: { silent?: boolean }) => void;
};

export function createStore(): Store {
	const plans = loadPlans();
	const settings = loadSettings();
	applyTheme(settings.themeId, settings.customThemes);

	const date = todayISO();
	const plan = plans[date] ?? emptyDay(date);

	let state: AppState = {
		date,
		plans,
		settings,
		ui: initialUi(plan, settings.dayStart),
	};

	const listeners = new Set<() => void>();

	function persist(prev: AppState, next: AppState) {
		if (next.plans !== prev.plans) savePlans(next.plans);
		if (next.settings !== prev.settings) saveSettings(next.settings);
	}

	return {
		get() {
			return state;
		},
		plan() {
			return state.plans[state.date] ?? emptyDay(state.date);
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		set(updater, options) {
			const prev = state;
			const next = updater(prev);
			if (next === prev) return;
			state = next;
			persist(prev, next);
			if (!options?.silent) {
				for (const listener of listeners) listener();
			}
		},
	};
}
