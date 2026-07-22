// core/rpc.js — aria2 JSON-RPC 2.0 client over cockpit.http.
//
// Bridge Lesson #1: `body` is ALWAYS a non-empty JSON string — never
// body-less (a body-less cockpit.http POST hangs).
// Bridge Lesson #2: binary uploads (.torrent) go base64-inside-JSON via
// aria2.addTorrent — never raw ArrayBuffer/binary/multipart.
// Bridge Lesson #5: cockpit.http is called with ONLY the port number
// (`cockpit.http(Number(port))`) — never `{ port, address }`.
'use strict';
(function (root) {
    const ENV = root.ManifestRpcEnvelope;

    function create(opts) {
        opts = opts || {};
        const port = opts.port;
        const secret = opts.secret;

        // Bridge Lesson #5: pass ONLY the port number to cockpit.http.
        // Bridge Lesson #1: body is always the JSON string (never empty/undefined).
        async function post(envelope) {
            const body = JSON.stringify(envelope);
            const http = cockpit.http(Number(port));   // port number only
            const text = await http.post('/jsonrpc', body, { 'Content-Type': 'application/json' });
            const msg = JSON.parse(text);
            if (msg.error) {
                const e = new Error(msg.error.message || 'aria2 RPC error');
                e.code = msg.error.code;
                throw e;
            }
            return msg.result;
        }

        function raw(method, params) {
            return post(ENV.call(method, params, secret));
        }

        async function batch(calls) {
            const envelope = ENV.multicall(calls, secret);
            const body = JSON.stringify(envelope);
            const http = cockpit.http(Number(port));
            const text = await http.post('/jsonrpc', body, { 'Content-Type': 'application/json' });
            const msg = JSON.parse(text);
            if (msg.error) {
                const e = new Error(msg.error.message || 'aria2 RPC error');
                e.code = msg.error.code;
                throw e;
            }
            // system.multicall returns an array of [result] or [{faultCode,faultString}]
            return (msg.result || []).map((entry) => {
                if (Array.isArray(entry)) return entry[0];
                if (entry && entry.faultString) {
                    const e = new Error(entry.faultString);
                    e.code = entry.faultCode;
                    throw e;
                }
                return entry;
            });
        }

        const getVersion = () => raw('aria2.getVersion', []);
        const getGlobalStat = () => raw('aria2.getGlobalStat', []);
        const tellActive = (keys) => raw('aria2.tellActive', keys ? [keys] : []);
        const tellWaiting = (offset, num, keys) => raw('aria2.tellWaiting', keys ? [offset, num, keys] : [offset, num]);
        const tellStopped = (offset, num, keys) => raw('aria2.tellStopped', keys ? [offset, num, keys] : [offset, num]);
        const tellStatus = (gid, keys) => raw('aria2.tellStatus', keys ? [gid, keys] : [gid]);
        const addUri = (uris, options) => raw('aria2.addUri', [uris, options || {}]);
        // Bridge Lesson #2: base64-encoded .torrent contents, never raw binary.
        const addTorrent = (b64, uris, options) => raw('aria2.addTorrent', [b64, uris || [], options || {}]);
        const addMetalink = (b64, options) => raw('aria2.addMetalink', [b64, options || {}]);
        const remove = (gid) => raw('aria2.remove', [gid]);
        const forceRemove = (gid) => raw('aria2.forceRemove', [gid]);
        const pause = (gid) => raw('aria2.pause', [gid]);
        const unpause = (gid) => raw('aria2.unpause', [gid]);
        const changeOption = (gid, opts_) => raw('aria2.changeOption', [gid, opts_]);
        const changeGlobalOption = (opts_) => raw('aria2.changeGlobalOption', [opts_]);
        const getFiles = (gid) => raw('aria2.getFiles', [gid]);
        const getPeers = (gid) => raw('aria2.getPeers', [gid]);
        const getServers = (gid) => raw('aria2.getServers', [gid]);
        const getUris = (gid) => raw('aria2.getUris', [gid]);
        const removeDownloadResult = (gid) => raw('aria2.removeDownloadResult', [gid]);
        const purgeDownloadResult = () => raw('aria2.purgeDownloadResult', []);
        const getGlobalOption = () => raw('aria2.getGlobalOption', []);
        const ping = () => getVersion().then(() => true).catch(() => false);

        return {
            raw, batch,
            getVersion, getGlobalStat,
            tellActive, tellWaiting, tellStopped, tellStatus,
            addUri, addTorrent, addMetalink,
            remove, forceRemove, pause, unpause,
            changeOption, changeGlobalOption,
            getFiles, getPeers, getServers, getUris,
            removeDownloadResult, purgeDownloadResult,
            getGlobalOption,
            ping,
        };
    }

    const ManifestRpc = { create };
    root.ManifestRpc = ManifestRpc;
})(typeof window !== 'undefined' ? window : globalThis);
