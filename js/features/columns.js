// features/columns.js — Alpine glue for resizable download-table columns.
// Spread into the component (app.js). Pure width math lives in
// core/columns.js; this file is the pointer-drag handler + persistence trigger.
'use strict';
(function (root) {
    const Columns = root.ManifestColumns;

    const ManifestColumnsUI = {
        // Live per-column width percentages, bound by the <colgroup> in index.html.
        // Always normalized so a hand-edited/old settings.yml can't break layout.
        get colWidths() {
            const c = this.settings && this.settings.columns;
            return Columns.normalizeWidths(c && c.widths);
        },

        // Begin dragging the grip on the right edge of column `boundaryIndex`,
        // transferring width between it and the next column. Deltas are computed
        // as a percentage of the live table width, so dragging tracks the cursor
        // 1:1 regardless of zoom/resolution. Persists once, on mouseup.
        startColResize(ev, boundaryIndex) {
            ev.preventDefault();
            ev.stopPropagation();
            const table = ev.target.closest('table');
            if (!table) return;
            const tableWidth = table.getBoundingClientRect().width || 1;
            const startX = ev.clientX;
            const startWidths = this.colWidths.slice();

            const onMove = (e) => {
                const deltaPct = ((e.clientX - startX) / tableWidth) * 100;
                const next = Columns.applyResize(startWidths, boundaryIndex, deltaPct);
                if (!this.settings.columns) this.settings.columns = {};
                this.settings.columns.widths = next;   // reactive → <col> styles update
            };
            const onUp = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                document.body.classList.remove('mf-col-resizing');
                this.saveSettings();
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
            document.body.classList.add('mf-col-resizing');
        },
    };

    root.ManifestColumnsUI = ManifestColumnsUI;
    if (typeof module !== 'undefined' && module.exports) module.exports = ManifestColumnsUI;
})(typeof window !== 'undefined' ? window : globalThis);
