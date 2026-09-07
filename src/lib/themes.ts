import type { CustomTheme, Settings, ThemeTokens } from './types';

export const THEME_CACHE_KEY = 'time-blocker-theme-cache';

export type ThemeCache =
	| { kind: 'system' }
	| { kind: 'light' }
	| { kind: 'dark' }
	| { kind: 'custom'; tokens: ThemeTokens };

export const TOKEN_VARS: [keyof ThemeTokens, string[]][] = [
	['ink', ['--ink', '--text']],
	['body', ['--body', '--text-secondary']],
	['mute', ['--mute', '--text-muted']],
	['hairline', ['--hairline', '--border']],
	['hairlineStrong', ['--hairline-strong']],
	['canvas', ['--canvas', '--surface']],
	['canvasSoft', ['--canvas-soft', '--surface-muted']],
	['canvasSoft2', ['--canvas-soft-2', '--surface-inset']],
	['primary', ['--primary']],
	['onPrimary', ['--on-primary']],
	['accent', ['--link', '--accent']],
	['accentDeep', ['--link-deep']],
	['error', ['--error']],
	['errorSoft', ['--error-soft']],
	['successSoft', ['--success-soft']],
	['activeSoft', ['--active-soft', '--active-fill']],
];

export const LIGHT_TOKENS: ThemeTokens = {
	ink: '#171717',
	body: '#4d4d4d',
	mute: '#888888',
	hairline: '#ebebeb',
	hairlineStrong: '#a1a1a1',
	canvas: '#ffffff',
	canvasSoft: '#fafafa',
	canvasSoft2: '#f5f5f5',
	primary: '#171717',
	onPrimary: '#ffffff',
	accent: '#0070f3',
	accentDeep: '#0761d1',
	error: '#ee0000',
	errorSoft: '#f7d4d6',
	successSoft: '#d3e5ff',
	activeSoft: '#eef6ff',
};

export const DARK_TOKENS: ThemeTokens = {
	ink: '#ededed',
	body: '#a1a1a1',
	mute: '#737373',
	hairline: '#2e2e2e',
	hairlineStrong: '#525252',
	canvas: '#0a0a0a',
	canvasSoft: '#111111',
	canvasSoft2: '#1a1a1a',
	primary: '#ededed',
	onPrimary: '#0a0a0a',
	accent: '#3291ff',
	accentDeep: '#0070f3',
	error: '#ff5555',
	errorSoft: '#3a1f1f',
	successSoft: '#1a2a3a',
	activeSoft: '#132033',
};

export interface ThemePreset {
	id: string;
	name: string;
	tokens: ThemeTokens;
}

export const THEME_PRESETS: ThemePreset[] = [
	{
		id: 'paper',
		name: 'Paper',
		tokens: {
			ink: '#2a241c',
			body: '#5c5348',
			mute: '#8a8074',
			hairline: '#e6dccf',
			hairlineStrong: '#b5a894',
			canvas: '#fffaf3',
			canvasSoft: '#f7f1e8',
			canvasSoft2: '#efe6d8',
			primary: '#2a241c',
			onPrimary: '#fffaf3',
			accent: '#8a5a2b',
			accentDeep: '#6d4520',
			error: '#b42318',
			errorSoft: '#f8d5d0',
			successSoft: '#e7eedc',
			activeSoft: '#f3ead9',
		},
	},
	{
		id: 'ocean',
		name: 'Ocean',
		tokens: {
			ink: '#1c2a32',
			body: '#4a5d68',
			mute: '#7b8d96',
			hairline: '#d7e1e6',
			hairlineStrong: '#8aa0ab',
			canvas: '#ffffff',
			canvasSoft: '#f3f6f8',
			canvasSoft2: '#e7eef2',
			primary: '#1c2a32',
			onPrimary: '#f3f6f8',
			accent: '#2b6e8a',
			accentDeep: '#1f5368',
			error: '#c23a3a',
			errorSoft: '#f3d4d4',
			successSoft: '#d4e8ef',
			activeSoft: '#e4f1f6',
		},
	},
	{
		id: 'forest',
		name: 'Forest',
		tokens: {
			ink: '#e8f0ea',
			body: '#a8bfb0',
			mute: '#6f8678',
			hairline: '#24332a',
			hairlineStrong: '#3d5446',
			canvas: '#101612',
			canvasSoft: '#0f1612',
			canvasSoft2: '#1a2420',
			primary: '#e8f0ea',
			onPrimary: '#101612',
			accent: '#6fbf93',
			accentDeep: '#4d9a72',
			error: '#ef7a70',
			errorSoft: '#3a2422',
			successSoft: '#1d3328',
			activeSoft: '#173024',
		},
	},
	{
		id: 'midnight',
		name: 'Midnight',
		tokens: {
			ink: '#e8eef4',
			body: '#9aabc0',
			mute: '#6b7c90',
			hairline: '#1c2733',
			hairlineStrong: '#3a4b5e',
			canvas: '#0b0f14',
			canvasSoft: '#0e141b',
			canvasSoft2: '#17202a',
			primary: '#e8eef4',
			onPrimary: '#0b0f14',
			accent: '#7aa2d4',
			accentDeep: '#5b86b8',
			error: '#f07178',
			errorSoft: '#3a2226',
			successSoft: '#1b2d3f',
			activeSoft: '#152433',
		},
	},
];

