// modalstack.js — make Bootstrap 5 nested modals stack correctly.
//
// Bootstrap gives every `.modal` the same z-index (1055) and every backdrop
// 1050, so when a second modal opens over a first (e.g. the server-side folder
// picker opened via "Browse…" from inside Quick Add / Configure / Settings),
// which one paints on top is decided purely by DOM order — and the folder
// picker lives in confirm.html, registered BEFORE quickadd.html in boot.js, so
// it renders BEHIND the modal that opened it. This self-installing handler
// bumps each newly-opened modal (and its backdrop) above the ones already open,
// and keeps body.modal-open set while any modal remains, so the parent modal
// stays scrollable after the child closes.
'use strict';
(function () {
    if (typeof document === 'undefined') return;

    document.addEventListener('show.bs.modal', function (e) {
        // Count modals already open (the one now showing isn't .show yet).
        var openCount = document.querySelectorAll('.modal.show').length;
        if (openCount < 1) return;                 // first/only modal → Bootstrap defaults are fine
        var z = 1055 + openCount * 20;
        e.target.style.zIndex = String(z);
        // Bootstrap inserts the backdrop asynchronously; bump it just under the modal.
        setTimeout(function () {
            var backdrops = document.querySelectorAll('.modal-backdrop');
            var last = backdrops[backdrops.length - 1];
            if (last) last.style.zIndex = String(z - 10);
        }, 0);
    });

    document.addEventListener('hidden.bs.modal', function (e) {
        e.target.style.zIndex = '';                // reset so a reused modal doesn't keep a stale z
        // Bootstrap removes body.modal-open whenever ANY modal closes; if another
        // modal is still open, restore it so the page/parent modal stays locked.
        if (document.querySelectorAll('.modal.show').length > 0) {
            document.body.classList.add('modal-open');
        }
    });
})();
