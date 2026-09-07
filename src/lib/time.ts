export const MINUTES_IN_DAY = 24 * 60;
export const DEFAULT_DAY_START = '08:00';
export const DEFAULT_DAY_END = '18:00';
export const DEFAULT_DURATION_HOURS = 0.5;
export const MIN_DURATION_MINUTES = 15;

export function pad2(n: number): string {
	return String(n).padStart(2, '0');
}

export function parseHHmm(value: string): number | null {
	const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
	if (!match) return null;
	const hours = Number(match[1]);
	const minutes = Number(match[2]);
	if (hours === 24 && minutes === 0) return MINUTES_IN_DAY;
	if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
	return hours * 60 + minutes;
}

export function formatHHmm(totalMinutes: number): string {
	if (totalMinutes >= MINUTES_IN_DAY) return '24:00';
	const wrapped = ((totalMinutes % MINUTES_IN_DAY) + MINUTES_IN_DAY) % MINUTES_IN_DAY;
	const hours = Math.floor(wrapped / 60);
	const minutes = wrapped % 60;
	return `${pad2(hours)}:${pad2(minutes)}`;
}

export function formatDisplayTime(hhmm: string, hour12: boolean): string {
	const minutes = parseHHmm(hhmm);
	if (minutes == null) return hhmm;
	if (!hour12) return minutes === MINUTES_IN_DAY ? '24:00' : formatHHmm(minutes);
	if (minutes === MINUTES_IN_DAY) return '12:00 AM';
	const hours = Math.floor(minutes / 60);
	const mins = minutes % 60;
	const period = hours >= 12 ? 'PM' : 'AM';
	const hour12Value = hours % 12 === 0 ? 12 : hours % 12;
	return `${hour12Value}:${pad2(mins)} ${period}`;
}

export function hoursToMinutes(hours: number): number {
	return Math.round(hours * 60);
}

export function minutesToHours(minutes: number): number {
	return Math.round((minutes / 60) * 100) / 100;
}

export function parseHoursInput(value: string): number | null {
	const trimmed = value.trim();
	if (!trimmed) return null;
	const hours = Number(trimmed);
	if (!Number.isFinite(hours) || hours <= 0) return null;
	return hours;
}

export function formatDuration(minutes: number): string {
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	if (rest === 0) return hours === 1 ? '1h' : `${hours}h`;
	return `${hours}h ${rest}m`;
}

export function blockDurationMinutes(startTime: string, endTime: string): number {
	const start = parseHHmm(startTime);
	const end = parseHHmm(endTime);
	if (start == null || end == null) return 0;
	return Math.max(0, end - start);
}

export function toISODate(date: Date): string {
	return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function todayISO(): string {
	return toISODate(new Date());
}

export function addDays(isoDate: string, delta: number): string {
	const [year, month, day] = isoDate.split('-').map(Number);
	const date = new Date(year, month - 1, day);
	date.setDate(date.getDate() + delta);
	return toISODate(date);
}

export function formatLongDate(isoDate: string): string {
	const [year, month, day] = isoDate.split('-').map(Number);
	return new Date(year, month - 1, day).toLocaleDateString(undefined, {
		weekday: 'long',
		month: 'long',
		day: 'numeric',
		year: 'numeric',
	});
}

export function formatMonth(isoDate: string): string {
	const [year, month] = isoDate.split('-').map(Number);
	return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
		month: 'long',
		year: 'numeric',
	});
}

export function addMonths(isoDate: string, delta: number): string {
	const [year, month, day] = isoDate.split('-').map(Number);
	const cursor = new Date(year, month - 1 + delta, 1);
	const daysInTarget = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
	return toISODate(new Date(cursor.getFullYear(), cursor.getMonth(), Math.min(day, daysInTarget)));
}

export function nowMinutes(): number {
	const now = new Date();
	return now.getHours() * 60 + now.getMinutes();
}

export function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
	return aStart < bEnd && bStart < aEnd;
}

export function isToday(isoDate: string): boolean {
	return isoDate === todayISO();
}

export const DURATION_CHIPS: { label: string; hours: number }[] = [
	{ label: '15m', hours: 0.25 },
	{ label: '30m', hours: 0.5 },
	{ label: '45m', hours: 0.75 },
	{ label: '1h', hours: 1 },
	{ label: '1.5h', hours: 1.5 },
	{ label: '2h', hours: 2 },
];

export type TimeParts = {
	hour: number;
	minute: number;
	period: 'AM' | 'PM';
};

export function splitTime(hhmm: string, hour12: boolean): TimeParts {
	const total = parseHHmm(hhmm) ?? 0;
	const capped = total >= MINUTES_IN_DAY ? 0 : total;
	const hour24 = Math.floor(capped / 60);
	const minute = capped % 60;
	const period: 'AM' | 'PM' = hour24 >= 12 ? 'PM' : 'AM';
	if (!hour12) {
		return { hour: total >= MINUTES_IN_DAY ? 24 : hour24, minute, period };
	}
	const hour = hour24 % 12 === 0 ? 12 : hour24 % 12;
	return { hour, minute, period };
}

export function joinTime(parts: TimeParts, hour12: boolean): string | null {
	const minute = parts.minute;
	if (minute < 0 || minute > 59) return null;
	if (!hour12) {
		if (parts.hour === 24 && minute === 0) return '24:00';
		if (parts.hour < 0 || parts.hour > 23) return null;
		return formatHHmm(parts.hour * 60 + minute);
	}
	if (parts.hour < 1 || parts.hour > 12) return null;
	let hour24 = parts.hour % 12;
	if (parts.period === 'PM') hour24 += 12;
	return formatHHmm(hour24 * 60 + minute);
}
