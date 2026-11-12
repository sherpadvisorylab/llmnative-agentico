// CR-019: the events of the host in a chat: read for a span of time, read again when the host says so, shown as
// compact cards with who did it in the column on the left. The model never reads them.
import React, { useEffect, useState } from 'react';
import { Badge, ChatMarkdown, Icon, useI18n } from '@llmnative/react';
import { useAgentico } from './AgenticoContext';
import { ChatAvatar } from './AgentActivityLog';
import type { ThreadEvent } from '../domain/threadEvents';
import { useAgenticoI18n } from '../i18n';

/** Where the person's choice to see the events or not is kept (this browser only). */
export const THREAD_EVENTS_STORAGE_KEY = 'llmnative.agentico.threadEvents';

/** Whether the events are shown (the filter in the header of the panel): on unless the person turned them off. */
export function useShowThreadEvents(): [boolean, (show: boolean) => void] {
    const [show, setShow] = useState(() => {
        try { return localStorage.getItem(THREAD_EVENTS_STORAGE_KEY) !== 'off'; } catch { return true; }
    });
    const set = (next: boolean) => {
        setShow(next);
        try { localStorage.setItem(THREAD_EVENTS_STORAGE_KEY, next ? 'on' : 'off'); } catch { /* not kept: fine */ }
    };
    return [show, set];
}

/** The events of `thread` from `from` to `to`, as the host has them; none without a source or a thread. */
export function useThreadEvents(thread: string | undefined, from: number, to: number, enabled = true): ThreadEvent[] {
    const { threadEvents } = useAgentico();
    const [events, setEvents] = useState<ThreadEvent[]>([]);
    useEffect(() => {
        if (!threadEvents || !thread || !enabled) {
            setEvents([]);
            return;
        }
        let live = true;
        const read = () => {
            void Promise.resolve(threadEvents.load(thread, from, to)).then(
                (list) => { if (live) setEvents(list.filter((event) => event.at >= from && event.at < to)); },
                () => undefined,
            );
        };
        read();
        const stop = threadEvents.subscribe?.(thread, read);
        return () => { live = false; stop?.(); };
    }, [threadEvents, thread, from, to, enabled]);
    return events;
}

/** One event: who did it in the column on the left, what happened next to their name, its time; opened, what it said. */
export function ThreadEventCard({ event }: { event: ThreadEvent }) {
    const t = useAgenticoI18n();
    const { locale } = useI18n();
    const [open, setOpen] = useState(false);
    const time = new Date(event.at).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' });
    return (
        <li className="flex items-start gap-2 py-1 text-xs" aria-label={`${event.author.name}: ${event.title}`}>
            <span className="flex w-6 shrink-0 justify-center pt-px"><ChatAvatar author={event.author} /></span>
            <div className="min-w-0 flex-1 rounded-md border border-border/60 bg-muted/30 px-2 py-1">
                <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    <span className="font-medium text-foreground">{event.author.name}</span>
                    {event.icon && <Icon name={event.icon} size={12} className="shrink-0 text-muted-foreground" />}
                    <span className="min-w-0 break-words text-muted-foreground">{event.title}</span>
                    {event.badge && <Badge variant={event.badge.variant ?? 'light'}>{event.badge.label}</Badge>}
                    <span className="ms-auto flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                        <time dateTime={new Date(event.at).toISOString()}>{time}</time>
                        {event.body && (
                            <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} title={open ? t.eventLess : t.eventMore} className="rounded hover:text-foreground">
                                <Icon name={open ? 'chevron-up' : 'chevron-down'} size={12} />
                            </button>
                        )}
                        {event.href && (
                            <a href={event.href} target="_blank" rel="noreferrer" title={t.eventOpen} aria-label={t.eventOpen} className="rounded hover:text-foreground">
                                <Icon name="external-link" size={12} />
                            </a>
                        )}
                    </span>
                </div>
                {open && event.body && <ChatMarkdown content={event.body} tone="muted" className="mt-1 break-words text-xs leading-relaxed" />}
            </div>
        </li>
    );
}
