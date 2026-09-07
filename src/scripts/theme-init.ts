import type { ThemeCache } from '../lib/themes';
import { THEME_CACHE_KEY, applyTokensToElement } from '../lib/themes';

/** Inline in head to prevent theme flash */
export function themeInitScript(): string {
	return `(function(){try{var raw=localStorage.getItem(${JSON.stringify(THEME_CACHE_KEY)});if(!raw)return;var c=JSON.parse(raw);var d=document.documentElement;if(!c||!c.kind)return;if(c.kind==='light'||c.kind==='dark'){d.setAttribute('data-theme',c.kind);return;}if(c.kind==='custom'&&c.tokens){d.setAttribute('data-theme','custom');var t=c.tokens;var map=[['--ink',t.ink],['--body',t.body],['--mute',t.mute],['--hairline',t.hairline],['--hairline-strong',t.hairlineStrong],['--canvas',t.canvas],['--canvas-soft',t.canvasSoft],['--canvas-soft-2',t.canvasSoft2],['--primary',t.primary],['--on-primary',t.onPrimary],['--link',t.accent],['--link-deep',t.accentDeep],['--error',t.error],['--error-soft',t.errorSoft],['--success-soft',t.successSoft],['--active-soft',t.activeSoft],['--surface',t.canvas],['--surface-muted',t.canvasSoft],['--surface-inset',t.canvasSoft2],['--text',t.ink],['--text-secondary',t.body],['--text-muted',t.mute],['--border',t.hairline],['--accent',t.accent],['--active-fill',t.activeSoft]];for(var i=0;i<map.length;i++){d.style.setProperty(map[i][0],map[i][1]);}}}catch(e){}})();`;
}

export function readThemeCache(): ThemeCache | null {
	try {
		const raw = localStorage.getItem(THEME_CACHE_KEY);
		if (!raw) return null;
		return JSON.parse(raw) as ThemeCache;
	} catch {
		return null;
	}
}

export { applyTokensToElement };
