// boot.js — inject modal partials into #manifest-partials, THEN load Alpine so it
// walks a complete DOM. Order is the whole trick (see explorer/js/boot.js).
(function () {
    'use strict';
    var PARTIALS = [
        'html/modals/confirm.html',
        'html/modals/quickadd.html'
    ];
    function loadScript(src) {
        return new Promise(function (resolve, reject) {
            var s = document.createElement('script');
            s.src = src; s.onload = resolve;
            s.onerror = function () { reject(new Error('failed to load ' + src)); };
            document.head.appendChild(s);
        });
    }
    var host = document.getElementById('manifest-partials');
    Promise.allSettled(PARTIALS.map(function (p) {
        return fetch(p, { cache: 'no-cache' }).then(function (r) {
            if (!r.ok) throw new Error(p + ' → HTTP ' + r.status);
            return r.text();
        });
    })).then(function (results) {
        var html = results.map(function (res, i) {
            if (res.status === 'fulfilled') return res.value;
            console.error('[manifest] partial failed:', PARTIALS[i], res.reason);
            return '';
        }).join('\n');
        // Trusted first-party templates only, same-origin under strict CSP.
        if (host) host.insertAdjacentHTML('beforeend', html);
    }).catch(function (e) {
        console.error('[manifest] partial injection error:', e);
    }).then(function () {
        return loadScript('js/alpine.min.js');
    }).catch(function (e) {
        console.error('[manifest] Alpine failed to start:', e);
    });
})();
