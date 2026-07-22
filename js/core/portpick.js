'use strict';
(function (root) {
    const RANGE = { lo: 16800, hi: 26800 };

    function listeningPorts(ssOutput) {
        const ports = new Set();
        const lines = String(ssOutput || '').split(/\r?\n/);
        for (const line of lines) {
            if (/^State\b/.test(line.trim())) continue; // header
            const cols = line.trim().split(/\s+/);
            if (cols.length < 4) continue;
            const local = cols[3];
            if (!local) continue;
            const m = local.match(/:(\d+)\s*$/);
            if (m) ports.add(parseInt(m[1], 10));
        }
        return ports;
    }

    function firstFree(ssOutput, lo, hi) {
        const taken = listeningPorts(ssOutput);
        for (let p = lo; p <= hi; p++) {
            if (!taken.has(p)) return p;
        }
        return null;
    }

    const ManifestPortPick = { listeningPorts, firstFree, RANGE };
    root.ManifestPortPick = ManifestPortPick;
    if (typeof module !== 'undefined' && module.exports) module.exports = ManifestPortPick;
})(typeof window !== 'undefined' ? window : globalThis);
