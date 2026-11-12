// CR-018: the sessions of one chat. Above the open session, the earlier ones of the same chat
// (SubagentManifest.thread), read-only, one more each time the person scrolls to the top (or presses the
// button there). Each session keeps its own context: the model reads only the open one.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActionButton, interpolate, useI18n } from '@llmnative/react';
import { AgentActivityLog } from './AgentActivityLog';
import { useThreadEvents } from './ThreadEvents';
import { earlierSessions } from '../domain/chatThread';
import { chatStartedAt, chatTitle, onEntityChatsChange, type EntityChatSnapshot } from '../domain/entityChatStore';
import { findSubagentManifest } from '../domain/subagentRegistry';
import { useAgenticoI18n } from '../i18n';

/** The line that opens a session: its title and when it started, and what to do with it. */
function SessionSeparator({ title, meta, action }: { title: string; meta?: string; action?: React.ReactNode }) {
    return (
        <div role="separator" aria-label={title} className="my-3 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            <span className="flex min-w-0 max-w-[75%] flex-col items-center text-center">
                <span className="max-w-full truncate font-medium text-foreground">{title}</span>
                {meta && <span>{meta}</span>}
                {action}
            </span>
            <span className="h-px flex-1 bg-border" />
        </div>
    );
}

/** An earlier session, read-only, with what happened from the last message of the session before it to its own. */
function SessionLog({ chat, thread, from, showEvents }: { chat: EntityChatSnapshot; thread: string; from: number; showEvents: boolean }) {
    const events = useThreadEvents(thread, from, chat.savedAt, showEvents);
    return (
        <AgentActivityLog
            activity={chat.activity}
            pinUserMessages={false}
            speaker={findSubagentManifest(chat.subagentId)?.speaker?.(chat.params)}
            events={events}
        />
    );
}

export function EarlierSessions({ scopeId, thread, taskId, scrollRef, onLoad, onContinue, busy = false, showEvents = true }: {
    scopeId: string;
    /** The chat the open one is a session of. */
    thread: string;
    /** The task of the open session: left out, and only the sessions started before it. */
    taskId: string;
    /** The scrolling body of the panel: its position stays where it was when a session is added above. */
    scrollRef: React.RefObject<HTMLDivElement | null>;
    /** Called before a session is added above (the panel stops following the bottom). */
    onLoad?: () => void;
    /** Takes up an earlier session. */
    onContinue: (chat: EntityChatSnapshot) => void;
    /** A turn of the open session runs: it is not left meanwhile. */
    busy?: boolean;
    /** CR-019: the events of the host among the messages (the filter of the header). */
    showEvents?: boolean;
}) {
    const t = useAgenticoI18n();
    const { locale } = useI18n();
    // Read again when a chat is saved, renamed, synced or removed.
    const [version, setVersion] = useState(0);
    useEffect(() => onEntityChatsChange(() => setVersion((count) => count + 1)), []);
    const sessions = useMemo(() => earlierSessions(scopeId, thread, taskId), [scopeId, thread, taskId, version]);
    const [shown, setShown] = useState(0);
    useEffect(() => setShown(0), [taskId, thread]);
    const more = shown < sessions.length;

    // Where the content was before a session was added above: the same text stays in view.
    const anchor = useRef<{ height: number; top: number } | null>(null);
    const load = () => {
        const el = scrollRef.current;
        if (el) anchor.current = { height: el.scrollHeight, top: el.scrollTop };
        onLoad?.();
        setShown((count) => Math.min(count + 1, sessions.length));
    };
    const loadRef = useRef(load);
    loadRef.current = load;
    useLayoutEffect(() => {
        const el = scrollRef.current;
        const before = anchor.current;
        anchor.current = null;
        if (el && before) el.scrollTop = before.top + (el.scrollHeight - before.height);
    }, [shown, scrollRef]);

    // Scrolling up to the top loads the session before: only after the person scrolled up, never by
    // itself when the open session is short.
    const sentinelRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        const el = scrollRef.current;
        const sentinel = sentinelRef.current;
        if (!el || !sentinel || !more || typeof IntersectionObserver === 'undefined') return;
        let last = el.scrollTop;
        let scrolledUp = false;
        const onScroll = () => {
            if (el.scrollTop < last) scrolledUp = true;
            last = el.scrollTop;
        };
        el.addEventListener('scroll', onScroll, { passive: true });
        const observer = new IntersectionObserver((seen) => {
            if (scrolledUp && seen.some((entry) => entry.isIntersecting)) {
                scrolledUp = false;
                loadRef.current();
            }
        }, { root: el, rootMargin: '40px 0px 0px 0px' });
        observer.observe(sentinel);
        return () => { el.removeEventListener('scroll', onScroll); observer.disconnect(); };
    }, [scrollRef, more, shown]);

    if (!sessions.length) return null;
    const when = (at: number) => new Date(at).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
    // The oldest loaded at the top, the one just before the open session right above it.
    const visible = sessions.slice(0, shown).reverse();
    // CR-019: each session has what happened from the last message of the one before it.
    const fromOf = (chat: EntityChatSnapshot) => {
        const older = sessions[sessions.indexOf(chat) + 1];
        return older ? older.savedAt : chatStartedAt(chat);
    };
    return (
        <div>
            {more && (
                <div ref={sentinelRef} className="flex justify-center pb-1">
                    <ActionButton icon="history" label={t.earlierSession} variant="link" className="text-xs" onClick={load} />
                </div>
            )}
            {visible.map((chat) => (
                <section key={`${chat.subagentId}:${chat.entityId}`} aria-label={chatTitle(chat)}>
                    <SessionSeparator
                        title={chatTitle(chat)}
                        meta={interpolate(t.sessionOf, { at: when(chatStartedAt(chat)) })}
                        action={<ActionButton label={t.continueSession} variant="link" className="text-[11px]" disabled={busy} onClick={() => onContinue(chat)} />}
                    />
                    {/* Read-only: no questions to answer, no Retry or Edit. */}
                    <SessionLog chat={chat} thread={thread} from={fromOf(chat)} showEvents={showEvents} />
                </section>
            ))}
            {shown > 0 && <SessionSeparator title={t.thisSession} />}
        </div>
    );
}