export function cloneTokens(tokens: ThemeTokens): ThemeTokens {
	return { ...tokens };
}

export function applyTokensToElement(el: HTMLElement, tokens: ThemeTokens): void {
	for (const [key, vars] of TOKEN_VARS) {
		const value = tokens[key];
		for (const cssVar of vars) {
			el.style.setProperty(cssVar, value);
		}
	}
}

export function clearThemeVars(el: HTMLElement): void {
	for (const [, vars] of TOKEN_VARS) {
		for (const cssVar of vars) {
			el.style.removeProperty(cssVar);
		}
	}
}

export function resolveThemeTokens(
	themeId: string,
	customThemes: CustomTheme[],
): ThemeTokens | null {
	if (themeId === 'light') return LIGHT_TOKENS;
	if (themeId === 'dark') return DARK_TOKENS;
	const preset = THEME_PRESETS.find((item) => item.id === themeId);
	if (preset) return preset.tokens;
	if (themeId.startsWith('custom:')) {
		const id = themeId.slice('custom:'.length);
		const custom = customThemes.find((item) => item.id === id);
		return custom?.tokens ?? null;
	}
	return null;
}

export function themeCacheFor(themeId: string, customThemes: CustomTheme[]): ThemeCache {
	if (themeId === 'light' || themeId === 'dark') return { kind: themeId };
	if (themeId === 'system') return { kind: 'system' };
	const tokens = resolveThemeTokens(themeId, customThemes);
	if (!tokens) return { kind: 'system' };
	return { kind: 'custom', tokens };
}

export function applyTheme(themeId: string, customThemes: CustomTheme[]): void {
	const root = document.documentElement;
	const cache = themeCacheFor(themeId, customThemes);

	if (cache.kind === 'system') {
		root.removeAttribute('data-theme');
		clearThemeVars(root);
	} else if (cache.kind === 'light' || cache.kind === 'dark') {
		root.setAttribute('data-theme', cache.kind);
		clearThemeVars(root);
	} else {
		root.setAttribute('data-theme', 'custom');
		applyTokensToElement(root, cache.tokens);
	}

	try {
		localStorage.setItem(THEME_CACHE_KEY, JSON.stringify(cache));
	} catch {
		/* ignore quota */
	}
}

export function currentTokensSnapshot(settings: Settings): ThemeTokens {
	if (settings.themeId === 'system') {
		const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
		return dark ? DARK_TOKENS : LIGHT_TOKENS;
	}
	return resolveThemeTokens(settings.themeId, settings.customThemes) ?? LIGHT_TOKENS;
}

export const TOKEN_FIELDS: { key: keyof ThemeTokens; label: string }[] = [
	{ key: 'canvasSoft', label: 'Page background' },
	{ key: 'canvas', label: 'Card surface' },
	{ key: 'canvasSoft2', label: 'Inset surface' },
	{ key: 'ink', label: 'Primary text' },
	{ key: 'body', label: 'Secondary text' },
	{ key: 'mute', label: 'Muted text' },
	{ key: 'hairline', label: 'Borders' },
	{ key: 'primary', label: 'Buttons' },
	{ key: 'onPrimary', label: 'Button text' },
	{ key: 'accent', label: 'Accent' },
	{ key: 'activeSoft', label: 'Active block' },
];
