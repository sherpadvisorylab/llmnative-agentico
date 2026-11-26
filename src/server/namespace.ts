// CR-025: the namespace of a project and its tenant: `<project>` without a tenant, `<project>-<tenant>` with one. The
// same name is the tenant on the runner and the container of the memory, so both segregate the same way.

/** A project: no hyphen, so that `<project>-<tenant>` names one project only (the rule of the runner, 1.2). */
export const PROJECT_ID = /^[a-z0-9]{1,32}$/;
/** A tenant: what fits after `<project>-` in a tenant of the runner (63 characters in all). */
export const TENANT_ID = /^[a-z0-9][a-z0-9-]{0,29}$/;

export class NamespaceError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'NamespaceError';
    }
}

/** The namespace of a project and its tenant, checked. */
export function namespaceOf(project: string, tenant?: string): string {
    if (!PROJECT_ID.test(project)) throw new NamespaceError(`invalid project "${project}"`);
    if (tenant === undefined || tenant === '') return project;
    if (!TENANT_ID.test(tenant)) throw new NamespaceError(`invalid tenant "${tenant}"`);
    return `${project}-${tenant}`;
}

/** Whether a namespace is of a project. */
export const inProject = (project: string, namespace: string) => namespace === project || namespace.startsWith(`${project}-`);

/** The tenant of a namespace of a project, or undefined for the project itself. */
export const tenantOf = (project: string, namespace: string) => (namespace === project ? undefined : namespace.slice(project.length + 1));
