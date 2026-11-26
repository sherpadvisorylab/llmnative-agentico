// CR-025: reference adapters of the ports. In memory (tests, a try) and in JSON files of a folder, 0600 (a Node server
// that keeps its data on its disk, like the studio of Playbook). A host with a database writes its own two adapters.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AgenticoRecords, AgenticoSecrets } from './ports';

type Tables = Record<string, Record<string, { id: string }>>;

function recordsOn(read: () => Tables, write: (tables: Tables) => void): AgenticoRecords {
    return {
        async get<T extends { id: string }>(collection: string, id: string) {
            return (read()[collection]?.[id] as T | undefined) ?? null;
        },
        async list<T extends { id: string }>(collection: string) {
            return Object.values(read()[collection] ?? {}) as T[];
        },
        async put<T extends { id: string }>(collection: string, record: T) {
            const tables = read();
            tables[collection] = { ...(tables[collection] ?? {}), [record.id]: structuredClone(record) };
            write(tables);
        },
        async delete(collection: string, id: string) {
            const tables = read();
            if (!tables[collection]?.[id]) return;
            delete tables[collection][id];
            write(tables);
        },
    };
}

function secretsOn(read: () => Record<string, string>, write: (values: Record<string, string>) => void): AgenticoSecrets {
    return {
        async get(name) {
            return read()[name] ?? null;
        },
        async set(name, value) {
            write({ ...read(), [name]: value });
        },
        async delete(name) {
            const values = read();
            delete values[name];
            write(values);
        },
    };
}

/** Documents and secrets kept in memory: lost when the process ends. */
export function memoryStores(): { records: AgenticoRecords; secrets: AgenticoSecrets } {
    let tables: Tables = {};
    let values: Record<string, string> = {};
    return {
        records: recordsOn(() => structuredClone(tables), (next) => { tables = next; }),
        secrets: secretsOn(() => ({ ...values }), (next) => { values = next; }),
    };
}

function readJson<T>(file: string, empty: T): T {
    try {
        return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) as T : empty;
    } catch {
        return empty;
    }
}

function writeJson(file: string, value: unknown) {
    const temporary = `${file}.tmp`;
    writeFileSync(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
    renameSync(temporary, file);
}

/** Documents in `records.json` and secrets in `secrets.json` of a folder, both 0600: the folder stays out of git. */
export function fileStores(folder: string): { records: AgenticoRecords; secrets: AgenticoSecrets } {
    mkdirSync(folder, { recursive: true, mode: 0o700 });
    const recordsFile = join(folder, 'records.json');
    const secretsFile = join(folder, 'secrets.json');
    return {
        records: recordsOn(() => readJson<Tables>(recordsFile, {}), (tables) => writeJson(recordsFile, tables)),
        secrets: secretsOn(() => readJson<Record<string, string>>(secretsFile, {}), (values) => writeJson(secretsFile, values)),
    };
}
