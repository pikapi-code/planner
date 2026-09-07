import type { DayPlan, PlannerView, PlansByDate, Settings } from './types';
import { DEFAULT_DAY_END, DEFAULT_DAY_START } from './time';

export const PLANS_KEY = 'time-blocker-data';
export const SETTINGS_KEY = 'time-blocker-settings';

const DEFAULT_SETTINGS: Settings = {
	hour12: false,
	themeId: 'system',
	customThemes: [],
	dayStart: DEFAULT_DAY_START,
	dayEnd: DEFAULT_DAY_END,
	view: 'list',
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function readJson(key: string): unknown {
	try {
		const raw = localStorage.getItem(key);
		if (!raw) return null;
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

export function loadPlans(): PlansByDate {
	const data = readJson(PLANS_KEY);
	if (!isRecord(data)) return {};
	const plans: PlansByDate = {};
	for (const [date, value] of Object.entries(data)) {
		if (!isRecord(value) || !Array.isArray(value.blocks)) continue;
		plans[date] = {
			date: typeof value.date === 'string' ? value.date : date,
			blocks: value.blocks as DayPlan['blocks'],
		};
	}
	return plans;
}

export function savePlans(plans: PlansByDate): void {
	try {
		localStorage.setItem(PLANS_KEY, JSON.stringify(plans));
	} catch {
		/* ignore quota */
	}
}

export function loadSettings(): Settings {
	const data = readJson(SETTINGS_KEY);
	if (!isRecord(data)) return { ...DEFAULT_SETTINGS, customThemes: [] };
	return {
		hour12: data.hour12 === true,
		themeId: typeof data.themeId === 'string' ? data.themeId : DEFAULT_SETTINGS.themeId,
		customThemes: Array.isArray(data.customThemes)
			? (data.customThemes as Settings['customThemes'])
			: [],
		dayStart: typeof data.dayStart === 'string' ? data.dayStart : DEFAULT_SETTINGS.dayStart,
		dayEnd: typeof data.dayEnd === 'string' ? data.dayEnd : DEFAULT_SETTINGS.dayEnd,
		view: parseView(data.view),
	};
}

function parseView(value: unknown): PlannerView {
	return value === 'day' || value === 'month' ? value : 'list';
}

export function saveSettings(settings: Settings): void {
	try {
		localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
	} catch {
		/* ignore quota */
	}
}

export function emptyDay(date: string): DayPlan {
	return { date, blocks: [] };
}
