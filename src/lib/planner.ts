import { createId } from './ids';
import type { DayPlan, Subtask, TimeBlock } from './types';
import {
	MIN_DURATION_MINUTES,
	MINUTES_IN_DAY,
	blockDurationMinutes,
	formatHHmm,
	hoursToMinutes,
	parseHHmm,
	rangesOverlap,
} from './time';

const PAST_MIDNIGHT_MESSAGE = 'This block would extend past midnight.';
const DURATION_MESSAGE = 'Duration must be at least 15 minutes.';
const ORDER_MESSAGE = 'End time must be after start time.';

export type TimeChangeError = string;

export function sortBlocks(blocks: TimeBlock[]): TimeBlock[] {
	return [...blocks].sort((a, b) => {
		const aStart = parseHHmm(a.startTime) ?? 0;
		const bStart = parseHHmm(b.startTime) ?? 0;
		return aStart - bStart;
	});
}

export function findOverlap(
	blocks: TimeBlock[],
	startMinutes: number,
	endMinutes: number,
	excludeId?: string,
): TimeBlock | undefined {
	return blocks.find((block) => {
		if (block.id === excludeId) return false;
		const start = parseHHmm(block.startTime);
		const end = parseHHmm(block.endTime);
		if (start == null || end == null) return false;
		return rangesOverlap(startMinutes, endMinutes, start, end);
	});
}

export function suggestedStartTime(blocks: TimeBlock[], dayStart: string): string {
	const sorted = sortBlocks(blocks);
	if (sorted.length === 0) return dayStart;
	return sorted[sorted.length - 1].endTime;
}

export function endFromStartAndHours(startTime: string, hours: number): string | null {
	const start = parseHHmm(startTime);
	if (start == null) return null;
	const duration = hoursToMinutes(hours);
	if (duration < MIN_DURATION_MINUTES) return null;
	const end = start + duration;
	if (end > MINUTES_IN_DAY) return null;
	return formatHHmm(end);
}

export function validateRange(
	_blocks: TimeBlock[],
	startTime: string,
	endTime: string,
	_excludeId?: string,
): TimeChangeError | null {
	const start = parseHHmm(startTime);
	const end = parseHHmm(endTime);
	if (start == null || end == null) return 'Enter a valid time.';
	if (end <= start) return ORDER_MESSAGE;
	if (end - start < MIN_DURATION_MINUTES) return DURATION_MESSAGE;
	if (end > MINUTES_IN_DAY) return PAST_MIDNIGHT_MESSAGE;
	return null;
}

export function blockOverlapsOthers(blocks: TimeBlock[], block: TimeBlock): boolean {
	const start = parseHHmm(block.startTime);
	const end = parseHHmm(block.endTime);
	if (start == null || end == null) return false;
	return Boolean(findOverlap(blocks, start, end, block.id));
}

export function validateHoursAndStart(
	blocks: TimeBlock[],
	hours: number,
	startTime: string,
	excludeId?: string,
): TimeChangeError | null {
	if (!Number.isFinite(hours) || hours <= 0) return 'Enter a duration in hours.';
	const duration = hoursToMinutes(hours);
	if (duration < MIN_DURATION_MINUTES) return DURATION_MESSAGE;
	const start = parseHHmm(startTime);
	if (start == null) return 'Enter a valid start time.';
	const end = start + duration;
	if (end > MINUTES_IN_DAY) return PAST_MIDNIGHT_MESSAGE;
	return validateRange(blocks, startTime, formatHHmm(end), excludeId);
}

function stamp(): string {
	return new Date().toISOString();
}

export function createBlock(input: {
	startTime: string;
	endTime: string;
	task?: string;
	color?: string;
}): TimeBlock {
	const now = stamp();
	return {
		id: createId(),
		startTime: input.startTime,
		endTime: input.endTime,
		task: input.task ?? '',
		color: input.color,
		subtasks: [],
		status: 'pending',
		createdAt: now,
		updatedAt: now,
	};
}

export function createSubtask(title = '', order = 0): Subtask {
	return {
		id: createId(),
		title,
		completed: false,
		order,
	};
}

