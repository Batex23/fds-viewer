/**
 * Remote simulation loading — open an FDS results folder from a shared link.
 *
 *   ?drive=<Google Drive folder id or folder URL>   folder shared "Anyone with the link"
 *   ?url=<base URL>                                  any static hosting with a manifest.json
 *   &key=<Google API key>                            optional, overrides js/config.js
 *
 * The folder is listed, then every file is exposed to the Output page as a
 * lazy File-like object (name, size, text(), arrayBuffer()): nothing is
 * downloaded until the viewer actually reads it, so a boundary file that is
 * never displayed is never fetched. The Output page pipeline (smoke, slices,
 * boundaries) is the same one used by "Open simulation folder".
 *
 * Also adds a "Partager" button that turns a Drive folder link into a viewer
 * link ready to send.
 */
(function () {
    'use strict';

    const CFG = window.FDS_VIEWER_CONFIG || {};
    const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';
    const FOLDER_MIME = 'application/vnd.google-apps.folder';
    const MAX_DEPTH = 2;   // results folder + up to 2 levels of sub-folders

    // ── Small helpers ─────────────────────────────────────────────────────
    function esc(s) {
        return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function formatBytes(n) {
        if (!Number.isFinite(n) || n <= 0) return '0 Mo';
        if (n < 1024 * 1024) return (n / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' ko';
        if (n < 1024 ** 3) return (n / 1024 / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' Mo';
        return (n / 1024 ** 3).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' Go';
    }

    /** Folder id from a Drive URL, an "id=" link or a bare id. */
    function extractDriveId(input) {
        const s = String(input || '').trim();
        if (!s) return '';
        let m = s.match(/\/folders\/([A-Za-z0-9_-]{10,})/);
        if (m) return m[1];
        m = s.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
        if (m) return m[1];
        m = s.match(/^[A-Za-z0-9_-]{10,}$/);
        return m ? m[0] : '';
    }

    function viewerBaseUrl() {
        return window.location.origin + window.location.pathname;
    }

    function shareLinkForDrive(folderId) {
        return viewerBaseUrl() + '?drive=' + encodeURIComponent(folderId);
    }

    // ── Connexion Google (accès aux dossiers privés + sélecteur Drive) ────
    // Avec un jeton OAuth, la visionneuse lit les dossiers auxquels la
    // personne connectée a accès (Mon Drive, partagés avec moi, Drives
    // partagés), sans partage public. Sans jeton : clé API seule, donc
    // dossiers partagés « Tous les utilisateurs disposant du lien ».
    const GSI_SRC = 'https://accounts.google.com/gsi/client';
    const GAPI_SRC = 'https://apis.google.com/js/api.js';
    const SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
    const auth = { token: null, expires: 0, client: null, pickerReady: null };

    const hasOAuth = () => !!CFG.googleClientId;
    const tokenValid = () => !!auth.token && Date.now() < auth.expires;
    function authHeaders(extra) {
        const h = Object.assign({}, extra || {});
        if (tokenValid()) h.Authorization = 'Bearer ' + auth.token;
        return h;
    }
    function keyParam(key) {
        // Avec un jeton, la clé est inutile (et pourrait être refusée par
        // ses restrictions) : on ne l'envoie que sans connexion.
        return (!tokenValid() && key) ? '&key=' + encodeURIComponent(key) : '';
    }

    const scripts = {};
    function loadScript(src) {
        if (!scripts[src]) {
            scripts[src] = new Promise((resolve, reject) => {
                const el = document.createElement('script');
                el.src = src; el.async = true; el.defer = true;
                el.onload = resolve;
                el.onerror = () => { delete scripts[src]; reject(new Error('Impossible de charger ' + src)); };
                document.head.appendChild(el);
            });
        }
        return scripts[src];
    }

    /** Précharge les scripts Google : la fenêtre de connexion doit s'ouvrir
     *  directement dans le clic, sans attente réseau intermédiaire. */
    function preloadGoogle() {
        if (!hasOAuth()) return;
        loadScript(GSI_SRC).catch(() => {});
        if (!auth.pickerReady) {
            auth.pickerReady = loadScript(GAPI_SRC)
                .then(() => new Promise(res => window.gapi.load('picker', res)))
                .catch(e => { auth.pickerReady = null; throw e; });
            auth.pickerReady.catch(() => {});
        }
    }

    function signIn() {
        return new Promise((resolve, reject) => {
            if (!hasOAuth()) {
                reject(new Error('La connexion Google n’est pas configurée pour ce site (identifiant client OAuth manquant dans js/config.js).'));
                return;
            }
            if (tokenValid()) { resolve(auth.token); return; }
            const go = () => {
                try {
                    if (!auth.client) {
                        auth.client = window.google.accounts.oauth2.initTokenClient({
                            client_id: CFG.googleClientId,
                            scope: SCOPE,
                            callback: () => {},
                        });
                    }
                    auth.client.callback = r => {
                        if (r && r.access_token) {
                            auth.token = r.access_token;
                            auth.expires = Date.now() + Math.max(60, (Number(r.expires_in) || 3600) - 60) * 1000;
                            resolve(auth.token);
                        } else {
                            reject(new Error('Connexion Google refusée' + (r && r.error ? ' (' + r.error + ')' : '') + '.'));
                        }
                    };
                    auth.client.error_callback = e => {
                        const t = e && e.type;
                        reject(new Error(t === 'popup_closed' ? 'Fenêtre de connexion fermée.'
                            : t === 'popup_failed_to_open' ? 'La fenêtre de connexion a été bloquée : autorisez les fenêtres pop-up pour ce site.'
                            : 'Connexion Google impossible.'));
                    };
                    auth.client.requestAccessToken({ prompt: auth.token ? '' : 'select_account' });
                } catch (e) { reject(e); }
            };
            if (window.google && window.google.accounts && window.google.accounts.oauth2) go();
            else loadScript(GSI_SRC).then(go, reject);
        });
    }

    /** Ouvre le sélecteur Google Drive et charge le dossier choisi. */
    async function pickFromDrive() {
        try {
            preloadGoogle();
            await signIn();
            await auth.pickerReady;
            const P = window.google.picker;
            const folderView = () => new P.DocsView(P.ViewId.FOLDERS)
                .setIncludeFolders(true)
                .setSelectFolderEnabled(true)
                .setMimeTypes(FOLDER_MIME);
            const label = (v, txt) => (typeof v.setLabel === 'function' ? v.setLabel(txt) : v);
            const mine = label(folderView().setOwnedByMe(true), 'Mon Drive');
            const shared = label(folderView().setOwnedByMe(false), 'Partagés avec moi');
            const drives = label(folderView().setEnableDrives(true), 'Drives partagés');
            const builder = new P.PickerBuilder()
                .setTitle('Choisissez le dossier de résultats FDS')
                .setLocale('fr')
                .setOAuthToken(auth.token)
                .enableFeature(P.Feature.SUPPORT_DRIVES)
                .addView(mine)
                .addView(shared)
                .addView(drives)
                .setCallback(data => {
                    if (data[P.Response.ACTION] !== P.Action.PICKED) return;
                    const doc = (data[P.Response.DOCUMENTS] || [])[0];
                    if (!doc) return;
                    const id = doc[P.Document.ID];
                    try { history.replaceState(null, '', shareLinkForDrive(id)); } catch (_) { /* file:// */ }
                    openRemote({ kind: 'drive', id, key: CFG.driveApiKey || '' });
                });
            if (CFG.driveApiKey) builder.setDeveloperKey(CFG.driveApiKey);
            if (CFG.googleAppId) builder.setAppId(CFG.googleAppId);
            builder.setOrigin(window.location.protocol + '//' + window.location.host);
            builder.build().setVisible(true);
        } catch (e) {
            console.error('[drive]', e);
            if (!/fermée/.test(e.message)) failOverlay(e);
        }
    }

    // ── Download progress (shared by every remote file) ──────────────────
    const progress = {
        active: new Map(),     // name → { loaded, total }
        doneBytes: 0,
        listeners: new Set(),
        update() { this.listeners.forEach(fn => fn(this)); },
        snapshot() {
            let loaded = this.doneBytes, total = this.doneBytes;
            for (const p of this.active.values()) { loaded += p.loaded; total += p.total || p.loaded; }
            return { loaded, total, files: Array.from(this.active.keys()) };
        },
    };

    async function fetchWithProgress(url, name, expectedSize) {
        const res = await fetch(url, { headers: authHeaders() });
        if (!res.ok) throw await httpError(res, name);
        const total = expectedSize || Number(res.headers.get('content-length')) || 0;
        const entry = { loaded: 0, total };
        progress.active.set(name, entry);
        progress.update();
        try {
            if (!res.body || !res.body.getReader) {
                const buf = await res.arrayBuffer();
                entry.loaded = buf.byteLength;
                return buf;
            }
            const reader = res.body.getReader();
            const chunks = [];
            let lastTick = 0;
            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
                entry.loaded += value.byteLength;
                const now = performance.now();
                if (now - lastTick > 100) { lastTick = now; progress.update(); }
            }
            const out = new Uint8Array(entry.loaded);
            let o = 0;
            for (const c of chunks) { out.set(c, o); o += c.byteLength; }
            return out.buffer;
        } finally {
            progress.active.delete(name);
            progress.doneBytes += entry.loaded;
            progress.update();
        }
    }

    async function httpError(res, name) {
        let detail = '';
        try {
            const j = await res.json();
            detail = (j && j.error && (j.error.message || j.error.status)) || '';
        } catch (_) { /* not JSON */ }
        const low = detail.toLowerCase();
        let msg;
        if (res.status === 404) {
            msg = tokenValid()
                ? 'Introuvable. Ce dossier n’existe plus ou votre compte Google n’y a pas accès.'
                : 'Introuvable. Le dossier n’est pas partagé publiquement : connectez-vous avec un compte Google qui y a accès, ou partagez-le en « Tous les utilisateurs disposant du lien ».';
        } else if (res.status === 403 && /referer|referrer/.test(low)) {
            msg = 'La clé API Google refuse ce site. Ajoutez son adresse dans les restrictions de la clé (console Google Cloud).';
        } else if (res.status === 403 && /quota|rate|exceeded/.test(low)) {
            msg = 'Google Drive limite temporairement les téléchargements de ce fichier. Réessayez un peu plus tard.';
        } else if ((res.status === 400 || res.status === 403) && /api key|key not valid|disabled|has not been used/.test(low)) {
            msg = 'Clé API Google invalide ou API Drive non activée sur le projet Google Cloud.';
        } else if (res.status === 403) {
            msg = tokenValid()
                ? 'Accès refusé par Google Drive pour ce compte.'
                : 'Accès refusé par Google Drive. Connectez-vous avec un compte Google qui a accès au dossier, ou partagez-le en « Tous les utilisateurs disposant du lien ».';
        } else {
            msg = 'Erreur ' + res.status + ' lors du téléchargement.';
        }
        const err = new Error((name ? name + ' : ' : '') + msg + (detail ? '\n(' + detail + ')' : ''));
        err.status = res.status;
        return err;
    }

    // ── Lazy remote file ──────────────────────────────────────────────────
    class RemoteFile {
        constructor(name, url, size) {
            this.name = name;
            this.size = size || 0;
            this.type = '';
            this.lastModified = Date.now();
            this._url = url;
            this._buf = null;
        }
        arrayBuffer() {
            if (!this._buf) {
                this._buf = fetchWithProgress(this._url, this.name, this.size);
                this._buf.catch(() => { this._buf = null; });  // allow a retry
            }
            return this._buf;
        }
        async text() {
            return new TextDecoder('utf-8').decode(await this.arrayBuffer());
        }
        /**
         * Blob.slice() equivalent, used to read file headers (e.g. slice
         * files) without downloading the whole file: an HTTP Range request,
         * or a view of the full buffer when it is already downloaded.
         */
        slice(start, end) {
            const self = this;
            start = start || 0;
            return {
                size: Math.max(0, (end == null ? self.size : end) - start),
                async arrayBuffer() {
                    if (self._buf) return (await self._buf).slice(start, end);
                    const headers = authHeaders();
                    if (end != null) headers.Range = 'bytes=' + start + '-' + (end - 1);
                    const res = await fetch(self._url, { headers });
                    if (!res.ok) throw await httpError(res, self.name);
                    const buf = await res.arrayBuffer();
                    // 206 = partial content; 200 = server ignored Range (whole file).
                    return res.status === 206 ? buf : buf.slice(start, end);
                },
                async text() {
                    return new TextDecoder('utf-8').decode(await this.arrayBuffer());
                },
            };
        }
        /** Real File (needed by code paths that use FileReader). */
        async toFile() {
            return new File([await this.arrayBuffer()], this.name);
        }
    }

    // ── Sources ───────────────────────────────────────────────────────────
    async function driveJson(url) {
        const res = await fetch(url, { headers: authHeaders() });
        if (!res.ok) throw await httpError(res, '');
        return res.json();
    }

    async function listDriveFolder(folderId, key) {
        const meta = await driveJson(DRIVE_API + '/' + encodeURIComponent(folderId) +
            '?fields=id,name,mimeType&supportsAllDrives=true' + keyParam(key));
        if (meta.mimeType !== FOLDER_MIME) {
            throw new Error('Ce lien ne pointe pas vers un dossier Google Drive. Partagez le dossier de résultats complet, pas un fichier.');
        }
        const files = [];
        async function walk(id, depth) {
            let pageToken = '';
            do {
                const q = "'" + id + "' in parents and trashed = false";
                const url = DRIVE_API + '?q=' + encodeURIComponent(q) +
                    '&fields=' + encodeURIComponent('nextPageToken,files(id,name,size,mimeType)') +
                    '&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true' +
                    (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '') +
                    keyParam(key);
                const page = await driveJson(url);
                for (const f of page.files || []) {
                    if (f.mimeType === FOLDER_MIME) {
                        if (depth < MAX_DEPTH) await walk(f.id, depth + 1);
                    } else if (!/^application\/vnd\.google-apps\./.test(f.mimeType)) {
                        const url = DRIVE_API + '/' + encodeURIComponent(f.id) +
                            '?alt=media&supportsAllDrives=true' + keyParam(key);
                        files.push(new RemoteFile(f.name, url, Number(f.size) || 0));
                    }
                }
                pageToken = page.nextPageToken || '';
            } while (pageToken);
        }
        await walk(folderId, 0);
        return { title: meta.name, files };
    }

    /**
     * Generic static hosting: <base>/manifest.json lists the files, either as
     * ["a.smv", ...] or { "title": "...", "files": [{ "name", "size" }, ...] }.
     */
    async function listUrlFolder(base) {
        base = base.replace(/\/+$/, '');
        const res = await fetch(base + '/manifest.json', { cache: 'no-cache' });
        if (!res.ok) throw new Error('manifest.json introuvable dans ' + base + ' (HTTP ' + res.status + ').');
        const man = await res.json();
        const list = Array.isArray(man) ? man : (man.files || []);
        const files = list.map(it => {
            const name = typeof it === 'string' ? it : it.name;
            const size = typeof it === 'string' ? 0 : Number(it.size) || 0;
            return new RemoteFile(name.split('/').pop(), base + '/' + name.split('/').map(encodeURIComponent).join('/'), size);
        });
        return { title: (!Array.isArray(man) && man.title) || base.split('/').pop(), files };
    }

    // ── Loading overlay ───────────────────────────────────────────────────
    let overlay = null;

    function showOverlay(title) {
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'rl-overlay';
            overlay.setAttribute('role', 'dialog');
            overlay.setAttribute('aria-live', 'polite');
            overlay.innerHTML =
                '<div class="rl-card">' +
                '  <div class="rl-flame" aria-hidden="true"><span></span><span></span><span></span></div>' +
                '  <div class="rl-kicker">Chargement de la simulation</div>' +
                '  <div class="rl-title"></div>' +
                '  <div class="rl-step"></div>' +
                '  <div class="rl-bar"><div class="rl-bar-fill"></div></div>' +
                '  <div class="rl-meta"><span class="rl-file"></span><span class="rl-bytes"></span></div>' +
                '  <div class="rl-error" hidden></div>' +
                '  <div class="rl-actions" hidden><button type="button" class="btn btn-sm btn-primary rl-signin" hidden>Se connecter avec Google</button><button type="button" class="btn btn-sm btn-secondary rl-close">Fermer</button></div>' +
                '</div>';
            document.body.appendChild(overlay);
            overlay.querySelector('.rl-close').addEventListener('click', hideOverlay);
            overlay.querySelector('.rl-signin').addEventListener('click', async () => {
                try { await signIn(); } catch (e) { failOverlay(e); return; }
                if (lastSource) openRemote(lastSource);
            });
            progress.listeners.add(renderProgress);
        }
        overlay.classList.remove('rl-failed', 'rl-hidden');
        overlay.querySelector('.rl-title').textContent = title || '';
        overlay.querySelector('.rl-error').hidden = true;
        overlay.querySelector('.rl-actions').hidden = true;
        setStep('Connexion au dossier…');
        renderProgress();
    }

    function setStep(text) {
        if (overlay) overlay.querySelector('.rl-step').textContent = text;
    }

    function setTitle(text) {
        if (overlay) overlay.querySelector('.rl-title').textContent = text;
    }

    function renderProgress() {
        if (!overlay) return;
        const s = progress.snapshot();
        const pct = s.total > 0 ? Math.min(100, (s.loaded / s.total) * 100) : 0;
        const fill = overlay.querySelector('.rl-bar-fill');
        fill.style.width = (s.files.length || s.loaded ? pct : 0) + '%';
        overlay.querySelector('.rl-bar').classList.toggle('rl-indeterminate', !s.files.length && !s.loaded);
        overlay.querySelector('.rl-file').textContent = s.files.length
            ? s.files[0] + (s.files.length > 1 ? '  +' + (s.files.length - 1) : '')
            : '';
        overlay.querySelector('.rl-bytes').textContent = s.loaded ? formatBytes(s.loaded) + (s.total > s.loaded ? ' / ' + formatBytes(s.total) : '') : '';
    }

    function hideOverlay() {
        if (!overlay) return;
        overlay.classList.add('rl-hidden');
    }

    function failOverlay(err) {
        if (!overlay) showOverlay('');
        overlay.classList.add('rl-failed');
        setStep('Impossible de charger la simulation');
        const box = overlay.querySelector('.rl-error');
        box.textContent = err && err.message ? err.message : String(err);
        box.hidden = false;
        overlay.querySelector('.rl-actions').hidden = false;
        // Dossier privé : proposer la connexion Google puis réessayer.
        const canSignIn = hasOAuth() && !tokenValid() && lastSource && lastSource.kind === 'drive'
            && err && (err.status === 403 || err.status === 404);
        overlay.querySelector('.rl-signin').hidden = !canSignIn;
    }

    // ── Main flow ─────────────────────────────────────────────────────────
    let currentShareLink = '';

    let lastSource = null;
    async function openRemote(source) {
        lastSource = source;
        progress.doneBytes = 0;
        showOverlay('');
        try {
            let listing;
            if (source.kind === 'drive') {
                if (!source.key && !tokenValid()) {
                    throw new Error('Aucune clé API Google n’est configurée pour ce site (js/config.js) : connectez-vous avec Google pour ouvrir le dossier.');
                }
                listing = await listDriveFolder(source.id, source.key);
                currentShareLink = shareLinkForDrive(source.id);
            } else {
                listing = await listUrlFolder(source.base);
                currentShareLink = window.location.href;
            }
            const { title, files } = listing;
            setTitle(title);
            document.title = title + ' · Visionneuse FDS';

            if (!files.some(f => /\.smv$/i.test(f.name))) {
                throw new Error('Aucun fichier .smv dans ce dossier. Déposez le dossier de résultats FDS complet (.smv, .s3d, .sf, .bf…).');
            }

            // 1. Geometry from the .fds input (3D page + greyscale scene).
            const fds = files.find(f => /\.fds$/i.test(f.name));
            if (fds && typeof window._fdsReload === 'function') {
                setStep('Lecture de la géométrie…');
                window._fdsReload(await fds.text(), fds.name);
            }
            const mt = document.getElementById('model-title');
            if (mt) mt.textContent = title;

            // 2. Output page: smoke, slices, boundaries — same pipeline as the folder picker.
            setStep('Téléchargement des résultats…');
            const outTab = document.querySelector('.page-tab[data-page="output"]');
            if (outTab) outTab.click();
            if (typeof window.outputPageLoadFolder !== 'function') {
                throw new Error('Cette version du viewer ne sait pas charger un dossier distant.');
            }
            await window.outputPageLoadFolder(files, { autoSmoke: true });
            const dz = document.getElementById('output-drop-zone');
            if (dz) dz.classList.add('hidden');

            // 3. Charts: HRR and device CSVs (small, FileReader needs real Files).
            const csvs = files.filter(f => /_(hrr|devc)\.csv$/i.test(f.name));
            if (csvs.length && typeof window.chartsPanelHandleFiles === 'function') {
                setStep('Lecture des courbes…');
                const real = await Promise.all(csvs.map(f => f.toFile().catch(() => null)));
                window.chartsPanelHandleFiles(real.filter(Boolean));
            }

            setStep('Prêt');
            setTimeout(hideOverlay, 250);
        } catch (err) {
            console.error('[remote-loader]', err);
            failOverlay(err);
        }
    }

    function sourceFromUrl() {
        const p = new URLSearchParams(window.location.search);
        const drive = p.get('drive');
        if (drive) {
            const id = extractDriveId(drive);
            if (!id) return { error: 'Le lien Google Drive dans l’adresse n’est pas reconnu.' };
            return { kind: 'drive', id, key: p.get('key') || CFG.driveApiKey || '' };
        }
        const base = p.get('url');
        if (base) return { kind: 'url', base };
        return null;
    }

    // ── Share dialog ──────────────────────────────────────────────────────
    let modal = null;

    function buildShareModal() {
        modal = document.createElement('div');
        modal.className = 'rl-modal-backdrop';
        modal.hidden = true;
        modal.innerHTML =
            '<div class="rl-modal" role="dialog" aria-modal="true" aria-labelledby="rl-share-title">' +
            '  <div class="rl-modal-head">' +
            '    <h2 id="rl-share-title">Partager une simulation</h2>' +
            '    <button type="button" class="rl-x" aria-label="Fermer">&times;</button>' +
            '  </div>' +
            '  <ol class="rl-steps">' +
            '    <li>Déposez le <strong>dossier de résultats FDS</strong> complet dans Google Drive.</li>' +
            (hasOAuth()
                ? '    <li>Partagez-le en lecture : <strong>« Tous les utilisateurs disposant du lien »</strong> pour l’ouvrir sans compte, ou <strong>uniquement avec certaines personnes</strong> — elles se connecteront avec leur compte Google.</li>'
                : '    <li>Partagez-le en <strong>« Tous les utilisateurs disposant du lien »</strong> (lecteur).</li>') +
            '    <li>Collez ici le lien du dossier :</li>' +
            '  </ol>' +
            '  <input type="text" class="rl-input" id="rl-drive-input" placeholder="https://drive.google.com/drive/folders/…" autocomplete="off" spellcheck="false">' +
            '  <div class="rl-hint" id="rl-drive-hint"></div>' +
            '  <label class="rl-label" for="rl-share-output">Lien à envoyer</label>' +
            '  <div class="rl-share-row">' +
            '    <input type="text" class="rl-input" id="rl-share-output" readonly placeholder="Le lien apparaîtra ici">' +
            '    <button type="button" class="btn btn-sm btn-primary" id="rl-copy" disabled>Copier</button>' +
            '  </div>' +
            '  <div class="rl-modal-foot">' +
            '    <span class="rl-warn">' + (CFG.driveApiKey ? '' : '⚠ Clé API Google non configurée (js/config.js) : les liens ne s’ouvriront pas.') + '</span>' +
            '    <a class="btn btn-sm btn-secondary" id="rl-open" href="#" target="_blank" rel="noopener" aria-disabled="true">Ouvrir</a>' +
            '  </div>' +
            '</div>';
        document.body.appendChild(modal);

        const input = modal.querySelector('#rl-drive-input');
        const out = modal.querySelector('#rl-share-output');
        const hint = modal.querySelector('#rl-drive-hint');
        const copy = modal.querySelector('#rl-copy');
        const open = modal.querySelector('#rl-open');

        function refresh() {
            const raw = input.value.trim();
            const id = extractDriveId(raw);
            if (!raw) { hint.textContent = ''; out.value = currentShareLink; }
            else if (!id) { hint.textContent = 'Lien non reconnu : collez le lien d’un dossier Google Drive.'; out.value = ''; }
            else { hint.textContent = ''; out.value = shareLinkForDrive(id); }
            const ok = !!out.value;
            copy.disabled = !ok;
            open.setAttribute('aria-disabled', ok ? 'false' : 'true');
            open.href = ok ? out.value : '#';
        }
        input.addEventListener('input', refresh);
        copy.addEventListener('click', async () => {
            try { await navigator.clipboard.writeText(out.value); }
            catch (_) { out.select(); document.execCommand('copy'); }
            copy.textContent = 'Copié ✓';
            setTimeout(() => { copy.textContent = 'Copier'; }, 1600);
        });
        open.addEventListener('click', e => { if (open.getAttribute('aria-disabled') === 'true') e.preventDefault(); });
        modal.querySelector('.rl-x').addEventListener('click', closeShare);
        modal.addEventListener('click', e => { if (e.target === modal) closeShare(); });
        document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) closeShare(); });
        modal._refresh = refresh;
    }

    function openShare() {
        if (!modal) buildShareModal();
        modal.hidden = false;
        modal._refresh();
        setTimeout(() => modal.querySelector('#rl-drive-input').focus(), 0);
    }

    function closeShare() {
        if (modal) modal.hidden = true;
    }

    function addShareButton() {
        const actions = document.querySelector('.top-bar .actions');
        if (!actions || document.getElementById('rl-share-btn')) return;
        const btn = document.createElement('button');
        btn.id = 'rl-share-btn';
        btn.className = 'btn btn-sm btn-primary';
        btn.title = 'Créer un lien de partage depuis un dossier Google Drive';
        btn.innerHTML =
            '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>' +
            '<path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg><span>Partager</span>';
        btn.addEventListener('click', openShare);
        actions.insertBefore(btn, actions.firstChild);
    }

    // ── Boot ──────────────────────────────────────────────────────────────
    function boot() {
        addShareButton();
        preloadGoogle();
        const src = sourceFromUrl();
        if (!src) return;
        if (src.error) { failOverlay(new Error(src.error)); return; }
        openRemote(src);
    }

    window.FDSRemote = { open: openRemote, extractDriveId, shareLinkForDrive, openShare, pickFromDrive, signIn, hasOAuth, isSignedIn: tokenValid };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
