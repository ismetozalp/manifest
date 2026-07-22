// filetree.js — build a folder tree from aria2's flat file list so torrents can
// be shown as a collapsible checkbox tree. Pure (dual-exported for Node tests):
// no window/cockpit/DOM references.
//
// aria2 getFiles / tellStatus(files) entries look like:
//   { index:"1", path:"/dir/Torrent Name/sub/a.mkv", length:"123",
//     completedLength:"0", selected:"true" }
// build() strips the longest shared directory prefix and nests the remainder.
'use strict';
(function (root) {
    // Longest directory prefix common to all paths (ends at a '/' boundary).
    function commonDirPrefix(paths) {
        if (!paths.length) return '';
        let prefix = paths[0];
        for (let k = 1; k < paths.length; k++) {
            const p = paths[k];
            let i = 0;
            while (i < prefix.length && i < p.length && prefix[i] === p[i]) i++;
            prefix = prefix.slice(0, i);
            if (!prefix) break;
        }
        const cut = prefix.lastIndexOf('/');
        return cut >= 0 ? prefix.slice(0, cut + 1) : '';
    }

    function sortNodes(nodes) {
        nodes.sort((a, b) => (a.dir === b.dir)
            ? a.name.localeCompare(b.name)
            : (a.dir ? -1 : 1));           // folders first, then files, each A→Z
        for (const n of nodes) if (n.dir) sortNodes(n.children);
        return nodes;
    }

    // Returns { nodes: [...root nodes], base: '<stripped prefix>' }.
    // Leaf:   { name, dir:false, index:Number, length:Number, completed:Number, selected:Boolean }
    // Folder: { name, dir:true, children:[...], indices:[all descendant leaf indices] }
    function build(files) {
        const list = (files || []).map((f) => ({
            index: parseInt(f.index, 10),
            path: String(f.path || ''),
            length: parseInt(f.length, 10) || 0,
            completed: parseInt(f.completedLength, 10) || 0,
            selected: String(f.selected) === 'true',
        })).filter((f) => f.path);
        if (!list.length) return { nodes: [], base: '' };
        const base = commonDirPrefix(list.map((f) => f.path));
        const rootChildren = [];
        const folderMap = new Map();
        for (const f of list) {
            const rel = f.path.slice(base.length).replace(/^\/+/, '');
            const parts = rel.split('/').filter(Boolean);
            if (!parts.length) parts.push(f.path.split('/').pop() || ('file-' + f.index));
            let level = rootChildren;
            let key = '';
            for (let i = 0; i < parts.length; i++) {
                key += '/' + parts[i];
                if (i === parts.length - 1) {
                    level.push({ name: parts[i], dir: false, index: f.index, length: f.length, completed: f.completed, selected: f.selected });
                } else {
                    let node = folderMap.get(key);
                    if (!node) { node = { name: parts[i], dir: true, children: [], indices: [] }; folderMap.set(key, node); level.push(node); }
                    node.indices.push(f.index);
                    level = node.children;
                }
            }
        }
        return { nodes: sortNodes(rootChildren), base };
    }

    // Tri-state of a folder given the set of selected leaf indices: 'all' | 'some' | 'none'.
    function folderState(node, selectedSet) {
        if (!node || !node.dir) return 'none';
        let sel = 0;
        for (const i of node.indices) if (selectedSet.has(i)) sel++;
        if (sel === 0) return 'none';
        return sel === node.indices.length ? 'all' : 'some';
    }

    // All leaf indices in a subtree (or the whole forest if given an array).
    function allIndices(nodesOrForest) {
        const out = [];
        const walk = (n) => { if (n.dir) n.children.forEach(walk); else out.push(n.index); };
        (Array.isArray(nodesOrForest) ? nodesOrForest : [nodesOrForest]).forEach(walk);
        return out;
    }

    const ManifestFileTree = { build, folderState, allIndices, commonDirPrefix };
    root.ManifestFileTree = ManifestFileTree;
    if (typeof module !== 'undefined' && module.exports) module.exports = ManifestFileTree;
})(typeof window !== 'undefined' ? window : globalThis);
