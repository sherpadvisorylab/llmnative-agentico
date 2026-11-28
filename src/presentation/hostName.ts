// The name of a runner or of a memory, taken from its address (no name to type): the main label of its domain
// (`runner.sherpalab.net` → `sherpalab`, `memory.acme.co.uk` → `acme`); an IP, or an address of sslip.io / nip.io that
// carries one (`runner-173-249-9-79.sslip.io`), gives the IP.

/** Second-level suffixes under which the name is the label before them (`acme.co.uk` → `acme`). */
const SECOND_LEVEL = new Set(['co', 'com', 'net', 'org', 'gov', 'edu', 'ac']);

export function nameOfHost(address: string): string {
    let host = String(address ?? '').trim();
    try {
        host = new URL(/^[a-z]+:\/\//i.test(host) ? host : `https://${host}`).hostname;
    } catch {
        // Not an address: as it is.
    }
    host = host.toLowerCase().replace(/\.$/, '');
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return host;
    const carried = /(?:^|[.-])(\d{1,3})[-.](\d{1,3})[-.](\d{1,3})[-.](\d{1,3})\.(?:sslip|nip)\.io$/.exec(host);
    if (carried) return carried.slice(1, 5).join('.');
    const labels = host.split('.').filter(Boolean);
    if (labels.length < 2) return host;
    const tld = labels.length - 1;
    const main = labels.length > 2 && SECOND_LEVEL.has(labels[tld - 1]) && labels[tld].length === 2 ? tld - 2 : tld - 1;
    return labels[main] ?? host;
}
