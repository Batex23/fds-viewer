/**
 * Lecteur de simulation — interface simplifiée posée sur le moteur existant.
 *
 * Principe : la vue 3D des résultats occupe l'écran. Par-dessus :
 *   - une barre d'outils à gauche (Vues, Coupe, Bâtiment, Visite, Capture) ;
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
    const SPEEDS = [1, 2, 4, 0.5];

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
        S.hrr = null;
        const hrr = files.find(f => /_hrr\.csv$/i.test(f.name));
        if (hrr) {
            hrr.text().then(txt => { S.hrr = parseHrr(txt); drawTimeline(); refreshHrrReadout(); })
                .catch(() => { /* frise sans courbe */ });
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

    function afterLoad() {
        applyStudioDefaults(true);
        const a = api() && api().availability();
        if (a) {
            if (a.smokeLoaded) api().setMode('smoke');
            else if (a.slice) api().setMode('slice');
            else if (a.boundary) { api().setMode('boundary'); api().loadBoundary(); }
        }
        S.cut.on = false; S.cut.pos = null;
        sync(true);
    }

    // Vue épurée par défaut : on garde le bâtiment, on masque le maillage.
    function applyStudioDefaults(results) {
        if (!layerBox('grid')) return;
        ['grid', 'meshes', 'devcs', 'inits', 'zones', 'hvacs'].forEach(l => setLayer(l, false));
        ['obsts', 'vents', 'holes', 'geoms', 'fires'].forEach(l => setLayer(l, true));
        setCtl('output-scene-grayscale', !!results);
        S.defaultsApplied = true;
    }

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
                <button type="button" class="st-tool" data-act="walk" data-tip="Visite à la première personne" aria-label="Visite à la première personne">${icon('walk')}</button>
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
                <button type="button" class="st-speed" title="Vitesse de lecture">×1</button>
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
        $('.st-speed', player).addEventListener('click', e => {
            const cur = api().getSpeed();
            const next = SPEEDS[(SPEEDS.indexOf(cur) + 1) % SPEEDS.length];
            api().setSpeed(next);
            e.currentTarget.textContent = '×' + String(next).replace('.', ',');
        });
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
            if (window.FDSRemote && window.FDSRemote.pickFromDrive) window.FDSRemote.pickFromDrive();
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
            const b = ctl('load-sample');
            if (b) b.click();
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
        document.body.classList.toggle('studio', on);
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
        const fn = { views: popViews, cut: popCut, building: popBuilding, settings: popSettings }[S.open];
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
                ${sw('color', 'Couleurs des matériaux', !(ctl('output-scene-grayscale') || {}).checked)}
                ${sw('fires', 'Foyers', isOn('fires'))}
                ${sw('openings', 'Ouvertures et vents', isOn('vents') || isOn('holes'))}
                ${sw('devcs', 'Capteurs', isOn('devcs'))}
                ${sw('grid', 'Grille de calcul', isOn('grid'))}
                ${sw('meshes', 'Limites des maillages', isOn('meshes'))}
            </div>
            <button type="button" class="st-link" data-all>${icon('layers', 'st-ico-sm')} Tous les calques…</button>`;
        on(el, 'click', e => {
            const btn = e.target.closest('button');
            if (!btn) return;
            if (btn.closest('[data-wall]')) {
                const v = btn.dataset.v;
                setLayer('obsts', v !== 'hidden');
                setLayer('geoms', v !== 'hidden');
                setCtl('output-opacity-slider', v === 'ghost' ? 0.25 : 1);
                $$('[data-wall] button', el).forEach(x => x.setAttribute('aria-pressed', String(x === btn)));
            } else if (btn.hasAttribute('data-all')) { closePop(); drawer('left', true); }
        });
        on(el, 'change', e => {
            const k = e.target.dataset.sw, on = e.target.checked;
            if (k === 'color') setCtl('output-scene-grayscale', !on);
            else if (k === 'openings') { setLayer('vents', on); setLayer('holes', on); }
            else setLayer(k, on);
        });
    }

    // Réglages de la donnée affichée
    function popSettings(el) {
        const mode = api().getMode();
        const sw = (id, label, on) => `<label class="st-switch"><span>${label}</span><input type="checkbox" data-ctl="${id}" ${on ? 'checked' : ''}></label>`;
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
        let body = '';
        if (mode === 'smoke') {
            body = rng('output-smoke-vol-gain', 'Densité de la fumée', 0.5, 20, 'Légère', 'Dense') +
                rng('output-smoke-fire-gain', 'Intensité des flammes', 0.5, 20, 'Faible', 'Forte') +
                `<div class="st-field"><div class="st-label">Seuil d’affichage des flammes <span class="st-val" data-kw>${esc((ctl('output-smoke-hrr-thresh-kw') || {}).textContent || '')}</span></div>
                    <input type="range" class="st-range" data-ctl="output-smoke-hrr-thresh" min="0" max="255" value="${(ctl('output-smoke-hrr-thresh') || {}).value || 42}">
                    <div class="st-hint">Les flammes sont affichées au-dessus de ce seuil de puissance volumique. Smokeview : 200 kW/m³.</div></div>` +
                '<div class="st-field">' +
                sw('output-smoke-render', 'Fumée masquée par les murs', (ctl('output-smoke-render') || {}).value === 'depth') +
                sw('output-smoke-smooth', 'Animation fluide', (ctl('output-smoke-smooth') || {}).checked) +
                '</div>';
        } else if (mode === 'slice') {
            body = mirrorSelect('output-slice-set-select', 'Plan affiché') +
                mirrorSelect('output-color-map', 'Palette') +
                '<div class="st-field">' + sw('output-slice-render', 'Plan masqué par les murs', (ctl('output-slice-render') || {}).value === 'depth') + '</div>';
        } else if (mode === 'boundary') {
            body = mirrorSelect('output-boundary-set', 'Grandeur sur les parois') +
                mirrorSelect('output-boundary-colormap', 'Palette') +
                rng('output-boundary-opacity', 'Opacité', 0.05, 1, 'Légère', 'Pleine');
        } else {
            body = '<p class="st-help">Aucun réglage pour cet affichage.</p>';
        }
        const titles = { smoke: 'Réglages de la fumée', slice: 'Réglages du plan de coupe', boundary: 'Réglages des parois' };
        el.innerHTML = popHead(titles[mode] || 'Réglages') + body +
            `<button type="button" class="st-link" data-all>${icon('sliders', 'st-ico-sm')} Tous les réglages…</button>`;

        on(el, 'input', e => {
            const id = e.target.dataset.ctl;
            if (!id || e.target.type !== 'range') return;
            setCtl(id, e.target.value);
            if (id === 'output-smoke-hrr-thresh') {
                const kw = $('[data-kw]', el);
                if (kw) kw.textContent = (ctl('output-smoke-hrr-thresh-kw') || {}).textContent || '';
            }
        });
        on(el, 'change', async e => {
            const id = e.target.dataset.ctl;
            if (!id) return;
            if (e.target.type === 'checkbox') {
                if (id === 'output-smoke-render' || id === 'output-slice-render') setCtl(id, e.target.checked ? 'depth' : 'basic');
                else setCtl(id, e.target.checked);
            } else if (e.target.tagName === 'SELECT') {
                setCtl(id, e.target.value);
                if (id === 'output-boundary-set') { await api().loadBoundary(); sync(true); }
                if (id === 'output-slice-set-select') sync(true);
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
            const t = S.frames[S.frameIdx];
            const modeName = { smoke: 'Fumée et flammes', slice: 'Plan de coupe', boundary: 'Parois' }[api().getMode()] || '';
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
            const t = S.frames[S.frameIdx];
            a.download = `${(S.simKey || 'simulation').replace(/[^\w-]+/g, '_')}${Number.isFinite(t) ? '_t' + Math.round(t) + 's' : ''}.png`;
            a.href = cv.toDataURL('image/png');
            a.click();
            toast('Image enregistrée.');
        }
    }

    // ── Lecteur ───────────────────────────────────────────────────────────
    function togglePlay() {
        const a = api();
        if (a.isPlaying()) a.pause(); else a.play();
        syncPlayer();
    }

    function nearestFrame(time) {
        const f = S.frames;
        let best = 0, bd = Infinity;
        for (let i = 0; i < f.length; i++) { const d = Math.abs(f[i] - time); if (d < bd) { bd = d; best = i; } }
        return best;
    }
    function span() {
        const f = S.frames;
        if (f.length > 1) return [f[0], f[f.length - 1]];
        if (S.hrr) return [S.hrr.t[0], S.hrr.t[S.hrr.t.length - 1]];
        return [0, 1];
    }
    function timeAtX(clientX) {
        const r = canvas.getBoundingClientRect();
        const k = Math.max(0, Math.min(1, (clientX - r.left - 6) / Math.max(1, r.width - 12)));
        const [t0, t1] = span();
        return t0 + k * (t1 - t0);
    }

    function wireTimeline() {
        let wasPlaying = false, raf = 0;
        const seek = x => {
            const t = timeAtX(x);
            S.hover = t;
            const i = nearestFrame(t);
            if (i !== S.frameIdx) { S.frameIdx = i; cancelAnimationFrame(raf); raf = requestAnimationFrame(() => api().setFrame(i)); }
            drawTimeline(); showTip(x);
        };
        timeline.addEventListener('pointerdown', e => {
            if (S.frames.length < 2) return;
            S.scrubbing = true;
            wasPlaying = api().isPlaying();
            if (wasPlaying) api().pause();
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
            if (wasPlaying) api().play();
            syncPlayer();
        };
        timeline.addEventListener('pointerup', end);
        timeline.addEventListener('pointercancel', end);
        timeline.addEventListener('pointerleave', () => { if (!S.scrubbing) { S.hover = null; tip.hidden = true; drawTimeline(); } });
        timeline.addEventListener('keydown', e => {
            const n = S.frames.length;
            if (n < 2) return;
            let i = S.frameIdx;
            if (e.key === 'ArrowRight') i++;
            else if (e.key === 'ArrowLeft') i--;
            else if (e.key === 'Home') i = 0;
            else if (e.key === 'End') i = n - 1;
            else if (e.key === 'PageUp') i += 10;
            else if (e.key === 'PageDown') i -= 10;
            else return;
            e.preventDefault(); e.stopPropagation();
            i = Math.max(0, Math.min(n - 1, i));
            S.frameIdx = i; api().setFrame(i); syncPlayer();
        });
        window.addEventListener('resize', drawTimeline);
    }

    function showTip(clientX) {
        if (S.hover == null) { tip.hidden = true; return; }
        const r = timeline.getBoundingClientRect();
        const hrr = hrrAt(S.hover);
        tip.textContent = fmtTime(S.hover) + (hrr != null ? ' · ' + fmtPower(hrr) : '');
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
        const muted = cssVar('--text-muted', '#999');
        const pad = 6, x0 = pad, x1 = W - pad, top = 6, bottom = H - 8;
        const [t0, t1] = span();
        const X = t => x0 + (t - t0) / ((t1 - t0) || 1) * (x1 - x0);
        const cur = S.frames.length ? S.frames[S.frameIdx] : null;
        const xc = cur != null ? X(cur) : x0;

        // fond
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
            // partie déjà jouée plus marquée
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

        // survol
        if (S.hover != null && !S.scrubbing) {
            const xh = X(S.hover);
            g.strokeStyle = hexA(ink, .5); g.setLineDash([3, 3]); g.lineWidth = 1;
            g.beginPath(); g.moveTo(xh, 2); g.lineTo(xh, H - 2); g.stroke(); g.setLineDash([]);
        }
        // curseur
        if (cur != null) {
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
        const t = S.frames[S.frameIdx];
        box.hidden = !S.hrr;
        if (S.hrr) {
            $('strong', box).textContent = fmtPower(hrrAt(Number.isFinite(t) ? t : S.hrr.t[0]));
            $('span', box).textContent = 'HRR · max ' + fmtPower(S.hrr.max);
        }
    }

    function syncPlayer() {
        const a = api();
        if (!a || !player) return;
        const frames = a.frames();
        if (frames.length !== S.frames.length || frames[frames.length - 1] !== S.frames[S.frames.length - 1]) {
            S.frames = frames;
        }
        if (!S.scrubbing) S.frameIdx = Math.min(a.frameIndex(), Math.max(0, frames.length - 1));
        const n = frames.length;
        const playBtn = $('.st-play', player);
        const playing = a.isPlaying();
        playBtn.disabled = n < 2;
        playBtn.innerHTML = icon(playing ? 'pause' : 'play');
        playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Lecture');
        const t = frames[S.frameIdx];
        $('.st-clock strong', player).innerHTML = n ? fmtNum(t, t < 10 ? 1 : 0) + '<small> s</small>' : '—';
        $('.st-clock span', player).textContent = n ? 'sur ' + fmtTime(frames[n - 1]) : 'pas de résultats animés';
        timeline.setAttribute('aria-valuemax', String(Math.max(0, n - 1)));
        timeline.setAttribute('aria-valuenow', String(S.frameIdx));
        timeline.setAttribute('aria-valuetext', n ? fmtTime(t) : '');
        $('.st-speed', player).textContent = '×' + String(a.getSpeed()).replace('.', ',');
        refreshHrrReadout();
        drawTimeline();
    }

    // ── Barre des modes ──────────────────────────────────────────────────
    const MODE_LABELS = [
        ['smoke', 'Fumée et flammes'],
        ['slice', 'Plans de coupe'],
        ['boundary', 'Parois'],
        ['charts', 'Courbes'],
    ];
    function renderModes(av, mode) {
        const show = { smoke: av.smoke, slice: av.slice, boundary: av.boundary, charts: S.csvSeen };
        const list = MODE_LABELS.filter(([k]) => show[k]);
        const sig = list.map(([k]) => k).join(',') + '|' + mode;
        if (sig === S.availSig) return;
        S.availSig = sig;
        modes.hidden = !list.length;
        modes.innerHTML = list.map(([k, l]) => `<button type="button" class="st-chip" data-mode="${k}" aria-pressed="${mode === k}">${esc(l)}</button>`).join('') +
            (['smoke', 'slice', 'boundary'].includes(mode) ? `<span class="st-sep"></span><button type="button" class="st-tool" data-pop="settings" data-tip="Réglages" aria-label="Réglages de l’affichage" aria-expanded="${S.open === 'settings'}">${icon('sliders')}</button>` : '');
    }
    function wireModes() {
        modes.addEventListener('click', async e => {
            const b = e.target.closest('button');
            if (!b) return;
            if (b.dataset.pop) { togglePop('settings', b); return; }
            const m = b.dataset.mode;
            if (!m) return;
            closePop();
            const a = api();
            a.setMode(m);
            const av = a.availability();
            if (m === 'smoke' && !av.smokeLoaded) { toast('Chargement de la fumée…', 0); await a.loadSmoke(); toast('Fumée chargée.'); }
            if (m === 'boundary' && !av.boundaryLoaded) { toast('Chargement des parois…', 0); await a.loadBoundary(); toast('Parois chargées.'); }
            S.availSig = '';
            sync(true);
        });
    }

    // ── Synchronisation périodique ───────────────────────────────────────
    function sync(force) {
        if (!document.body.classList.contains('studio') || !root) return;
        const a = api();
        if (!a) return;
        const av = a.availability();
        const mode = a.getMode();
        const hasResults = av.smoke || av.slice || av.boundary;
        renderModes(av, mode);
        emptyEl.hidden = hasResults || a.hasData();
        rail.hidden = !(hasResults || a.hasData()) || mode === 'charts';
        player.hidden = !hasResults || mode === 'charts';
        if (!S.defaultsApplied && a.hasData()) applyStudioDefaults(hasResults);
        markRail();
        if (!player.hidden || force) syncPlayer();
    }

    function loop() {
        if (document.body.classList.contains('studio') && api() && api().isPlaying() && !S.scrubbing) syncPlayer();
        requestAnimationFrame(loop);
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
                const n = S.frames.length; if (n < 2) return;
                const i = Math.max(0, Math.min(n - 1, S.frameIdx + (e.key === 'ArrowRight' ? 1 : -1)));
                S.frameIdx = i; api().setFrame(i); syncPlayer();
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
        requestAnimationFrame(loop);
    }

    window.FDSStudio = { setStudio, present, sync };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
