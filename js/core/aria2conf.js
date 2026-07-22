'use strict';
(function (root) {
    function confText(opts) {
        opts = opts || {};
        const home = opts.home;
        const port = opts.port;
        const secret = opts.secret;
        const dir = opts.dir;
        const limits = opts.limits || {};
        const manifestDir = home + '/.config/cockpit/manifest';
        const sessionPath = manifestDir + '/aria2.session';
        const lines = [
            'enable-rpc=true',
            'rpc-listen-all=false',
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
            'force-save=false'
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
