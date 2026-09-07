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

function parsePlans(data: unknown): { plans: PlansByDate; skipped: number } {
	if (!isRecord(data)) return { plans: {}, skipped: 0 };
	const plans: PlansByDate = {};
	let skipped = 0;
	for (const [key, value] of Object.entries(data)) {
		if (!isRecord(value) || !Array.isArray(value.blocks)) {
			skipped += 1;
			continue;
		}
		const date = typeof value.date === 'string' && value.date ? value.date : key;
		plans[date] = { date, blocks: value.blocks as DayPlan['blocks'] };
	}
	return { plans, skipped };
}

function parseSettings(data: unknown): Settings {
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

export function loadPlans(): PlansByDate {
	return parsePlans(readJson(PLANS_KEY)).plans;
}

export function savePlans(plans: PlansByDate): void {
	try {
		localStorage.setItem(PLANS_KEY, JSON.stringify(plans));
	} catch {
		/* ignore quota */
	}
}

export function loadSettings(): Settings {
	return parseSettings(readJson(SETTINGS_KEY));
}

export interface PlannerExport {
	version: 1;
	exportedAt: string;
	plans: PlansByDate;
	settings: Settings;
}

export function buildExport(plans: PlansByDate, settings: Settings): PlannerExport {
	return { version: 1, exportedAt: new Date().toISOString(), plans, settings };
}

export interface ImportedExport {
	plans: PlansByDate;
	settings: Settings;
	importedDayCount: number;
	skippedEntryCount: number;
}

export function parseImportedExport(raw: unknown): ImportedExport | null {
	if (!isRecord(raw)) return null;
	if (!('plans' in raw) && !('settings' in raw)) return null;
	const { plans, skipped } = parsePlans(raw.plans);
	return {
		plans,
		settings: parseSettings(raw.settings),
		importedDayCount: Object.keys(plans).length,
		skippedEntryCount: skipped,
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
