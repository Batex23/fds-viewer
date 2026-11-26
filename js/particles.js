// Particules FDS (.prt5) — lecture et affichage synchronisé au temps.
//
// Format .prt5 (enregistrements Fortran non formatés) :
//   ONE, VERSION, N_CLASSES
//   pour chaque classe : (NQ, 0) puis NQ × (nom 30 car., unités 30 car.)
//   pour chaque pas de temps : TIME (float32)
//     pour chaque classe : NPLIM (int32), XP…YP…ZP (3·N float32), TAG (N int32),
//                          QP (N·NQ float32, seulement si NQ > 0)
// Les positions ne sont décodées qu'au moment de l'affichage (DataView),
// pour garder la mémoire au niveau de la taille du fichier.
(function (global) {
    'use strict';

    function readRecords(buffer) {
        const dv = new DataView(buffer);
        const recs = [];
        let off = 0;
        const n = buffer.byteLength;
        while (off + 4 <= n) {
            const len = dv.getInt32(off, true);
            if (len < 0 || off + 8 + len > n) break;
            const end = dv.getInt32(off + 4 + len, true);
            if (end !== len) break;
            recs.push({ off: off + 4, len });
            off += 8 + len;
        }
        return { dv, recs, truncated: off < n };
    }

    function parsePrt5(buffer, fileName) {
        const { dv, recs } = readRecords(buffer);
        let r = 0;
        const int = (rec, k) => dv.getInt32(rec.off + 4 * (k || 0), true);
        if (recs.length < 3) throw new Error('Fichier particules vide : ' + fileName);
        r++; // ONE
        const version = int(recs[r++]);
        const nClasses = int(recs[r++]);
        if (!(nClasses >= 0 && nClasses < 1000)) throw new Error('En-tête .prt5 illisible : ' + fileName);
        const classes = [];
        for (let c = 0; c < nClasses; c++) {
            const nq = int(recs[r++]);
            const names = [];
            for (let q = 0; q < nq; q++) {
                const nameRec = recs[r++]; r++; // unités ignorées
                let s = '';
                for (let i = 0; i < nameRec.len; i++) s += String.fromCharCode(dv.getUint8(nameRec.off + i));
                names.push(s.trim());
            }
            classes.push({ nq, names });
        }
        const frames = [];
        while (r < recs.length) {
            const tRec = recs[r];
            if (tRec.len !== 4) break;
            const time = dv.getFloat32(tRec.off, true);
            r++;
            const perClass = [];
            let ok = true;
            for (let c = 0; c < nClasses; c++) {
                const nRec = recs[r++];
                if (!nRec || nRec.len !== 4) { ok = false; break; }
                const np = int(nRec);
                const xyz = recs[r++];
                r++; // tags
                if (classes[c].nq > 0) r++; // valeurs
                if (!xyz || xyz.len < np * 12) { ok = false; break; }
                perClass.push({ n: np, off: xyz.off });
            }
            if (!ok) break;
            frames.push({ time, perClass });
        }
        return { fileName, version, classes, frames, dv };
    }

    // CLASS_OF_PARTICLES blocks in the .smv: name, then "r g b", then nq and
    // 3 lines per quantity. PRT5 blocks: "PRT5 mesh", file name, n, class ids.
    function parseSmvParticles(text) {
        const lines = text.split(/\r?\n/);
        const classes = [];
        const files = [];
        for (let i = 0; i < lines.length; i++) {
            const kw = lines[i].trim();
            if (/^CLASS_OF_PARTICLES\b/.test(kw)) {
                const name = (lines[i + 1] || '').trim();
                const rgb = (lines[i + 2] || '').trim().split(/\s+/).map(Number);
                classes.push({ name, rgb: rgb.length >= 3 && rgb.every(Number.isFinite) ? rgb.slice(0, 3) : null });
            } else if (/^PRT5\b/.test(kw)) {
                const mesh = parseInt(kw.split(/\s+/)[1], 10) || files.length + 1;
                const fileName = (lines[i + 1] || '').trim();
                const n = parseInt((lines[i + 2] || '').trim(), 10) || 0;
                const ids = [];
                for (let k = 0; k < n; k++) ids.push(parseInt((lines[i + 3 + k] || '').trim(), 10));
                if (fileName) files.push({ mesh, fileName, classIds: ids });
            }
        }
        return { classes, files };
    }

    const PALETTE = ['#ff9f1c', '#2ec4b6', '#e71d36', '#a06cd5', '#8ac926', '#ffca3a'];
    const WATER = '#3d9bff';

    function classColor(cls, index) {
        const name = (cls && cls.name) || '';
        if (/WATER|EAU|DROP|SPRINK|MIST|BRUMI/i.test(name)) return WATER;
        if (cls && cls.rgb && cls.rgb.every(v => v >= 0)) {
            const k = cls.rgb.some(v => v > 1) ? 1 : 255;
            const [r, g, b] = cls.rgb.map(v => Math.max(0, Math.min(255, Math.round(v * k))));
            // FDS uses pure black for "default" tracers: keep it visible.
            if (r + g + b > 30) return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
        }
        return PALETTE[index % PALETTE.length];
    }

    function dropSprite() {
        const c = document.createElement('canvas');
        c.width = c.height = 64;
        const g = c.getContext('2d');
        const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        grd.addColorStop(0, 'rgba(255,255,255,1)');
        grd.addColorStop(0.45, 'rgba(255,255,255,0.9)');
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grd;
        g.fillRect(0, 0, 64, 64);
        const t = new THREE.CanvasTexture(c);
        return t;
    }

    function nearestIndex(times, t) {
        let lo = 0, hi = times.length - 1;
        if (hi < 0) return -1;
        if (t <= times[0]) return 0;
        if (t >= times[hi]) return hi;
        while (hi - lo > 1) {
            const mid = (lo + hi) >> 1;
            if (times[mid] <= t) lo = mid; else hi = mid;
        }
        return (t - times[lo] <= times[hi] - t) ? lo : hi;
    }

    class ParticleLayer {
        constructor(scene) {
            this.scene = scene;
            this.group = new THREE.Group();
            this.group.name = 'particles';
            scene.add(this.group);
            this.files = [];       // parsed .prt5 per mesh
            this.classes = [];     // { name, color, visible, points, count }
            this.times = [];
            this.frameIndex = -1;
            this.pointSize = 4;
        }

        get loaded() { return this.files.length > 0; }

        /** files: lazy File-like objects; smvText: .smv content. */
        async load(fileList, smvText, onProgress) {
            const smv = parseSmvParticles(smvText);
            const byName = new Map(fileList.map(f => [f.name.toLowerCase(), f]));
            let entries = smv.files.filter(e => byName.has(e.fileName.toLowerCase()));
            if (!entries.length) {
                entries = fileList.filter(f => /\.prt5$/i.test(f.name)).map(f => ({ fileName: f.name, classIds: [] }));
            }
            if (!entries.length) return false;
            const parsed = [];
            for (let i = 0; i < entries.length; i++) {
                const e = entries[i];
                if (onProgress) onProgress(i, entries.length, e.fileName);
                const buf = await byName.get(e.fileName.toLowerCase()).arrayBuffer();
                try {
                    const p = parsePrt5(buf, e.fileName);
                    if (!p.frames.length) continue;
                    // Map the file's local class order to global class ids.
                    p.globalIds = p.classes.map((_, k) => (e.classIds[k] || k + 1) - 1);
                    p.times = p.frames.map(f => f.time);
                    parsed.push(p);
                } catch (err) {
                    console.warn('[particules]', err);
                }
                await new Promise(r => setTimeout(r, 0));
            }
            if (!parsed.length) return false;
            this.files = parsed;
            // Global class list.
            const nGlobal = Math.max(smv.classes.length, ...parsed.map(p => Math.max(...p.globalIds, -1) + 1));
            const sprite = dropSprite();
            this.classes = [];
            for (let c = 0; c < nGlobal; c++) {
                const cls = smv.classes[c] || { name: 'Classe ' + (c + 1), rgb: null };
                const color = classColor(cls, c);
                const geom = new THREE.BufferGeometry();
                geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 1024), 3));
                geom.setDrawRange(0, 0);
                const mat = new THREE.PointsMaterial({
                    color: new THREE.Color(color), size: this.pointSize, sizeAttenuation: false,
                    map: sprite, transparent: true, alphaTest: 0.25, depthWrite: false,
                });
                const pts = new THREE.Points(geom, mat);
                pts.frustumCulled = false;
                pts.renderOrder = 7;
                pts._isParticleLayer = true;
                this.group.add(pts);
                this.classes.push({ name: cls.name, color, visible: true, points: pts, count: 0, max: 0 });
            }
            // Reference time list: the longest file.
            this.times = parsed.reduce((a, p) => p.times.length > a.length ? p.times : a, []);
            this._computeMaxCounts();
            this.frameIndex = -1;
            return true;
        }

        _computeMaxCounts() {
            for (const p of this.files) {
                for (const fr of p.frames) {
                    fr.perClass.forEach((pc, k) => {
                        const g = this.classes[p.globalIds[k]];
                        if (g && pc.n > g.max) g.max = pc.n;
                    });
                }
            }
        }

        /** Classes that actually carry particles at some point. */
        activeClasses() { return this.classes.filter(c => c.max > 0); }

        setPointSize(s) {
            this.pointSize = s;
            for (const c of this.classes) c.points.material.size = s;
        }
        setClassVisible(index, v) {
            const c = this.classes[index];
            if (c) { c.visible = !!v; c.points.visible = !!v; }
        }
        setVisible(v) { this.group.visible = !!v; }

        setFrame(i) {
            if (!this.files.length) return;
            i = Math.max(0, Math.min(this.times.length - 1, i | 0));
            if (i === this.frameIndex) return;
            this.frameIndex = i;
            const t = this.times[i];
            const totals = this.classes.map(() => 0);
            const pending = this.classes.map(() => []);
            for (const p of this.files) {
                const fi = p.times === this.times ? i : nearestIndex(p.times, t);
                const fr = p.frames[fi];
                if (!fr) continue;
                fr.perClass.forEach((pc, k) => {
                    const g = p.globalIds[k];
                    if (!this.classes[g] || !pc.n) return;
                    totals[g] += pc.n;
                    pending[g].push({ dv: p.dv, n: pc.n, off: pc.off });
                });
            }
            this.classes.forEach((cls, g) => {
                const need = totals[g] * 3;
                let attr = cls.points.geometry.getAttribute('position');
                if (attr.array.length < need) {
                    attr = new THREE.BufferAttribute(new Float32Array(Math.ceil(need * 1.5)), 3);
                    attr.setUsage(THREE.DynamicDrawUsage);
                    cls.points.geometry.setAttribute('position', attr);
                }
                const arr = attr.array;
                let w = 0;
                for (const seg of pending[g]) {
                    const { dv, n, off } = seg;
                    for (let j = 0; j < n; j++) {
                        const x = dv.getFloat32(off + 4 * j, true);
                        const y = dv.getFloat32(off + 4 * (n + j), true);
                        const z = dv.getFloat32(off + 4 * (2 * n + j), true);
                        arr[w++] = x; arr[w++] = z; arr[w++] = -y;
                    }
                }
                cls.count = totals[g];
                attr.needsUpdate = true;
                cls.points.geometry.setDrawRange(0, totals[g]);
            });
        }

        dispose() {
            for (const c of this.classes) {
                c.points.geometry.dispose();
                if (c.points.material.map) c.points.material.map.dispose();
                c.points.material.dispose();
            }
            this.scene.remove(this.group);
            this.classes = [];
            this.files = [];
        }
    }

    global.FDSParticles = { parsePrt5, parseSmvParticles, ParticleLayer, nearestIndex };
})(window);
