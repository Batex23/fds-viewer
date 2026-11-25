/**
 * FDS Linter — client-side static analysis for FDS input files.
 *
 * Covers all rules from validate_fds.py plus additional checks sourced from
 * fds_possible_input_errors.md (FDS User Guide error codes + forum patterns).
 *
 * Entry point:  fdsLint(text)  →  [{severity, message, hint, line, rule}, ...]
 * Severities: 'ERROR' | 'WARNING' | 'INFO'
 */

// ── Known-valid quantity sets ─────────────────────────────────────────────────
// Sources: FDS User Guide Table 22.4 (gas phase), 22.5 (solid phase), 22.6 (device/misc)
// File type key: D=device CSV, S=slice file, B=boundary file, I=isosurface, P=Plot3D

// Table 22.4 gas-phase (D,I,P,S unless noted) + Table 22.5 solid-phase (B,D) + Table 22.6 (D or D,S)
const _KNOWN_DEVC_Q = new Set([
    // Table 22.4 — gas phase (all have D)
    'BACKGROUND PRESSURE','BULK DENSITY','CELL REYNOLDS NUMBER',
    'CELL U','CELL V','CELL W','CFL','CFL MAX',
    'CHEMISTRY SUBITERATIONS','CHI_R','COMBUSTION EFFICIENCY',
    'CONDUCTIVITY','C_SMAG','DENSITY','DIVERGENCE',
    'EFFECTIVE FLAME TEMPERATURE','ENTHALPY',
    'ENTHALPY FLUX X','ENTHALPY FLUX Y','ENTHALPY FLUX Z',
    'EXTINCTION','EXTINCTION COEFFICIENT',
    'F_X','F_Y','F_Z','H','HRRPUV','HRRPUV REAC',
    'IDEAL GAS PRESSURE','INTEGRATED INTENSITY','INTERNAL ENERGY',
    'KINETIC ENERGY','KOLMOGOROV LENGTH SCALE',
    'MACH NUMBER','MASS FRACTION','MASS FLUX X','MASS FLUX Y','MASS FLUX Z',
    'MAXIMUM VELOCITY ERROR','MIXING TIME','MIXTURE FRACTION',
    'MOLECULAR CONDUCTIVITY','MOLECULAR VISCOSITY',
    'OPTICAL DENSITY','ORIENTED VELOCITY','PRESSURE','PRESSURE ITERATIONS','PRESSURE ZONE',
    'Q CRITERION','RADIAL VELOCITY',
    'RADIATION ABSORPTION','RADIATION EMISSION','RADIATION LOSS',
    'RADIATIVE HEAT FLUX GAS',
    'REAC SOURCE TERM','RELATIVE HUMIDITY',
    'RESOLVED KINETIC ENERGY','RTE SOURCE CORRECTION FACTOR',
    'SENSIBLE ENTHALPY','SPECIFIC ENTHALPY','SPECIFIC HEAT',
    'SPECIFIC INTERNAL ENERGY','SPECIFIC SENSIBLE ENTHALPY',
    'STRAIN RATE','STRAIN RATE X','STRAIN RATE Y','STRAIN RATE Z',
    'SUBGRID KINETIC ENERGY','SUM LUMPED MASS FRACTIONS','SUM PRIMITIVE MASS FRACTIONS',
    'TEMPERATURE','TOTAL MASS FLUX X','TOTAL MASS FLUX Y','TOTAL MASS FLUX Z',
    'U-VELOCITY','V-VELOCITY','W-VELOCITY','VELOCITY','VISCOSITY','VISIBILITY',
    'VN','VN MAX','VOLUME FRACTION',
    'VORTICITY','VORTICITY X','VORTICITY Y','VORTICITY Z',
    'WAVELET ERROR',
    // Table 22.5 — solid phase (B,D)
    'ADIABATIC SURFACE TEMPERATURE','BACK WALL TEMPERATURE',
    'BURNING RATE','CONVECTIVE HEAT FLUX','CONVECTIVE HEAT FLUX GAUGE',
    'GAUGE HEAT FLUX','INCIDENT HEAT FLUX','NET HEAT FLUX',
    'HEAT TRANSFER COEFFICIENT','HRRPUA',
    'INSIDE WALL TEMPERATURE','INSIDE WALL DEPTH',
    'MASS FLUX WALL','NORMAL VELOCITY',
    'RADIATIVE HEAT FLUX','RADIOMETER','TOTAL HEAT FLUX',
    'WALL TEMPERATURE','WALL THICKNESS',
    // Table 22.6 — device/misc (D or D,S)
    'FED','FIC',
    'LAYER HEIGHT','LOWER TEMPERATURE','UPPER TEMPERATURE',
    'LINK TEMPERATURE','SPRINKLER LINK TEMPERATURE','THERMOCOUPLE',
    'CONTROL','CONTROL VALUE','CONTROL FUNCTION',
    'TIME','FIRE DEPTH','PATH OBSCURATION','ASPIRATION',
    'CHAMBER OBSCURATION','TRANSMISSION',
    // Additional common aliases
    'PARTICLE TEMPERATURE','PARTICLE MASS',
    'HRR','MASS FLOW','VOLUME FLOW','HEAT FLOW',
    'HEAT RELEASE RATE PER UNIT AREA',
]);

const _REJECTED_DEVC_Q = {
    'HEAT RELEASE RATE': "Use QUANTITY='HRR' with XB for an integrated volume; total HRR is written to <chid>_hrr.csv automatically.",
    'SOOT MASS FRACTION':   "Indisponible avec la suie implicite (SOOT_YIELD dans &REAC). Utilisez QUANTITY='VISIBILITY'.",
    'SOOT VOLUME FRACTION': "Indisponible avec la suie implicite (SOOT_YIELD dans &REAC). Utilisez QUANTITY='VISIBILITY'.",
};

// Table 22.4 quantities with File Type that includes S (slice)
// Excludes: D-only entries and solid-phase (Table 22.5) entries which are B,D only
const _KNOWN_SLCF_Q = new Set([
    // Table 22.4 — gas phase with S in file type (D,I,P,S or D,S or S)
    'BACKGROUND PRESSURE','BULK DENSITY','CELL REYNOLDS NUMBER',
    'CELL U','CELL V','CELL W','CFL',
    'CHEMISTRY SUBITERATIONS','CHI_R','COMBUSTION EFFICIENCY',
    'CONDUCTIVITY','C_SMAG','DENSITY','DIVERGENCE',
    'EFFECTIVE FLAME TEMPERATURE','ENTHALPY',
    'ENTHALPY FLUX X','ENTHALPY FLUX Y','ENTHALPY FLUX Z',
    'EXTINCTION','EXTINCTION COEFFICIENT',
    'F_X','F_Y','F_Z','H','HRRPUV','HRRPUV REAC',
    'IDEAL GAS PRESSURE','INTEGRATED INTENSITY','INTERNAL ENERGY',
    'KINETIC ENERGY','KOLMOGOROV LENGTH SCALE',
    'MACH NUMBER','MASS FRACTION','MASS FLUX X','MASS FLUX Y','MASS FLUX Z',
    'MIXING TIME','MIXTURE FRACTION',
    'MOLECULAR CONDUCTIVITY','MOLECULAR VISCOSITY',
    'OPTICAL DENSITY','PRESSURE','PRESSURE ZONE',
    'Q CRITERION','RADIAL VELOCITY',
    'RADIATION ABSORPTION','RADIATION EMISSION','RADIATION LOSS',
    'REAC SOURCE TERM','RELATIVE HUMIDITY',
    'RESOLVED KINETIC ENERGY',
    'SENSIBLE ENTHALPY','SPECIFIC ENTHALPY','SPECIFIC HEAT',
    'SPECIFIC INTERNAL ENERGY','SPECIFIC SENSIBLE ENTHALPY',
    'STRAIN RATE','STRAIN RATE X','STRAIN RATE Y','STRAIN RATE Z',
    'SUBGRID KINETIC ENERGY','SUM LUMPED MASS FRACTIONS','SUM PRIMITIVE MASS FRACTIONS',
    'TEMPERATURE','TOTAL MASS FLUX X','TOTAL MASS FLUX Y','TOTAL MASS FLUX Z',
    'U-VELOCITY','V-VELOCITY','W-VELOCITY','VELOCITY','VISCOSITY','VISIBILITY',
    'VN','VOLUME FRACTION','MOLE FRACTION',
    'VORTICITY','VORTICITY X','VORTICITY Y','VORTICITY Z',
    'WAVELET ERROR',
    // Table 22.6 — FIC is D,S (valid for SLCF)
    'FIC',
    // Table 22.6 — CELL INDEX is D,S
    'CELL INDEX I','CELL INDEX J','CELL INDEX K',
]);

const _REJECTED_SLCF_Q = {
    // Table 22.6 — D only (not S)
    'FED':                  "FED (Fractional Effective Dose) n’existe qu’en capteur (FDS User Guide Table 22.6, File Type D). Utilisez &DEVC QUANTITY='FED' en un point. FIC est l’équivalent disponible en slice (File Type D,S).",
    // Table 22.4 — D only (not S)
    'RADIATIVE HEAT FLUX GAS': "RADIATIVE HEAT FLUX GAS est en File Type D uniquement (Table 22.4) — non valide pour &SLCF. Utilisez &DEVC.",
    // Table 22.5 — solid phase (B,D only, not S)
    'WALL TEMPERATURE':     "WALL TEMPERATURE est une grandeur de phase solide (Table 22.5, File Type B,D) — non valide pour &SLCF. Utilisez &BNDF QUANTITY='WALL TEMPERATURE' / pour une sortie sur toutes les surfaces.",
    'BURNING RATE':         "BURNING RATE est une grandeur de phase solide (Table 22.5, File Type B,D) — non valide pour &SLCF. Utilisez &BNDF QUANTITY='BURNING RATE' / pour une sortie en surface.",
    'HRRPUA':               "HRRPUA est une grandeur de phase solide (Table 22.5, File Type B,D) — non valide pour &SLCF. Utilisez &BNDF QUANTITY='HRRPUA' / pour une sortie en surface.",
    'GAUGE HEAT FLUX':      "GAUGE HEAT FLUX est une grandeur de phase solide (Table 22.5, File Type B,D) — non valide pour &SLCF. Utilisez &BNDF QUANTITY='GAUGE HEAT FLUX' /.",
    'INCIDENT HEAT FLUX':   "INCIDENT HEAT FLUX est une grandeur de phase solide (Table 22.5, File Type B,D) — non valide pour &SLCF. Utilisez &BNDF.",
    'CONVECTIVE HEAT FLUX': "CONVECTIVE HEAT FLUX est une grandeur de phase solide (Table 22.5, File Type B,D) — non valide pour &SLCF. Utilisez &BNDF.",
    'ADIABATIC SURFACE TEMPERATURE': "ADIABATIC SURFACE TEMPERATURE est une grandeur de phase solide (Table 22.5, File Type B,D) — non valide pour &SLCF. Utilisez &BNDF ou &DEVC avec IOR.",
    // Implicit-soot crashes
    'SOOT MASS FRACTION':   "Indisponible avec la suie implicite (SOOT_YIELD dans &REAC). Utilisez QUANTITY='VISIBILITY'.",
    'SOOT VOLUME FRACTION': "Indisponible avec la suie implicite (SOOT_YIELD dans &REAC). Utilisez QUANTITY='VISIBILITY'.",
    'HEAT RELEASE RATE':    "Grandeur SLCF non valide. Utilisez QUANTITY='HRRPUV' pour des slices de puissance volumique.",
};

