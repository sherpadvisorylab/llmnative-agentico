// `@llmnative/agentico/server` (CR-025): the server of Agentico, pure Node. Connections of the AI providers, runners,
// memories and projects of a host, behind one `handle(Request)`; the host gives who asks and where it keeps data and
// secrets. No React and no browser API here.
export { createAgenticoServer } from './server';
export type { AgenticoServer, AgenticoServerOptions } from './server';
export type { AgenticoIdentity, AgenticoKnownTenant, AgenticoRecords, AgenticoRole, AgenticoSecrets } from './ports';
export { namespaceOf, inProject, tenantOf, PROJECT_ID, TENANT_ID, NamespaceError } from './namespace';
export { memoryStores, fileStores } from './stores';
export { createConnections, defaultAdapterFactory, CONNECTIONS } from './connections';
export type { AdapterFactory, Connections, ConnectionsSnapshot, ConnectionResult } from './connections';
export { createFleet, FleetError, normalizeRunnerUrl, NAMESPACE_KEY_PERMISSIONS, RUNNERS, NAMESPACES } from './runners';
export type { Fleet, RunnerEntry, RunnerRecord, NamespaceRecord, RunnerConnection, RunnerTarget } from './runners';
export { createMemories, MemoryError, MEMORIES, administers } from './memories';
export type { Memories, MemoryEntry, MemoryCheck, MemoryHit, MemoryRecord, MemoryViewer } from './memories';
