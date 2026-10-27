// The width of the Agentico column (CR-005): resizable by dragging its inner edge, clamped between
// a minimum and a maximum, remembered per browser. The framework has no splitter, so the handle is
// here (AgenticoResizeHandle in Agentico.tsx); this file holds the arithmetic and the storage.
import { useCallback, useEffect, useState } from 'react';

/** Default width of the panel, in px. Also the `rightInset` a host can give a Modal that must leave it room. */
export const AGENTICO_WIDTH = 420;
/** Default minimum width of the panel, in px. */
export const AGENTICO_MIN_WIDTH = 320;
/** Default maximum width of the panel: a share of the viewport. */
export const AGENTICO_MAX_WIDTH = '60vw';
/** Where the width chosen by the person is kept, per browser. */
export const AGENTICO_WIDTH_STORAGE_KEY = 'agentico:panel-width';
/** One arrow key press, in px (with Shift: four times as much). */
export const AGENTICO_WIDTH_STEP = 16;

/** A width in px, or a share of the viewport (`'60vw'`). */
export type AgenticoPanelSize = number | `${number}vw`;

/** A size in px: a number as it is, `'<n>vw'` as that share of `viewportWidth`. */
export function resolvePanelSize(size: AgenticoPanelSize, viewportWidth: number): number {
    if (typeof size === 'number') return size;
    const share = Number.parseFloat(size);
    return Number.isFinite(share) ? Math.round((share / 100) * viewportWidth) : Number.POSITIVE_INFINITY;
}

/** `width` kept between `min` and `max` (a max below the min gives way to the min). */
export function clampPanelWidth(width: number, min: number, max: number): number {
    return Math.round(Math.min(Math.max(width, min), Math.max(min, max)));
}

function readStoredWidth(): number | null {
    try {
        const raw = window.localStorage.getItem(AGENTICO_WIDTH_STORAGE_KEY);
        const value = raw === null ? Number.NaN : Number(raw);
        return Number.isFinite(value) && value > 0 ? value : null;
    } catch {
        return null;
    }
}

function writeStoredWidth(width: number | null): void {
    try {
        if (width === null) window.localStorage.removeItem(AGENTICO_WIDTH_STORAGE_KEY);
        else window.localStorage.setItem(AGENTICO_WIDTH_STORAGE_KEY, String(width));
    } catch {
        // Private window or blocked storage: the width just is not remembered.
    }
}

function viewportWidth(): number {
    return typeof window === 'undefined' ? Number.POSITIVE_INFINITY : window.innerWidth;
}

export interface PanelWidthOptions {
    defaultWidth?: number;
    minWidth?: number;
    maxWidth?: AgenticoPanelSize;
    onWidthChange?: (width: number) => void;
}

/** The width of the panel: the stored one or the default, clamped to the current viewport. `set`
 * changes it (clamped), `commit` stores it, `reset` goes back to the default and forgets it. */
export function usePanelWidth({ defaultWidth = AGENTICO_WIDTH, minWidth = AGENTICO_MIN_WIDTH, maxWidth = AGENTICO_MAX_WIDTH, onWidthChange }: PanelWidthOptions) {
    const [viewport, setViewport] = useState(viewportWidth);
    const [chosen, setChosen] = useState<number>(() => readStoredWidth() ?? defaultWidth);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const handleResize = () => setViewport(window.innerWidth);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const min = minWidth;
    const max = Math.max(min, resolvePanelSize(maxWidth, viewport));
    const width = clampPanelWidth(chosen, min, max);

    useEffect(() => { onWidthChange?.(width); }, [width]); // eslint-disable-line react-hooks/exhaustive-deps

    const set = useCallback((next: number) => setChosen(clampPanelWidth(next, min, max)), [min, max]);
    const commit = useCallback((next: number) => writeStoredWidth(clampPanelWidth(next, min, max)), [min, max]);
    const reset = useCallback(() => { setChosen(defaultWidth); writeStoredWidth(null); }, [defaultWidth]);

    return { width, min, max, set, commit, reset };
}
