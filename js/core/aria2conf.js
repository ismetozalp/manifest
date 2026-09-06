'use strict';
(function (root) {
    function confText(opts) {
        opts = opts || {};
        const home = opts.home;
        const port = opts.port;
        const secret = opts.secret;
        const dir = opts.dir;
        const limits = opts.limits || {};
        // listenAll=true binds the RPC to all interfaces (0.0.0.0) instead of
        // loopback-only, so a browser/tool on another machine (e.g. the Aria2
        // Explorer extension) can reach it. Off by default — the rpc-secret is
        // then the only thing gating the port, so it's opt-in and LAN-only.
        const listenAll = !!opts.listenAll;
        const manifestDir = home + '/.config/cockpit/manifest';
        const sessionPath = manifestDir + '/aria2.session';
        const lines = [
            'enable-rpc=true',
            'rpc-listen-all=' + (listenAll ? 'true' : 'false'),
            'rpc-listen-port=' + port,
            'rpc-secret=' + secret,
            'dir=' + dir,
            'continue=true',
            'save-session=' + sessionPath,
            'input-file=' + sessionPath,
            'save-session-interval=30',
            'rpc-save-upload-metadata=true',
            'bt-save-metadata=true',
            // force-save=false so aria2 removes the .aria2 control file when a
            // download completes (force-save=true leaves a leftover .aria2 next
            // to every finished file). Completed items still show in the UI while
            // aria2 runs; they're just not re-persisted across an aria2 restart.
            'force-save=false',
            // file-allocation=none: DON'T pre-allocate files. aria2's default
            // (prealloc/fallocate) stalls hard on network mounts (CIFS/NFS/SMB) —
            // the periodic "pauses" during large downloads — and pre-allocates
            // even UNSELECTED torrent files to full size, so a selected-subset
            // download looks like it grabbed everything. With none, files grow as
            // data arrives and unselected files stay empty.
            'file-allocation=none',
            // disk-cache: buffer writes in RAM so a slow/network disk is flushed
            // less often (fewer stalls). aria2 default is 16M.
            'disk-cache=64M',
            // bt-remove-unselected-file: when you download a subset of a torrent's
            // files, drop the unselected ones on completion instead of leaving
            // empty placeholders behind.
            'bt-remove-unselected-file=true'
        ];
        Object.keys(limits).forEach(function (k) {
            lines.push(k + '=' + limits[k]);
        });
        return lines.join('\n') + '\n';
    }

    function unitText(opts) {
        opts = opts || {};
        const home = opts.home;
        const aria2Path = opts.aria2Path;
        const confPath = home + '/.config/cockpit/manifest/aria2.conf';
        const lines = [
            '[Unit]',
            'Description=Manifest aria2 daemon',
            '',
            '[Service]',
            'ExecStart=' + aria2Path + ' --conf-path=' + confPath,
            'Restart=on-failure',
            '',
            '[Install]',
            'WantedBy=default.target'
        ];
        return lines.join('\n') + '\n';
    }

    const ManifestAria2Conf = { confText, unitText };
    root.ManifestAria2Conf = ManifestAria2Conf;
    if (typeof module !== 'undefined' && module.exports) module.exports = ManifestAria2Conf;
})(typeof window !== 'undefined' ? window : globalThis);
