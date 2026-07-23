'use strict';
(function (root) {
    // Turnkey last resort when no supported package manager is found or install
    // fails: fetch a known-good static aria2 build directly (spec §2, §13).
    const STATIC_ARIA2_URL = 'https://github.com/q3aql/aria2-static-builds/releases/latest/download/aria2-x86_64-linux-gnu-static.tar.gz';

    const PROBES = [
        { manager: 'dnf', bin: 'dnf' },
        { manager: 'apt', bin: 'apt-get' },
        { manager: 'pacman', bin: 'pacman' },
        { manager: 'zypper', bin: 'zypper' }
    ];

    function planFor(managerBin) {
        switch (managerBin) {
        case 'dnf':
            return [
                ['dnf', 'install', '-y', 'aria2'],
                ['dnf', 'install', '-y', 'epel-release'],
                ['dnf', 'install', '-y', 'aria2']
            ];
        case 'apt-get':
            return [
                ['apt-get', 'update'],
                ['apt-get', 'install', '-y', 'aria2']
            ];
        case 'pacman':
            return [
                ['pacman', '-Sy', '--noconfirm', 'aria2']
            ];
        case 'zypper':
            return [
                ['zypper', '--non-interactive', 'install', 'aria2']
            ];
        default:
            return [];
        }
    }

    function staticFallbackPlan(home) {
        const dir = String(home || '').replace(/\/+$/, '') + '/.local/bin';   // normalize trailing slash
        const binPath = dir + '/aria2c';
        const archivePath = dir + '/aria2-static.tar.gz';
        const steps = [
            ['mkdir', '-p', dir],
            ['curl', '-fsSL', '-o', archivePath, STATIC_ARIA2_URL],
            ['tar', '-xzf', archivePath, '-C', dir, '--strip-components=1'],
            ['chmod', '+x', binPath]
        ];
        return { dir, binPath, steps };
    }

    const ManifestInstallCmd = { PROBES, planFor, staticFallbackPlan, STATIC_ARIA2_URL };
    root.ManifestInstallCmd = ManifestInstallCmd;
    if (typeof module !== 'undefined' && module.exports) module.exports = ManifestInstallCmd;
})(typeof window !== 'undefined' ? window : globalThis);
