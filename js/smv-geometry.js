// Géométrie « telle que calculée » lue dans le .smv (comme Smokeview).
//
// Le .smv contient, pour chaque maillage, la liste des obstructions après
// application des HOLE (murs déjà percés), avec leurs surfaces et couleurs,
// ainsi que les événements d'ouverture/fermeture :
//   HIDE_OBST m / "n t"  → l'obstruction n du maillage m disparaît à t (porte qui s'ouvre)
//   SHOW_OBST m / "n t"  → elle apparaît à t (porte qui se ferme)
// Format vérifié sur Source/dump.f90 et Source/init.f90 de FDS.
(function (global) {
    'use strict';

    const DEFAULT_RGB = [1.0, 0.8, 0.4];
    const PALETTE = [
        [201, 162, 122], [127, 167, 201], [163, 184, 108], [212, 195, 138],
        [156, 139, 196], [111, 179, 168], [208, 143, 107], [143, 160, 184],
        [199, 155, 176], [181, 181, 160], [120, 150, 110], [220, 170, 90],
    ].map(c => c.map(v => v / 255));

    function nums(line) {
        return String(line || '').replace(/!.*$/, '').trim().split(/\s+/).filter(Boolean).map(Number);
    }

    function parse(text) {
        const lines = text.split(/\r?\n/);
        const surfaces = [];
        const meshes = [];   // { obsts: [...] }
        const events = [];   // { mesh, n, t, show }
        let mesh = -1;
        for (let i = 0; i < lines.length; i++) {
            const raw = lines[i];
            const kw = raw.trim();
            if (!kw) continue;
            if (/^GRID\b/.test(kw)) { mesh++; meshes[mesh] = { obsts: [] }; continue; }
            if (kw === 'SURFACE') {
                const name = (lines[i + 1] || '').trim();
                const v = nums(lines[i + 3]);
                // type, largeur et hauteur de texture, r, g, b, transparence
                const rgb = v.length >= 7 ? [v[3], v[4], v[5]] : null;
                surfaces.push({ name, rgb: rgb && rgb.every(Number.isFinite) && rgb.every(c => c >= 0) ? rgb : null,
                    alpha: v.length >= 7 && Number.isFinite(v[6]) ? v[6] : 1 });
                i += 4;
                continue;
            }
            if (kw === 'OBST' && mesh >= 0) {
                const n = parseInt(nums(lines[i + 1])[0], 10) || 0;
                const list = meshes[mesh].obsts;
                for (let k = 0; k < n; k++) {
                    const l = lines[i + 2 + k] || '';
                    const v = nums(l);
                    const label = (l.split('!')[1] || '').trim();
                    list.push({ xb: v.slice(0, 6), surf: v.slice(7, 13), label, n: k + 1 });
                }
                for (let k = 0; k < n; k++) {
                    const v = nums(lines[i + 2 + n + k]);
                    const ob = list[k];
                    if (!ob) continue;
                    ob.colorIndicator = v[6];
                    ob.blockType = v[7];
                    if (v[6] === -3 && v.length >= 11) {
                        ob.rgb = [v[8], v[9], v[10]];
                        ob.alpha = Number.isFinite(v[11]) ? v[11] : 1;
                    }
                }
                i += 1 + 2 * n;
                continue;
            }
            const ev = /^(SHOW_OBST|HIDE_OBST)\s*(\d+)?/.exec(kw);
            if (ev) {
                let m = ev[2] ? parseInt(ev[2], 10) : NaN;
                let j = i + 1;
                let v = nums(lines[j]);
                if (!Number.isFinite(m)) { m = v[0]; j++; v = nums(lines[j]); }
                if (v.length >= 2 && Number.isFinite(m)) {
                    events.push({ mesh: m - 1, n: v[0], t: v[1], show: ev[1] === 'SHOW_OBST' });
                }
                i = j;
            }
        }
        return { surfaces, meshes, events };
    }

    function obstColor(ob, surfaces, distinct) {
        if (ob.rgb && ob.rgb.every(c => c >= 0)) return { rgb: ob.rgb, alpha: ob.alpha != null ? ob.alpha : 1, surf: -1 };
        // Surface dominante (hors INERT/OPEN) parmi les six faces.
        const counts = new Map();
        for (const s of ob.surf) {
            const sf = surfaces[s];
            if (!sf || /^(INERT|OPEN|MIRROR|PERIODIC)$/i.test(sf.name)) continue;
            counts.set(s, (counts.get(s) || 0) + 1);
        }
        let best = -1, bc = 0;
        for (const [s, c] of counts) if (c > bc) { best = s; bc = c; }
        if (best < 0) best = ob.surf.find(s => surfaces[s]) ?? -1;
        const sf = surfaces[best];
        if (!sf) return { rgb: DEFAULT_RGB, alpha: 1, surf: -1 };
        const isDefault = !sf.rgb || (Math.abs(sf.rgb[0] - 1) < 1e-3 && Math.abs(sf.rgb[1] - 0.8) < 1e-3 && Math.abs(sf.rgb[2] - 0.4) < 1e-3);
        if (distinct && isDefault && !/^INERT$/i.test(sf.name)) return { rgb: PALETTE[best % PALETTE.length], alpha: sf.alpha, surf: best };
        return { rgb: sf.rgb || DEFAULT_RGB, alpha: sf.alpha, surf: best };
    }

    // Boîte FDS → triangles dans le repère de la scène (x, z, -y).
    function pushBox(pos, nor, xb) {
        let [x1, x2, y1, y2, z1, z2] = xb;
        const t = 0.01;
        if (x2 - x1 < 1e-6) { x1 -= t; x2 += t; }
        if (y2 - y1 < 1e-6) { y1 -= t; y2 += t; }
        if (z2 - z1 < 1e-6) { z1 -= t; z2 += t; }
        const P = (x, y, z) => [x, z, -y];
        const quad = (a, b, c, d, n) => {
            for (const p of [a, b, c, a, c, d]) { pos.push(p[0], p[1], p[2]); nor.push(n[0], n[1], n[2]); }
        };
        // Faces orientées vers l'extérieur (ordre anti-horaire vu de l'extérieur).
        quad(P(x2, y1, z1), P(x2, y2, z1), P(x2, y2, z2), P(x2, y1, z2), [1, 0, 0]);    // +x
        quad(P(x1, y2, z1), P(x1, y1, z1), P(x1, y1, z2), P(x1, y2, z2), [-1, 0, 0]);   // -x
        quad(P(x1, y1, z2), P(x2, y1, z2), P(x2, y2, z2), P(x1, y2, z2), [0, 1, 0]);    // +z FDS → +y scène
        quad(P(x1, y2, z1), P(x2, y2, z1), P(x2, y1, z1), P(x1, y1, z1), [0, -1, 0]);   // -z FDS
        quad(P(x1, y1, z1), P(x2, y1, z1), P(x2, y1, z2), P(x1, y1, z2), [0, 0, 1]);    // -y FDS → +z scène
        quad(P(x2, y2, z1), P(x1, y2, z1), P(x1, y2, z2), P(x2, y2, z2), [0, 0, -1]);   // +y FDS
    }
    function pushEdges(arr, xb) {
        const [x1, x2, y1, y2, z1, z2] = xb;
        const c = [];
        for (const x of [x1, x2]) for (const y of [y1, y2]) for (const z of [z1, z2]) c.push([x, z, -y]);
        // indices : (x,y,z) bits → c[(xi<<2)|(yi<<1)|zi]
        const e = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
        for (const [a, b] of e) arr.push(...c[a], ...c[b]);
    }

    class SmvGeometry {
        constructor(viewer) {
            this.viewer = viewer;
            this.group = new THREE.Group();
            this.group.name = 'smv-obsts';
            this.dynamic = [];   // { mesh, events:[{t,show}], visible }
            this.count = 0;
        }

        build(parsed, opts) {
            this.dispose();
            const distinct = !!(opts && opts.distinct);
            const dynKey = new Set(parsed.events.map(e => e.mesh + ':' + e.n));
            const batches = new Map(); // couleur → { pos, nor, alpha }
            const edges = [];
            const edgeMat = this.viewer._obstEdgeMaterial || new THREE.LineBasicMaterial({ color: 0x111111 });
            const showEdges = this.viewer.showObstEdges !== false;
            const mkMat = (rgb, alpha) => new THREE.MeshPhongMaterial({
                color: new THREE.Color(rgb[0], rgb[1], rgb[2]), specular: 0x000000, shininess: 0,
                transparent: alpha < 1, opacity: alpha, depthWrite: alpha >= 1,
                side: THREE.DoubleSide,
                polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
            });
            parsed.meshes.forEach((m, mi) => {
                if (!m) return;
                for (const ob of m.obsts) {
                    if (ob.xb.length < 6 || !ob.xb.every(Number.isFinite)) continue;
                    this.count++;
                    const col = obstColor(ob, parsed.surfaces, distinct);
                    const key = mi + ':' + ob.n;
                    if (dynKey.has(key)) {
                        const pos = [], nor = [], ed = [];
                        pushBox(pos, nor, ob.xb); pushEdges(ed, ob.xb);
                        const g = new THREE.BufferGeometry();
                        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
                        g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
                        const mesh = new THREE.Mesh(g, mkMat(col.rgb, col.alpha));
                        mesh.userData = { type: 'SMV_OBST', id: ob.label, dynamic: true };
                        const eg = new THREE.BufferGeometry();
                        eg.setAttribute('position', new THREE.Float32BufferAttribute(ed, 3));
                        const lines = new THREE.LineSegments(eg, edgeMat);
                        lines._isObstEdge = true; lines.visible = showEdges;
                        mesh.add(lines);
                        this.group.add(mesh);
                        const evs = parsed.events.filter(e => e.mesh === mi && e.n === ob.n).sort((a, b) => a.t - b.t);
                        this.dynamic.push({ mesh, events: evs, label: ob.label, visible: true });
                        continue;
                    }
                    const ck = col.rgb.map(c => c.toFixed(3)).join(',') + '|' + (col.alpha < 1 ? col.alpha.toFixed(2) : '1');
                    if (!batches.has(ck)) batches.set(ck, { pos: [], nor: [], rgb: col.rgb, alpha: col.alpha });
                    const b = batches.get(ck);
                    pushBox(b.pos, b.nor, ob.xb);
                    pushEdges(edges, ob.xb);
                }
            });
            for (const b of batches.values()) {
                const g = new THREE.BufferGeometry();
                g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
                g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
                const mesh = new THREE.Mesh(g, mkMat(b.rgb, b.alpha));
                mesh.userData = { type: 'SMV_OBST' };
                mesh.renderOrder = b.alpha < 1 ? 1 : 0;
                this.group.add(mesh);
            }
            if (edges.length) {
                const eg = new THREE.BufferGeometry();
                eg.setAttribute('position', new THREE.Float32BufferAttribute(edges, 3));
                const lines = new THREE.LineSegments(eg, edgeMat);
                lines._isObstEdge = true; lines.visible = showEdges;
                this.group.add(lines);
            }
            return this.count;
        }

        /** Montre ou cache les obstructions mobiles (portes) à l'instant t. */
        setTime(t) {
            let changed = false;
            for (const d of this.dynamic) {
                let vis = true;
                for (const e of d.events) { if (e.t <= t + 1e-6) vis = e.show; else break; }
                if (vis !== d.visible) { d.visible = vis; d.mesh.visible = vis; changed = true; }
            }
            return changed;
        }

        /** Changements d'état (pour les repères sur la frise). */
        eventTimes() {
            const out = [];
            for (const d of this.dynamic) for (const e of d.events) if (e.t > 1e-6) out.push({ t: e.t, show: e.show, label: d.label });
            return out.sort((a, b) => a.t - b.t);
        }

        dispose() {
            this.group.traverse(c => {
                if (c.geometry) c.geometry.dispose();
                if (c.material && c.material !== this.viewer._obstEdgeMaterial && c.material.dispose) c.material.dispose();
            });
            this.group.clear();
            if (this.group.parent) this.group.parent.remove(this.group);
            this.dynamic = [];
            this.count = 0;
        }
    }

    global.FDSSmvGeometry = { parse, SmvGeometry };
})(window);
