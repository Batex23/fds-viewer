/**
 * Lecteur de simulation — interface simplifiée posée sur le moteur existant.
 *
 * Principe : la vue 3D des résultats occupe l'écran. Par-dessus :
 *   - une barre d'outils à gauche (Vues, Coupe, Bâtiment, Capture) ;
 *   - en haut, le choix de la donnée affichée (Fumée, Plans de coupe,
 *     Parois, Courbes) et ses réglages essentiels ;
 *   - en bas, un lecteur façon vidéo dont la frise porte la courbe HRR.
 * Tout le reste (anciens panneaux) reste accessible en tiroirs « Tous les
 * réglages » / « Tous les calques », ou via le mode expert.
 *
 * Le moteur est piloté par window.outputPageAPI (js/output-page.js).
 */
(function () {
    'use strict';

    const LS_UI = 'sp33-ui-mode';
    const LS_VIEWS = 'sp33-views:';
    const SPEEDS = [0.5, 1, 2, 4, 8, 16];

    const api = () => window.outputPageAPI;
    const $ = (sel, root) => (root || document).querySelector(sel);
    const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fmtNum = (v, d) => Number(v).toLocaleString('fr-FR', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
    const lsGet = k => { try { return localStorage.getItem(k); } catch (_) { return null; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* navigation privée */ } };

    // ── Icônes (tracés simples, 24×24) ───────────────────────────────────
    const ICONS = {
        play: '<path d="M7 4.6v14.8L19.5 12z" fill="currentColor" stroke="none"/>',
        pause: '<rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none"/>',
        cube: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>',
        cut: '<path d="M4 9V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v4"/><path d="M2 12h20"/><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" stroke-dasharray="2.5 2.5"/>',
        building: '<path d="M5 21V8l7-4.5L19 8v13"/><path d="M10 21v-5h4v5"/><path d="M3 21h18"/><path d="M9 11h.01M15 11h.01"/>',
        walk: '<circle cx="13" cy="4.5" r="1.8"/><path d="M10 21l2.5-6 2.5 2.5V21"/><path d="M7 12.5l2.5-4h4.5l2 3.5H19"/><path d="M12.5 8.5l-1 6.5"/>',
        camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
        sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
        more: '<circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/>',
        folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
        file: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5"/>',
        flame: '<path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5 1-8.5z"/>',
        x: '<path d="M6 6l12 12M18 6L6 18"/>',
        layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
        expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
        help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7"/><path d="M12 17h.01"/>',
        tool: '<path d="M14.5 6.5a4 4 0 0 0-5 5L4 17l3 3 5.5-5.5a4 4 0 0 0 5-5l-2.5 2.5-2.5-.5-.5-2.5z"/>',
        player: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9.5v5l4.5-2.5z" fill="currentColor"/>',
        info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
        target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5"/>',
        drive: '<path d="M8.5 4h7l6 10.5-3.5 6h-11L3.5 14.5z"/><path d="M8.5 4l6.5 11h7M15.5 4L9 15H2.5M5.5 19.5L12 9"/>',
        plus: '<path d="M12 5v14M5 12h14"/>',
        chev: '<path d="M6 9l6 6 6-6"/>',
        check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    };
    const icon = (name, cls) => `<svg class="${cls || 'st-ico'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

    // ── État ──────────────────────────────────────────────────────────────
    const S = {
        open: null,                 // panneau contextuel ouvert
        cut: { axis: 'z', pos: null, keep: 'below', on: false },
        hrr: null,                  // { t: [], q: [] } en kW
        csvSeen: false,
        frames: [],
        frameIdx: 0,
        simKey: '',
        hover: null,                // temps survolé sur la frise
        scrubbing: false,
        availSig: '',
        defaultsApplied: false,
        // Lecture pilotée par le lecteur (toutes les couches au même instant)
        time: 0, playing: false, speed: 1, lastTick: 0, nextApply: 0,
        files: [], devc: null, devcSel: [], devcPicker: false, devcFilter: '',
        dock: false, dockCharts: null,
        smokeLoading: false, sliceLoading: new Set(),
        sliceMap: 'diagnostic', sliceOpacity: 0.9, sliceDepth: false, sliceOutline: true,
        partBase: 0.05, partScale: 1,
        L: {
            smoke: { on: true, times: [], _src: null },
            wall: { on: false, loaded: false, loading: false, key: null, times: [], quantity: '', units: '', progress: '' },
            part: { on: false, layer: null, loading: false, available: false, progress: '' },
            slices: [],
        },
    };

    // ── Commandes de l'ancienne interface (pilotées par valeur) ───────────
    function setCtl(id, value) {
        const el = document.getElementById(id);
        if (!el) return;
        if (el.type === 'checkbox') el.checked = !!value;
        else el.value = String(value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const ctl = id => document.getElementById(id);
    const layerBox = layer => $(`.output-layer-toggle[data-layer="${layer}"]`);
    function setLayer(layer, on) {
        const cb = layerBox(layer);
        if (!cb || cb.checked === !!on) return;
        cb.checked = !!on;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // ── Chargement : capture des fichiers pour la frise HRR ───────────────
    const _origLoadFolder = window.outputPageLoadFolder;
    if (typeof _origLoadFolder === 'function') {
        window.outputPageLoadFolder = async function (files, opts) {
            onFiles(files);
            const r = await _origLoadFolder.call(this, files, opts);
            afterLoad();
            return r;
        };
    }

    function onFiles(files) {
        const smv = files.find(f => /\.smv$/i.test(f.name));
        S.simKey = smv ? smv.name.replace(/\.smv$/i, '') : (S.simKey || '');
        S.csvSeen = files.some(f => /\.csv$/i.test(f.name));
        S.hrr = null; S.devc = null; S.devcSel = []; S.dockCharts = null;
        S.files = files;
        resetLayers();
        L.part.available = files.some(f => /\.prt5$/i.test(f.name));
        const hrr = files.find(f => /_hrr\.csv$/i.test(f.name));
        if (hrr) {
            hrr.text().then(txt => { S.hrr = parseHrr(txt); drawTimeline(); refreshHrrReadout(); renderChips(true); if (S.dock) buildDock(); })
                .catch(() => { /* frise sans courbe */ });
        }
        const devc = files.find(f => /_devc\.csv$/i.test(f.name));
        if (devc) {
            devc.text().then(txt => {
                S.devc = parseCsv(txt);
                S.devcSel = defaultDevcSelection(S.devc);
                renderChips(true);
                if (S.dock) buildDock();
            }).catch(() => { /* pas de capteurs */ });
        }
    }

    function parseHrr(text) {
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 3) return null;
        const split = l => l.split(',').map(s => s.trim().replace(/^"|"$/g, ''));
        const names = split(lines[1]).map(s => s.toUpperCase());
        const it = names.indexOf('TIME');
        const iq = names.indexOf('HRR');
        if (it < 0 || iq < 0) return null;
        const t = [], q = [];
        for (let i = 2; i < lines.length; i++) {
            const c = split(lines[i]);
            const tv = parseFloat(c[it]), qv = parseFloat(c[iq]);
            if (Number.isFinite(tv) && Number.isFinite(qv)) { t.push(tv); q.push(qv); }
        }
        return t.length > 1 ? { t, q, max: Math.max(...q) } : null;
    }

    function hrrAt(time) {
        const h = S.hrr;
        if (!h) return null;
        if (time <= h.t[0]) return h.q[0];
        if (time >= h.t[h.t.length - 1]) return h.q[h.q.length - 1];
        let lo = 0, hi = h.t.length - 1;
        while (hi - lo > 1) { const m = (lo + hi) >> 1; if (h.t[m] <= time) lo = m; else hi = m; }
        const f = (time - h.t[lo]) / (h.t[hi] - h.t[lo] || 1);
        return h.q[lo] + f * (h.q[hi] - h.q[lo]);
    }

    function fmtPower(kw) {
        if (kw == null || !Number.isFinite(kw)) return '—';
        return Math.abs(kw) >= 1000 ? fmtNum(kw / 1000, 2) + ' MW' : fmtNum(kw, 0) + ' kW';
    }
    function fmtTime(t) {
        if (!Number.isFinite(t)) return '—';
        return fmtNum(t, t < 10 ? 1 : 0) + ' s';
    }

    async function loadLocalFolder(files) {
        if (!files.length) return;
        if (!files.some(f => /\.smv$/i.test(f.name))) {
            toast('Ce dossier ne contient pas de fichier .smv : choisissez le dossier de résultats FDS.');
            return;
        }
        toast('Chargement de la simulation…', 0);
        try {
            const fds = files.find(f => /\.fds$/i.test(f.name));
            if (fds && typeof window._fdsReload === 'function') window._fdsReload(await fds.text(), fds.name);
            const mt = ctl('model-title');
            if (mt && !mt.textContent) mt.textContent = S.simKey;
            await window.outputPageLoadFolder(files, { autoSmoke: true });
            const csvs = files.filter(f => /_(hrr|devc)\.csv$/i.test(f.name));
            if (csvs.length && typeof window.chartsPanelHandleFiles === 'function') window.chartsPanelHandleFiles(csvs);
            toast('Simulation chargée.');
        } catch (e) {
            console.error(e);
            toast('Impossible de charger ce dossier : ' + e.message);
        }
    }

    async function afterLoad() {
        applyStudioDefaults(true);
        const a = api();
        const av = a && a.availability();
        S.cut.on = false; S.cut.pos = null;
        if (!av) return;
        // Le lecteur garde le moteur en mode « fumée » et gère lui-même
        // l'affichage de chaque couche.
        a.setMode('smoke');
        a.stopAllPlayback();
        L.smoke.on = true;
        await buildSmvGeometry();
        const [t0] = span();
        S.time = t0;
        applyVisibility();
        applyTime(true);
        sync(true);
        if (!av.smoke) toast('Ce calcul ne contient pas de fumée 3D (fichiers .s3d) : vérifiez &DUMP / SMOKE3D dans le .fds.', 7000);
        // Préchargement en arrière-plan : particules (affichées dès qu'elles
        // sont prêtes), puis températures des parois (affichées d'office
        // seulement s'il n'y a pas de fumée).
        if (L.part.available) await loadParticles(true);
        if (a.boundarySets().length) await loadWall(null, !av.smoke);
        if (!av.smoke && !L.wall.on && av.slice) togglePop('slices', $('[data-layer="slices"]', modes));
    }

    // Vue épurée par défaut : on garde le bâtiment, on masque le maillage.
    function applyStudioDefaults(results) {
        if (!layerBox('grid')) return;
        // Par défaut : bâtiment et foyers seulement. Évents, HOLE et
        // emplacements des &SLCF sont masqués (activables dans « Bâtiment »).
        ['grid', 'meshes', 'devcs', 'inits', 'zones', 'hvacs', 'vents', 'holes'].forEach(l => setLayer(l, false));
        ['obsts', 'geoms', 'fires'].forEach(l => setLayer(l, true));
        const v = api() && api().getViewer();
        if (v && v.slcfGroup) v.slcfGroup.visible = false;
        // Rendu « PyroSim » : murs pleins beiges, arêtes noires, fond ardoise,
        // fumée masquée par les murs.
        setCtl('output-scene-grayscale', false);
        setCtl('output-smoke-render', 'depth');
        applyLook();
        S.defaultsApplied = true;
    }

    // ── Aspect du bâtiment ────────────────────────────────────────────────
    const BG = { slate: '#535a74', light: '#e8e8e8', dark: '#0d1736' };
    const LOOK_KEY = 'sp33-look';
    function loadLook() {
        const d = { colors: 'fds', edges: true, bg: 'slate' };
        try { return Object.assign(d, JSON.parse(localStorage.getItem(LOOK_KEY) || '{}')); } catch (_) { return d; }
    }
    S.look = loadLook();
    window.FDS_DISTINCT_SURF_COLORS = S.look.colors === 'distinct';
    function saveLook() { try { localStorage.setItem(LOOK_KEY, JSON.stringify(S.look)); } catch (_) { /* navigation privée */ } }
    function applyLook() {
        const v = api() && api().getViewer();
        window.FDS_DISTINCT_SURF_COLORS = S.look.colors === 'distinct';
        if (!v) return;
        setCtl('output-scene-grayscale', S.look.colors === 'gray');
        if (v.refreshSurfaceColors) v.refreshSurfaceColors();
        if (smvParsed && smvGeo && smvGeo._distinct !== (S.look.colors === 'distinct')) {
            smvGeo._distinct = S.look.colors === 'distinct';
            rebuildSmvGeometry();
        }
        hideBoundaryVents();
        if (v.setShowObstEdges) v.setShowObstEdges(!!S.look.edges);
        if (document.body.classList.contains('studio')) v.setBackground(BG[S.look.bg] || BG.slate);
    }
    // ── Géométrie du .smv : murs percés par les HOLE, portes mobiles ─────
    let smvGeo = null, smvParsed = null;
    async function buildSmvGeometry() {
        if (smvGeo) { smvGeo.dispose(); smvGeo = null; }
        smvParsed = null;
        const smv = S.files.find(f => /\.smv$/i.test(f.name));
        if (!smv || !window.FDSSmvGeometry) return;
        try { smvParsed = FDSSmvGeometry.parse(await smv.text()); }
        catch (e) { console.warn('[smv]', e); return; }
        rebuildSmvGeometry();
    }
    function rebuildSmvGeometry() {
        const v = api() && api().getViewer();
        if (!v || !smvParsed) return;
        if (!smvGeo) smvGeo = new FDSSmvGeometry.SmvGeometry(v);
        smvGeo._distinct = S.look.colors === 'distinct';
        const n = smvGeo.build(smvParsed, { distinct: smvGeo._distinct });
        if (!n) { smvGeo.dispose(); smvGeo = null; return; }
        v.obstGroup.add(smvGeo.group);
        // Les OBST lus dans le .fds ne tiennent pas compte des HOLE : on
        // affiche à la place la géométrie réellement calculée par FDS.
        v.obstGroup.children.forEach(c => { if (c.userData && c.userData.type === 'OBST') c.visible = false; });
        setLayer('holes', false);
        if (v.setShowObstEdges) v.setShowObstEdges(!!S.look.edges);
        if (v._grayscale) v.setGrayscale(true);
        smvGeo.setTime(S.time);
    }
    /** Évents OPEN / MIRROR (limites du domaine) : non affichés, comme dans PyroSim. */
    function hideBoundaryVents() {
        const v = api() && api().getViewer();
        if (!v || !v.ventGroup) return;
        v.ventGroup.children.forEach(c => {
            const sid = c.userData && c.userData.surf_id;
            const name = String(Array.isArray(sid) ? sid[0] : sid || '').replace(/['"]/g, '').trim();
            if (/^(OPEN|MIRROR|PERIODIC)$/i.test(name)) c.visible = false;
        });
    }

    // Le changement de thème clair/sombre ne doit pas écraser le fond choisi.
    const _setSceneBg = window.outputPageSetSceneBackground;
    window.outputPageSetSceneBackground = function (bg) {
        if (_setSceneBg) _setSceneBg(bg);
        if (document.body.classList.contains('studio')) applyLook();
    };

    // ── Construction de l'interface ───────────────────────────────────────
    let root, rail, modes, player, timeline, canvas, tip, emptyEl, toastEl, pop, menuEl;

    function buildRoot() {
        const layout = $('#output-panel .output-layout');
        if (!layout) return;
        root = document.createElement('div');
        root.id = 'st-root';
        root.className = 'st-only';
        root.innerHTML = `
            <nav class="st-rail st-glass" aria-label="Outils">
                <button type="button" class="st-tool" data-pop="views" data-tip="Vues" aria-label="Vues" aria-expanded="false">${icon('cube')}</button>
                <button type="button" class="st-tool" data-pop="cut" data-tip="Couper le bâtiment" aria-label="Couper le bâtiment" aria-expanded="false">${icon('cut')}</button>
                <button type="button" class="st-tool" data-pop="building" data-tip="Affichage du bâtiment" aria-label="Affichage du bâtiment" aria-expanded="false">${icon('building')}</button>
                <hr>
                <button type="button" class="st-tool" data-act="capture" data-tip="Capturer l’image" aria-label="Capturer l’image">${icon('camera')}</button>
            </nav>
            <div class="st-modes st-glass" role="toolbar" aria-label="Donnée affichée" hidden></div>
            <div class="st-player st-glass" hidden>
                <button type="button" class="st-play" aria-label="Lecture">${icon('play')}</button>
                <div class="st-clock" aria-live="off"><strong>0 s</strong><span>sur —</span></div>
                <div class="st-timeline" tabindex="0" role="slider" aria-label="Temps de simulation" aria-valuemin="0" aria-valuemax="0" aria-valuenow="0">
                    <canvas></canvas>
                    <div class="st-tl-tip" hidden></div>
                </div>
                <div class="st-hrr" hidden title="Puissance dégagée par le feu (fichier _hrr.csv)"><strong>—</strong><span>HRR</span></div>
                <button type="button" class="st-speed" title="Vitesse de lecture" aria-haspopup="menu">×1</button>
            </div>
            <section class="st-empty st-glass" hidden>
                <h1>Ouvrir une simulation</h1>
                <p>Choisissez le dossier de résultats d’un calcul FDS dans votre Google Drive ou sur cet ordinateur, ou ouvrez un lien partagé.</p>
                <div class="st-empty-actions">
                    <button type="button" class="st-btn st-btn-primary" data-act="open-drive">${icon('drive')} Depuis Google Drive <small>connexion Google</small></button>
                    <button type="button" class="st-btn" data-act="open-folder">${icon('folder')} Dossier sur cet ordinateur <small>.smv, .s3d, .sf…</small></button>
                    <button type="button" class="st-btn" data-act="open-fds">${icon('file')} Fichier .fds seul <small>géométrie</small></button>
                    <button type="button" class="st-btn st-btn-ghost" data-act="open-sample">${icon('flame')} Voir l’exemple</button>
                </div>
                <div class="st-empty-note">Vous pouvez aussi glisser-déposer le dossier sur cette page.</div>
            </section>`;
        layout.appendChild(root);

        rail = $('.st-rail', root);
        modes = $('.st-modes', root);
        player = $('.st-player', root);
        timeline = $('.st-timeline', root);
        canvas = $('canvas', timeline);
        tip = $('.st-tl-tip', timeline);
        emptyEl = $('.st-empty', root);

        rail.addEventListener('click', e => {
            const b = e.target.closest('.st-tool');
            if (!b) return;
            if (b.dataset.pop) togglePop(b.dataset.pop, b);
            else if (b.dataset.act === 'walk') toggleWalk();
            else if (b.dataset.act === 'capture') capture();
        });
        emptyEl.addEventListener('click', e => {
            const b = e.target.closest('[data-act]');
            if (b) openAction(b.dataset.act);
        });
        $('.st-play', player).addEventListener('click', togglePlay);
        $('.st-speed', player).addEventListener('click', e => openSpeedMenu(e.currentTarget));
        wireTimeline();

        // En-têtes « fermer » des tiroirs (anciens panneaux)
        [['.output-sidebar-left', 'Tous les calques', 'left'], ['.output-sidebar-right', 'Tous les réglages', 'right']].forEach(([sel, title, side]) => {
            const sb = $(sel);
            if (!sb || $('.st-drawer-close', sb)) return;
            const h = document.createElement('div');
            h.className = 'st-drawer-close st-only';
            h.innerHTML = `<span>${title}</span><button type="button" class="st-btn st-btn-ghost" aria-label="Fermer">${icon('x', 'st-ico-sm')}</button>`;
            $('button', h).addEventListener('click', () => drawer(side, false));
            sb.prepend(h);
        });
    }

    function buildTopbar() {
        const actions = $('.top-bar .actions');
        if (!actions) return;
        const share = ctl('rl-share-btn');
        const mk = (html, cls, title) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'btn btn-sm ' + cls;
            b.title = title;
            b.innerHTML = html;
            return b;
        };
        const openBtn = mk(icon('folder', 'st-ico-sm') + '<span>Ouvrir</span>', 'btn-secondary st-topbtn st-only', 'Ouvrir une simulation');
        openBtn.id = 'st-open-btn';
        openBtn.addEventListener('click', () => openMenu(openBtn, [
            { icon: 'drive', label: 'Depuis Google Drive', sub: 'Mon Drive, partagés avec moi, Drives partagés', act: 'open-drive' },
            { icon: 'folder', label: 'Dossier sur cet ordinateur', sub: 'Fumée, plans de coupe, parois, courbes', act: 'open-folder' },
            { icon: 'file', label: 'Fichier .fds seul', sub: 'Géométrie, sans résultats', act: 'open-fds' },
            { icon: 'flame', label: 'Simulation d’exemple', act: 'open-sample' },
        ]));
        const backBtn = mk(icon('player', 'st-ico-sm') + '<span>Retour au lecteur</span>', 'btn-primary st-topbtn st-expert-only', 'Revenir au lecteur simplifié');
        backBtn.addEventListener('click', () => setStudio(true));
        const moreBtn = mk(icon('more', 'st-ico-sm'), 'btn-secondary st-only', 'Plus d’options');
        moreBtn.setAttribute('aria-label', 'Plus d’options');
        moreBtn.addEventListener('click', () => openMenu(moreBtn, [
            { icon: 'expand', label: 'Mode présentation', sub: 'Plein écran, scène et lecteur seuls', act: 'present' },
            { icon: 'tool', label: 'Analyse du modèle', sub: 'Mode expert : maillage, feu, code…', act: 'expert' },
            { sep: true },
            { icon: 'help', label: 'Guide d’utilisation', act: 'help' },
            { icon: 'info', label: 'À propos et licence', act: 'license' },
        ]));
        actions.insertBefore(openBtn, share || actions.firstChild);
        actions.insertBefore(backBtn, actions.firstChild);
        actions.appendChild(moreBtn);
    }

    // ── Menus de la barre supérieure ──────────────────────────────────────
    function openMenu(anchor, items) {
        closeMenu();
        menuEl = document.createElement('div');
        menuEl.className = 'st-menu st-glass';
        menuEl.setAttribute('role', 'menu');
        menuEl.innerHTML = items.map(it => it.sep ? '<hr>' :
            `<button type="button" role="menuitem" data-act="${it.act}">${icon(it.icon)}<span>${esc(it.label)}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span></button>`).join('');
        document.body.appendChild(menuEl);
        const r = anchor.getBoundingClientRect();
        menuEl.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
        menuEl.addEventListener('click', e => {
            const b = e.target.closest('[data-act]');
            if (!b) return;
            closeMenu();
            openAction(b.dataset.act);
        });
        const first = $('button', menuEl);
        if (first) first.focus();
        setTimeout(() => document.addEventListener('pointerdown', outsideMenu, true), 0);
    }
    function outsideMenu(e) { if (menuEl && !menuEl.contains(e.target)) closeMenu(); }
    function closeMenu() {
        if (menuEl) { menuEl.remove(); menuEl = null; }
        document.removeEventListener('pointerdown', outsideMenu, true);
    }

    let folderInput;
    function openAction(act) {
        if (act === 'open-drive') {
            const R = window.FDSRemote;
            if (!R || !R.hasOAuth()) {
                toast('L’ouverture depuis Google Drive n’est pas encore activée sur ce site (identifiant client OAuth à renseigner).', 6000);
                return;
            }
            R.pickFromDrive();
            return;
        }
        if (act === 'open-folder') {
            if (!folderInput) {
                folderInput = document.createElement('input');
                folderInput.type = 'file';
                folderInput.webkitdirectory = true;
                folderInput.multiple = true;
                folderInput.hidden = true;
                folderInput.addEventListener('change', () => {
                    const files = Array.from(folderInput.files || []);
                    folderInput.value = '';
                    loadLocalFolder(files);
                });
                document.body.appendChild(folderInput);
            }
            folderInput.click();
        } else if (act === 'open-fds') {
            const fi = ctl('file-input');
            if (fi) fi.click();
        } else if (act === 'open-sample') {
            // Simulation d'exemple publique sur le Drive (voir js/config.js).
            const id = (window.FDS_VIEWER_CONFIG || {}).sampleDriveId;
            if (id) location.assign(location.pathname + '?drive=' + encodeURIComponent(id));
            else { const b = ctl('load-sample'); if (b) b.click(); }
        } else if (act === 'present') {
            present(true);
        } else if (act === 'expert') {
            setStudio(false);
        } else if (act === 'help') {
            setStudio(false, 'help');
        } else if (act === 'license') {
            const b = ctl('show-license');
            if (b) b.click();
        }
    }

    // ── Modes lecteur / expert / présentation ─────────────────────────────
    function setStudio(on, page) {
        S.playing = false;
        document.body.classList.toggle('studio', on);
        try {
            const v = api() && api().getViewer();
            if (v) {
                if (on) applyLook();
                else v.setBackground(document.documentElement.getAttribute('data-theme') === 'light' ? BG.light : BG.dark);
            }
        } catch (_) { /* pas encore de vue 3D */ }
        if (!on && legendEl) legendEl.hidden = true;
        lsSet(LS_UI, on ? 'studio' : 'expert');
        closePop(); closeMenu(); drawer('left', false); drawer('right', false);
        const tab = $(`.page-tab[data-page="${on ? 'output' : (page || 'output')}"]`);
        if (tab) tab.click();
        const v = api() && api().getViewer();
        if (v) setTimeout(() => v._onResize(), 30);
        sync(true);
    }

    function present(on) {
        document.body.classList.toggle('st-present', on);
        closePop();
        if (on && document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(() => { /* refus du navigateur */ });
        }
        if (on) toast('Mode présentation — Échap pour quitter.');
        const v = api() && api().getViewer();
        if (v) setTimeout(() => v._onResize(), 60);
    }
    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement && document.body.classList.contains('st-present')) present(false);
    });

    function drawer(side, open) {
        document.body.classList.toggle('st-drawer-' + side, !!open);
    }

    // ── Panneaux contextuels ──────────────────────────────────────────────
    function togglePop(name, anchor) {
        if (S.open === name) { closePop(); return; }
        closePop();
        S.open = name;
        pop = document.createElement('section');
        pop.className = 'st-pop st-glass';
        pop.setAttribute('aria-label', name);
        root.appendChild(pop);
        if (anchor) anchor.setAttribute('aria-expanded', 'true');
        if (anchor && anchor.closest('.st-modes')) {
            // Réglages : sous la barre des modes, côté droit
            const r = anchor.getBoundingClientRect(), pr = root.getBoundingClientRect();
            pop.style.left = Math.max(8, Math.min(r.right - pr.left - 300, pr.width - 308)) + 'px';
            pop.style.top = (r.bottom - pr.top + 10) + 'px';
        } else if (anchor && window.innerWidth > 760) {
            const r = anchor.getBoundingClientRect(), pr = root.getBoundingClientRect();
            pop.style.top = Math.max(16, r.top - pr.top - 6) + 'px';
        }
        renderPop();
    }
    function closePop() {
        S.open = null;
        if (pop) { pop.remove(); pop = null; }
        $$('.st-tool[aria-expanded="true"]', root).forEach(b => b.setAttribute('aria-expanded', 'false'));
    }
    // Un seul gestionnaire par type et par panneau : les rendus successifs
    // remplacent le précédent au lieu de l'empiler.
    const on = (el, type, fn) => { el['on' + type] = fn; };
    const popHead = title => `<h2>${esc(title)}<button type="button" class="st-x" data-close aria-label="Fermer">${icon('x', 'st-ico-sm')}</button></h2>`;

    function renderPop() {
        if (!pop) return;
        const fn = { views: popViews, cut: popCut, building: popBuilding, settings: popSettings, slices: popSlices }[S.open];
        if (fn) fn(pop);
        const x = $('[data-close]', pop);
        if (x) x.addEventListener('click', closePop);
    }

    // Vues
    function popViews(el) {
        const v = api().getViewer();
        const ortho = v && v.getProjection && v.getProjection() === 'orthographic';
        const views = loadViews();
        el.innerHTML = popHead('Vues') + `
            <div class="st-views">
                ${[['iso', 'Iso'], ['top', 'Dessus'], ['front', 'Avant'], ['back', 'Arrière'], ['left', 'Gauche'], ['right', 'Droite']]
                    .map(([k, l]) => `<button type="button" class="st-btn" data-view="${k}">${l}</button>`).join('')}
            </div>
            <button type="button" class="st-btn st-btn-block" data-reset style="margin-top:6px">${icon('target', 'st-ico-sm')} Recentrer sur le modèle</button>
            <div class="st-field" style="margin-top:14px">
                <div class="st-label">Projection</div>
                <div class="st-seg" data-proj>
                    <button type="button" data-v="perspective" aria-pressed="${!ortho}">Perspective</button>
                    <button type="button" data-v="orthographic" aria-pressed="${!!ortho}">Orthographique</button>
                </div>
            </div>
            <div class="st-field">
                <div class="st-label">Mes vues</div>
                ${views.length ? '' : '<div class="st-hint">Enregistrez un point de vue pour y revenir pendant une présentation.</div>'}
                <ul class="st-saved">${views.map((vw, i) => `<li><button type="button" class="st-saved-go" data-i="${i}">${esc(vw.name)}</button><button type="button" class="st-x" data-del="${i}" aria-label="Supprimer ${esc(vw.name)}">${icon('x', 'st-ico-sm')}</button></li>`).join('')}</ul>
                <form class="st-save-row"><input type="text" placeholder="Nom de la vue" maxlength="40" aria-label="Nom de la vue"><button type="submit" class="st-btn">${icon('plus', 'st-ico-sm')} Enregistrer</button></form>
            </div>`;
        on(el, 'click', e => {
            const b = e.target.closest('button');
            if (!b) return;
            if (b.dataset.view) flyToPreset(b.dataset.view);
            else if (b.hasAttribute('data-reset')) flyToPreset('reset');
            else if (b.closest('[data-proj]')) {
                const vw = api().getViewer();
                vw.setProjection(b.dataset.v);
                renderPop();
            } else if (b.dataset.i != null) flyToSaved(loadViews()[+b.dataset.i]);
            else if (b.dataset.del != null) {
                const list = loadViews(); list.splice(+b.dataset.del, 1); saveViews(list); renderPop();
            }
        });
        $('form', el).addEventListener('submit', e => {
            e.preventDefault();
            const inp = $('input', el);
            const vw = api().getViewer();
            const list = loadViews();
            list.push({
                name: inp.value.trim() || ('Vue ' + (list.length + 1)),
                pos: vw.camera.position.toArray(),
                target: vw.controls.target.toArray(),
                proj: vw.getProjection(),
            });
            saveViews(list);
            renderPop();
        });
    }
    const viewsKey = () => LS_VIEWS + (S.simKey || (ctl('filename-display') || {}).textContent || 'sans-nom');
    function loadViews() { try { return JSON.parse(lsGet(viewsKey()) || '[]'); } catch (_) { return []; } }
    function saveViews(list) { lsSet(viewsKey(), JSON.stringify(list)); }

    let flight = null;
    function flyTo(pos, target, ms) {
        const v = api().getViewer();
        if (!v) return;
        const from = { p: v.camera.position.clone(), t: v.controls.target.clone() };
        const to = { p: new THREE.Vector3().fromArray(pos), t: new THREE.Vector3().fromArray(target) };
        if (flight) cancelAnimationFrame(flight);
        const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
        const dur = reduce ? 0 : (ms || 650);
        const t0 = performance.now();
        const step = now => {
            const k = dur ? Math.min(1, (now - t0) / dur) : 1;
            const e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
            v.camera.position.lerpVectors(from.p, to.p, e);
            v.controls.target.lerpVectors(from.t, to.t, e);
            v.camera.lookAt(v.controls.target);
            v.controls.update();
            flight = k < 1 ? requestAnimationFrame(step) : null;
        };
        flight = requestAnimationFrame(step);
    }
    function flyToPreset(name) {
        const v = api().getViewer();
        if (!v) return;
        const fromP = v.camera.position.toArray(), fromT = v.controls.target.toArray();
        if (name === 'reset') v.resetCamera(); else v.setView(name);
        const toP = v.camera.position.toArray(), toT = v.controls.target.toArray();
        if (v.getProjection() === 'orthographic') return; // le zoom ortho ne s'interpole pas
        v.camera.position.fromArray(fromP); v.controls.target.fromArray(fromT);
        flyTo(toP, toT);
    }
    function flyToSaved(vw) {
        if (!vw) return;
        const v = api().getViewer();
        if (vw.proj && v.getProjection() !== vw.proj) v.setProjection(vw.proj);
        flyTo(vw.pos, vw.target, 800);
    }

    // Coupe
    const CUT_AXES = {
        z: { label: 'Horizontale', sub: 'étages', keep: ['Garder le dessous', 'Garder le dessus'] },
        x: { label: 'Verticale', sub: 'selon x', keep: ['Côté x min', 'Côté x max'] },
        y: { label: 'Verticale', sub: 'selon y', keep: ['Côté y min', 'Côté y max'] },
    };
    function popCut(el) {
        const b = api().bounds();
        if (!b) {
            el.innerHTML = popHead('Couper le bâtiment') + '<p class="st-help">Ouvrez d’abord une simulation.</p>';
            return;
        }
        const c = S.cut;
        const [mn, mx] = [b[c.axis + 'min'], b[c.axis + 'max']];
        if (c.pos == null || c.pos < mn || c.pos > mx) c.pos = c.axis === 'z' ? mn + (mx - mn) * 0.8 : (mn + mx) / 2;
        const ax = CUT_AXES[c.axis];
        el.innerHTML = popHead('Couper le bâtiment') + `
            <p class="st-help">Retirez une partie du bâtiment pour voir l’intérieur. La fumée et les résultats sont coupés aussi.</p>
            <div class="st-field">
                <div class="st-label">Direction</div>
                <div class="st-seg" data-axis>
                    ${Object.entries(CUT_AXES).map(([k, a]) => `<button type="button" data-v="${k}" aria-pressed="${c.axis === k}">${a.label}<small style="font-weight:500;opacity:.75">${a.sub}</small></button>`).join('')}
                </div>
            </div>
            <div class="st-field">
                <div class="st-label">Position <span class="st-val">${c.axis} = ${fmtNum(c.pos, 2)} m</span></div>
                <input type="range" class="st-range" min="${mn}" max="${mx}" step="${Math.max(0.01, (mx - mn) / 400)}" value="${c.pos}" aria-label="Position de la coupe">
                <div class="st-range-ends"><span>${fmtNum(mn, 2)} m</span><span>${fmtNum(mx, 2)} m</span></div>
            </div>
            <div class="st-field">
                <div class="st-seg" data-keep>
                    <button type="button" data-v="below" aria-pressed="${c.keep === 'below'}">${ax.keep[0]}</button>
                    <button type="button" data-v="above" aria-pressed="${c.keep === 'above'}">${ax.keep[1]}</button>
                </div>
            </div>
            <button type="button" class="st-btn st-btn-block" data-clear ${c.on ? '' : 'disabled'}>Retirer la coupe</button>`;
        const range = $('input', el);
        const val = $('.st-val', el);
        range.addEventListener('input', () => {
            c.pos = parseFloat(range.value);
            val.textContent = `${c.axis} = ${fmtNum(c.pos, 2)} m`;
            applyCut();
            const clr = $('[data-clear]', el); if (clr) clr.disabled = false;
        });
        on(el, 'click', e => {
            const btn = e.target.closest('button');
            if (!btn) return;
            if (btn.closest('[data-axis]')) { c.axis = btn.dataset.v; c.pos = null; renderPop(); applyCut(); }
            else if (btn.closest('[data-keep]')) { c.keep = btn.dataset.v; renderPop(); applyCut(); }
            else if (btn.hasAttribute('data-clear')) { clearCut(); renderPop(); }
        });
    }
    function bindClose(el) { const x = $('[data-close]', el); if (x) x.addEventListener('click', closePop); }
    function applyCut() {
        const b = api().bounds();
        if (!b) return;
        const c = S.cut;
        const box = {};
        box[c.axis] = c.keep === 'below' ? [b[c.axis + 'min'], c.pos] : [c.pos, b[c.axis + 'max']];
        api().setClip(box);
        c.on = true;
        markRail();
    }
    function clearCut() {
        api().setClip(null);
        S.cut.on = false;
        markRail();
    }

    // Bâtiment
    function popBuilding(el) {
        const opacity = parseFloat((ctl('output-opacity-slider') || {}).value || 1);
        const obstOn = (layerBox('obsts') || {}).checked !== false;
        const wall = !obstOn ? 'hidden' : opacity < 0.6 ? 'ghost' : 'solid';
        const sw = (key, label, on) => `<label class="st-switch"><span>${label}</span><input type="checkbox" data-sw="${key}" ${on ? 'checked' : ''}></label>`;
        const isOn = l => !!(layerBox(l) && layerBox(l).checked);
        const seg = (key, opts) => `<div class="st-seg" data-look="${key}">${opts.map(([v, l]) =>
            `<button type="button" data-v="${v}" aria-pressed="${S.look[key] === v}">${l}</button>`).join('')}</div>`;
        el.innerHTML = popHead('Bâtiment') + `
            <div class="st-field">
                <div class="st-label">Murs et obstacles</div>
                <div class="st-seg" data-wall>
                    <button type="button" data-v="solid" aria-pressed="${wall === 'solid'}">Opaques</button>
                    <button type="button" data-v="ghost" aria-pressed="${wall === 'ghost'}">Transparents</button>
                    <button type="button" data-v="hidden" aria-pressed="${wall === 'hidden'}">Masqués</button>
                </div>
            </div>
            <div class="st-field">
                <div class="st-label">Couleurs</div>
                ${seg('colors', [['fds', 'Comme PyroSim'], ['distinct', 'Par matériau'], ['gray', 'Gris']])}
                <div class="st-hint">« Comme PyroSim » reprend les couleurs du .fds (COLOR, RGB) et le beige par défaut de FDS.</div>
            </div>
            <div class="st-field">
                ${smvGeo && smvGeo.dynamic.length ? `<div class="st-hint" style="margin:-4px 0 12px">${smvGeo.dynamic.length} obstruction(s) mobile(s) (portes, trappes) : elles s’ouvrent et se ferment avec la lecture. Repères sur la frise : <b style="color:#2ec4b6">▼</b> ouverture, <b style="color:#ff9f1c">▼</b> fermeture.</div>` : ''}
                <div class="st-label">Fond</div>
                ${seg('bg', [['slate', 'Ardoise'], ['light', 'Clair'], ['dark', 'Nuit']])}
            </div>
            <div class="st-field">
                <label class="st-switch"><span>Arêtes des obstacles</span><input type="checkbox" data-edges ${S.look.edges ? 'checked' : ''}></label>
                ${sw('fires', 'Foyers', isOn('fires'))}
                ${sw('openings', 'Ouvertures et vents', isOn('vents') || isOn('holes'))}
                ${sw('devcs', 'Capteurs', isOn('devcs'))}
                <label class="st-switch"><span>Emplacement des plans (&amp;SLCF)</span><input type="checkbox" data-slcf ${(api().getViewer() || {}).slcfGroup && api().getViewer().slcfGroup.visible ? 'checked' : ''}></label>
                ${sw('grid', 'Grille de calcul', isOn('grid'))}
                ${sw('meshes', 'Limites des maillages', isOn('meshes'))}
            </div>
            <button type="button" class="st-link" data-all>${icon('layers', 'st-ico-sm')} Tous les calques…</button>`;
        on(el, 'click', e => {
            const btn = e.target.closest('button');
            if (!btn) return;
            const look = btn.closest('[data-look]');
            if (look) {
                S.look[look.dataset.look] = btn.dataset.v;
                saveLook(); applyLook();
                $$('button', look).forEach(x => x.setAttribute('aria-pressed', String(x === btn)));
            } else if (btn.closest('[data-wall]')) {
                const v = btn.dataset.v;
                setLayer('obsts', v !== 'hidden');
                setLayer('geoms', v !== 'hidden');
                setCtl('output-opacity-slider', v === 'ghost' ? 0.25 : 1);
                $$('[data-wall] button', el).forEach(x => x.setAttribute('aria-pressed', String(x === btn)));
            } else if (btn.hasAttribute('data-all')) { closePop(); drawer('left', true); }
        });
        on(el, 'change', e => {
            if (e.target.hasAttribute('data-slcf')) { const v = api().getViewer(); if (v && v.slcfGroup) v.slcfGroup.visible = e.target.checked; return; }
            if (e.target.hasAttribute('data-edges')) { S.look.edges = e.target.checked; saveLook(); applyLook(); return; }
            const k = e.target.dataset.sw, on = e.target.checked;
            if (k === 'openings') { setLayer('vents', on); setLayer('holes', on); }
            else setLayer(k, on);
        });
    }

    // Réglages des couches affichées
    function popSettings(el) {
        const av = api().availability();
        const sw = (id, label, on, attr) => `<label class="st-switch"><span>${label}</span><input type="checkbox" ${attr || 'data-ctl'}="${id}" ${on ? 'checked' : ''}></label>`;
        const rng = (id, label, lo, hi, left, right) => {
            const src = ctl(id) || {};
            return `<div class="st-field"><div class="st-label">${label}</div>
                <input type="range" class="st-range" data-ctl="${id}" min="${src.min || lo}" max="${src.max || hi}" step="${src.step || 'any'}" value="${src.value || lo}">
                <div class="st-range-ends"><span>${left}</span><span>${right}</span></div></div>`;
        };
        const mirrorSelect = (id, label) => {
            const src = ctl(id);
            if (!src) return '';
            return `<div class="st-field"><div class="st-label">${label}</div><select class="st-select" data-ctl="${id}">${Array.from(src.options).map(o => `<option value="${esc(o.value)}" ${o.value === src.value ? 'selected' : ''}>${esc(o.textContent)}</option>`).join('')}</select></div>`;
        };
        const sections = [];
        if (av.smokeLoaded && L.smoke.on) {
            sections.push('<h3>Fumée et flammes</h3>' +
                rng('output-smoke-vol-gain', 'Densité de la fumée', 0.5, 20, 'Légère', 'Dense') +
                rng('output-smoke-fire-gain', 'Intensité des flammes', 0.5, 20, 'Faible', 'Forte') +
                `<div class="st-field"><div class="st-label">Seuil d’affichage des flammes <span class="st-val" data-kw>${esc((ctl('output-smoke-hrr-thresh-kw') || {}).textContent || '')}</span></div>
                    <input type="range" class="st-range" data-ctl="output-smoke-hrr-thresh" min="0" max="255" value="${(ctl('output-smoke-hrr-thresh') || {}).value || 42}">
                    <div class="st-hint">Les flammes sont affichées au-dessus de ce seuil de puissance volumique. Smokeview : 200 kW/m³.</div></div>` +
                '<div class="st-field">' +
                sw('output-smoke-render', 'Fumée masquée par les murs', (ctl('output-smoke-render') || {}).value === 'depth') +
                sw('output-smoke-smooth', 'Animation fluide (interpolation)', (ctl('output-smoke-smooth') || {}).checked) +
                '</div>');
        }
        if (L.wall.loaded || L.wall.loading) {
            const sets = api().boundarySets();
            sections.push('<h3>Parois</h3>' +
                (sets.length > 1 ? `<div class="st-field"><div class="st-label">Grandeur sur les parois</div><select class="st-select" data-wallset>${sets.map(x =>
                    `<option value="${esc(x.key)}" ${x.key === L.wall.key ? 'selected' : ''}>${esc(qtyFr(x.quantity))}${x.units ? ' (' + esc(unitLabel(x.units)) + ')' : ''}</option>`).join('')}</select></div>` : '') +
                mirrorSelect('output-boundary-colormap', 'Palette') +
                rng('output-boundary-opacity', 'Opacité', 0.05, 1, 'Légère', 'Pleine'));
        }
        if (L.part.layer) {
            const cls = L.part.layer.activeClasses();
            sections.push('<h3>Particules</h3><div class="st-field">' +
                cls.map(c => `<label class="st-switch"><span><i class="st-swatch" style="background:${c.color}"></i>${esc(c.name)}</span><input type="checkbox" data-pclass="${L.part.layer.classes.indexOf(c)}" ${c.visible ? 'checked' : ''}></label>`).join('') +
                `</div><div class="st-field"><div class="st-label">Taille des particules</div>
                <input type="range" class="st-range" data-psize min="0.25" max="3" step="0.05" value="${S.partScale}">
                <div class="st-range-ends"><span>Fines</span><span>Grosses</span></div></div>`);
        }
        if (L.slices.length) {
            const mapSel = ctl('output-color-map');
            const maps = mapSel ? Array.from(mapSel.options).map(o => [o.value, o.textContent]) : [['diagnostic', 'Diagnostic']];
            sections.push('<h3>Plans de coupe</h3>' +
                `<div class="st-field"><div class="st-label">Palette</div><select class="st-select" data-slicemap>${maps.map(([v, l]) => `<option value="${esc(v)}" ${v === S.sliceMap ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>` +
                `<div class="st-field"><div class="st-label">Opacité</div><input type="range" class="st-range" data-sliceop min="0.1" max="1" step="0.05" value="${S.sliceOpacity}"><div class="st-range-ends"><span>Légère</span><span>Pleine</span></div></div>` +
                '<div class="st-field">' + sw('depth', 'Plans masqués par les murs', S.sliceDepth, 'data-slicesw') + sw('outline', 'Contour des plans', S.sliceOutline, 'data-slicesw') + '</div>');
        }
        el.innerHTML = popHead('Réglages de l’affichage') +
            (sections.join('') || '<p class="st-help">Activez une couche (fumée, parois, particules, plans) pour la régler ici.</p>') +
            `<button type="button" class="st-link" data-all>${icon('sliders', 'st-ico-sm')} Tous les réglages…</button>`;

        on(el, 'input', e => {
            const t = e.target;
            if (t.hasAttribute('data-psize')) {
                S.partScale = parseFloat(t.value);
                if (L.part.layer) L.part.layer.setPointSize(S.partBase * S.partScale);
                return;
            }
            if (t.hasAttribute('data-sliceop')) {
                S.sliceOpacity = parseFloat(t.value);
                L.slices.forEach(x => x.overlay.setOpacity(S.sliceOpacity));
                return;
            }
            const id = t.dataset.ctl;
            if (!id || t.type !== 'range') return;
            setCtl(id, t.value);
            if (id === 'output-smoke-hrr-thresh') {
                const kw = $('[data-kw]', el);
                if (kw) kw.textContent = (ctl('output-smoke-hrr-thresh-kw') || {}).textContent || '';
            }
        });
        on(el, 'change', async e => {
            const t = e.target;
            if (t.dataset.pclass != null) {
                L.part.layer.setClassVisible(+t.dataset.pclass, t.checked);
                renderLegends();
                return;
            }
            if (t.dataset.slicesw) {
                if (t.dataset.slicesw === 'depth') { S.sliceDepth = t.checked; L.slices.forEach(x => x.overlay.setRenderMode(S.sliceDepth ? 'depth' : 'basic')); }
                else { S.sliceOutline = t.checked; applyVisibility(); }
                return;
            }
            if (t.hasAttribute('data-slicemap')) {
                S.sliceMap = t.value;
                L.slices.forEach(x => x.overlay.setColorMap(S.sliceMap));
                renderLegends();
                return;
            }
            if (t.hasAttribute('data-wallset')) {
                L.wall.loaded = false;
                await loadWall(t.value, true);
                return;
            }
            const id = t.dataset.ctl;
            if (!id) return;
            if (t.type === 'checkbox') {
                if (id === 'output-smoke-render') setCtl(id, t.checked ? 'depth' : 'basic');
                else setCtl(id, t.checked);
            } else if (t.tagName === 'SELECT') {
                setCtl(id, t.value);
                if (id === 'output-boundary-colormap') { applyTime(true); setTimeout(renderLegends, 0); }
            }
        });
        on(el, 'click', e => {
            if (e.target.closest('[data-all]')) { closePop(); drawer('right', true); }
        });
    }

    function markRail() {
        const cutBtn = $('[data-pop="cut"]', rail);
        if (cutBtn) cutBtn.classList.toggle('is-active', !!S.cut.on);
        const v = api() && api().getViewer();
        const walkBtn = $('[data-act="walk"]', rail);
        if (walkBtn && v) walkBtn.classList.toggle('is-on', !!v.walkMode);
    }

    // ── Visite, capture ──────────────────────────────────────────────────
    function toggleWalk() {
        const b = ctl('output-walk-mode-btn');
        if (!b) return;
        closePop();
        if (!api().hasData()) { toast('La visite nécessite la géométrie (.fds) de la simulation.'); return; }
        b.click();
        setTimeout(markRail, 50);
    }

    function capture() {
        const v = api().getViewer();
        if (!v || !v.renderer) return;
        const r = v.renderer;
        const orig = r.render;
        let shot = null;
        r.render = function () {
            orig.apply(this, arguments);
            if (r.getRenderTarget() === null) shot = r.domElement.toDataURL('image/png');
        };
        requestAnimationFrame(() => requestAnimationFrame(() => {
            r.render = orig;
            if (!shot) { r.render(v.scene, v.camera); shot = r.domElement.toDataURL('image/png'); }
            composeCapture(shot);
        }));
    }

    function composeCapture(dataUrl) {
        const img = new Image();
        img.onload = () => {
            const band = Math.round(img.height * 0.075) + 24;
            const cv = document.createElement('canvas');
            cv.width = img.width; cv.height = img.height + band;
            const g = cv.getContext('2d');
            g.drawImage(img, 0, 0);
            g.fillStyle = '#02216E'; g.fillRect(0, img.height, cv.width, band);
            g.fillStyle = '#CE0019'; g.fillRect(0, img.height, cv.width, Math.max(3, band * 0.06));
            const title = ((ctl('model-title') || {}).textContent || S.simKey || 'Simulation FDS').trim();
            const t = hasTimeline() ? S.time : NaN;
            const modeName = [L.smoke.on && api().availability().smokeLoaded ? 'Fumée' : '', L.wall.on && L.wall.loaded ? 'Parois' : '',
                L.part.on && L.part.layer ? 'Particules' : '', L.slices.some(x => x.on) ? 'Plans de coupe' : ''].filter(Boolean).join(', ');
            const fs = Math.round(band * 0.32);
            g.fillStyle = '#fff';
            g.font = `600 ${fs}px "Barlow Semi Condensed", sans-serif`;
            g.textBaseline = 'middle';
            const y = img.height + band / 2 + 2;
            g.fillText(title, band * 0.4, y - fs * 0.55);
            g.font = `500 ${Math.round(fs * 0.8)}px "Barlow Semi Condensed", sans-serif`;
            g.fillStyle = 'rgba(255,255,255,.78)';
            const hrr = Number.isFinite(t) ? hrrAt(t) : null;
            g.fillText([Number.isFinite(t) ? 't = ' + fmtTime(t) : '', hrr != null ? 'HRR ' + fmtPower(hrr) : '', modeName, new Date().toLocaleDateString('fr-FR')].filter(Boolean).join('   ·   '), band * 0.4, y + fs * 0.6);
            const logo = new Image();
            logo.onload = () => {
                const lh = band * 0.62, lw = logo.width * lh / logo.height, pad = band * 0.16;
                const x = cv.width - lw - band * 0.4 - pad;
                g.fillStyle = '#fff';
                g.fillRect(x - pad, img.height + (band - lh) / 2 - pad / 2 + 2, lw + pad * 2, lh + pad);
                g.drawImage(logo, x, img.height + (band - lh) / 2 + 2, lw, lh);
                download(cv);
            };
            logo.onerror = () => download(cv);
            logo.src = 'assets/sdis33/logo-sp33.png';
        };
        img.src = dataUrl;
        function download(cv) {
            const a = document.createElement('a');
            const t = hasTimeline() ? S.time : NaN;
            a.download = `${(S.simKey || 'simulation').replace(/[^\w-]+/g, '_')}${Number.isFinite(t) ? '_t' + Math.round(t) + 's' : ''}.png`;
            a.href = cv.toDataURL('image/png');
            a.click();
            toast('Image enregistrée.');
        }
    }

    // ── Horloge et couches ────────────────────────────────────────────────
    // Le lecteur possède son propre temps (S.time, en secondes de simulation).
    // Chaque couche visible reçoit le pas de temps qui correspond, seulement
    // quand il change : les couches ont chacune leurs instants de sortie.
    const REF_FPS = 6;           // ×1 = 6 pas de sortie par seconde
    const L = S.L;

    function frameAt(times, t) {
        const n = times.length;
        if (!n) return -1;
        if (t <= times[0]) return 0;
        if (t >= times[n - 1]) return n - 1;
        let lo = 0, hi = n - 1;
        while (hi - lo > 1) { const m = (lo + hi) >> 1; if (times[m] <= t + 1e-6) lo = m; else hi = m; }
        return lo;
    }
    function smokeOv() { const o = api() && api().overlays(); return o ? o.smoke : null; }
    function wallOv() { const o = api() && api().overlays(); return o ? o.boundary : null; }
    function smokeTimes() {
        const ov = smokeOv();
        const fr = ov && ov.activeFrames;
        if (!fr || !fr.length) return [];
        if (L.smoke._src !== fr) { L.smoke._src = fr; L.smoke.times = fr.map(f => Number(f.time) || 0); }
        return L.smoke.times;
    }
    /** Listes d'instants des couches chargées (visibles ou non). */
    function allTimes() {
        const out = [];
        const st = smokeTimes(); if (st.length) out.push(st);
        if (L.wall.loaded && L.wall.times.length) out.push(L.wall.times);
        if (L.part.layer && L.part.layer.times.length) out.push(L.part.layer.times);
        for (const s of L.slices) if (s.times && s.times.length) out.push(s.times);
        return out;
    }
    function refTimes() {
        const st = smokeTimes();
        if (st.length > 1) return st;
        const all = allTimes().filter(t => t.length > 1);
        return all.length ? all[0] : [];
    }
    function span() {
        const all = allTimes().filter(t => t.length);
        if (all.length) {
            return [Math.min(...all.map(t => t[0])), Math.max(...all.map(t => t[t.length - 1]))];
        }
        if (S.hrr) return [S.hrr.t[0], S.hrr.t[S.hrr.t.length - 1]];
        return [0, 1];
    }
    function hasTimeline() { return allTimes().some(t => t.length > 1); }
    function refDt() {
        const t = refTimes();
        if (t.length < 2) { const [a, b] = span(); return (b - a) / 100 || 1; }
        const d = [];
        for (let i = 1; i < t.length; i++) d.push(t[i] - t[i - 1]);
        d.sort((a, b) => a - b);
        return d[d.length >> 1] || ((t[t.length - 1] - t[0]) / (t.length - 1)) || 1;
    }
    /** Secondes de simulation par seconde réelle. */
    function rate() { return REF_FPS * refDt() * S.speed; }

    function applyVisibility() {
        const sm = smokeOv();
        if (sm) sm.setVisible(!!L.smoke.on);
        const w = wallOv();
        if (w) w.setVisible(!!(L.wall.on && L.wall.loaded));
        if (L.part.layer) L.part.layer.setVisible(!!L.part.on);
        for (const s of L.slices) {
            const ov = s.overlay;
            if (ov.mesh) ov.mesh.visible = !!s.on;
            if (ov.outline) ov.outline.visible = !!s.on && !!S.sliceOutline;
        }
    }

    /** Donne à chaque couche visible le pas de temps de S.time. */
    function applyTime(force) {
        const t = S.time;
        if (smvGeo) smvGeo.setTime(t);
        const sm = smokeOv();
        if (sm && L.smoke.on && sm.activeFrames && sm.activeFrames.length) {
            const i = frameAt(smokeTimes(), t);
            if (force || i !== sm.frameIndex) {
                sm._smoothFrameDuration = Math.max(16, 1000 * refDt() / Math.max(1e-6, rate()));
                sm.setFrame(i);
            }
        }
        const w = wallOv();
        if (w && L.wall.on && L.wall.loaded && w.activeFrames.length) {
            const i = frameAt(L.wall.times, t);
            if (force || i !== w.frameIndex) w.setFrame(i);
        }
        if (L.part.layer && L.part.on) {
            const i = frameAt(L.part.layer.times, t);
            if (force) L.part.layer.frameIndex = -1;
            L.part.layer.setFrame(i);
        }
        for (const s of L.slices) {
            if (!s.on) continue;
            const i = frameAt(s.times, t);
            if (force || i !== s.overlay.frameIndex) s.overlay.setFrame(i);
        }
    }

    function setTime(t, force) {
        const [t0, t1] = span();
        S.time = Math.max(t0, Math.min(t1, t));
        applyTime(force);
        updatePlayerUI();
    }

    function togglePlay() {
        if (!hasTimeline()) return;
        if (S.playing) { S.playing = false; }
        else {
            const [t0, t1] = span();
            if (S.time >= t1 - 1e-6) S.time = t0;
            api().stopAllPlayback();
            S.playing = true;
            S.lastTick = performance.now();
        }
        updatePlayerUI();
    }

    function tick(now) {
        if (!S.lastLoadUi || now - S.lastLoadUi > 150) { S.lastLoadUi = now; renderLoad(); }
        if (S.playing && !S.scrubbing && document.body.classList.contains('studio')) {
            const dt = Math.min(0.1, Math.max(0, (now - S.lastTick) / 1000));
            const [, t1] = span();
            S.time += dt * rate();
            if (S.time >= t1) { S.time = t1; S.playing = false; }
            // Aux vitesses élevées on saute des pas plutôt que de ralentir :
            // la mise à jour des couches est espacée selon son coût réel.
            if (now >= S.nextApply || !S.playing) {
                const c0 = performance.now();
                applyTime(!S.playing);
                const cost = performance.now() - c0;
                S.nextApply = now + Math.min(200, cost * 0.75);
            }
            updatePlayerUI();
        }
        S.lastTick = now;
        requestAnimationFrame(tick);
    }

    // ── Barre de chargement ──────────────────────────────────────────────
    let loadEl;
    const fmtMo = b => (b / 1048576).toLocaleString('fr-FR', { maximumFractionDigits: b < 10485760 ? 1 : 0 }) + ' Mo';
    function smokeLoadingTask() {
        const a = api();
        const av = a ? a.availability() : {};
        if (!av.smoke || av.smokeLoaded) return null;
        const p = window.__fdsSmokeProgress;
        if (p && p.active && p.total) {
            // i = fichier en cours (1..n), sur l'ensemble suie + flammes
            return { label: 'Fumée et flammes', file: p.file, i: Math.min(p.total, p.done + 1), n: p.total };
        }
        const st = window.__fdsSmokeStatus;
        if (!st || !/^Loading /.test(st.msg) || Date.now() - st.at > 300000) return null;
        return { label: 'Fumée et flammes', file: '', i: 0, n: 0 };
    }
    function loadTasks() {
        const tasks = [];
        const sm = smokeLoadingTask();
        if (sm) tasks.push(sm);
        const frac = p => { const m = /(\d+)\/(\d+)/.exec(p || ''); return m ? { i: +m[1], n: +m[2] } : { i: 0, n: 0 }; };
        if (L.part.loading) tasks.push(Object.assign({ label: 'Particules' }, frac(L.part.progress)));
        if (L.wall.loading) tasks.push(Object.assign({ label: 'Températures des parois' }, frac(L.wall.progress)));
        if (S.sliceLoading.size) tasks.push({ label: S.sliceLoading.size > 1 ? S.sliceLoading.size + ' plans de coupe' : 'Plan de coupe', i: 0, n: 0 });
        return tasks;
    }
    function renderLoad() {
        if (!root) return;
        if (!loadEl) {
            loadEl = document.createElement('div');
            loadEl.className = 'st-load st-glass';
            loadEl.setAttribute('role', 'status');
            loadEl.setAttribute('aria-live', 'polite');
            loadEl.hidden = true;
            root.appendChild(loadEl);
        }
        const tasks = document.body.classList.contains('studio') ? loadTasks() : [];
        if (!tasks.length) { if (!loadEl.hidden) { loadEl.hidden = true; loadEl._sig = ''; } return; }
        const t = tasks[0];
        const dl = window.FDSRemote && FDSRemote.downloads ? FDSRemote.downloads().active : [];
        const cur = dl[0];
        const f = cur && cur.total ? Math.min(1, cur.loaded / cur.total) : 0;
        let pct = null;
        if (t.n) pct = Math.max(0.02, Math.min(1, ((t.i - 1) + f) / t.n));
        else if (cur && cur.total) pct = f;
        const parts = [];
        if (t.n) parts.push(`Fichier ${t.i} sur ${t.n}`);
        if (cur && cur.total > 262144) parts.push(`${fmtMo(cur.loaded)} / ${fmtMo(cur.total)}`);
        else if (cur && cur.loaded > 262144) parts.push(fmtMo(cur.loaded) + ' reçus');
        else if (t.n) parts.push(cur ? 'téléchargement' : 'lecture des données');
        const next = tasks.slice(1).map(x => x.label).join(', ');
        const sig = [t.label, parts.join(), pct == null ? 'x' : pct.toFixed(3), next].join('|');
        if (sig === loadEl._sig) return;
        loadEl._sig = sig;
        loadEl.hidden = false;
        loadEl.innerHTML = `
            <div class="st-load-head"><span class="st-spin" aria-hidden="true"></span><strong>Chargement : ${esc(t.label)}</strong>${pct != null ? `<span class="st-load-pct">${Math.round(pct * 100)} %</span>` : ''}</div>
            <div class="st-load-bar${pct == null ? ' is-indet' : ''}"><i style="width:${pct == null ? 35 : (pct * 100).toFixed(1)}%"></i></div>
            <div class="st-load-meta">${esc(parts.join(' · ') || 'Patientez…')}</div>
            ${next ? `<div class="st-load-next">Ensuite : ${esc(next)}</div>` : ''}`;
    }

    // ── Lecteur ───────────────────────────────────────────────────────────
    function timeAtX(clientX) {
        const r = canvas.getBoundingClientRect();
        const k = Math.max(0, Math.min(1, (clientX - r.left - 6) / Math.max(1, r.width - 12)));
        const [t0, t1] = span();
        return t0 + k * (t1 - t0);
    }

    function stepFrame(dir, big) {
        const t = refTimes();
        if (t.length < 2) return;
        let i;
        if (dir > 0) { i = t.findIndex(x => x > S.time + 1e-6); if (i < 0) i = t.length - 1; i += (big ? 9 : 0); }
        else { i = frameAt(t, S.time - 1e-6); if (t[i] >= S.time - 1e-6) i--; i -= (big ? 9 : 0); }
        i = Math.max(0, Math.min(t.length - 1, i));
        S.playing = false;
        setTime(t[i]);
    }

    function wireTimeline() {
        let wasPlaying = false, raf = 0;
        const seek = x => {
            const t = timeAtX(x);
            S.hover = t;
            S.time = t;
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => setTime(S.time));
            drawTimeline(); showTip(x);
        };
        timeline.addEventListener('pointerdown', e => {
            if (!hasTimeline()) return;
            S.scrubbing = true;
            wasPlaying = S.playing;
            S.playing = false;
            timeline.setPointerCapture(e.pointerId);
            seek(e.clientX);
        });
        timeline.addEventListener('pointermove', e => {
            if (S.scrubbing) { seek(e.clientX); return; }
            S.hover = timeAtX(e.clientX);
            drawTimeline(); showTip(e.clientX);
        });
        const end = () => {
            if (!S.scrubbing) return;
            S.scrubbing = false;
            if (wasPlaying) togglePlay();
            updatePlayerUI();
        };
        timeline.addEventListener('pointerup', end);
        timeline.addEventListener('pointercancel', end);
        timeline.addEventListener('pointerleave', () => { if (!S.scrubbing) { S.hover = null; tip.hidden = true; drawTimeline(); } });
        timeline.addEventListener('keydown', e => {
            const t = refTimes();
            if (t.length < 2) return;
            if (e.key === 'ArrowRight') stepFrame(1);
            else if (e.key === 'ArrowLeft') stepFrame(-1);
            else if (e.key === 'PageUp') stepFrame(1, true);
            else if (e.key === 'PageDown') stepFrame(-1, true);
            else if (e.key === 'Home') { S.playing = false; setTime(span()[0]); }
            else if (e.key === 'End') { S.playing = false; setTime(span()[1]); }
            else return;
            e.preventDefault(); e.stopPropagation();
        });
        window.addEventListener('resize', () => { drawTimeline(); drawDock(true); });
    }

    function showTip(clientX) {
        if (S.hover == null) { tip.hidden = true; return; }
        const r = timeline.getBoundingClientRect();
        const hrr = hrrAt(S.hover);
        let door = '';
        if (smvGeo) {
            const [t0, t1] = span();
            const tol = (t1 - t0) * 6 / Math.max(1, r.width);
            const near = smvGeo.eventTimes().filter(e => Math.abs(e.t - S.hover) <= tol);
            if (near.length) door = ' · ' + (near.length > 1 ? near.length + ' changements de porte' : (near[0].show ? 'fermeture' : 'ouverture') + (near[0].label && !/^OB_/.test(near[0].label) ? ' ' + near[0].label : ''));
        }
        tip.textContent = fmtTime(S.hover) + (hrr != null ? ' · ' + fmtPower(hrr) : '') + door;
        tip.style.left = Math.max(40, Math.min(r.width - 40, clientX - r.left)) + 'px';
        tip.hidden = false;
    }

    function cssVar(name, fb) {
        const v = getComputedStyle(document.body).getPropertyValue(name).trim();
        return v || fb;
    }

    function drawTimeline() {
        if (!canvas || !timeline.offsetWidth) return;
        const dpr = window.devicePixelRatio || 1;
        const W = timeline.clientWidth, H = timeline.clientHeight;
        if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
            canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
        }
        const g = canvas.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, W, H);
        const red = cssVar('--sp-red', '#CE0019');
        const track = cssVar('--bg-tertiary', '#15224f');
        const ink = cssVar('--text-primary', '#fff');
        const pad = 6, x0 = pad, x1 = W - pad, top = 6, bottom = H - 8;
        const [t0, t1] = span();
        const X = t => x0 + (t - t0) / ((t1 - t0) || 1) * (x1 - x0);
        const has = hasTimeline();
        const xc = has ? X(S.time) : x0;

        g.fillStyle = track;
        roundRect(g, 0, 0, W, H, 8); g.fill();

        if (S.hrr) {
            const h = S.hrr, qmax = h.max > 0 ? h.max : 1;
            const Y = q => bottom - Math.max(0, q) / qmax * (bottom - top);
            const path = () => {
                g.beginPath();
                g.moveTo(X(Math.max(t0, h.t[0])), bottom);
                for (let i = 0; i < h.t.length; i++) {
                    if (h.t[i] < t0 - 1e-9 || h.t[i] > t1 + 1e-9) continue;
                    g.lineTo(X(h.t[i]), Y(h.q[i]));
                }
                g.lineTo(X(Math.min(t1, h.t[h.t.length - 1])), bottom);
                g.closePath();
            };
            const grad = g.createLinearGradient(0, top, 0, bottom);
            grad.addColorStop(0, hexA(red, .55)); grad.addColorStop(1, hexA(red, .08));
            g.save(); path(); g.fillStyle = grad; g.fill();
            g.beginPath(); g.rect(0, 0, xc, H); g.clip();
            path(); g.fillStyle = hexA(red, .35); g.fill();
            g.restore();
            g.save(); path(); g.strokeStyle = red; g.lineWidth = 1.6; g.stroke(); g.restore();
        } else {
            g.fillStyle = hexA(ink, .18);
            g.fillRect(x0, H / 2 - 2, x1 - x0, 4);
            g.fillStyle = red;
            g.fillRect(x0, H / 2 - 2, xc - x0, 4);
        }

        // Repères d'ouverture / fermeture des portes (obstructions mobiles)
        if (smvGeo && has) {
            for (const e of smvGeo.eventTimes()) {
                if (e.t < t0 || e.t > t1) continue;
                const x = X(e.t);
                g.fillStyle = e.show ? '#ff9f1c' : '#2ec4b6';
                g.beginPath(); g.moveTo(x - 4, 2); g.lineTo(x + 4, 2); g.lineTo(x, 8); g.closePath(); g.fill();
            }
        }
        if (S.hover != null && !S.scrubbing) {
            const xh = X(S.hover);
            g.strokeStyle = hexA(ink, .5); g.setLineDash([3, 3]); g.lineWidth = 1;
            g.beginPath(); g.moveTo(xh, 2); g.lineTo(xh, H - 2); g.stroke(); g.setLineDash([]);
        }
        if (has) {
            g.fillStyle = ink;
            g.fillRect(xc - 1.25, 2, 2.5, H - 4);
            g.beginPath(); g.arc(xc, H - 5, 5, 0, Math.PI * 2); g.fill();
            g.strokeStyle = red; g.lineWidth = 2; g.stroke();
        }
    }
    function roundRect(g, x, y, w, h, r) {
        g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
        g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
    }
    function hexA(color, a) {
        const m = /^#([0-9a-f]{6})$/i.exec(color.trim());
        if (!m) return color;
        const n = parseInt(m[1], 16);
        return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
    }

    function refreshHrrReadout() {
        const box = $('.st-hrr', player);
        if (!box) return;
        box.hidden = !S.hrr;
        if (S.hrr) {
            $('strong', box).textContent = fmtPower(hrrAt(hasTimeline() ? S.time : S.hrr.t[0]));
            $('span', box).textContent = 'HRR · max ' + fmtPower(S.hrr.max);
        }
    }

    const fmtSpeed = v => '×' + String(v).replace('.', ',');

    function updatePlayerUI() {
        if (!player) return;
        const has = hasTimeline();
        const [t0, t1] = span();
        const playBtn = $('.st-play', player);
        playBtn.disabled = !has;
        playBtn.innerHTML = icon(S.playing ? 'pause' : 'play');
        playBtn.setAttribute('aria-label', S.playing ? 'Pause' : 'Lecture');
        const t = S.time;
        $('.st-clock strong', player).innerHTML = has ? fmtNum(t, t < 10 ? 1 : 0) + '<small> s</small>' : '—';
        $('.st-clock span', player).textContent = has ? 'sur ' + fmtTime(t1) : 'pas de résultats animés';
        timeline.setAttribute('aria-valuemin', String(Math.round(t0)));
        timeline.setAttribute('aria-valuemax', String(Math.round(t1)));
        timeline.setAttribute('aria-valuenow', String(Math.round(t)));
        timeline.setAttribute('aria-valuetext', has ? fmtTime(t) : '');
        $('.st-speed', player).textContent = fmtSpeed(S.speed);
        refreshHrrReadout();
        drawTimeline();
        drawDock(false);
    }
    // Compatibilité : anciens appels.
    const syncPlayer = updatePlayerUI;

    function openSpeedMenu(anchor) {
        closeMenu();
        menuEl = document.createElement('div');
        menuEl.className = 'st-menu st-glass st-speed-menu';
        menuEl.setAttribute('role', 'menu');
        menuEl.innerHTML = '<div class="st-menu-title">Vitesse de lecture</div>' + SPEEDS.map(v =>
            `<button type="button" role="menuitemradio" aria-checked="${v === S.speed}" data-speed="${v}"><span>${fmtSpeed(v)}</span></button>`).join('');
        document.body.appendChild(menuEl);
        const r = anchor.getBoundingClientRect();
        menuEl.style.top = 'auto';
        menuEl.style.bottom = (window.innerHeight - r.top + 8) + 'px';
        menuEl.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
        menuEl.addEventListener('click', e => {
            const b = e.target.closest('[data-speed]');
            if (!b) return;
            S.speed = parseFloat(b.dataset.speed);
            closeMenu();
            updatePlayerUI();
        });
        const cur = $('[aria-checked="true"]', menuEl);
        if (cur) cur.focus();
        setTimeout(() => document.addEventListener('pointerdown', outsideMenu, true), 0);
    }

    // ── Couches : chargement ─────────────────────────────────────────────
    function resetLayers() {
        S.playing = false;
        for (const s of L.slices) { try { s.overlay.dispose(); } catch (_) { /* déjà libéré */ } }
        L.slices = [];
        if (L.part.layer) { L.part.layer.dispose(); }
        Object.assign(L.part, { layer: null, on: false, loading: false, available: false, progress: '' });
        Object.assign(L.wall, { on: false, loaded: false, loading: false, key: null, times: [], quantity: '', units: '', progress: '' });
        Object.assign(L.smoke, { on: true, times: [], _src: null });
        S.time = 0;
    }

    function preferredWallKey() {
        const sets = api().boundarySets();
        const pick = sets.find(s => /WALL TEMPERATURE/i.test(s.quantity))
            || sets.find(s => /TEMPERATURE/i.test(s.quantity)) || sets[0];
        return pick ? pick.key : null;
    }

    async function loadWall(key, turnOn) {
        key = key || L.wall.key || preferredWallKey();
        if (!key) return false;
        if (L.wall.loading) { if (turnOn) L.wall.on = true; return false; }
        L.wall.loading = true; L.wall.key = key; L.wall.progress = '';
        if (turnOn) L.wall.on = true;
        renderChips(true);
        try {
            const r = await api().loadBoundarySet(key, msg => {
                const m = /\((\d+) of (\d+)\)/.exec(msg || '');
                L.wall.progress = m ? `${m[1]}/${m[2]}` : '';
                renderChips(true);
            });
            const w = wallOv();
            if (!r || !r.frameCount || !w) throw new Error('aucun pas de temps');
            L.wall.loaded = true;
            L.wall.times = w.activeFrames.map(f => Number(f.time) || 0);
            L.wall.quantity = r.quantity || ''; L.wall.units = r.units || '';
            applyVisibility();
            applyTime(true);
            return true;
        } catch (e) {
            console.error(e);
            L.wall.on = false;
            toast('Températures des parois indisponibles : ' + e.message, 6000);
            return false;
        } finally {
            L.wall.loading = false; L.wall.progress = '';
            renderChips(true); renderLegends(); updatePlayerUI();
            if (S.open === 'settings') renderPop();
        }
    }

    async function loadParticles(turnOn) {
        if (L.part.layer || L.part.loading || !L.part.available) { if (turnOn && L.part.layer) { L.part.on = true; applyVisibility(); applyTime(true); } return; }
        L.part.loading = true; L.part.progress = '';
        if (turnOn) L.part.on = true;
        renderChips(true);
        try {
            const smv = S.files.find(f => /\.smv$/i.test(f.name));
            const v = api().getViewer();
            const layer = new FDSParticles.ParticleLayer(v.scene);
            const ok = await layer.load(S.files, smv ? await smv.text() : '', (i, n) => {
                L.part.progress = `${i + 1}/${n}`; renderChips(true);
            });
            if (!ok) { layer.dispose(); L.part.available = false; L.part.on = false; toast('Aucune particule enregistrée dans ce calcul.'); return; }
            // Taille en pixels à l'écran (comme Smokeview) : visible à toute distance.
            S.partBase = 5;
            layer.setPointSize(S.partBase * S.partScale);
            L.part.layer = layer;
            applyVisibility();
            applyTime(true);
        } catch (e) {
            console.error(e);
            L.part.on = false;
            toast('Lecture des particules impossible : ' + e.message, 6000);
        } finally {
            L.part.loading = false; L.part.progress = '';
            renderChips(true); renderLegends(); updatePlayerUI();
            if (S.open === 'settings') renderPop();
        }
    }

    /** Une même grandeur partage une seule échelle (et une seule légende). */
    function harmonizeSliceRanges() {
        const byQ = new Map();
        for (const s of L.slices) {
            const k = s.quantity + '|' + s.units;
            const r = byQ.get(k) || { min: Infinity, max: -Infinity };
            if (Number.isFinite(s.range.min)) r.min = Math.min(r.min, s.range.min);
            if (Number.isFinite(s.range.max)) r.max = Math.max(r.max, s.range.max);
            byQ.set(k, r);
        }
        for (const s of L.slices) {
            const r = byQ.get(s.quantity + '|' + s.units);
            if (r && r.max > r.min) { s.shared = r; s.overlay.setManualRange(r.min, r.max); }
        }
    }

    async function addSlice(key) {
        if (L.slices.some(s => s.key === key) || S.sliceLoading.has(key)) return;
        S.sliceLoading.add(key);
        if (S.open === 'slices') renderPop();
        renderChips(true);
        try {
            const r = await api().createSliceLayer(key);
            const info = api().sliceGroups().find(g => g.key === key) || {};
            r.overlay.setColorMap(S.sliceMap);
            r.overlay.setOpacity(S.sliceOpacity);
            r.overlay.setRenderMode(S.sliceDepth ? 'depth' : 'basic');
            L.slices.push({ key, info, overlay: r.overlay, times: r.times, range: r.range,
                quantity: r.quantity || info.quantity, units: r.units || info.units, on: true });
            harmonizeSliceRanges();
            applyVisibility();
            applyTime(true);
        } catch (e) {
            console.error(e);
            toast('Plan de coupe illisible : ' + e.message, 6000);
        } finally {
            S.sliceLoading.delete(key);
            if (S.open === 'slices') renderPop();
            renderChips(true); renderLegends(); updatePlayerUI();
        }
    }
    function removeSlice(key) {
        const i = L.slices.findIndex(s => s.key === key);
        if (i < 0) return;
        L.slices[i].overlay.dispose();
        L.slices.splice(i, 1);
        harmonizeSliceRanges();
        renderChips(true); renderLegends(); updatePlayerUI();
    }

    // ── Barre des couches ────────────────────────────────────────────────
    function layerList() {
        const a = api();
        const av = a ? a.availability() : {};
        const out = [];
        if (av.smoke) out.push({ k: 'smoke', label: 'Fumée et flammes', on: L.smoke.on && av.smokeLoaded, busy: !av.smokeLoaded && (S.smokeLoading || !!smokeLoadingTask()) });
        if (a && a.boundarySets().length) out.push({ k: 'wall', label: 'Températures des parois', on: L.wall.on, busy: L.wall.loading, progress: L.wall.progress });
        if (L.part.available) out.push({ k: 'part', label: 'Particules', on: L.part.on, busy: L.part.loading, progress: L.part.progress });
        if (av.slice) {
            const n = L.slices.filter(s => s.on).length;
            out.push({ k: 'slices', label: 'Plans de coupe', on: n > 0, count: n, busy: S.sliceLoading.size > 0, pop: true, minor: true });
        }
        if (S.hrr || S.devc) out.push({ k: 'charts', label: 'Courbes', on: S.dock, minor: true });
        return out;
    }
    function renderChips(force) {
        if (!modes) return;
        const list = layerList();
        const sig = JSON.stringify(list) + S.open;
        if (!force && sig === S.availSig) return;
        S.availSig = sig;
        modes.hidden = !list.length;
        const chip = it => {
            const state = it.busy ? `<span class="st-spin" aria-hidden="true"></span>${it.progress ? `<small>${esc(it.progress)}</small>` : ''}`
                : `<span class="st-check" aria-hidden="true">${it.on ? icon('check', 'st-ico-xs') : ''}</span>`;
            const count = it.count ? `<span class="st-count">${it.count}</span>` : '';
            const attrs = it.pop ? `aria-expanded="${S.open === 'slices'}" aria-haspopup="dialog"` : `aria-pressed="${!!it.on}"`;
            return `<button type="button" class="st-chip st-layer${it.minor ? ' st-chip-minor' : ''}${it.on ? ' is-on' : ''}" data-layer="${it.k}" ${attrs}>${it.pop ? '' : state}${esc(it.label)}${count}${it.pop ? icon('chev', 'st-ico-xs') : ''}</button>`;
        };
        const main = list.filter(x => !x.minor), minor = list.filter(x => x.minor);
        modes.innerHTML = main.map(chip).join('') + (main.length && minor.length ? '<span class="st-sep"></span>' : '') + minor.map(chip).join('') +
            `<span class="st-sep"></span><button type="button" class="st-tool" data-pop="settings" data-tip="Réglages" aria-label="Réglages de l’affichage" aria-expanded="${S.open === 'settings'}">${icon('sliders')}</button>`;
    }
    // Ancien nom, encore utilisé par sync().
    const renderModes = () => renderChips(false);

    function wireModes() {
        modes.addEventListener('click', async e => {
            const b = e.target.closest('button');
            if (!b) return;
            if (b.dataset.pop) { togglePop('settings', b); return; }
            const k = b.dataset.layer;
            if (!k) return;
            if (k === 'slices') { togglePop('slices', b); return; }
            if (k === 'charts') { setDock(!S.dock); renderChips(true); return; }
            if (k === 'smoke') {
                const av = api().availability();
                if (!av.smokeLoaded) {
                    S.smokeLoading = true; renderChips(true);
                    try { await api().loadSmoke(); } finally { S.smokeLoading = false; }
                    api().stopAllPlayback();
                    L.smoke.on = true;
                } else L.smoke.on = !L.smoke.on;
            } else if (k === 'wall') {
                if (L.wall.loaded) L.wall.on = !L.wall.on;
                else if (L.wall.loading) L.wall.on = !L.wall.on;
                else loadWall(null, true);
            } else if (k === 'part') {
                if (L.part.layer) L.part.on = !L.part.on;
                else if (L.part.loading) L.part.on = !L.part.on;
                else loadParticles(true);
            }
            applyVisibility();
            applyTime(true);
            renderChips(true); renderLegends(); updatePlayerUI();
            if (S.open === 'settings') renderPop();
        });
    }

    // ── Plans de coupe (popover) ─────────────────────────────────────────
    function popSlices(el) {
        // Un même plan réparti sur plusieurs maillages = une seule ligne.
        const merged = new Map();
        for (const g of api().sliceGroups()) {
            const pos = g.position != null ? g.position.toFixed(3) : g.key;
            const k = [g.quantity, g.units, g.axis, pos].join('|');
            if (!merged.has(k)) merged.set(k, Object.assign({}, g, { keys: [] }));
            merged.get(k).keys.push(g.key);
        }
        const byQ = new Map();
        for (const g of merged.values()) {
            const k = qtyFr(g.quantity) + (g.units ? ' (' + unitLabel(g.units) + ')' : '');
            if (!byQ.has(k)) byQ.set(k, []);
            byQ.get(k).push(g);
        }
        for (const list of byQ.values()) list.sort((x, y) => String(x.axis).localeCompare(String(y.axis)) || (x.position || 0) - (y.position || 0));
        const row = g => {
            const on = g.keys.every(k => L.slices.some(s => s.key === k));
            const busy = g.keys.some(k => S.sliceLoading.has(k));
            const pos = g.position != null ? `${g.axis} = ${fmtNum(g.position, 2)} m` : '';
            return `<label class="st-slice-row${busy ? ' is-busy' : ''}">
                <input type="checkbox" data-keys="${esc(g.keys.join('\n'))}" ${on ? 'checked' : ''} ${busy ? 'disabled' : ''}>
                <span><strong>${esc(g.plane || 'Plan')}</strong><small>${esc(pos || g.label)}</small></span>
                ${busy ? '<span class="st-spin" aria-label="Chargement"></span>' : ''}
            </label>`;
        };
        el.innerHTML = popHead('Plans de coupe') + `
            <p class="st-help">Cochez plusieurs plans pour les afficher ensemble. Une même grandeur garde une seule échelle de couleurs.</p>
            <div class="st-slice-list">${Array.from(byQ.entries()).map(([q, list]) =>
                `<div class="st-label">${esc(q)}</div>${list.map(row).join('')}`).join('')}</div>
            ${L.slices.length ? '<button type="button" class="st-btn st-btn-block" data-clear-slices style="margin-top:8px">Retirer tous les plans</button>' : ''}`;
        on(el, 'change', e => {
            const keys = (e.target.dataset.keys || '').split('\n').filter(Boolean);
            if (!keys.length) return;
            if (e.target.checked) keys.forEach(k => addSlice(k));
            else { keys.forEach(k => removeSlice(k)); renderPop(); }
        });
        on(el, 'click', e => {
            if (e.target.closest('[data-clear-slices]')) {
                L.slices.slice().forEach(s => removeSlice(s.key));
                renderPop();
            }
        });
    }

    // ── Légendes ─────────────────────────────────────────────────────────
    let legendEl;
    function gradientCss(sampler) {
        const stops = [];
        for (let i = 0; i <= 10; i++) { const c = sampler(i / 10); stops.push(`rgb(${c[0]},${c[1]},${c[2]}) ${i * 10}%`); }
        return `linear-gradient(90deg, ${stops.join(', ')})`;
    }
    function fmtVal(v) {
        if (!Number.isFinite(v)) return '—';
        if (v === 0) return '0';
        const a = Math.abs(v);
        if (a >= 10000 || (a < 0.01 && v !== 0)) return v.toExponential(1).replace('.', ',');
        return fmtNum(v, a < 10 ? 2 : a < 100 ? 1 : 0);
    }
    const unitLabel = u => ({ C: '°C', 'kW/m2': 'kW/m²', 'kW/m3': 'kW/m³', 'kg/m3': 'kg/m³', '1/m': 'm⁻¹', 'm/s': 'm/s' }[u] || u || '');
    function legendCard(title, units, min, max, sampler) {
        return `<div class="st-legend"><div class="st-legend-title">${esc(title)}${units ? ` <span>${esc(unitLabel(units))}</span>` : ''}</div>
            <div class="st-legend-bar" style="background:${gradientCss(sampler)}"></div>
            <div class="st-legend-ends"><span>${fmtVal(min)}</span><span>${fmtVal(max)}</span></div></div>`;
    }
    const QTY_FR = {
        'WALL TEMPERATURE': 'Température des parois', 'TEMPERATURE': 'Température',
        'VISIBILITY': 'Visibilité', 'SOOT VISIBILITY': 'Visibilité', 'VELOCITY': 'Vitesse',
        'NET HEAT FLUX': 'Flux thermique net', 'GAUGE HEAT FLUX': 'Flux thermique (fluxmètre)',
        'RADIATIVE HEAT FLUX': 'Flux radiatif', 'CONVECTIVE HEAT FLUX': 'Flux convectif',
        'SOOT DENSITY': 'Densité de suies', 'EXTINCTION COEFFICIENT': 'Coefficient d’extinction',
        'CARBON MONOXIDE VOLUME FRACTION': 'Fraction volumique de CO', 'OXYGEN VOLUME FRACTION': 'Fraction volumique d’O₂',
        'HRRPUV': 'Puissance volumique (HRRPUV)', 'PRESSURE': 'Pression',
    };
    const qtyFr = q => QTY_FR[String(q || '').toUpperCase().trim()] || q || '';
    function renderLegends() {
        if (!root) return;
        if (!legendEl) { legendEl = document.createElement('div'); legendEl.className = 'st-legends'; root.appendChild(legendEl); }
        const cards = [];
        const w = wallOv();
        if (L.wall.on && L.wall.loaded && w) {
            const lut = w._lut();
            const r = w.lastRange || { min: 0, max: 1 };
            cards.push(legendCard(qtyFr(L.wall.quantity), L.wall.units, r.min, r.max,
                t => { const i = Math.round(t * 255) * 4; return [lut[i], lut[i + 1], lut[i + 2]]; }));
        }
        const seen = new Set();
        for (const s of L.slices) {
            if (!s.on) continue;
            const k = s.quantity + '|' + s.units;
            if (seen.has(k)) continue;
            seen.add(k);
            const r = s.shared || s.range;
            const map = s.overlay.mapName;
            cards.push(legendCard(qtyFr(s.quantity) + ' · plans', s.units, r.min, r.max, t => SliceColorMap.colorMap(t, map)));
        }
        if (L.part.on && L.part.layer) {
            const cls = L.part.layer.activeClasses().filter(c => c.visible);
            if (cls.length) {
                cards.push(`<div class="st-legend"><div class="st-legend-title">Particules</div>${cls.map(c =>
                    `<div class="st-legend-dot"><i style="background:${c.color}"></i>${esc(c.name)}</div>`).join('')}</div>`);
            }
        }
        const html = cards.join('');
        if (html !== legendEl._html) { legendEl.innerHTML = html; legendEl._html = html; }
        legendEl.hidden = !cards.length || !document.body.classList.contains('studio');
    }

    // ── Courbes à côté du modèle ─────────────────────────────────────────
    function parseCsv(text) {
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 3) return null;
        const split = l => l.split(',').map(s => s.trim().replace(/^"|"$/g, '').trim());
        const units = split(lines[0]), names = split(lines[1]);
        const n = names.length;
        const cols = names.map(() => []);
        for (let i = 2; i < lines.length; i++) {
            const c = split(lines[i]);
            if (c.length < n) continue;
            for (let k = 0; k < n; k++) cols[k].push(parseFloat(c[k]));
        }
        const it = names.findIndex(s => /^time$/i.test(s));
        if (it < 0 || cols[it].length < 2) return null;
        const series = [];
        for (let k = 0; k < n; k++) {
            if (k === it) continue;
            const v = cols[k];
            if (!v.some(Number.isFinite)) continue;
            series.push({ name: names[k], units: units[k] || '', v });
        }
        return { t: cols[it], series };
    }

    const SERIES_COLORS = ['#4ea1ff', '#ffb020', '#34c38f', '#e05cc8', '#9b8cff', '#46c8d8', '#f07c4a', '#c7d84a'];

    function defaultDevcSelection(devc) {
        if (!devc) return [];
        const groups = new Map();
        devc.series.forEach((s, i) => { const u = s.units; if (!groups.has(u)) groups.set(u, []); groups.get(u).push(i); });
        const temp = groups.get('C') || Array.from(groups.values()).sort((a, b) => b.length - a.length)[0] || [];
        return temp.slice(0, 4);
    }

    function setDock(open) {
        S.dock = !!open;
        document.body.classList.toggle('st-dock-open', S.dock);
        if (S.dock) buildDock();
        const v = api() && api().getViewer();
        if (v) setTimeout(() => { v._onResize(); drawTimeline(); drawDock(true); }, 30);
    }

    let dockEl;
    function buildDock() {
        const layout = $('#output-panel .output-layout');
        if (!layout) return;
        if (!dockEl) {
            dockEl = document.createElement('aside');
            dockEl.className = 'st-dock st-only';
            dockEl.setAttribute('aria-label', 'Courbes');
            layout.appendChild(dockEl);
            dockEl.addEventListener('click', e => {
                if (e.target.closest('[data-dock-close]')) { setDock(false); renderChips(true); }
                else if (e.target.closest('[data-pick]')) { S.devcPicker = !S.devcPicker; buildDock(); }
            });
            dockEl.addEventListener('change', e => {
                const i = e.target.dataset.devc;
                if (i == null) return;
                const idx = +i;
                const sel = new Set(S.devcSel);
                if (e.target.checked) sel.add(idx); else sel.delete(idx);
                S.devcSel = Array.from(sel).sort((a, b) => a - b);
                buildDock();
            });
            dockEl.addEventListener('input', e => {
                if (!e.target.matches('[data-filter]')) return;
                S.devcFilter = e.target.value;
                const q = S.devcFilter.trim().toLowerCase();
                $$('.st-devc-item', dockEl).forEach(li => { li.hidden = q && !li.dataset.name.includes(q); });
            });
        }
        const charts = [];
        if (S.hrr) charts.push({ id: 'hrr', title: 'Puissance du feu (HRR, kW)', units: 'kW', t: S.hrr.t, series: [{ name: 'HRR', v: S.hrr.q, color: '#ff5a5f' }] });
        if (S.devc && S.devcSel.length) {
            const byU = new Map();
            S.devcSel.forEach((i, n) => {
                const s = S.devc.series[i];
                if (!s) return;
                if (!byU.has(s.units)) byU.set(s.units, []);
                byU.get(s.units).push({ name: s.name, v: s.v, color: SERIES_COLORS[n % SERIES_COLORS.length] });
            });
            for (const [u, list] of byU) charts.push({ id: 'devc-' + u, title: 'Capteurs' + (u ? ' (' + unitLabel(u) + ')' : ''), units: u, t: S.devc.t, series: list });
        }
        S.dockCharts = charts;
        const picker = S.devc ? `
            <div class="st-dock-pick">
                <button type="button" class="st-btn st-btn-block" data-pick aria-expanded="${!!S.devcPicker}">${icon('sliders', 'st-ico-sm')} Choisir les capteurs <small>${S.devcSel.length} / ${S.devc.series.length}</small></button>
                ${S.devcPicker ? `<input type="search" class="st-input" data-filter placeholder="Filtrer par nom" value="${esc(S.devcFilter || '')}" aria-label="Filtrer les capteurs">
                <ul class="st-devc-list">${S.devc.series.map((s, i) => `<li class="st-devc-item" data-name="${esc(s.name.toLowerCase())}"><label><input type="checkbox" data-devc="${i}" ${S.devcSel.includes(i) ? 'checked' : ''}><span>${esc(s.name)}</span><small>${esc(unitLabel(s.units))}</small></label></li>`).join('')}</ul>` : ''}
            </div>` : '';
        dockEl.innerHTML = `
            <header class="st-dock-head"><h2>Courbes</h2><button type="button" class="st-x" data-dock-close aria-label="Fermer les courbes">${icon('x', 'st-ico-sm')}</button></header>
            <div class="st-dock-body">
                ${charts.map(c => `<figure class="st-chart" data-chart="${esc(c.id)}">
                    <figcaption>${esc(c.title)}</figcaption>
                    <div class="st-chart-plot"><canvas class="st-chart-base"></canvas><canvas class="st-chart-cur"></canvas></div>
                    <ul class="st-chart-legend">${c.series.map((s, k) => `<li><i style="background:${s.color}"></i><span>${esc(s.name)}</span><b data-k="${k}">—</b></li>`).join('')}</ul>
                </figure>`).join('') || '<p class="st-help">Choisissez des capteurs pour tracer leurs courbes.</p>'}
                ${picker}
            </div>`;
        if (S.devcFilter) { const f = $('[data-filter]', dockEl); if (f) f.dispatchEvent(new Event('input', { bubbles: true })); }
        $$('.st-chart-plot', dockEl).forEach(plot => wireChartSeek(plot));
        drawDock(true);
    }

    function wireChartSeek(plot) {
        let drag = false;
        const seek = e => {
            const r = plot.getBoundingClientRect();
            const [t0, t1] = span();
            const k = Math.max(0, Math.min(1, (e.clientX - r.left - CH.l) / Math.max(1, r.width - CH.l - CH.r)));
            S.playing = false;
            setTime(t0 + k * (t1 - t0));
        };
        plot.addEventListener('pointerdown', e => { if (!hasTimeline()) return; drag = true; plot.setPointerCapture(e.pointerId); seek(e); });
        plot.addEventListener('pointermove', e => { if (drag) seek(e); });
        plot.addEventListener('pointerup', () => { drag = false; });
        plot.addEventListener('pointercancel', () => { drag = false; });
    }

    const CH = { l: 44, r: 10, t: 8, b: 20 };
    function niceTicks(min, max, n) {
        const span = max - min || 1;
        const step0 = span / n, mag = Math.pow(10, Math.floor(Math.log10(step0)));
        const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= step0) || step0;
        const out = [];
        for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(+v.toFixed(10));
        return out;
    }
    function valueAt(t, ts, vs) {
        const i = frameAt(ts, t);
        if (i < 0) return NaN;
        if (i >= ts.length - 1 || ts[i] >= t) return vs[i];
        const f = (t - ts[i]) / ((ts[i + 1] - ts[i]) || 1);
        return vs[i] + f * (vs[i + 1] - vs[i]);
    }

    function drawDock(full) {
        if (!S.dock || !dockEl || !S.dockCharts) return;
        const [t0, t1] = span();
        const ink = cssVar('--text-primary', '#fff'), muted = cssVar('--text-muted', '#8a93b0'), line = cssVar('--border', '#2a3766');
        const dpr = window.devicePixelRatio || 1;
        S.dockCharts.forEach(c => {
            const fig = $(`[data-chart="${CSS.escape(c.id)}"]`, dockEl);
            if (!fig) return;
            const base = $('.st-chart-base', fig), cur = $('.st-chart-cur', fig);
            const W = base.clientWidth, H = base.clientHeight;
            if (!W || !H) return;
            const X = t => CH.l + (t - t0) / ((t1 - t0) || 1) * (W - CH.l - CH.r);
            if (full || base._w !== W || base._span !== t0 + ':' + t1) {
                base._w = W; base._span = t0 + ':' + t1;
                for (const cv of [base, cur]) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
                let mn = Infinity, mx = -Infinity;
                for (const s of c.series) for (let i = 0; i < s.v.length; i++) {
                    const tt = c.t[i]; if (tt < t0 - 1e-9 || tt > t1 + 1e-9) continue;
                    const v = s.v[i]; if (!Number.isFinite(v)) continue;
                    if (v < mn) mn = v; if (v > mx) mx = v;
                }
                if (!Number.isFinite(mn)) { mn = 0; mx = 1; }
                if (mn > 0 && mn < (mx - mn) * 0.5) mn = 0;
                if (mx === mn) { mx += 1; mn -= 1; }
                const ticks = niceTicks(mn, mx, 3);
                mn = Math.min(mn, ticks[0]); mx = Math.max(mx, ticks[ticks.length - 1]);
                const Y = v => CH.t + (1 - (v - mn) / (mx - mn)) * (H - CH.t - CH.b);
                c._Y = Y;
                const g = base.getContext('2d');
                g.setTransform(dpr, 0, 0, dpr, 0, 0);
                g.clearRect(0, 0, W, H);
                g.font = '11px "Barlow Semi Condensed", sans-serif';
                g.textBaseline = 'middle';
                g.strokeStyle = line; g.lineWidth = 1; g.fillStyle = muted;
                for (const v of ticks) {
                    const y = Math.round(Y(v)) + .5;
                    g.globalAlpha = .6; g.beginPath(); g.moveTo(CH.l, y); g.lineTo(W - CH.r, y); g.stroke(); g.globalAlpha = 1;
                    g.textAlign = 'right';
                    g.fillText(c.id === 'hrr' ? fmtVal(v >= 1000 ? v / 1000 : v) + (v >= 1000 ? ' MW' : '') : fmtVal(v), CH.l - 6, y);
                }
                g.textAlign = 'center'; g.textBaseline = 'alphabetic';
                niceTicks(t0, t1, 4).forEach(v => g.fillText(fmtNum(v, 0) + ' s', Math.max(CH.l + 12, Math.min(W - CH.r - 12, X(v))), H - 4));
                for (const s of c.series) {
                    g.strokeStyle = s.color; g.lineWidth = 1.8; g.lineJoin = 'round';
                    g.beginPath();
                    let started = false;
                    for (let i = 0; i < s.v.length; i++) {
                        const tt = c.t[i], v = s.v[i];
                        if (!Number.isFinite(v) || tt < t0 - 1e-9 || tt > t1 + 1e-9) { started = false; continue; }
                        if (started) g.lineTo(X(tt), Y(v)); else { g.moveTo(X(tt), Y(v)); started = true; }
                    }
                    g.stroke();
                }
            }
            // Curseur et valeurs à l'instant courant
            const g2 = cur.getContext('2d');
            g2.setTransform(dpr, 0, 0, dpr, 0, 0);
            g2.clearRect(0, 0, W, H);
            if (!hasTimeline() && c.id !== 'hrr') return;
            const xc = X(S.time);
            g2.fillStyle = hexA(ink.startsWith('#') ? ink : '#ffffff', .06);
            g2.fillRect(xc, CH.t, Math.max(0, W - CH.r - xc), H - CH.t - CH.b);
            g2.strokeStyle = ink; g2.lineWidth = 1.5;
            g2.beginPath(); g2.moveTo(Math.round(xc) + .5, CH.t - 2); g2.lineTo(Math.round(xc) + .5, H - CH.b); g2.stroke();
            c.series.forEach((s, k) => {
                const v = valueAt(S.time, c.t, s.v);
                if (Number.isFinite(v) && c._Y) {
                    g2.beginPath(); g2.arc(xc, c._Y(v), 3.5, 0, Math.PI * 2);
                    g2.fillStyle = s.color; g2.fill(); g2.strokeStyle = ink; g2.lineWidth = 1.2; g2.stroke();
                }
                const b = $(`b[data-k="${k}"]`, fig);
                if (b) b.textContent = c.id === 'hrr' ? fmtPower(v) : fmtVal(v) + (s.units || c.units ? ' ' + unitLabel(c.units) : '');
            });
        });
    }

    // ── Synchronisation périodique ───────────────────────────────────────
    function sync(force) {
        if (!document.body.classList.contains('studio') || !root) return;
        const a = api();
        if (!a) return;
        const av = a.availability();
        const hasResults = av.smoke || av.slice || av.boundary || L.part.available;
        renderChips(!!force);
        emptyEl.hidden = hasResults || a.hasData();
        rail.hidden = !(hasResults || a.hasData());
        player.hidden = !hasResults;
        if (!S.defaultsApplied && a.hasData()) applyStudioDefaults(hasResults);
        markRail();
        // Le moteur peut ré-afficher ou masquer une couche (changement de
        // mode, rechargement) : on ré-impose l'état du lecteur.
        applyVisibility();
        renderLegends();
        if (force) updatePlayerUI();
        else if (!S.playing) { const [t0, t1] = span(); if (S.time < t0 || S.time > t1) setTime(S.time); }
    }

    // ── Notifications ────────────────────────────────────────────────────
    let toastTimer;
    function toast(msg, ms) {
        if (!root) return;
        if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'st-toast st-glass'; toastEl.setAttribute('role', 'status'); root.appendChild(toastEl); }
        toastEl.textContent = msg;
        toastEl.hidden = false;
        clearTimeout(toastTimer);
        if (ms !== 0) toastTimer = setTimeout(() => { toastEl.hidden = true; }, ms || 2800);
    }

    // ── Clavier ──────────────────────────────────────────────────────────
    function wireKeyboard() {
        document.addEventListener('keydown', e => {
            if (!document.body.classList.contains('studio')) return;
            const t = e.target;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) {
                if (e.key === 'Escape') t.blur();
                return;
            }
            const v = api() && api().getViewer();
            if (v && v.walkMode) return;
            if (e.key === 'Escape') {
                closeMenu(); closePop(); drawer('left', false); drawer('right', false);
            } else if (e.code === 'Space') {
                if (t && t.tagName === 'BUTTON') return;
                e.preventDefault(); togglePlay();
            } else if (e.shiftKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
                e.preventDefault(); e.stopImmediatePropagation();
                stepFrame(e.key === 'ArrowRight' ? 1 : -1);
            }
        }, true);
    }

    // ── Glisser-déposer d'un dossier ─────────────────────────────────────
    function wireDrop() {
        const hasDir = dt => Array.from(dt.items || []).some(it => it.webkitGetAsEntry && it.webkitGetAsEntry() && it.webkitGetAsEntry().isDirectory);
        window.addEventListener('dragover', e => {
            if (!document.body.classList.contains('studio') || !e.dataTransfer) return;
            document.body.classList.add('st-dragging');
        }, true);
        window.addEventListener('dragleave', e => { if (e.relatedTarget == null) document.body.classList.remove('st-dragging'); }, true);
        window.addEventListener('drop', async e => {
            document.body.classList.remove('st-dragging');
            if (!document.body.classList.contains('studio') || !e.dataTransfer) return;
            const dt = e.dataTransfer;
            const dropped = Array.from(dt.files || []);
            const isFolder = hasDir(dt) || dropped.some(f => /\.smv$/i.test(f.name));
            if (!isFolder) return; // un .fds ou des .csv : comportement habituel
            e.preventDefault(); e.stopImmediatePropagation();
            const entries = Array.from(dt.items || []).map(it => it.webkitGetAsEntry && it.webkitGetAsEntry()).filter(Boolean);
            const files = entries.length ? await readEntries(entries) : dropped;
            loadLocalFolder(files);
        }, true);
    }
    async function readEntries(entries, depth) {
        const out = [];
        for (const en of entries) {
            if (en.isFile) out.push(await new Promise((res, rej) => en.file(res, rej)));
            else if (en.isDirectory && (depth || 0) < 3) {
                const reader = en.createReader();
                let batch;
                do {
                    batch = await new Promise((res, rej) => reader.readEntries(res, rej));
                    out.push(...await readEntries(batch, (depth || 0) + 1));
                } while (batch.length);
            }
        }
        return out;
    }

    // ── Démarrage ─────────────────────────────────────────────────────────
    function boot() {
        buildTopbar();
        buildRoot();
        if (!root) return;
        wireModes();
        wireKeyboard();
        wireDrop();
        const studio = lsGet(LS_UI) !== 'expert';
        document.body.classList.toggle('studio', studio);
        if (studio) {
            const tab = $('.page-tab[data-page="output"]');
            if (tab) tab.click();
        }
        // Le mode visite peut se terminer tout seul (Échap) : on suit l'état.
        const oc = ctl('output-viewer-container');
        if (oc) oc.addEventListener('walkModeChanged', markRail);
        sync(true);
        setInterval(() => sync(false), 300);
        requestAnimationFrame(tick);
    }

    window.FDSStudio = { setStudio, present, sync };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