const _SPEC_ID_Q = new Set(['VOLUME FRACTION','MASS FRACTION','MOLE FRACTION']);

const _WALL_DEVC_Q = new Set([
    'WALL TEMPERATURE','INSIDE WALL TEMPERATURE','BACK WALL TEMPERATURE',
    'GAUGE HEAT FLUX','NET HEAT FLUX','CONVECTIVE HEAT FLUX',
    'RADIATIVE HEAT FLUX','TOTAL HEAT FLUX','INCIDENT HEAT FLUX',
    'BURNING RATE','WALL THICKNESS','ADIABATIC SURFACE TEMPERATURE',
    'HEAT TRANSFER COEFFICIENT','MASS FLUX WALL',
]);

const _ZONE_DEVC_Q = new Set([
    'LAYER HEIGHT','UPPER TEMPERATURE','LOWER TEMPERATURE','HRR',
    'VOLUME FLOW','MASS FLOW',
]);

const _BUILTIN_SPECIES = new Set([
    'AIR','NITROGEN','OXYGEN','CARBON DIOXIDE','CARBON MONOXIDE',
    'WATER VAPOR','HYDROGEN','METHANE','ETHYLENE','PROPANE',
    'BUTANE','HEPTANE','ETHANOL','METHANOL','TOLUENE',
    'N2','O2','CO2','CO','H2O','H2','PRODUCTS','FUEL',
]);

// ── Lightweight record parser (tracks source line numbers) ───────────────────

function _stripFdsComment(line) {
    let out = '', inQ = null;
    for (const ch of line) {
        if (inQ) { out += ch; if (ch === inQ) inQ = null; }
        else if (ch === "'" || ch === '"') { inQ = ch; out += ch; }
        else if (ch === '!') break;
        else out += ch;
    }
    return out;
}

function _coerceFds(raw) {
    raw = raw.trim().replace(/,\s*$/, '').trim();
    if (!raw) return '';
    if (raw[0] === "'" || raw[0] === '"') {
        const items = _csvSplitFds(raw).map(s => {
            s = s.trim();
            return (s.length >= 2 && s[0] === s[s.length - 1] && (s[0] === "'" || s[0] === '"')) ? s.slice(1, -1) : s;
        });
        return items.length === 1 ? items[0] : items;
    }
    const up = raw.toUpperCase().replace(/\./g, '');
    if (up === 'T' || up === 'TRUE')  return true;
    if (up === 'F' || up === 'FALSE') return false;
    const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
    const nums = parts.map(p => { const n = parseFloat(p); return isNaN(n) ? null : n; });
    if (nums.every(n => n !== null)) return nums.length === 1 ? nums[0] : nums;
    return raw;
}

function _csvSplitFds(s) {
    const out = [], cur = [];
    let inQ = null;
    for (const ch of s) {
        if (inQ) { cur.push(ch); if (ch === inQ) inQ = null; }
        else if (ch === "'" || ch === '"') { inQ = ch; cur.push(ch); }
        else if (ch === ',') { out.push(cur.join('')); cur.length = 0; }
        else cur.push(ch);
    }
    if (cur.length) out.push(cur.join(''));
    return out.map(x => x.trim()).filter(Boolean);
}

// Replace contents of quoted strings with same-length placeholders so KEY=
// patterns inside strings (e.g. TITLE='HRRPUA=500 kW') don't get scanned as
// parameter assignments. Positions are preserved so callers can still slice
// the ORIGINAL body for value extraction.
function _maskFdsStrings(body) {
    let out = '';
    let inQ = null;
    for (let i = 0; i < body.length; i++) {
        const ch = body[i];
        if (inQ) {
            if (ch === inQ) { inQ = null; out += ch; }
            else out += ' '; // any non-key, non-= placeholder
        } else if (ch === "'" || ch === '"') {
            inQ = ch; out += ch;
        } else {
            out += ch;
        }
    }
    return out;
}

function _parseParamsFds(body) {
    const params = {};
    const masked = _maskFdsStrings(body);
    const KEY_RE = /\b([A-Za-z_]\w*(?:\([^)]*\))?)\s*=/g;
    const matches = [];
    let m;
    while ((m = KEY_RE.exec(masked)) !== null) {
        matches.push({ key: m[1], idx: m.index, end: m.index + m[0].length });
    }
    for (let i = 0; i < matches.length; i++) {
        const rawKey = matches[i].key.toUpperCase();
        const idxMatch = rawKey.match(/^([A-Z_][A-Z0-9_]*)\(\s*(\d+)\s*\)$/);
        const start = matches[i].end;
        const end = i + 1 < matches.length ? matches[i + 1].idx : body.length;
        const value = _coerceFds(body.slice(start, end));
        if (idxMatch) {
            // Array-indexed key: XB(1), IJK(2), MATL_ID(1,3), etc.
            // Merge into the base key as a 1-indexed -> 0-indexed array.
            const base = idxMatch[1];
            const slot = parseInt(idxMatch[2], 10) - 1;
            if (!Array.isArray(params[base])) {
                const existing = params[base];
                params[base] = [];
                if (existing !== undefined) params[base][0] = existing;
            }
            // _coerceFds returns either a scalar or an array; flatten 1-element arrays
            params[base][slot] = Array.isArray(value) && value.length === 1 ? value[0] : value;
        } else {
            params[rawKey] = value;
        }
    }
    return params;
}

