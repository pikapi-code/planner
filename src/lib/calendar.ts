import type { TimeBlock } from './types';
import { formatHHmm, parseHHmm } from './time';

export const PX_PER_HOUR = 64;
export const MONTH_EVENT_LIMIT = 3;

export const EVENT_PALETTE = [
	{ id: 'blue', bg: '#2563eb', fg: '#ffffff', label: 'Blue' },
	{ id: 'teal', bg: '#0d9488', fg: '#ffffff', label: 'Teal' },
	{ id: 'amber', bg: '#d97706', fg: '#ffffff', label: 'Amber' },
	{ id: 'green', bg: '#16a34a', fg: '#ffffff', label: 'Green' },
	{ id: 'violet', bg: '#7c3aed', fg: '#ffffff', label: 'Violet' },
	{ id: 'pink', bg: '#db2777', fg: '#ffffff', label: 'Pink' },
	{ id: 'red', bg: '#dc2626', fg: '#ffffff', label: 'Red' },
	{ id: 'sky', bg: '#0284c7', fg: '#ffffff', label: 'Sky' },
] as const;

export type EventColor = (typeof EVENT_PALETTE)[number];
export type EventColorId = EventColor['id'];

export function isEventColorId(value: string | undefined): value is EventColorId {
	return EVENT_PALETTE.some((item) => item.id === value);
}

export function hashedEventColor(id: string): EventColor {
	let hash = 0;
	for (let i = 0; i < id.length; i++) {
		hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
	}
	return EVENT_PALETTE[hash % EVENT_PALETTE.length];
}

export function eventColor(block: { id: string; color?: string }): EventColor {
	if (isEventColorId(block.color)) {
		return EVENT_PALETTE.find((item) => item.id === block.color) ?? hashedEventColor(block.id);
	}
	return hashedEventColor(block.id);
}

export type LaidOutBlock = {
	block: TimeBlock;
	start: number;
	end: number;
	col: number;
	colCount: number;
};

function blockRange(block: TimeBlock): { start: number; end: number } | null {
	const start = parseHHmm(block.startTime);
	const end = parseHHmm(block.endTime);
	if (start == null || end == null || end <= start) return null;
	return { start, end };
}

export function layoutOverlaps(blocks: TimeBlock[]): LaidOutBlock[] {
	const items = blocks
		.map((block) => {
			const range = blockRange(block);
			if (!range) return null;
			return { block, ...range };
		})
		.filter((item): item is { block: TimeBlock; start: number; end: number } => item != null)
		.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));

	const result: LaidOutBlock[] = [];
	let cluster: { block: TimeBlock; start: number; end: number; col: number }[] = [];
	let columnEnds: number[] = [];
	let clusterEnd = 0;

	const flush = () => {
		const colCount = Math.max(1, columnEnds.length);
		for (const item of cluster) {
			result.push({ ...item, colCount });
		}
		cluster = [];
		columnEnds = [];
		clusterEnd = 0;
	};

	for (const item of items) {
		if (cluster.length > 0 && item.start >= clusterEnd) flush();

		let col = columnEnds.findIndex((end) => end <= item.start);
		if (col === -1) {
			col = columnEnds.length;
			columnEnds.push(item.end);
		} else {
			columnEnds[col] = item.end;
		}

		cluster.push({ ...item, col });
		clusterEnd = Math.max(clusterEnd, item.end);
	}

	flush();
	return result;
}

export function visibleDayRange(
	blocks: TimeBlock[],
	dayStart: string,
	dayEnd: string,
	options?: { nowMinutes?: number; includeNow?: boolean },
): { start: number; end: number } {
	let start = parseHHmm(dayStart) ?? 8 * 60;
	let end = parseHHmm(dayEnd) ?? 18 * 60;

	for (const block of blocks) {
		const range = blockRange(block);
		if (!range) continue;
		start = Math.min(start, range.start);
		end = Math.max(end, range.end);
	}

	if (options?.includeNow && options.nowMinutes != null) {
		start = Math.min(start, options.nowMinutes);
		end = Math.max(end, options.nowMinutes + 30);
	}

	start = Math.max(0, Math.floor(start / 60) * 60);
	end = Math.min(24 * 60, Math.ceil(end / 60) * 60);
	if (end <= start) end = Math.min(24 * 60, start + 60);
	return { start, end };
}

export function snapMinutes(value: number, step = 15): number {
	return Math.round(value / step) * step;
}

export function minutesFromCanvasY(y: number, rangeStart: number, pxPerHour = PX_PER_HOUR): number {
	return rangeStart + (y / pxPerHour) * 60;
}

export function formatHourLabel(hour: number, hour12: boolean): string {
	const minutes = Math.min(hour * 60, 24 * 60);
	if (!hour12) return formatHHmm(minutes === 24 * 60 ? 24 * 60 : minutes);
	if (minutes === 24 * 60 || minutes === 0) return '12 AM';
	const h = Math.floor(minutes / 60);
	const period = h >= 12 ? 'PM' : 'AM';
	const hour12Value = h % 12 === 0 ? 12 : h % 12;
	return `${hour12Value} ${period}`;
}

export type MonthCell = {
	date: string;
	day: number;
	inMonth: boolean;
};

export function monthGrid(isoDate: string): MonthCell[] {
	const [year, month] = isoDate.split('-').map(Number);
	const first = new Date(year, month - 1, 1);
	const start = new Date(year, month - 1, 1 - first.getDay());
	const cells: MonthCell[] = [];

	for (let i = 0; i < 42; i++) {
		const date = new Date(start);
		date.setDate(start.getDate() + i);
		cells.push({
			date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
			day: date.getDate(),
			inMonth: date.getMonth() === month - 1,
		});
	}

	const lastWeekOutOfMonth = cells.slice(35).every((cell) => !cell.inMonth);
	return lastWeekOutOfMonth ? cells.slice(0, 35) : cells;
}

export function weekdayLabels(): string[] {
	return Array.from({ length: 7 }, (_, index) =>
		new Date(2026, 7, 2 + index).toLocaleDateString(undefined, { weekday: 'short' }),
	);
}
