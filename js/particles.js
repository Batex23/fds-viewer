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

    // ── Lecture en flux (fichiers .prt5 volumineux) ──────────────────────
    // Les gros calculs produisent des .prt5 de plusieurs centaines de Mo :
    // on les lit morceau par morceau, sans jamais garder le fichier entier,
    // et on ne conserve qu'une particule sur k (choisie par son étiquette,
    // donc toujours les mêmes gouttes d'un pas de temps à l'autre). Seules
    // les positions (repère de la scène) et les étiquettes sont gardées.
    const PRT5_BUDGET = 60e6;   // octets de fichier « utiles » visés par fichier

    async function* fortranRecords(reader) {
        let buf = new Uint8Array(0);
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!value || !value.length) continue;
            const nb = new Uint8Array(buf.length + value.length);
            nb.set(buf, 0); nb.set(value, buf.length);
            buf = nb;
            const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
            let off = 0;
            while (buf.length - off >= 4) {
                const len = dv.getInt32(off, true);
                if (len < 0) return;
                if (buf.length - off < len + 8) break;
                yield buf.slice(off + 4, off + 4 + len);   // copie alignée
                off += len + 8;
            }
            if (off) buf = buf.slice(off);
        }
    }

    async function openReader(file) {
        if (file.stream) {
            const st = await file.stream();
            return st.getReader ? st.getReader() : st;
        }
        const buf = await file.arrayBuffer();
        let sent = false;
        return { read: async () => sent ? { done: true } : (sent = true, { done: false, value: new Uint8Array(buf) }) };
    }

    async function parsePrt5Stream(file, fileName) {
        const stride = Math.max(1, Math.ceil((file.size || 0) / PRT5_BUDGET));
        const it = fortranRecords(await openReader(file));
        const next = async () => { const r = await it.next(); return r.done ? null : r.value; };
        const i32 = rec => new DataView(rec.buffer).getInt32(0, true);
        let rec = await next(); if (!rec) throw new Error('Fichier particules vide : ' + fileName);   // ONE
        rec = await next(); const version = rec ? i32(rec) : 0;
        rec = await next(); const nClasses = rec ? i32(rec) : -1;
        if (!(nClasses >= 0 && nClasses < 1000)) throw new Error('En-tête .prt5 illisible : ' + fileName);
        const classes = [];
        for (let c = 0; c < nClasses; c++) {
            const nq = i32(await next());
            const names = [];
            for (let q = 0; q < nq; q++) {
                const nm = await next(); await next();
                names.push(String.fromCharCode(...nm).trim());
            }
            classes.push({ nq, names });
        }
        const frames = [];
        for (;;) {
            const tRec = await next();
            if (!tRec || tRec.length !== 4) break;
            const time = new DataView(tRec.buffer).getFloat32(0, true);
            const perClass = [];
            let ok = true;
            for (let c = 0; c < nClasses; c++) {
                const nRec = await next();
                if (!nRec || nRec.length !== 4) { ok = false; break; }
                const np = i32(nRec);
                const xyzRec = await next();
                const tagRec = await next();
                if (classes[c].nq > 0) await next();
                if (!xyzRec || xyzRec.length < np * 12) { ok = false; break; }
                const xyz = new Float32Array(xyzRec.buffer, 0, np * 3);
                const tags = tagRec && tagRec.length >= np * 4 ? new Int32Array(tagRec.buffer, 0, np) : null;
                let keep = np;
                if (stride > 1 && tags) { keep = 0; for (let j = 0; j < np; j++) if (tags[j] % stride === 0) keep++; }
                else if (stride > 1) keep = Math.ceil(np / stride);
                const pos = new Float32Array(keep * 3), tag = new Int32Array(keep);
                let w = 0;
                for (let j = 0; j < np; j++) {
                    if (stride > 1 && (tags ? tags[j] % stride !== 0 : j % stride !== 0)) continue;
                    pos[3 * w] = xyz[j]; pos[3 * w + 1] = xyz[2 * np + j]; pos[3 * w + 2] = -xyz[np + j];
                    tag[w] = tags ? tags[j] : j;
                    w++;
                }
                perClass.push({ n: w, pos, tag });
            }
            if (!ok) break;
            frames.push({ time, perClass });
        }
        return { fileName, version, classes, frames, stride };
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

    function waterSprite() {
        const c = document.createElement('canvas');
        c.width = c.height = 64;
        const g = c.getContext('2d');
        const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        grd.addColorStop(0, 'rgba(255,255,255,1)');
        grd.addColorStop(0.3, 'rgba(255,255,255,0.75)');
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grd;
        g.fillRect(0, 0, 64, 64);
        return new THREE.CanvasTexture(c);
    }

    // Lignes à transparence dégradée (tête opaque → queue transparente),
    // compatibles avec les plans de coupe du rendu (clipping).
    function streakMaterial(color, opacity) {
        return new THREE.ShaderMaterial({
            uniforms: { color: { value: new THREE.Color(color) }, opacity: { value: opacity } },
            vertexShader: `
                #include <common>
                #include <clipping_planes_pars_vertex>
                attribute float a;
                varying float vA;
                void main() {
                    vA = a;
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_Position = projectionMatrix * mvPosition;
                    #include <clipping_planes_vertex>
                }`,
            fragmentShader: `
                uniform vec3 color;
                uniform float opacity;
                varying float vA;
                #include <common>
                #include <clipping_planes_pars_fragment>
                void main() {
                    #include <clipping_planes_fragment>
                    gl_FragColor = vec4(color, opacity * vA);
                }`,
            transparent: true,
            depthWrite: false,
            clipping: true,
        });
    }


    // ── Eau « liquide » (rendu écran façon simulation de fluide) ─────────
    // Chaque goutte est projetée comme une tache gaussienne dont on cumule
    // l'épaisseur dans une texture à demi-résolution (masquée par les murs).
    // Cette épaisseur, lissée, est transformée en surface : normales tirées
    // du gradient, éclairage, reflet et transparence. Les gouttes voisines
    // se fondent en nappes et filets d'eau, sans maillage ni mémoire en plus
    // (une seule texture de la taille de l'écran / 2).
    class WaterFluid {
        constructor(layer) {
            this.layer = layer;
            this.rt = null;
            this.radius = 0.06;
            this.splatMat = new THREE.ShaderMaterial({
                uniforms: { radius: { value: this.radius }, viewH: { value: 500 } },
                vertexShader: `
                    #include <common>
                    #include <clipping_planes_pars_vertex>
                    uniform float radius; uniform float viewH;
                    void main() {
                        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                        gl_Position = projectionMatrix * mvPosition;
                        gl_PointSize = clamp(radius * projectionMatrix[1][1] * viewH / max(0.05, -mvPosition.z), 2.0, 96.0);
                        #include <clipping_planes_vertex>
                    }`,
                fragmentShader: `
                    #include <common>
                    #include <clipping_planes_pars_fragment>
                    void main() {
                        #include <clipping_planes_fragment>
                        vec2 d = gl_PointCoord * 2.0 - 1.0;
                        float r2 = dot(d, d);
                        if (r2 > 1.0) discard;
                        gl_FragColor = vec4(exp(-r2 * 3.0) * 0.22, 0.0, 0.0, 1.0);
                    }`,
                blending: THREE.AdditiveBlending, transparent: true, depthTest: true, depthWrite: false, clipping: true,
            });
            this.quadScene = new THREE.Scene();
            this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
            this.compMat = new THREE.ShaderMaterial({
                uniforms: {
                    tT: { value: null }, texel: { value: new THREE.Vector2(1 / 512, 1 / 512) },
                    shallow: { value: new THREE.Color('#d3e5f3') }, deep: { value: new THREE.Color('#4a84b3') },
                },
                vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
                fragmentShader: `
                    uniform sampler2D tT; uniform vec2 texel; uniform vec3 shallow; uniform vec3 deep;
                    varying vec2 vUv;
                    float T(vec2 o) { return texture2D(tT, vUv + o * texel).r; }
                    float S(vec2 o) {   // épaisseur lissée (deux anneaux)
                        float c = T(o) * 4.0;
                        c += (T(o + vec2(2.0, 0.0)) + T(o - vec2(2.0, 0.0)) + T(o + vec2(0.0, 2.0)) + T(o - vec2(0.0, 2.0))) * 2.0;
                        c += T(o + vec2(3.0, 3.0)) + T(o - vec2(3.0, 3.0)) + T(o + vec2(3.0, -3.0)) + T(o - vec2(-3.0, 3.0));
                        return c / 16.0;
                    }
                    void main() {
                        float t = S(vec2(0.0));
                        if (t < 0.03) discard;
                        float dx = S(vec2(3.0, 0.0)) - S(vec2(-3.0, 0.0));
                        float dy = S(vec2(0.0, 3.0)) - S(vec2(0.0, -3.0));
                        // Normales douces : surface d'eau lisse plutôt que granuleuse
                        vec3 n = normalize(vec3(-dx * 1.4, -dy * 1.4, 1.0));
                        vec3 L = normalize(vec3(-0.35, 0.65, 0.68));
                        float diff = clamp(dot(n, L), 0.0, 1.0);
                        float spec = pow(max(dot(n, normalize(L + vec3(0.0, 0.0, 1.0))), 0.0), 140.0);
                        float rim = pow(1.0 - n.z, 3.0);
                        // Zones peu denses : voile de pulvérisation ; zones denses : nappe d'eau.
                        float a = smoothstep(0.03, 0.7, t);
                        vec3 col = mix(shallow, deep, clamp(t * 0.25, 0.0, 1.0));
                        col = col * (0.75 + 0.25 * diff) + rim * 0.08 + spec * 0.22;
                        gl_FragColor = vec4(col, clamp(a * 0.6 + spec * 0.08, 0.0, 0.7));
                    }`,
                transparent: true, depthTest: false, depthWrite: false,
            });
            this.quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.compMat));
            this.pass = (renderer, scene, camera, viewer) => this.render(renderer, camera, viewer);
        }
        setRadius(r) { this.radius = r; this.splatMat.uniforms.radius.value = r; }
        _ensureRT(renderer) {
            const size = renderer.getDrawingBufferSize(new THREE.Vector2());
            const w = Math.max(1, Math.floor(size.x / 2)), h = Math.max(1, Math.floor(size.y / 2));
            if (!this.rt) {
                this.rt = new THREE.WebGLRenderTarget(w, h, {
                    type: THREE.HalfFloatType, format: THREE.RGBAFormat,
                    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true,
                });
            } else if (this.rt.width !== w || this.rt.height !== h) this.rt.setSize(w, h);
            this.compMat.uniforms.texel.value.set(1 / w, 1 / h);
            this.splatMat.uniforms.viewH.value = h;
        }
        render(renderer, camera, viewer) {
            const L = this.layer;
            if (!L.fluid || !L.group.visible || !L.group.parent) return;
            const water = L.classes.filter(c => c.water && c.visible && c.count > 0);
            if (!water.length) return;
            this._ensureRT(renderer);
            const autoClear = renderer.autoClear;
            const clearColor = renderer.getClearColor(new THREE.Color()), clearAlpha = renderer.getClearAlpha();
            renderer.autoClear = false;
            renderer.setRenderTarget(this.rt);
            renderer.setClearColor(0x000000, 0);
            renderer.clear(true, true, false);
            // 1. Profondeur des murs (pour masquer l'eau cachée), puis on efface la couleur.
            if (viewer.obstGroup && viewer.obstGroup.visible) renderer.render(viewer.obstGroup, camera);
            if (viewer.geomGroup && viewer.geomGroup.visible) renderer.render(viewer.geomGroup, camera);
            renderer.clear(true, false, false);
            // 2. Épaisseur d'eau cumulée
            for (const c of water) {
                if (!c._splat) { c._splat = new THREE.Points(c.points.geometry, this.splatMat); c._splat.frustumCulled = false; }
                if (c._splat.geometry !== c.points.geometry) c._splat.geometry = c.points.geometry;
                renderer.render(c._splat, camera);
            }
            // 3. Composition sur l'image
            renderer.setRenderTarget(null);
            this.compMat.uniforms.tT.value = this.rt.texture;
            renderer.render(this.quadScene, this.quadCam);
            renderer.setClearColor(clearColor, clearAlpha);
            renderer.autoClear = autoClear;
        }
        dispose() {
            if (this.rt) this.rt.dispose();
            this.splatMat.dispose(); this.compMat.dispose();
        }
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
            this.fluid = true;      // eau rendue comme un liquide
            this.waterFluid = null;
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
                try {
                    const p = await parsePrt5Stream(byName.get(e.fileName.toLowerCase()), e.fileName);
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
            // Fichiers allégés (1 particule sur k) : taches d'eau un peu plus grandes.
            this.stride = Math.max(1, ...parsed.map(p => p.stride || 1));
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
                const water = color === WATER;
                if (water) {
                    // Gouttes d'eau : petit noyau clair + traînée dans le sens du
                    // mouvement (comme un jet de sprinkleur filmé), au lieu de billes.
                    mat.color = new THREE.Color('#d8eeff');
                    mat.opacity = 0.9;
                    mat.map = waterSprite();
                    mat.alphaTest = 0.05;
                }
                const pts = new THREE.Points(geom, mat);
                pts.frustumCulled = false;
                pts.renderOrder = 7;
                pts._isParticleLayer = true;
                this.group.add(pts);
                let streaks = null;
                if (water) {
                    const sg = new THREE.BufferGeometry();
                    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6 * 1024), 3));
                    sg.setAttribute('a', new THREE.BufferAttribute(new Float32Array(2 * 1024), 1));
                    sg.setDrawRange(0, 0);
                    streaks = new THREE.LineSegments(sg, streakMaterial('#7cc4ff', 0.75));
                    streaks.frustumCulled = false;
                    streaks.renderOrder = 7;
                    streaks._isParticleLayer = true;
                    pts.add(streaks);
                }
                this.classes.push({ name: cls.name, color, visible: true, points: pts, streaks, water, count: 0, max: 0 });
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
            for (const c of this.classes) c.points.material.size = c.water ? s * 0.7 : s;
            if (this.waterFluid) this.waterFluid.setRadius(0.06 * s / 5 * Math.min(2.2, Math.cbrt(this.stride || 1)));
        }
        setClassVisible(index, v) {
            const c = this.classes[index];
            if (c) { c.visible = !!v; c.points.visible = !!v; }
        }
        setVisible(v) { this.group.visible = !!v; }

        /** Active le rendu « liquide » de l'eau (passe écran du viewer). */
        attachFluid(viewer) {
            if (!viewer) return;
            this.viewer = viewer;
            if (!this.waterFluid) { this.waterFluid = new WaterFluid(this); this.setPointSize(this.pointSize); }
            viewer.postPasses = viewer.postPasses || [];
            if (!viewer.postPasses.includes(this.waterFluid.pass)) viewer.postPasses.push(this.waterFluid.pass);
            this._applyFluidVisibility();
        }
        setFluid(on) {
            this.fluid = !!on;
            this._applyFluidVisibility();
            const i = this.frameIndex; this.frameIndex = -1; if (i >= 0) this.setFrame(i);
        }
        _applyFluidVisibility() {
            for (const c of this.classes) {
                if (!c.water) continue;
                // En mode liquide, les points et traînées ne sont pas dessinés
                // (ils servent seulement de source à la passe d'eau).
                const drops = !(this.fluid && this.waterFluid);
                c.points.material.visible = drops;
                if (c.streaks) c.streaks.visible = drops;
            }
        }

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
                    const seg = { n: pc.n, pos: pc.pos, tag: pc.tag, prev: null };
                    if (this.classes[g].water && fi > 0) {
                        const pf = p.frames[fi - 1] && p.frames[fi - 1].perClass[k];
                        if (pf && pf.n) seg.prev = pf;
                    }
                    pending[g].push(seg);
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
                for (const seg of pending[g]) { arr.set(seg.pos.subarray(0, seg.n * 3), w); w += seg.n * 3; }
                cls.count = totals[g];
                attr.needsUpdate = true;
                cls.points.geometry.setDrawRange(0, totals[g]);
                if (cls.streaks && !(this.fluid && this.waterFluid)) this._buildStreaks(cls, pending[g], arr, totals[g]);
            });
        }

        /** Traînées : de la position précédente (même étiquette) vers la goutte. */
        _buildStreaks(cls, segs, head, total) {
            const g = cls.streaks.geometry;
            let pos = g.getAttribute('position'), al = g.getAttribute('a');
            if (pos.array.length < total * 6) {
                const cap = Math.ceil(total * 1.5);
                pos = new THREE.BufferAttribute(new Float32Array(cap * 6), 3); pos.setUsage(THREE.DynamicDrawUsage);
                al = new THREE.BufferAttribute(new Float32Array(cap * 2), 1);
                for (let i = 0; i < cap; i++) { al.array[2 * i] = 1; al.array[2 * i + 1] = 0; }
                g.setAttribute('position', pos); g.setAttribute('a', al);
                al.needsUpdate = true;
            } else if (!al._init) {
                for (let i = 0; i < al.array.length / 2; i++) { al.array[2 * i] = 1; al.array[2 * i + 1] = 0; }
                al._init = true; al.needsUpdate = true;
            }
            const P = pos.array;
            const MAXL = 0.45, MINL = 0.07;
            let w = 0, h = 0;
            for (const s of segs) {
                let map = null;
                if (s.prev) {
                    map = new Map();
                    const pn = s.prev.n, pt = s.prev.tag;
                    for (let j = 0; j < pn; j++) map.set(pt[j], j);
                }
                for (let j = 0; j < s.n; j++, h += 3) {
                    const hx = head[h], hy = head[h + 1], hz = head[h + 2];
                    let dx = 0, dy = -MINL, dz = 0; // par défaut : chute verticale
                    if (map) {
                        const pj = map.get(s.tag[j]);
                        if (pj !== undefined) {
                            const pp = s.prev.pos;
                            // traînée = 60 % du déplacement depuis le pas précédent
                            dx = (pp[3 * pj] - hx) * 0.6; dy = (pp[3 * pj + 1] - hy) * 0.6; dz = (pp[3 * pj + 2] - hz) * 0.6;
                            const L = Math.hypot(dx, dy, dz);
                            if (L > MAXL) { const k = MAXL / L; dx *= k; dy *= k; dz *= k; }
                            else if (L < MINL) { if (L > 1e-6) { const k = MINL / L; dx *= k; dy *= k; dz *= k; } else { dx = 0; dy = MINL; dz = 0; } }
                        }
                    }
                    P[w++] = hx; P[w++] = hy; P[w++] = hz;
                    P[w++] = hx + dx; P[w++] = hy + dy; P[w++] = hz + dz;
                }
            }
            pos.needsUpdate = true;
            g.setDrawRange(0, total * 2);
        }

        dispose() {
            if (this.waterFluid) {
                if (this.viewer && this.viewer.postPasses) this.viewer.postPasses = this.viewer.postPasses.filter(p => p !== this.waterFluid.pass);
                this.waterFluid.dispose();
                this.waterFluid = null;
            }
            for (const c of this.classes) {
                if (c.streaks) { c.streaks.geometry.dispose(); c.streaks.material.dispose(); }
                c.points.geometry.dispose();
                if (c.points.material.map) c.points.material.map.dispose();
                c.points.material.dispose();
            }
            this.scene.remove(this.group);
            this.classes = [];
            this.files = [];
        }
    }

    global.FDSParticles = { parsePrt5Stream, parseSmvParticles, ParticleLayer, nearestIndex };
})(window);
