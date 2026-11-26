// CR-025: what the host gives the server of Agentico. Who asks (from its own sign-in), where it keeps documents that
// are not secret, and where it keeps secrets. Everything else (connections, runners, memories, projects) is the
// package's.

/**
 * What a person may do:
 * - `platform`: the runners and memories of the project, and which runner and memory each namespace uses;
 * - `admin`: the cloud connections of their namespace;
 * - `member`: use them (models, runner, memory).
 */
export type AgenticoRole = 'platform' | 'admin' | 'member';

/** Who asks, as the host knows it from its own sign-in. */
export interface AgenticoIdentity {
    user: { id: string; name?: string };
    role: AgenticoRole;
    /** The project of the host (`crm`, `cms`, `playbook`): lowercase letters and digits, no hyphen. */
    project: string;
    /** The tenant inside a multi-tenant project; absent for a project with one tenant. */
    tenant?: string;
}

/** Documents that are not secret, by collection; every document carries its own `id`. */
export interface AgenticoRecords {
    get<T extends { id: string }>(collection: string, id: string): Promise<T | null>;
    list<T extends { id: string }>(collection: string): Promise<T[]>;
    put<T extends { id: string }>(collection: string, record: T): Promise<void>;
    delete(collection: string, id: string): Promise<void>;
}

/** Secrets by name (keys of runners and providers, keys of memories): never in a document, an answer or a log. */
export interface AgenticoSecrets {
    get(name: string): Promise<string | null>;
    set(name: string, value: string): Promise<void>;
    delete(name: string): Promise<void>;
}

/** A tenant of the project the host knows (the tenants of a CMS): listed in Projects even before it has a runner. */
export type AgenticoKnownTenant = { id: string; name?: string };
