export type BlockStatus = 'pending' | 'in-progress' | 'completed';

export interface Subtask {
	id: string;
	title: string;
	completed: boolean;
	order: number;
}

export interface TimeBlock {
	id: string;
	startTime: string;
	endTime: string;
	task: string;
	color?: string;
	subtasks: Subtask[];
	status: BlockStatus;
	createdAt: string;
	updatedAt: string;
}

export interface DayPlan {
	date: string;
	blocks: TimeBlock[];
}

export type PlansByDate = Record<string, DayPlan>;

export interface ThemeTokens {
	ink: string;
	body: string;
	mute: string;
	hairline: string;
	hairlineStrong: string;
	canvas: string;
	canvasSoft: string;
	canvasSoft2: string;
	primary: string;
	onPrimary: string;
	accent: string;
	accentDeep: string;
	error: string;
	errorSoft: string;
	successSoft: string;
	activeSoft: string;
}

export interface CustomTheme {
	id: string;
	name: string;
	tokens: ThemeTokens;
}

export type PlannerView = 'list' | 'day' | 'month';

export interface Settings {
	hour12: boolean;
	themeId: string;
	customThemes: CustomTheme[];
	dayStart: string;
	dayEnd: string;
	view: PlannerView;
}

export type EditTarget =
	| { type: 'task'; blockId: string }
	| { type: 'subtask'; blockId: string; subtaskId: string }
	| { type: 'start'; blockId: string }
	| { type: 'end'; blockId: string }
	| { type: 'hours'; blockId: string };

export type DialogState = { type: 'delete-block'; blockId: string } | null;

export interface ComposerState {
	open: boolean;
	hours: string;
	startTime: string;
	error: string | null;
}

export interface ThemeEditorState {
	mode: 'create' | 'edit';
	id?: string;
	name: string;
	tokens: ThemeTokens;
}

export interface UiState {
	selectedBlockId: string | null;
	menuBlockId: string | null;
	editing: EditTarget | null;
	dialog: DialogState;
	settingsOpen: boolean;
	shortcutsOpen: boolean;
	headerMenu: 'io' | 'theme' | null;
	themeEditor: ThemeEditorState | null;
	composer: ComposerState;
	focus: string | null;
	notice: string | null;
	nowMinutes: number;
	dragOverBlockId: string | null;
	dragOverSubtaskId: string | null;
}
