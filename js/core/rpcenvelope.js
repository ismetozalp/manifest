'use strict';
(function (root) {
    let _id = 0;
    const TOKEN = (s) => 'token:' + s;
    function withToken(params, secret) {
        params = params || [];
        return secret ? [TOKEN(secret)].concat(params) : params.slice();
    }
    function call(method, params, secret, id) {
        return { jsonrpc: '2.0', id: (id == null ? ++_id : id), method, params: withToken(params, secret) };
    }
    function multicall(calls, secret) {
        const inner = (calls || []).map(c => ({ methodName: c.method, params: withToken(c.params, secret) }));
        return { jsonrpc: '2.0', id: ++_id, method: 'system.multicall', params: [inner] };
    }
    const ManifestRpcEnvelope = { call, multicall, TOKEN };
    root.ManifestRpcEnvelope = ManifestRpcEnvelope;
    if (typeof module !== 'undefined' && module.exports) module.exports = ManifestRpcEnvelope;
})(typeof window !== 'undefined' ? window : globalThis);