export function duplicateBlock(source: TimeBlock, startTime: string, endTime: string): TimeBlock {
	const now = stamp();
	return {
		id: createId(),
		startTime,
		endTime,
		task: source.task,
		color: source.color,
		subtasks: source.subtasks.map((subtask, index) => ({
			id: createId(),
			title: subtask.title,
			completed: false,
			order: index,
		})),
		status: 'pending',
		createdAt: now,
		updatedAt: now,
	};
}

export function findNextFreeSlot(
	blocks: TimeBlock[],
	durationMinutes: number,
	preferredStart: string,
	excludeId?: string,
): { startTime: string; endTime: string } | null {
	const preferred = parseHHmm(preferredStart);
	if (preferred == null) return null;
	const occupied = sortBlocks(blocks.filter((block) => block.id !== excludeId)).map((block) => ({
		start: parseHHmm(block.startTime) ?? 0,
		end: parseHHmm(block.endTime) ?? 0,
	}));

	let cursor = preferred;
	for (const slot of occupied) {
		if (cursor + durationMinutes <= slot.start) {
			return { startTime: formatHHmm(cursor), endTime: formatHHmm(cursor + durationMinutes) };
		}
		if (cursor < slot.end) cursor = slot.end;
	}

	if (cursor + durationMinutes <= MINUTES_IN_DAY) {
		return { startTime: formatHHmm(cursor), endTime: formatHHmm(cursor + durationMinutes) };
	}
	return null;
}

export function reorderBlocks(blocks: TimeBlock[], fromId: string, beforeId: string | null): TimeBlock[] {
	const sorted = sortBlocks(blocks);
	const fromIndex = sorted.findIndex((block) => block.id === fromId);
	if (fromIndex === -1) return blocks;
	const [moved] = sorted.splice(fromIndex, 1);
	const beforeIndex = beforeId ? sorted.findIndex((block) => block.id === beforeId) : sorted.length;
	const insertAt = beforeIndex === -1 ? sorted.length : beforeIndex;
	sorted.splice(insertAt, 0, moved);

	const origin = parseHHmm(sortBlocks(blocks)[0]?.startTime ?? moved.startTime) ?? 0;
	let cursor = origin;
	const now = stamp();
	return sorted.map((block) => {
		const duration = blockDurationMinutes(block.startTime, block.endTime);
		const startTime = formatHHmm(cursor);
		const endTime = formatHHmm(cursor + duration);
		cursor += duration;
		return { ...block, startTime, endTime, updatedAt: now };
	});
}

export function reorderSubtasks(
	subtasks: Subtask[],
	fromId: string,
	beforeId: string | null,
): Subtask[] {
	const sorted = [...subtasks].sort((a, b) => a.order - b.order);
	const fromIndex = sorted.findIndex((item) => item.id === fromId);
	if (fromIndex === -1) return subtasks;
	const [moved] = sorted.splice(fromIndex, 1);
	const beforeIndex = beforeId ? sorted.findIndex((item) => item.id === beforeId) : sorted.length;
	const insertAt = beforeIndex === -1 ? sorted.length : beforeIndex;
	sorted.splice(insertAt, 0, moved);
	return sorted.map((item, index) => ({ ...item, order: index }));
}

export function withUpdatedBlock(plan: DayPlan, blockId: string, patch: Partial<TimeBlock>): DayPlan {
	return {
		...plan,
		blocks: plan.blocks.map((block) =>
			block.id === blockId ? { ...block, ...patch, updatedAt: stamp() } : block,
		),
	};
}

export function derivedStatus(
	block: TimeBlock,
	date: string,
	today: string,
	currentMinutes: number,
): TimeBlock['status'] {
	if (block.status === 'completed') return 'completed';
	if (date !== today) return 'pending';
	const start = parseHHmm(block.startTime);
	const end = parseHHmm(block.endTime);
	if (start == null || end == null) return 'pending';
	if (currentMinutes >= start && currentMinutes < end) return 'in-progress';
	return 'pending';
}

export function subtaskProgress(block: TimeBlock): { done: number; total: number } {
	const total = block.subtasks.length;
	const done = block.subtasks.filter((item) => item.completed).length;
	return { done, total };
}