function _lintParseRecords(text) {
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = text.split('\n');

    // Build a flat comment-stripped string with a parallel line-number array
    const chars = [], lineOf = [];
    for (let ln = 0; ln < lines.length; ln++) {
        for (const ch of _stripFdsComment(lines[ln])) {
            chars.push(ch); lineOf.push(ln + 1);
        }
        chars.push('\n'); lineOf.push(ln + 1);
    }
    const flat = chars.join('');

    const records = [];
    const HEAD_RE = /&(\w+)/g;
    let searchFrom = 0, mo;
    while ((mo = HEAD_RE.exec(flat)) !== null) {
        if (mo.index < searchFrom) continue;
        const name = mo[1].toUpperCase();
        const bodyStart = mo.index + mo[0].length;
        let j = bodyStart, inQ = null, found = false, unterminated = false;
        while (j < flat.length) {
            const ch = flat[j];
            if (inQ) { if (ch === inQ) inQ = null; }
            else if (ch === "'" || ch === '"') inQ = ch;
            else if (ch === '/') { found = true; break; }
            else if (ch === '&') {
                // Next record starts before we found / — this record is unterminated
                let k = j + 1;
                while (k < flat.length && (flat[k] === ' ' || flat[k] === '\t')) k++;
                if (/[A-Za-z]/.test(flat[k] || '')) { unterminated = true; break; }
            }
            j++;
        }
        // Reached EOF without finding / or the start of the next record.
        // The record is unterminated (e.g. &TAIL at EOF, or a / swallowed inside
        // a mismatched string literal).
        if (!found && !unterminated && j >= flat.length) unterminated = true;
        if (found || unterminated) {
            const body = flat.slice(bodyStart, j);
            // Last line of this record's content (the char before the / or &)
            const lastContentPos = j > bodyStart ? j - 1 : bodyStart;
            records.push({
                name,
                line: lineOf[mo.index] || 1,
                lineEnd: lineOf[lastContentPos] || lineOf[mo.index] || 1,
                params: _parseParamsFds(body),
                _body: body,
                _bodyLine: lineOf[bodyStart] || lineOf[mo.index] || 1,
                _unterminated: unterminated || undefined,
            });
            // If unterminated, restart from the & so the next record is re-parsed correctly
            HEAD_RE.lastIndex = unterminated ? j : j + 1;
            searchFrom = unterminated ? j : j + 1;
        }
    }
    return records;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _asList(v) {
    if (v === undefined || v === null || v === '') return [];
    return Array.isArray(v) ? v : [v];
}

function _definedSpecies(records) {
    const ids = new Set(_BUILTIN_SPECIES);
    for (const r of records) {
        if (r.name === 'SPEC' && r.params.ID) ids.add(String(r.params.ID).toUpperCase());
        if (r.name === 'REAC' && r.params.FUEL) ids.add(String(r.params.FUEL).toUpperCase());
    }
    return ids;
}

function _hasImplicitSoot(records) {
    return records.some(r => r.name === 'REAC' && r.params.SOOT_YIELD != null) &&
          !records.some(r => r.name === 'SPEC' && String(r.params.ID || '').toUpperCase() === 'SOOT');
}

// ── Rules ─────────────────────────────────────────────────────────────────────

const _LINT_RULES = [];
const _rule = (name, fn) => _LINT_RULES.push([name, fn]);

// ── Parse errors ─────────────────────────────────────────────────────────────

_rule('unterminated-record', (R, F) => {
    for (const r of R) {
        if (r._unterminated)
            F.push({
                severity: 'ERROR',
                message: `&${r.name} ligne ${r.line} : la barre / de fin est absente — l’enregistrement n’est pas terminé.`,
                hint: `Chaque namelist FDS doit se terminer par /. Ajoutez / à la fin du bloc &${r.name}. Sinon FDS lève ERROR(101) et les enregistrements suivants peuvent être mal lus.`,
                line: r.line,
                lineEnd: r.lineEnd,
                rule: 'unterminated-record',
            });
    }
});

// ── Simulation control ────────────────────────────────────────────────────────

_rule('head-chid-required', (R, F) => {
    const heads = R.filter(r => r.name === 'HEAD');
    if (!heads.length) {
        return F.push({ severity:'ERROR', message:"Namelist &HEAD absente — CHID est indispensable pour que FDS produise ses fichiers de sortie.", hint:"Ajoutez &HEAD CHID='ma_simu', TITLE='Description' /", line:1, rule:'head-chid-required' });
    }
    const chid = heads[0].params.CHID || '';
    if (!chid)
        F.push({ severity:'ERROR', message:"&HEAD sans CHID — obligatoire.", hint:"Ajoutez CHID='<nom_simu>' à la ligne &HEAD.", line:heads[0].line, rule:'head-chid-required' });
    else if (/[ .\\/:\*?"<>|]/.test(String(chid)))
        F.push({ severity:'WARNING', message:`Le CHID '${chid}' contient une espace ou un point — interdit par FDS.`, hint:"Pas d’espace ni de point dans le CHID (FDS User Guide §6.1). Utilisez uniquement lettres, chiffres, tirets et tirets bas.", line:heads[0].line, rule:'head-chid-required' });
});

_rule('time-tend-required', (R, F) => {
    const times = R.filter(r => r.name === 'TIME');
    if (!times.length) {
        return F.push({ severity:'WARNING', message:"Namelist &TIME absente ; FDS utilisera T_END=1.0 s par défaut.", hint:"Ajoutez &TIME T_END=<secondes> /", line:1, rule:'time-tend-required' });
    }
    if (times[0].params.T_END == null)
        F.push({ severity:'WARNING', message:"&TIME sans T_END ; FDS utilisera 1.0 s par défaut.", hint:"Ajoutez T_END=<secondes> à la ligne &TIME.", line:times[0].line, rule:'time-tend-required' });
});

_rule('tail-missing', (R, F) => {
    if (!R.some(r => r.name === 'TAIL'))
        F.push({ severity:'INFO', message:"Pas de &TAIL / en fin de fichier.", hint:"Ajoutez &TAIL / en dernière ligne. FDS ignore tout ce qui suit &TAIL : c’est un marqueur de fin propre.", line:0, rule:'tail-missing' });
});

// ── Mesh ──────────────────────────────────────────────────────────────────────

_rule('mesh-required', (R, F) => {
    if (!R.some(r => r.name === 'MESH'))
        F.push({ severity:'ERROR', message:"Aucun &MESH défini — FDS a besoin d’au moins un maillage.", hint:"Ajoutez &MESH IJK=I,J,K, XB=x0,x1,y0,y1,z0,z1 /. FDS lève ERROR(113).", line:1, rule:'mesh-required' });
});

_rule('mesh-ijk-min', (R, F) => {
    for (const m of R.filter(r => r.name === 'MESH')) {
        const ijk = m.params.IJK;
        if (!Array.isArray(ijk) || ijk.length < 3) continue;
        if (ijk.some(n => n < 2))
            F.push({ severity:'ERROR', message:`&MESH ligne ${m.line} : une dimension IJK est < 2 (${ijk.join(',')}).`, hint:"Toutes les valeurs IJK doivent être ≥ 2 ; visez ≥ 4 par direction pour un vrai maillage 3D. FDS lève ERROR(426) pour un maillage dégénéré.", line:m.line, rule:'mesh-ijk-min' });
    }
});

_rule('mesh-xb-degenerate', (R, F) => {
    for (const m of R.filter(r => r.name === 'MESH')) {
        const xb = m.params.XB;
        if (!Array.isArray(xb) || xb.length !== 6) continue;
        if (xb[0] === xb[1] || xb[2] === xb[3] || xb[4] === xb[5])
            F.push({ severity:'ERROR', message:`&MESH ligne ${m.line} : XB de longueur nulle dans au moins une direction (${xb.join(',')}).`, hint:"FDS lève ERROR(119) quand un axe du maillage a des bornes égales.", line:m.line, rule:'mesh-xb-degenerate' });
    }
});

_rule('mesh-balance', (R, F) => {
    const meshes = R.filter(r => r.name === 'MESH');
    if (meshes.length < 2) return;
    const cells = meshes
        .map(m => Array.isArray(m.params.IJK) && m.params.IJK.length === 3 ? Math.round(m.params.IJK.reduce((a,b)=>a*b,1)) : null)
        .filter(n => n !== null);
    if (cells.length > 1 && Math.max(...cells) > 4 * Math.min(...cells))
        F.push({ severity:'INFO', message:`Nombre de cellules déséquilibré entre maillages (max ${Math.max(...cells).toLocaleString()} contre min ${Math.min(...cells).toLocaleString()}).`, hint:"Avec un rang MPI par maillage, le maillage le plus lent fixe la durée du calcul. Visez des effectifs à moins d’un facteur 2.", line:meshes[0].line, rule:'mesh-balance' });
});

// ── XB ordering (all namelists) ───────────────────────────────────────────────

_rule('xb-ordered', (R, F) => {
    for (const r of R) {
        const xb = r.params.XB;
        if (Array.isArray(xb) && xb.length === 6 && (xb[0] > xb[1] || xb[2] > xb[3] || xb[4] > xb[5]))
            F.push({ severity:'ERROR', message:`&${r.name} : bornes XB inversées (${xb.join(',')}).`, hint:"Ordre attendu pour XB : x_min, x_max, y_min, y_max, z_min, z_max.", line:r.line, rule:'xb-ordered' });
    }
});

// ── Combustion ────────────────────────────────────────────────────────────────

_rule('reac-missing-fuel', (R, F) => {
    for (const r of R.filter(r => r.name === 'REAC')) {
        if (!r.params.FUEL)
            F.push({ severity:'ERROR', message:`&REAC ligne ${r.line} : aucun FUEL défini.`, hint:"Ajoutez FUEL='<nom>' (ex. FUEL='PROPANE') et éventuellement C=3, H=8. FDS lève ERROR(190).", line:r.line, rule:'reac-missing-fuel' });
    }
});

_rule('surf-hrrpua-needs-reac', (R, F) => {
    const hasReac = R.some(r => r.name === 'REAC');
    for (const s of R.filter(r => r.name === 'SURF')) {
        if ((s.params.HRRPUA != null || s.params.MLRPUA != null) && !hasReac)
            F.push({ severity:'WARNING', message:`&SURF '${s.params.ID || '?'}' utilise HRRPUA/MLRPUA mais aucun &REAC n’est défini.`, hint:"Ajoutez &REAC FUEL='...', HEAT_OF_COMBUSTION=... / pour que FDS calcule les produits de combustion. FDS lève ERROR(314).", line:s.line, rule:'surf-hrrpua-needs-reac' });
    }
});

// ── Surface / material ────────────────────────────────────────────────────────

_rule('surf-missing-id', (R, F) => {
    for (const s of R.filter(r => r.name === 'SURF')) {
        const id = s.params.ID;
        if (!id || (typeof id === 'string' && !id.trim()))
            F.push({ severity:'ERROR', message:`&SURF ligne ${s.line} : pas d’ID — obligatoire.`, hint:"Ajoutez ID='<nom>' pour pouvoir la référencer depuis VENT/OBST. FDS lève ERROR(301).", line:s.line, rule:'surf-missing-id' });
    }
});

_rule('duplicate-ids', (R, F) => {
    for (const type of ['SURF','MATL','SPEC','RAMP','PART','PROP','CTRL','DEVC','VENT']) {
        const seen = {}, dupes = new Set();
        for (const r of R.filter(r => r.name === type)) {
            const id = String(r.params.ID || '');
            if (!id) continue;
            if (id in seen && !dupes.has(id)) {
                dupes.add(id);
                F.push({ severity:'ERROR', message:`&${type} : l’ID '${id}' est défini plusieurs fois (d’abord ligne ${seen[id]}, puis ligne ${r.line}).`, hint:`Renommez l’une des occurrences. FDS refuse les ID ${type} en double (ex. ERROR(302) pour SURF).`, line:r.line, rule:'duplicate-ids' });
            }
            seen[id] = r.line;
        }
    }
});

_rule('burn-away-surf-id6', (R, F) => {
    const burnSurfs = new Set(
        R.filter(r => r.name === 'SURF' && r.params.BURN_AWAY === true).map(r => String(r.params.ID || ''))
    );
    if (!burnSurfs.size) return;
    for (const o of R.filter(r => r.name === 'OBST')) {
        for (const s of _asList(o.params.SURF_ID6)) {
            if (s && burnSurfs.has(String(s)))
                F.push({ severity:'ERROR', message:`&OBST ligne ${o.line} : utilise la SURF '${s}' (BURN_AWAY=.TRUE.) via SURF_ID6 — refusé par FDS.`, hint:`Retirez BURN_AWAY de la SURF '${s}' ou placez le matériau combustible dans sa propre OBST.`, line:o.line, rule:'burn-away-surf-id6' });
        }
    }
});

_rule('burn-away-bulk-density', (R, F) => {
    const matls = {};
    for (const r of R.filter(r => r.name === 'MATL')) matls[String(r.params.ID || '')] = r;
    for (const s of R.filter(r => r.name === 'SURF')) {
        if (s.params.BURN_AWAY !== true || s.params.BULK_DENSITY != null) continue;
        if (_asList(s.params.MATL_ID).some(mid => (matls[mid] || {}).params && matls[mid].params.DENSITY != null)) continue;
        F.push({ severity:'ERROR', message:`&SURF '${s.params.ID}' : BURN_AWAY=.TRUE. sans BULK_DENSITY ni MATL avec DENSITY.`, hint:"Ajoutez BULK_DENSITY=<kg/m³> à la SURF, ou référencez un MATL qui définit DENSITY. FDS lève ERROR(607).", line:s.line, rule:'burn-away-bulk-density' });
    }
});

_rule('ht3d-burn-away', (R, F) => {
    for (const s of R.filter(r => r.name === 'SURF')) {
        if (s.params.HT3D === true && s.params.BURN_AWAY === true)
            F.push({ severity:'ERROR', message:`&SURF '${s.params.ID}' : HT3D=.TRUE. et BURN_AWAY=.TRUE. à la fois — FDS lève ERROR(369).`, hint:"Utilisez HT3D pour la conduction ou BURN_AWAY pour la perte de masse, pas les deux sur la même surface.", line:s.line, rule:'ht3d-burn-away' });
    }
});

// ── VENT ──────────────────────────────────────────────────────────────────────

_rule('vent-not-planar', (R, F) => {
    for (const v of R.filter(r => r.name === 'VENT')) {
        const xb = v.params.XB;
        if (!Array.isArray(xb) || xb.length !== 6 || v.params.MB) continue;
        const equalPairs = [[xb[0],xb[1]],[xb[2],xb[3]],[xb[4],xb[5]]].filter(([a,b]) => a === b).length;
        if (equalPairs === 0)
            F.push({ severity:'ERROR', message:`&VENT ligne ${v.line} : XB=(${xb.join(',')}) n’est pas plan — aucune paire de coordonnées n’est égale.`, hint:"Un VENT doit être plan : une seule paire de coordonnées égale (ex. x0=x1 pour un plan YZ). FDS lève ERROR(810).", line:v.line, rule:'vent-not-planar' });
    }
});

// ── Reference resolution ──────────────────────────────────────────────────────

_rule('surf-id-undefined', (R, F) => {
    const BUILTIN = new Set(['OPEN','MIRROR','INERT','PERIODIC','INTERPOLATED','HVAC']);
    const defined = new Set(R.filter(r => r.name === 'SURF').map(r => String(r.params.ID || '')));
    for (const b of BUILTIN) defined.add(b);
    for (const r of R) {
        if (!['VENT','OBST'].includes(r.name)) continue;
        for (const s of [..._asList(r.params.SURF_ID), ..._asList(r.params.SURF_IDS), ..._asList(r.params.SURF_ID6)]) {
            if (s && !defined.has(String(s)))
                F.push({ severity:'ERROR', message:`&${r.name} ligne ${r.line} : la SURF_ID '${s}' référencée n’est pas définie.`, hint:`Définissez &SURF ID='${s}', ... / ou corrigez la référence. FDS lève ERROR(605) ou ERROR(812).`, line:r.line, rule:'surf-id-undefined' });
        }
    }
});

_rule('matl-id-undefined', (R, F) => {
    const defined = new Set(R.filter(r => r.name === 'MATL').map(r => String(r.params.ID || '')));
    for (const r of R.filter(r => r.name === 'SURF')) {
        for (const m of _asList(r.params.MATL_ID)) {
            if (m && !defined.has(String(m)))
                F.push({ severity:'ERROR', message:`&SURF '${r.params.ID}' : le MATL_ID '${m}' référencé n’est pas défini.`, hint:`Définissez &MATL ID='${m}', ... / plus haut dans le fichier. FDS lève ERROR(608).`, line:r.line, rule:'matl-id-undefined' });
        }
    }
});

_rule('ramp-id-undefined', (R, F) => {
    const defined = new Set(R.filter(r => r.name === 'RAMP').map(r => String(r.params.ID || '')));
    if (!defined.size) return;
    for (const r of R) {
        for (const [key, val] of Object.entries(r.params)) {
            if (!key.startsWith('RAMP_') || typeof val !== 'string' || !val) continue;
            if (!defined.has(val))
                F.push({ severity:'WARNING', message:`&${r.name} ligne ${r.line} : ${key}='${val}' ne correspond à aucun &RAMP ID.`, hint:`Définissez &RAMP ID='${val}', T=..., F=... / ou corrigez la référence. FDS lève ERROR(391).`, line:r.line, rule:'ramp-id-undefined' });
        }
    }
});

_rule('prop-id-undefined', (R, F) => {
    const defined = new Set(R.filter(r => r.name === 'PROP').map(r => String(r.params.ID || '')));
    if (!defined.size) return;
    for (const d of R.filter(r => r.name === 'DEVC')) {
        const pid = d.params.PROP_ID;
        if (pid && !defined.has(String(pid)))
            F.push({ severity:'ERROR', message:`&DEVC '${d.params.ID||'?'}' : le PROP_ID='${pid}' référencé n’est pas défini.`, hint:`Définissez &PROP ID='${pid}', ... / ou corrigez la référence. FDS lève ERROR(1043).`, line:d.line, rule:'prop-id-undefined' });
    }
});

_rule('ctrl-id-undefined', (R, F) => {
    const defined = new Set(R.filter(r => r.name === 'CTRL').map(r => String(r.params.ID || '')));
    if (!defined.size) return;
    for (const r of R) {
        if (!['DEVC','VENT','OBST','HOLE'].includes(r.name)) continue;
        const cid = r.params.CTRL_ID;
        if (cid && !defined.has(String(cid)))
            F.push({ severity:'WARNING', message:`&${r.name} ligne ${r.line} : le CTRL_ID='${cid}' référencé n’est pas défini.`, hint:`Définissez &CTRL ID='${cid}', FUNCTION_TYPE='...', INPUT_ID='...' / ou corrigez la référence. FDS lève ERROR(938).`, line:r.line, rule:'ctrl-id-undefined' });
    }
});

_rule('mult-id-undefined', (R, F) => {
    const defined = new Set(R.filter(r => r.name === 'MULT').map(r => String(r.params.ID || '')));
    if (!defined.size) return;
    for (const r of R) {
        if (!['OBST','VENT','DEVC'].includes(r.name)) continue;
        const mid = r.params.MULT_ID;
        if (mid && !defined.has(String(mid)))
            F.push({ severity:'ERROR', message:`&${r.name} ligne ${r.line} : le MULT_ID='${mid}' référencé n’est pas défini.`, hint:`Définissez &MULT ID='${mid}', ... / ou corrigez la référence. FDS lève ERROR(811).`, line:r.line, rule:'mult-id-undefined' });
    }
});

// ── DEVC / CTRL / SLCF output quantities ─────────────────────────────────────

_rule('devc-quantity', (R, F) => {
    for (const d of R.filter(r => r.name === 'DEVC')) {
        const q = d.params.QUANTITY;
        if (!q) continue;
        const qU = String(q).toUpperCase();
        if (qU in _REJECTED_DEVC_Q)
            F.push({ severity:'ERROR', message:`&DEVC '${d.params.ID||'?'}' : QUANTITY='${q}' est refusée par FDS6 (ERROR 1042).`, hint:_REJECTED_DEVC_Q[qU], line:d.line, rule:'devc-quantity' });
        else if (!_KNOWN_DEVC_Q.has(qU))
            F.push({ severity:'WARNING', message:`&DEVC '${d.params.ID||'?'}' : QUANTITY='${q}' ne figure pas dans la liste des grandeurs connues.`, hint:"Vérifiez l’orthographe et la casse dans le FDS User Guide.", line:d.line, rule:'devc-quantity' });
    }
});

_rule('devc-missing-output', (R, F) => {
    for (const d of R.filter(r => r.name === 'DEVC')) {
        if (!d.params.QUANTITY && !d.params.PROP_ID && !d.params.STATISTICS)
            F.push({ severity:'WARNING', message:`&DEVC '${d.params.ID||'?'}' ligne ${d.line} : ni QUANTITY ni PROP_ID.`, hint:"Ajoutez QUANTITY='<nom>' (mesure en phase gazeuse) ou PROP_ID='<nom>' (sprinkleur/détecteur). FDS lève ERROR(886).", line:d.line, rule:'devc-missing-output' });
    }
});

_rule('devc-wall-ior', (R, F) => {
    for (const d of R.filter(r => r.name === 'DEVC')) {
        const q = d.params.QUANTITY;
        if (!q || !_WALL_DEVC_Q.has(String(q).toUpperCase())) continue;
        if (Array.isArray(d.params.XYZ) && d.params.IOR == null && !Array.isArray(d.params.XB))
            F.push({ severity:'WARNING', message:`&DEVC '${d.params.ID||'?'}' mesure '${q}' en XYZ sans IOR.`, hint:"Ajoutez IOR=±1/±2/±3 pour indiquer la face mesurée. Sinon FDS en choisit une arbitrairement.", line:d.line, rule:'devc-wall-ior' });
    }
});

_rule('devc-zone-needs-xb', (R, F) => {
    for (const d of R.filter(r => r.name === 'DEVC')) {
        const q = d.params.QUANTITY;
        if (!q || !_ZONE_DEVC_Q.has(String(q).toUpperCase())) continue;
        if (Array.isArray(d.params.XYZ) && !(Array.isArray(d.params.XB) && d.params.XB.length === 6))
            F.push({ severity:'ERROR', message:`&DEVC '${d.params.ID||'?'}' : QUANTITY='${q}' avec XYZ au lieu de XB.`, hint:`'${q}' s’intègre sur un volume — remplacez XYZ par XB=x0,x1,y0,y1,z0,z1.`, line:d.line, rule:'devc-zone-needs-xb' });
    }
});

_rule('devc-in-hole', (R, F) => {
    const holes = R.filter(r => r.name === 'HOLE' && Array.isArray(r.params.XB) && r.params.XB.length === 6);
    if (!holes.length) return;
    for (const d of R.filter(r => r.name === 'DEVC')) {
        const xyz = d.params.XYZ;
        if (!Array.isArray(xyz) || xyz.length !== 3) continue;
        const [x, y, z] = xyz;
        for (const h of holes) {
            const [x0,x1,y0,y1,z0,z1] = h.params.XB;
            if (x0<=x&&x<=x1&&y0<=y&&y<=y1&&z0<=z&&z<=z1) {
                const sev = d.params.IOR != null ? 'ERROR' : 'WARNING';
                const iorNote = d.params.IOR != null ? ` et utilise IOR=${d.params.IOR}` : '';
                F.push({ severity:sev, message:`&DEVC '${d.params.ID||'?'}' : XYZ=(${xyz.join(',')}) se trouve dans le &HOLE de la ligne ${h.line}${iorNote}.`, hint:"La paroi a été évidée à cet endroit. Déplacez le capteur là où la surface existe encore.", line:d.line, rule:'devc-in-hole' });
            }
        }
    }
});

_rule('devc-outside-domain', (R, F) => {
    const meshes = R.filter(r => r.name === 'MESH' && Array.isArray(r.params.XB) && r.params.XB.length === 6).map(r => r.params.XB);
    if (!meshes.length) return;
    const inside = ([x,y,z]) => meshes.some(([x0,x1,y0,y1,z0,z1]) => x0-1e-6<=x&&x<=x1+1e-6&&y0-1e-6<=y&&y<=y1+1e-6&&z0-1e-6<=z&&z<=z1+1e-6);
    for (const d of R.filter(r => r.name === 'DEVC')) {
        const xyz = d.params.XYZ;
        if (Array.isArray(xyz) && xyz.length === 3 && !inside(xyz))
            F.push({ severity:'WARNING', message:`&DEVC '${d.params.ID||'?'}' : XYZ=(${xyz.join(',')}) est hors de tout &MESH.`, hint:"Le capteur sera ignoré ou déplacé sans avertissement. Placez-le à l’intérieur d’un maillage.", line:d.line, rule:'devc-outside-domain' });
    }
});

_rule('slcf-quantity', (R, F) => {
    for (const s of R.filter(r => r.name === 'SLCF')) {
        const q = s.params.QUANTITY;
        if (!q) continue;
        const qU = String(q).toUpperCase();
        if (qU in _REJECTED_SLCF_Q)
            F.push({ severity:'ERROR', message:`&SLCF : QUANTITY='${q}' est refusée par FDS6 (ERROR 1042).`, hint:_REJECTED_SLCF_Q[qU], line:s.line, rule:'slcf-quantity' });
        else if (!_KNOWN_SLCF_Q.has(qU))
            F.push({ severity:'WARNING', message:`&SLCF : QUANTITY='${q}' ne figure pas dans la liste des grandeurs connues.`, hint:"Vérifiez l’orthographe et la casse dans le FDS User Guide.", line:s.line, rule:'slcf-quantity' });
    }
});

_rule('spec-id-undefined', (R, F) => {
    const known = _definedSpecies(R);
    const implSoot = _hasImplicitSoot(R);
    for (const r of R) {
        if (r.name !== 'SLCF' && r.name !== 'DEVC') continue;
        const q = r.params.QUANTITY;
        if (!q || !_SPEC_ID_Q.has(String(q).toUpperCase())) continue;
        const sid = r.params.SPEC_ID;
        if (!sid) continue;
        const sU = String(sid).toUpperCase();
        if (sU === 'SOOT' && implSoot)
            F.push({ severity:'ERROR', message:`&${r.name} : QUANTITY='${q}', SPEC_ID='SOOT' alors que la suie est implicite (SOOT_YIELD dans &REAC). FDS s’arrêtera avec ERROR 1042.`, hint:"Utilisez QUANTITY='VISIBILITY' (toujours disponible avec la suie implicite).", line:r.line, rule:'spec-id-undefined' });
        else if (!known.has(sU))
            F.push({ severity:'WARNING', message:`&${r.name} : le SPEC_ID='${sid}' référencé n’est pas défini par &SPEC.`, hint:`Définissez &SPEC ID='${sid}', FORMULA='...' / ou corrigez l’orthographe du SPEC_ID.`, line:r.line, rule:'spec-id-undefined' });
    }
});

_rule('ctrl-missing-function-type', (R, F) => {
    for (const c of R.filter(r => r.name === 'CTRL')) {
        if (!c.params.FUNCTION_TYPE)
            F.push({ severity:'ERROR', message:`&CTRL '${c.params.ID||'?'}' ligne ${c.line} : pas de FUNCTION_TYPE.`, hint:"Ajoutez FUNCTION_TYPE='ANY'/'ALL'/'TIME_DELAY'/'DEADBAND'/etc. FDS lève ERROR(901).", line:c.line, rule:'ctrl-missing-function-type' });
    }
});

// ── GEOM ──────────────────────────────────────────────────────────────────────

_rule('geom-faces-stride', (R, F) => {
    for (const r of R.filter(r => r.name === 'GEOM')) {
        const faces = _asList(r.params.FACES);
        if (faces.length > 0 && faces.length % 4 !== 0)
            F.push({ severity:'ERROR', message:`&GEOM '${r.params.ID}' : FACES comporte ${faces.length} entiers — pas un multiple de 4.`, hint:"Chaque face s’écrit (v1,v2,v3,indice_surf_id) = 4 entiers. Ajoutez l’indice de SURF_ID à chaque face. FDS lève ERROR(701). Voir User Guide §7.3.2.", line:r.line, rule:'geom-faces-stride' });
    }
});

// ── SURF VEL sign convention ──────────────────────────────────────────────────

_rule('vel-sign-convention', (R, F) => {
    const EXHAUST = ['EXHAUST','EXTRACT','OUTLET','OUTFLOW','EXIT','EXPEL','SUCTION','DRAW'];
    const SUPPLY  = ['SUPPLY','INTAKE','INLET','INFLOW','BLOW','INJECT','FAN_IN'];
    for (const s of R.filter(r => r.name === 'SURF')) {
        const sid = String(s.params.ID || '').toUpperCase();
        if (!sid) continue;
        let flowVal = null, flowKey = null;
        for (const k of ['VEL','VEL_T','VOLUME_FLOW','MASS_FLUX','MASS_FLOW_RATE']) {
            const v = s.params[k];
            if (typeof v === 'number' && v !== 0) { flowVal = v; flowKey = k; break; }
        }
        if (flowVal === null) continue;
        const isEx = EXHAUST.some(t => sid.includes(t));
        const isSu = SUPPLY.some(t => sid.includes(t));
        if (isEx && flowVal < 0)
            F.push({ severity:'WARNING', message:`&SURF '${s.params.ID}' : ${flowKey}=${flowVal} (négatif). Le nom évoque une EXTRACTION mais une valeur négative souffle DANS le domaine.`, hint:`Un ${flowKey} positif aspire HORS du domaine (extraction). Inversez le signe (${-flowVal}) pour une extraction.`, line:s.line, rule:'vel-sign-convention' });
        else if (isSu && flowVal > 0)
            F.push({ severity:'WARNING', message:`&SURF '${s.params.ID}' : ${flowKey}=${flowVal} (positif). Le nom évoque un SOUFFLAGE mais une valeur positive aspire HORS du domaine.`, hint:`Un ${flowKey} négatif souffle DANS le domaine (soufflage). Inversez le signe (${-flowVal}).`, line:s.line, rule:'vel-sign-convention' });
    }
});

// ── RAMP T monotonicity ───────────────────────────────────────────────────────
// FDS User Guide §11.1: "each set of RAMP lines must be listed with monotonically increasing T"

_rule('ramp-t-monotonic', (R, F) => {
    const groups = {};
    for (const r of R.filter(r => r.name === 'RAMP')) {
        const id = String(r.params.ID || '');
        if (!id) continue;
        if (!groups[id]) groups[id] = [];
        groups[id].push(r);
    }
    for (const [id, ramps] of Object.entries(groups)) {
        ramps.sort((a, b) => a.line - b.line);
        for (let i = 1; i < ramps.length; i++) {
            const prevT = ramps[i-1].params.T, currT = ramps[i].params.T;
            if (typeof prevT !== 'number' || typeof currT !== 'number') continue;
            if (currT <= prevT)
                F.push({ severity:'ERROR', message:`&RAMP ID='${id}' : T=${currT} ligne ${ramps[i].line} n’est pas supérieur à T=${prevT} ligne ${ramps[i-1].line}.`, hint:"Les lignes d’une RAMP doivent avoir des T strictement croissants (FDS User Guide §11.1). Sinon l’interpolation peut être fausse sans avertissement.", line:ramps[i].line, rule:'ramp-t-monotonic' });
        }
    }
});

// ── Mesh cell aspect ratio ────────────────────────────────────────────────────
// FDS User Guide §2.3.1: "mesh cells that have an aspect ratio larger than 2 to 1" → numerical instability

_rule('mesh-cell-aspect-ratio', (R, F) => {
    for (const m of R.filter(r => r.name === 'MESH')) {
        const xb = m.params.XB, ijk = m.params.IJK;
        if (!Array.isArray(xb) || xb.length !== 6 || !Array.isArray(ijk) || ijk.length !== 3) continue;
        const dx = (xb[1]-xb[0]) / ijk[0];
        const dy = (xb[3]-xb[2]) / ijk[1];
        const dz = (xb[5]-xb[4]) / ijk[2];
        const dims = [dx, dy, dz].filter(d => d > 0);
        if (dims.length < 2) continue;
        const ratio = Math.max(...dims) / Math.min(...dims);
        if (ratio > 3)
            F.push({ severity:'WARNING', message:`&MESH ligne ${m.line} : rapport d’aspect des cellules ≈ ${ratio.toFixed(1)}:1 (dx=${dx.toFixed(3)}, dy=${dy.toFixed(3)}, dz=${dz.toFixed(3)} m).`, hint:"Un rapport d’aspect > 2:1 est une cause fréquente d’instabilité numérique (FDS User Guide §16.2.4). Affinez ou répartissez autrement les cellules.", line:m.line, rule:'mesh-cell-aspect-ratio' });
        else if (ratio > 2)
            F.push({ severity:'INFO', message:`&MESH ligne ${m.line} : rapport d’aspect des cellules ≈ ${ratio.toFixed(1)}:1 (dx=${dx.toFixed(3)}, dy=${dy.toFixed(3)}, dz=${dz.toFixed(3)} m).`, hint:"Un rapport d’aspect proche de 2:1 commence à dégrader la précision LES. Préférez des cellules plus cubiques.", line:m.line, rule:'mesh-cell-aspect-ratio' });
    }
});

// ── INIT PART_ID cross-reference ──────────────────────────────────────────────

_rule('init-part-id-undefined', (R, F) => {
    const parts = new Set(R.filter(r => r.name === 'PART').map(r => String(r.params.ID || '')));
    for (const r of R.filter(r => r.name === 'INIT')) {
        const pid = r.params.PART_ID;
        if (pid && !parts.has(String(pid)))
            F.push({ severity:'ERROR', message:`&INIT ligne ${r.line} : le PART_ID='${pid}' référencé n’est pas défini.`, hint:`Définissez &PART ID='${pid}', SPEC_ID='...', ... / ou corrigez le PART_ID.`, line:r.line, rule:'init-part-id-undefined' });
    }
});

// ── Deprecated parameter names ────────────────────────────────────────────────
// MOISTURE_CONTENT was renamed MOISTURE_FRACTION in FDS6 (User Guide §11.4)

_rule('deprecated-params', (R, F) => {
    for (const r of R) {
        if (r.params.MOISTURE_CONTENT != null)
            F.push({ severity:'WARNING', message:`&${r.name} ligne ${r.line} : utilise MOISTURE_CONTENT, ancien nom de paramètre FDS5.`, hint:"Renommez en MOISTURE_FRACTION (FDS6 User Guide §11.4). MOISTURE_CONTENT est ignoré sans avertissement par FDS6 : humidité nulle.", line:r.line, rule:'deprecated-params' });
    }
});

// ── DUMP NFRAMES ──────────────────────────────────────────────────────────────

_rule('dump-nframes-positive', (R, F) => {
    for (const r of R.filter(r => r.name === 'DUMP')) {
        const nf = r.params.NFRAMES;
        if (typeof nf === 'number' && nf < 1)
            F.push({ severity:'ERROR', message:`&DUMP NFRAMES=${nf} — doit être un entier positif.`, hint:"NFRAMES est le nombre d’instants de sortie (1000 par défaut). Zéro provoque une division par zéro à l’écriture des sorties.", line:r.line, rule:'dump-nframes-positive' });
    }
});

// ── REAC FUEL must match a known or defined species ───────────────────────────
// If FUEL is not predefined and no &SPEC defines it, FDS assigns nitrogen properties

_rule('reac-fuel-species', (R, F) => {
    // Use only user-defined &SPEC IDs — not _definedSpecies() (adds REAC FUEL
    // itself) and not _BUILTIN_SPECIES (AIR, N2, etc. are not burnable fuels;
    // all legitimate builtin fuels are already covered by KNOWN_FUELS below).
    const specDefined = new Set(
        R.filter(r => r.name === 'SPEC' && r.params.ID)
            .map(r => String(r.params.ID).toUpperCase())
    );
    const KNOWN_FUELS = new Set([
        'METHANE','PROPANE','ETHYLENE','ACETYLENE','N-HEPTANE','HEPTANE',
        'ETHANOL','METHANOL','TOLUENE','BUTANE','HYDROGEN','ISOPROPANOL',
        'N-DECANE','N-HEXANE','ETHANE','NATURAL GAS','PROPYLENE','ACETONE',
        'WOOD','CELLULOSE','POLYURETHANE','POLYMETHYLMETHACRYLATE','PMMA',
        'DIESEL','KEROSENE','GASOLINE','BENZENE','STYRENE','NYLON',
    ]);
    for (const r of R.filter(r => r.name === 'REAC')) {
        const fuel = r.params.FUEL;
        if (!fuel) continue;
        const fU = String(fuel).toUpperCase();
        if (!specDefined.has(fU) && !KNOWN_FUELS.has(fU))
            F.push({ severity:'WARNING', message:`&REAC FUEL='${fuel}' n’est pas une espèce prédéfinie de FDS et aucun &SPEC ne porte cet ID.`, hint:`Définissez &SPEC ID='${fuel}', FORMULA='CxHy', MW=..., ... / ou utilisez un nom standard comme PROPANE ou N-HEPTANE.`, line:r.line, rule:'reac-fuel-species' });
    }
});

// ── SURF conflicting flow boundary conditions ─────────────────────────────────

_rule('surf-vel-flow-conflict', (R, F) => {
    for (const s of R.filter(r => r.name === 'SURF')) {
        const hasVel  = s.params.VEL != null || s.params.VEL_T != null;
        const hasFlow = s.params.VOLUME_FLOW != null || s.params.MASS_FLUX != null || s.params.MASS_FLOW_RATE != null;
        if (hasVel && hasFlow)
            F.push({ severity:'WARNING', message:`&SURF '${s.params.ID||'?'}' définit à la fois une vitesse (VEL/VEL_T) et un débit (VOLUME_FLOW/MASS_FLUX/MASS_FLOW_RATE).`, hint:"Ne définissez qu’un seul type de débit. FDS en retient un et ignore l’autre sans avertissement.", line:s.line, rule:'surf-vel-flow-conflict' });
    }
});

// ── CHID length limit ─────────────────────────────────────────────────────────
// FDS hard-crashes if CHID exceeds 39 characters (used as base filename)

_rule('chid-length', (R, F) => {
    for (const r of R.filter(r => r.name === 'HEAD')) {
        const chid = String(r.params.CHID || '');
        if (chid.length > 39)
            F.push({ severity:'ERROR', message:`Le CHID '${chid}' fait ${chid.length} caractères — FDS refuse un CHID de plus de 39 caractères.`, hint:`Raccourcissez le CHID à 39 caractères maximum. Il sert de préfixe aux fichiers de sortie ; plus long, FDS s’arrête au démarrage.`, line:r.line, rule:'chid-length' });
    }
});

// ── XB / XYZ / IJK array length ───────────────────────────────────────────────
// XB always needs exactly 6 values; XYZ exactly 3; IJK (MESH only) exactly 3.

_rule('array-count', (R, F) => {
    for (const r of R) {
        const xb = r.params.XB;
        if (xb !== undefined) {
            const n = Array.isArray(xb) ? xb.length : 1;
            if (n !== 6)
                F.push({ severity:'ERROR', message:`&${r.name} ligne ${r.line} : XB compte ${n} valeur${n===1?'':'s'} — 6 attendues (x0,x1,y0,y1,z0,z1).`, hint:`Comptez les virgules : XB doit contenir six nombres séparés par des virgules. FDS lève ERROR(119) sinon.`, line:r.line, rule:'array-count' });
        }
        const xyz = r.params.XYZ;
        if (xyz !== undefined) {
            const n = Array.isArray(xyz) ? xyz.length : 1;
            if (n !== 3)
                F.push({ severity:'ERROR', message:`&${r.name} ligne ${r.line} : XYZ compte ${n} valeur${n===1?'':'s'} — 3 attendues (x,y,z).`, hint:`XYZ doit contenir trois nombres séparés par des virgules : XYZ=x,y,z.`, line:r.line, rule:'array-count' });
        }
        if (r.name === 'MESH') {
            const ijk = r.params.IJK;
            if (ijk !== undefined) {
                const n = Array.isArray(ijk) ? ijk.length : 1;
                if (n !== 3)
                    F.push({ severity:'ERROR', message:`&MESH ligne ${r.line} : IJK compte ${n} valeur${n===1?'':'s'} — 3 attendues (I,J,K).`, hint:`IJK doit contenir trois entiers : IJK=I,J,K. FDS lève ERROR(113).`, line:r.line, rule:'array-count' });
            }
        }
    }
});

// ── TIME T_BEGIN must be before T_END ─────────────────────────────────────────

_rule('time-t-begin-end', (R, F) => {
    for (const r of R.filter(r => r.name === 'TIME')) {
        const tb = r.params.T_BEGIN, te = r.params.T_END;
        if (typeof tb === 'number' && typeof te === 'number' && tb >= te)
            F.push({ severity:'ERROR', message:`&TIME T_BEGIN=${tb} ≥ T_END=${te} — la durée simulée serait nulle ou négative.`, hint:`T_BEGIN doit être strictement inférieur à T_END. T_BEGIN vaut 0.0 par défaut.`, line:r.line, rule:'time-t-begin-end' });
    }
});

// ── REAC species yield sanity ─────────────────────────────────────────────────
// Yields are mass fractions (kg/kg): must be ≥ 0, each ≤ 1, combined ≤ 1.

_rule('reac-yield-range', (R, F) => {
    for (const r of R.filter(r => r.name === 'REAC')) {
        const sy = r.params.SOOT_YIELD, cy = r.params.CO_YIELD;
        for (const [k, v] of [['SOOT_YIELD', sy], ['CO_YIELD', cy]]) {
            if (typeof v !== 'number') continue;
            if (v < 0)
                F.push({ severity:'ERROR', message:`&REAC ${k}=${v} est négatif — un rendement massique ne peut pas être négatif.`, hint:`${k} s’exprime en kg de suie (ou de CO) par kg de combustible brûlé. Une valeur négative n’a pas de sens physique et FDS s’arrêtera.`, line:r.line, rule:'reac-yield-range' });
            else if (v > 1)
                F.push({ severity:'ERROR', message:`&REAC ${k}=${v} dépasse 1.0 — impossible de produire plus de masse que le combustible.`, hint:`${k} est une fraction massique (kg/kg). Une valeur > 1 viole la conservation de la masse.`, line:r.line, rule:'reac-yield-range' });
        }
        if (typeof sy === 'number' && typeof cy === 'number' && sy + cy > 1)
            F.push({ severity:'WARNING', message:`&REAC SOOT_YIELD + CO_YIELD = ${(sy+cy).toFixed(3)} > 1.0 — les rendements cumulés dépassent la masse de combustible.`, hint:`Valeurs usuelles : SOOT_YIELD 0,01–0,10, CO_YIELD 0,01–0,05 selon le combustible. Leur somme doit rester < 1.`, line:r.line, rule:'reac-yield-range' });
    }
});

// ── SURF HRRPUA / MLRPUA = 0 ──────────────────────────────────────────────────
// A fire surface with zero heat release does nothing — almost always a typo.

_rule('surf-hrrpua-zero', (R, F) => {
    for (const s of R.filter(r => r.name === 'SURF')) {
        for (const k of ['HRRPUA', 'MLRPUA']) {
            if (s.params[k] === 0)
                F.push({ severity:'WARNING', message:`&SURF '${s.params.ID||'?'}' : ${k}=0 — cette surface ne dégage aucune chaleur et ne produit pas de feu.`, hint:`${k}=0 est très probablement une faute de frappe. Indiquez une valeur positive (ex. HRRPUA=250 kW/m²) ou supprimez le paramètre.`, line:s.line, rule:'surf-hrrpua-zero' });
        }
    }
});

// ── RAMP with only one point ───────────────────────────────────────────────────
// A single-entry RAMP cannot interpolate; FDS may warn and treat it as a constant.

_rule('ramp-single-entry', (R, F) => {
    const groups = {};
    for (const r of R.filter(r => r.name === 'RAMP')) {
        const id = String(r.params.ID || '');
        if (!id) continue;
        (groups[id] = groups[id] || []).push(r);
    }
    for (const [id, entries] of Object.entries(groups)) {
        if (entries.length === 1)
            F.push({ severity:'WARNING', message:`&RAMP ID='${id}' n’a qu’une seule ligne — l’interpolation demande au moins 2 couples (T,F).`, hint:`Ajoutez une seconde ligne &RAMP ID='${id}', T=..., F=... /. Un seul point rend la rampe constante, ce qui n’est sans doute pas voulu.`, line:entries[0].line, rule:'ramp-single-entry' });
    }
});

// ── DEVC missing ID ───────────────────────────────────────────────────────────

_rule('devc-id-missing', (R, F) => {
    for (const d of R.filter(r => r.name === 'DEVC')) {
        const id = d.params.ID;
        if (!id || (typeof id === 'string' && !id.trim()))
            F.push({ severity:'WARNING', message:`&DEVC ligne ${d.line} : pas d’ID — la colonne de _devc.csv n’aura pas de nom.`, hint:`Ajoutez ID='<nom>' pour identifier le capteur dans les sorties et le référencer depuis un CTRL.`, line:d.line, rule:'devc-id-missing' });
    }
});

// ── VENT / OBST outside domain ────────────────────────────────────────────────
// Geometry outside all mesh bounds is silently dropped by FDS.

_rule('vent-outside-domain', (R, F) => {
    const meshes = R.filter(r => r.name === 'MESH' && Array.isArray(r.params.XB) && r.params.XB.length === 6).map(r => r.params.XB);
    if (!meshes.length) return;
    const overlaps = (a, b) =>
        a[0] <= b[1]+1e-6 && a[1] >= b[0]-1e-6 &&
        a[2] <= b[3]+1e-6 && a[3] >= b[2]-1e-6 &&
        a[4] <= b[5]+1e-6 && a[5] >= b[4]-1e-6;
    for (const v of R.filter(r => r.name === 'VENT')) {
        const xb = v.params.XB;
        if (!Array.isArray(xb) || xb.length !== 6 || v.params.MB) continue;
        if (!meshes.some(m => overlaps(xb, m)))
            F.push({ severity:'ERROR', message:`&VENT ligne ${v.line} : XB=(${xb.join(',')}) est hors de tous les &MESH — FDS l’ignorera sans avertissement.`, hint:`Placez le VENT sur une face de maillage, ou utilisez MB='XMIN'/'XMAX'/'YMIN'/'YMAX'/'ZMIN'/'ZMAX' pour l’accrocher à une frontière.`, line:v.line, rule:'vent-outside-domain' });
    }
});

_rule('obst-outside-domain', (R, F) => {
    const meshes = R.filter(r => r.name === 'MESH' && Array.isArray(r.params.XB) && r.params.XB.length === 6).map(r => r.params.XB);
    if (!meshes.length) return;
    const overlaps = (a, b) =>
        a[0] < b[1]+1e-6 && a[1] > b[0]-1e-6 &&
        a[2] < b[3]+1e-6 && a[3] > b[2]-1e-6 &&
        a[4] < b[5]+1e-6 && a[5] > b[4]-1e-6;
    for (const o of R.filter(r => r.name === 'OBST')) {
        const xb = o.params.XB;
        if (!Array.isArray(xb) || xb.length !== 6) continue;
        if (!meshes.some(m => overlaps(xb, m)))
            F.push({ severity:'WARNING', message:`&OBST ligne ${o.line} : XB=(${xb.join(',')}) ne recoupe aucun &MESH — elle sera ignorée sans avertissement.`, hint:`Vérifiez les coordonnées. FDS rogne les obstructions aux limites des maillages mais supprime celles qui n’en recoupent aucun.`, line:o.line, rule:'obst-outside-domain' });
    }
});

// ── VENT not on a mesh boundary or OBST face ─────────────────────────────────
// FDS requires every VENT to be placed flush against a solid surface: either a
// mesh boundary plane or a face of an OBST. A floating VENT is silently attached
// to whatever surface FDS finds nearby — usually the wrong one.
//
// Algorithm:
//  1. Determine the plane axis (X / Y / Z) from the equal coordinate pair.
//  2. Check if that plane coincides (within tolerance) with any mesh boundary.
//  3. Check if that plane coincides with a face of any OBST whose other two
//     extents overlap the VENT's extents.

_rule('vent-not-on-surface', (R, F) => {
    const EPS  = 1e-4;
    const meshes = R.filter(r => r.name === 'MESH' && Array.isArray(r.params.XB) && r.params.XB.length === 6).map(r => r.params.XB);
    const obsts  = R.filter(r => r.name === 'OBST' && Array.isArray(r.params.XB) && r.params.XB.length === 6).map(r => r.params.XB);
    if (!meshes.length) return;

    for (const v of R.filter(r => r.name === 'VENT')) {
        const xb = v.params.XB;
        if (!Array.isArray(xb) || xb.length !== 6) continue;
        if (v.params.MB) continue;          // MB= explicitly names a mesh boundary

        const [vx0,vx1,vy0,vy1,vz0,vz1] = xb;
        let axis = null, vp = 0;
        if (Math.abs(vx1-vx0) < EPS) { axis = 'X'; vp = (vx0+vx1)/2; }
        else if (Math.abs(vy1-vy0) < EPS) { axis = 'Y'; vp = (vy0+vy1)/2; }
        else if (Math.abs(vz1-vz0) < EPS) { axis = 'Z'; vp = (vz0+vz1)/2; }
        else continue;                      // non-planar — caught by vent-not-planar

        // On a mesh boundary?
        const onMesh = meshes.some(m => {
            if (axis === 'X') return Math.abs(vp-m[0]) < EPS || Math.abs(vp-m[1]) < EPS;
            if (axis === 'Y') return Math.abs(vp-m[2]) < EPS || Math.abs(vp-m[3]) < EPS;
                              return Math.abs(vp-m[4]) < EPS || Math.abs(vp-m[5]) < EPS;
        });
        if (onMesh) continue;

        // On an OBST face? (plane matches a face AND lateral extents overlap)
        const onObst = obsts.some(o => {
            const [ox0,ox1,oy0,oy1,oz0,oz1] = o;
            if (axis === 'X') {
                return (Math.abs(vp-ox0) < EPS || Math.abs(vp-ox1) < EPS) &&
                       vy0 < oy1+EPS && vy1 > oy0-EPS &&
                       vz0 < oz1+EPS && vz1 > oz0-EPS;
            }
            if (axis === 'Y') {
                return (Math.abs(vp-oy0) < EPS || Math.abs(vp-oy1) < EPS) &&
                       vx0 < ox1+EPS && vx1 > ox0-EPS &&
                       vz0 < oz1+EPS && vz1 > oz0-EPS;
            }
            return (Math.abs(vp-oz0) < EPS || Math.abs(vp-oz1) < EPS) &&
                   vx0 < ox1+EPS && vx1 > ox0-EPS &&
                   vy0 < oy1+EPS && vy1 > oy0-EPS;
        });
        if (onObst) continue;

        F.push({
            severity: 'WARNING',
            message: `&VENT ligne ${v.line} : XB=(${xb.join(',')}) n’est ni sur une frontière de maillage ni sur une face d’OBST — FDS le recalera sur la surface la plus proche, qui n’est peut-être pas la bonne.`,
            hint: `Plaquez le VENT contre une frontière de maillage (ou utilisez MB='XMIN'/'XMAX'/'YMIN'/'YMAX'/'ZMIN'/'ZMAX') ou alignez-le sur une face d’OBST. Un VENT « flottant » est déplacé par FDS sans avertissement.`,
            line: v.line,
            rule: 'vent-not-on-surface',
        });
    }
});

// ── MATL Arrhenius completeness ────────────────────────────────────────────────
// Arrhenius kinetics require both A (pre-exponential) and either E or REFERENCE_TEMPERATURE.

_rule('matl-arrhenius-incomplete', (R, F) => {
    for (const m of R.filter(r => r.name === 'MATL')) {
        const hasA   = m.params.A != null;
        const hasE   = m.params.E != null;
        const hasRef = m.params.REFERENCE_TEMPERATURE != null;
        if (hasA && !hasE && !hasRef)
            F.push({ severity:'WARNING', message:`&MATL '${m.params.ID||'?'}' : A sans E ni REFERENCE_TEMPERATURE — couple d’Arrhenius incomplet.`, hint:`Ajoutez E=<J/mol> (énergie d’activation) ou REFERENCE_TEMPERATURE=<°C>. FDS a besoin de A et E (ou A et REFERENCE_TEMPERATURE) pour calculer la pyrolyse.`, line:m.line, rule:'matl-arrhenius-incomplete' });
        if (hasE && !hasA)
            F.push({ severity:'WARNING', message:`&MATL '${m.params.ID||'?'}' : E sans A — le facteur pré-exponentiel d’Arrhenius manque.`, hint:`Ajoutez A=<s⁻¹> (facteur pré-exponentiel). FDS a besoin de A avec E pour la cinétique de pyrolyse d’Arrhenius.`, line:m.line, rule:'matl-arrhenius-incomplete' });
    }
});

// ── SURF MATL_MASS_FRACTION consistency ───────────────────────────────────────
// Count must match MATL_ID count and values must sum to 1.

_rule('surf-matl-mass-fraction', (R, F) => {
    for (const s of R.filter(r => r.name === 'SURF')) {
        const ids   = _asList(s.params.MATL_ID);
        const fracs = _asList(s.params.MATL_MASS_FRACTION);
        if (!ids.length || !fracs.length) continue;
        if (fracs.length !== ids.length) {
            F.push({ severity:'WARNING', message:`&SURF '${s.params.ID||'?'}' : ${ids.length} MATL_ID mais ${fracs.length} valeurs MATL_MASS_FRACTION — les nombres doivent correspondre.`, hint:`Donnez une valeur MATL_MASS_FRACTION par MATL_ID. Sinon FDS peut attribuer de mauvaises fractions sans avertissement.`, line:s.line, rule:'surf-matl-mass-fraction' });
        } else {
            const nums = fracs.filter(f => typeof f === 'number');
            if (nums.length === fracs.length) {
                const sum = nums.reduce((a, b) => a + b, 0);
                if (Math.abs(sum - 1.0) > 0.01)
                    F.push({ severity:'WARNING', message:`&SURF '${s.params.ID||'?'}' : la somme des MATL_MASS_FRACTION vaut ${sum.toFixed(4)} — elle devrait valoir 1.0.`, hint:`Les MATL_MASS_FRACTION sont des fractions massiques et doivent totaliser exactement 1.0.`, line:s.line, rule:'surf-matl-mass-fraction' });
            }
        }
    }
});

// ── Missing comma between parameters ─────────────────────────────────────────
// FDS namelists are comma-delimited. Catches both same-line (ID='A' COLOR='B')
// and cross-line (value on one line, IDENTIFIER= on the next) missing commas.
// Pattern: string or number value followed by whitespace (no comma) then IDENT=

_rule('missing-comma', (R, F) => {
    // Matches: closing quote or number, then whitespace (no comma), then IDENT=
    // The \s+ covers both spaces (same-line) and newlines (cross-line).
    const RE = /('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|\b[\d.]+(?:[eE][+-]?\d+)?)\s+(?=[A-Za-z_]\w*(?:\([^)]*\))?\s*=)/g;
    for (const r of R) {
        if (!r._body) continue;
        RE.lastIndex = 0;
        let m;
        while ((m = RE.exec(r._body)) !== null) {
            // Line where the value ends
            const valEnd = m.index + m[1].length;
            const lineOffset = (r._body.slice(0, valEnd).match(/\n/g) || []).length;
            const lineNum = r._bodyLine + lineOffset;
            const nextId = (r._body.slice(m.index + m[0].length).match(/^([A-Za-z_]\w*)/) || [])[1] || '?';
            F.push({
                severity: 'WARNING',
                message: `&${r.name} ligne ${lineNum} : virgule manquante après ${m[1]} avant '${nextId}='.`,
                hint: `Ajoutez une virgule après la valeur. Les namelists FDS sont séparées par des virgules ; sans elle, le lecteur Fortran peut mal lire '${nextId}' sans avertissement.`,
                line: lineNum,
                rule: 'missing-comma',
            });
        }
    }
});

// ── Unterminated / parameter-absorbing string literals ───────────────────────
// Catches SURF_ID='CONCRETE, COLOR='GRAY where the missing closing quote after
// CONCRETE causes the parser to read 'CONCRETE, COLOR=' as the full string value.
// We re-scan each record body for strings whose content contains a comma (or
// whitespace) followed by an ALL-CAPS identifier followed by '=' — a pattern
// that only appears legitimately BETWEEN parameters, never INSIDE a value.

_rule('unterminated-string', (R, F) => {
    // Matches ', PARAM=' or ' PARAM=' inside a string (min 2-char param name).
    const ABSORBED = /(?:,|\s)\s*([A-Z_][A-Z0-9_]{1,})\s*=/;
    for (const r of R) {
        if (!r._body) continue;
        const body = r._body;
        let i = 0;
        while (i < body.length) {
            const q = body[i];
            if (q !== "'" && q !== '"') { i++; continue; }
            const start = i;
            i++;
            while (i < body.length && body[i] !== q) i++;
            if (i >= body.length) {
                // Opening quote with no matching closing quote in the body
                const lineOffset = (body.slice(0, start).match(/\n/g) || []).length;
                F.push({
                    severity: 'ERROR',
                    message: `&${r.name} ligne ${r._bodyLine + lineOffset} : chaîne non fermée — le ${q} d’ouverture n’a pas de fermeture.`,
                    hint: `Ajoutez un ${q} de fermeture à la fin de la valeur.`,
                    line: r._bodyLine + lineOffset,
                    rule: 'unterminated-string',
                });
                break;
            }
            const content = body.slice(start + 1, i);
            const am = content.match(ABSORBED);
            // Only fire the "absorbed param" heuristic if the string content
            // looks like FDS keyword fragments — all-caps identifiers plus
            // punctuation. A real title/description containing lowercase letters
            // (e.g. "Run with HRRPUA=500 kW") is legitimate FDS and must not fire.
            const prefix = am ? content.slice(0, content.search(ABSORBED)) : '';
            const isKeywordLike = am && !/[a-z]/.test(prefix);
            if (isKeywordLike) {
                const lineOffset = (body.slice(0, start).match(/\n/g) || []).length;
                const lineNum = r._bodyLine + lineOffset;
                const bare = prefix.trim();
                F.push({
                    severity: 'ERROR',
                    message: `&${r.name} ligne ${lineNum} : ${q} de fermeture manquant après '${bare}' — le paramètre ${am[1]} a été absorbé dans la chaîne.`,
                    hint: `Remplacez ${q}${content}${q} par ${q}${bare}${q}. Sans le guillemet de fermeture, le lecteur Fortran lit '${am[1]}' comme une partie de la chaîne et non comme un paramètre.`,
                    line: lineNum,
                    rule: 'unterminated-string',
                });
            }
            i++; // step past closing quote
        }
    }
});

// ── MATL zero physical properties ────────────────────────────────────────────
// ERROR(253/254/255): DENSITY/CONDUCTIVITY/SPECIFIC_HEAT = 0 causes division-by-zero.

_rule('matl-zero-properties', (R, F) => {
    for (const m of R.filter(r => r.name === 'MATL')) {
        for (const [k, code] of [['DENSITY',253],['CONDUCTIVITY',254],['SPECIFIC_HEAT',255]]) {
            if (m.params[k] === 0)
                F.push({ severity:'ERROR', message:`&MATL '${m.params.ID||'?'}' : ${k}=0 — FDS lève ERROR(${code}).`, hint:`${k} doit être strictement positif. Zéro provoque une division par zéro ou un calcul de transfert thermique mal conditionné.`, line:m.line, rule:'matl-zero-properties' });
        }
    }
});

// ── MATL HEAT_OF_REACTION must be positive ───────────────────────────────────
// ERROR(252): zero or negative HEAT_OF_REACTION is unphysical — pyrolysis absorbs energy.

_rule('matl-heat-of-reaction', (R, F) => {
    for (const m of R.filter(r => r.name === 'MATL')) {
        const hor = m.params.HEAT_OF_REACTION;
        if (typeof hor === 'number' && hor <= 0)
            F.push({ severity:'ERROR', message:`&MATL '${m.params.ID||'?'}' : HEAT_OF_REACTION=${hor} — doit être positif (FDS lève ERROR(252)).`, hint:`HEAT_OF_REACTION est l’énergie absorbée par la pyrolyse (kJ/kg). Une valeur nulle ou négative n’a pas de sens physique et arrête FDS.`, line:m.line, rule:'matl-heat-of-reaction' });
    }
});

// ── SURF HRRPUA/MLRPUA conflicts with pyrolysis MATL_ID ─────────────────────
// ERROR(357): HRRPUA/MLRPUA (prescribed fire) + MATL_ID (pyrolysis model) conflict.

_rule('surf-hrrpua-pyrolysis-conflict', (R, F) => {
    for (const s of R.filter(r => r.name === 'SURF')) {
        const hasHrrpua = s.params.HRRPUA != null || s.params.MLRPUA != null;
        const hasMatlId = _asList(s.params.MATL_ID).length > 0;
        if (hasHrrpua && hasMatlId)
            F.push({ severity:'ERROR', message:`&SURF '${s.params.ID||'?'}' : HRRPUA/MLRPUA et MATL_ID à la fois — FDS lève ERROR(357).`, hint:`Utilisez soit HRRPUA/MLRPUA (feu imposé), soit MATL_ID (réactions de pyrolyse), pas les deux : ils définissent la combustion de façon contradictoire.`, line:s.line, rule:'surf-hrrpua-pyrolysis-conflict' });
    }
});

// ── SURF MASS_FLUX must be ≥ 0 ───────────────────────────────────────────────
// ERROR(321): negative MASS_FLUX is unphysical on a solid surface boundary.

_rule('surf-mass-flux-negative', (R, F) => {
    for (const s of R.filter(r => r.name === 'SURF')) {
        const mf = s.params.MASS_FLUX;
        if (typeof mf === 'number' && mf < 0)
            F.push({ severity:'ERROR', message:`&SURF '${s.params.ID||'?'}' : MASS_FLUX=${mf} — doit être ≥ 0 (FDS lève ERROR(321)).`, hint:`MASS_FLUX est un flux massique positif (kg/m²/s) de la surface vers le gaz. Pour un apport d’air, utilisez VEL ou VOLUME_FLOW.`, line:s.line, rule:'surf-mass-flux-negative' });
    }
});

// ── SURF with MATL_ID requires THICKNESS ─────────────────────────────────────
// ERROR(307): a layered surface must specify the thickness of each layer.

_rule('surf-thickness-required', (R, F) => {
    for (const s of R.filter(r => r.name === 'SURF')) {
        if (_asList(s.params.MATL_ID).length > 0 && s.params.THICKNESS == null)
            F.push({ severity:'ERROR', message:`&SURF '${s.params.ID||'?'}' : MATL_ID sans THICKNESS — FDS lève ERROR(307).`, hint:`Ajoutez THICKNESS=<m> (une valeur par couche). Sans THICKNESS, FDS ne peut pas calculer la conduction dans le solide.`, line:s.line, rule:'surf-thickness-required' });
    }
});

// ── CTRL INPUT_ID must resolve to a known DEVC or CTRL ───────────────────────
// ERROR(916): INPUT_ID references a name not defined as any DEVC or CTRL.

_rule('ctrl-input-undefined', (R, F) => {
    const devcIds = new Set(R.filter(r => r.name === 'DEVC' && r.params.ID).map(r => String(r.params.ID)));
    const ctrlIds = new Set(R.filter(r => r.name === 'CTRL' && r.params.ID).map(r => String(r.params.ID)));
    const all = new Set([...devcIds, ...ctrlIds]);
    if (!all.size) return;
    for (const c of R.filter(r => r.name === 'CTRL')) {
        for (const iid of _asList(c.params.INPUT_ID)) {
            const s = String(iid);
            if (s && !all.has(s))
                F.push({ severity:'ERROR', message:`&CTRL '${c.params.ID||'?'}' : INPUT_ID='${s}' n’est l’ID d’aucun DEVC ni CTRL — FDS lève ERROR(916).`, hint:`Définissez &DEVC ID='${s}', ... / ou &CTRL ID='${s}', ... / ou corrigez l’orthographe de INPUT_ID.`, line:c.line, rule:'ctrl-input-undefined' });
        }
    }
});

// ── CTRL logic types require at least one INPUT_ID ────────────────────────────
// ERROR(905): logic-type CTRL with no inputs defined.

_rule('ctrl-no-inputs', (R, F) => {
    const NEEDS_INPUT = new Set(['ANY','ALL','ONLY','AT_LEAST','EXACTLY','TIME_DELAY']);
    for (const c of R.filter(r => r.name === 'CTRL')) {
        const ft = String(c.params.FUNCTION_TYPE || '').toUpperCase();
        if (!NEEDS_INPUT.has(ft)) continue;
        if (!c.params.INPUT_ID)
            F.push({ severity:'WARNING', message:`&CTRL '${c.params.ID||'?'}' FUNCTION_TYPE='${c.params.FUNCTION_TYPE}' sans INPUT_ID — FDS lève ERROR(905).`, hint:`Ajoutez INPUT_ID='<id_devc_ou_ctrl>' pour relier ce contrôleur à un capteur ou à un autre contrôleur.`, line:c.line, rule:'ctrl-no-inputs' });
    }
});

// ── HOLE must overlap at least one OBST ──────────────────────────────────────
// A HOLE with no overlapping OBST is silently ignored by FDS.

_rule('hole-no-obst', (R, F) => {
    const obsts = R.filter(r => r.name === 'OBST' && Array.isArray(r.params.XB) && r.params.XB.length === 6).map(r => r.params.XB);
    if (!obsts.length) return;
    const overlaps = (a, b) =>
        a[0] < b[1]+1e-6 && a[1] > b[0]-1e-6 &&
        a[2] < b[3]+1e-6 && a[3] > b[2]-1e-6 &&
        a[4] < b[5]+1e-6 && a[5] > b[4]-1e-6;
    for (const h of R.filter(r => r.name === 'HOLE')) {
        const xb = h.params.XB;
        if (!Array.isArray(xb) || xb.length !== 6) continue;
        if (!obsts.some(o => overlaps(xb, o)))
            F.push({ severity:'WARNING', message:`&HOLE ligne ${h.line} : XB=(${xb.join(',')}) ne recoupe aucune &OBST — sans effet.`, hint:`Un HOLE ne fait qu’évider des OBST existantes. S’il n’en recoupe aucune, FDS l’ignore. Vérifiez les coordonnées.`, line:h.line, rule:'hole-no-obst' });
    }
});

// ── VENT/OBST/HOLE cannot have both CTRL_ID and DEVC_ID ─────────────────────
// ERROR(393): only one activation mechanism is allowed per element.

_rule('ctrl-devc-conflict', (R, F) => {
    for (const r of R) {
        if (!['VENT','OBST','HOLE'].includes(r.name)) continue;
        if (r.params.CTRL_ID != null && r.params.DEVC_ID != null)
            F.push({ severity:'ERROR', message:`&${r.name} ligne ${r.line} : CTRL_ID='${r.params.CTRL_ID}' et DEVC_ID='${r.params.DEVC_ID}' à la fois — FDS lève ERROR(393).`, hint:`N’utilisez qu’un seul déclencheur : CTRL_ID (contrôleur logique) ou DEVC_ID (capteur), pas les deux.`, line:r.line, rule:'ctrl-devc-conflict' });
    }
});

// ── INIT MASS_FRACTION and VOLUME_FRACTION are mutually exclusive ─────────────
// ERROR(842): FDS cannot accept both simultaneously on the same INIT record.

_rule('init-fraction-conflict', (R, F) => {
    for (const r of R.filter(r => r.name === 'INIT')) {
        if (r.params.MASS_FRACTION != null && r.params.VOLUME_FRACTION != null)
            F.push({ severity:'ERROR', message:`&INIT ligne ${r.line} : MASS_FRACTION et VOLUME_FRACTION à la fois — FDS lève ERROR(842).`, hint:`Utilisez MASS_FRACTION (base massique) ou VOLUME_FRACTION (base volumique) pour initialiser les espèces : ils s’excluent mutuellement.`, line:r.line, rule:'init-fraction-conflict' });
    }
});

// ── Cylindrical coordinate mesh constraints ───────────────────────────────────
// ERROR(120): XB(1) < 0 in cylindrical mode (radial axis cannot be negative).
// ERROR(121): IJK(2) ≠ 1 in cylindrical mode (azimuthal dimension must be 1).

_rule('mesh-cylindrical', (R, F) => {
    const isCyl = R.some(r => r.name === 'MISC' && r.params.CYLINDRICAL === true);
    if (!isCyl) return;
    for (const m of R.filter(r => r.name === 'MESH')) {
        const xb = m.params.XB;
        if (Array.isArray(xb) && xb.length === 6 && xb[0] < -1e-6)
            F.push({ severity:'ERROR', message:`&MESH ligne ${m.line} : XB(1)=${xb[0]} < 0 en coordonnées cylindriques — FDS lève ERROR(120).`, hint:`La première coordonnée XB est l’axe radial et ne peut pas être négative en mode cylindrique.`, line:m.line, rule:'mesh-cylindrical' });
        const ijk = m.params.IJK;
        if (Array.isArray(ijk) && ijk.length === 3 && ijk[1] !== 1)
            F.push({ severity:'ERROR', message:`&MESH ligne ${m.line} : IJK(2)=${ijk[1]} ≠ 1 en coordonnées cylindriques — FDS lève ERROR(121).`, hint:`En mode cylindrique, la dimension azimutale (J) doit valoir 1. Utilisez IJK=I,1,K.`, line:m.line, rule:'mesh-cylindrical' });
    }
});

// ── DEVC QUANTITY_RANGE: upper bound must exceed lower bound ──────────────────
// ERROR(881): QUANTITY_RANGE(2) ≤ QUANTITY_RANGE(1) is logically invalid.

_rule('devc-quantity-range', (R, F) => {
    for (const d of R.filter(r => r.name === 'DEVC')) {
        const qr = d.params.QUANTITY_RANGE;
        if (!Array.isArray(qr) || qr.length < 2) continue;
        if (typeof qr[0] === 'number' && typeof qr[1] === 'number' && qr[1] <= qr[0])
            F.push({ severity:'ERROR', message:`&DEVC '${d.params.ID||'?'}' QUANTITY_RANGE=(${qr[0]},${qr[1]}) : la borne haute doit être > à la borne basse — FDS lève ERROR(881).`, hint:`QUANTITY_RANGE(1) est le seuil bas et QUANTITY_RANGE(2) le seuil haut. Le haut doit être strictement supérieur au bas.`, line:d.line, rule:'devc-quantity-range' });
    }
});

// ── Main entry ────────────────────────────────────────────────────────────────

function fdsLint(text) {
    const records = _lintParseRecords(text);
    const findings = [];
    for (const [name, fn] of _LINT_RULES) {
        try { fn(records, findings); }
        catch (e) {
            findings.push({ severity:'WARNING', message:`Erreur interne : la règle '${name}' a échoué — ${e.message}`, hint:'', line:0, rule:name });
        }
    }
    findings.sort((a, b) => (a.line || 999999) - (b.line || 999999) || a.severity.localeCompare(b.severity));

    return findings;
}
