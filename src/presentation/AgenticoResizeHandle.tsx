import React, { useRef, useState } from 'react';
import { AGENTICO_WIDTH_STEP } from './panelWidth';
import { useAgenticoI18n } from '../i18n';

/** The inner edge of the Agentico column (CR-005), the one facing the page: dragged with the
 * pointer it resizes the panel; focused, the arrow keys do (Shift for bigger steps, Home/End for
 * the minimum/maximum); a double click goes back to the default width. The framework has no
 * splitter primitive, so this one is drawn with theme tokens only: a thin line in the primary
 * colour on hover, focus and while dragging. The panel sits on the right, so moving the edge to
 * the left makes it wider. */
export function AgenticoResizeHandle({ width, min, max, onResize, onCommit, onReset }: {
    width: number;
    min: number;
    max: number;
    /** A new width while it changes (clamped by the caller). */
    onResize: (width: number) => void;
    /** The width the person settled on: stored. */
    onCommit: (width: number) => void;
    onReset: () => void;
}) {
    const t = useAgenticoI18n();
    const drag = useRef<{ pointerId: number; startX: number; startWidth: number; last: number } | null>(null);
    const [dragging, setDragging] = useState(false);
    const clamp = (value: number) => Math.round(Math.min(Math.max(value, min), Math.max(min, max)));

    const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
        const current = drag.current;
        if (!current || current.pointerId !== event.pointerId) return;
        drag.current = null;
        setDragging(false);
        document.body.style.removeProperty('cursor');
        document.body.style.removeProperty('user-select');
        try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* already released */ }
        onCommit(current.last);
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        const step = event.shiftKey ? AGENTICO_WIDTH_STEP * 4 : AGENTICO_WIDTH_STEP;
        let next: number | null = null;
        if (event.key === 'ArrowLeft') next = width + step;
        else if (event.key === 'ArrowRight') next = width - step;
        else if (event.key === 'Home') next = min;
        else if (event.key === 'End') next = max;
        if (next === null) return;
        event.preventDefault();
        const clamped = clamp(next);
        onResize(clamped);
        onCommit(clamped);
    };

    return (
        <div
            role="separator"
            aria-orientation="vertical"
            aria-label={t.resizePanel}
            aria-valuenow={width}
            aria-valuemin={min}
            aria-valuemax={max}
            tabIndex={0}
            title={t.resizePanelHint}
            data-dragging={dragging || undefined}
            className="group absolute inset-y-0 -left-1 z-30 flex w-2 cursor-col-resize touch-none select-none justify-center outline-none"
            onPointerDown={(event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                drag.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: width, last: width };
                setDragging(true);
                document.body.style.cursor = 'col-resize';
                document.body.style.userSelect = 'none';
                try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* not supported */ }
            }}
            onPointerMove={(event) => {
                const current = drag.current;
                if (!current || current.pointerId !== event.pointerId) return;
                current.last = clamp(current.startWidth + (current.startX - event.clientX));
                onResize(current.last);
            }}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onLostPointerCapture={endDrag}
            onDoubleClick={onReset}
            onKeyDown={handleKeyDown}
        >
            <span
                aria-hidden
                className={`h-full w-0.5 transition-colors ${dragging ? 'bg-primary' : 'bg-transparent group-hover:bg-primary/50 group-focus-visible:bg-primary'}`}
            />
        </div>
    );
}
