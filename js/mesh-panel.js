/**
 * FDS Viewer - Mesh Panel
 * Renders mesh resolution, characteristic fire diameter, MPI, and OpenMP data.
 */

function buildMeshPanel(data) {
    const wrap = document.querySelector('#mesh-panel .fp-scroll');
    if (!wrap) return;

    const meshInfo    = meshAnalyzeMeshes(data);
    const fireInfo    = meshEstimatePeakFireHRR(data);
    const dStar       = fireInfo.peakHRR > 0 ? meshCharacteristicFireDiameter(fireInfo.peakHRR, data) : null;
    const mpiInfo     = meshAnalyzeMPI(data.meshes || []);
    const ompInfo     = meshAnalyzeOpenMP(data);
    const imbalance   = meshAnalyzeImbalance(data.meshes || []);
    const ifaceIssues = meshFindInterfaceIssues(data.meshes || []);
    const ratioValues = [];

    const resolutionRows = meshInfo.rows.map(row => {
        const ratio = dStar && row.nominalCell > 0 ? dStar / row.nominalCell : null;
        if (ratio != null) ratioValues.push(ratio);
        return `<tr>
            <td>${esc(row.id)}</td>
            <td>${meshFmtDims(row.ijk)}</td>
            <td>${meshFmtLength(row.cellX)} × ${meshFmtLength(row.cellY)} × ${meshFmtLength(row.cellZ)}</td>
            <td>${meshFmtLength(row.nominalCell)}</td>
            <td>${ratio != null ? meshResolutionBadge(ratio) : '—'}</td>
            <td>${row.mpiProcess != null ? esc(row.mpiProcess) : '—'}</td>
        </tr>`;
    }).join('');

    const dStarText = dStar ? `${dStar.toFixed(2)} m` : '—';
    const peakText = fireInfo.peakHRR > 0
        ? (fireInfo.peakHRR >= 1000 ? `${(fireInfo.peakHRR / 1000).toFixed(2)} MW` : `${fireInfo.peakHRR.toFixed(0)} kW`)
        : 'Pas d’estimation du HRR';
    const ratioRangeText = ratioValues.length
        ? `${Math.min(...ratioValues).toFixed(1)} – ${Math.max(...ratioValues).toFixed(1)}`
        : '—';
    const ratioSummary = meshResolutionSummary(ratioValues);

    // Build interface-issue HTML (shown after table)
    const ifaceHtml = ifaceIssues.length ? `
        <div class="fp-mesh-iface-warn">
            <div class="fp-section-label fp-section-warn">
                ⚠ Compatibilité aux interfaces de maillage (${ifaceIssues.length} problème${ifaceIssues.length !== 1 ? 's' : ''})
            </div>
            <table class="fp-prop-table">
                ${ifaceIssues.map(iss => `<tr>
                    <td><strong class="fp-text-warn">${esc(iss.meshA)}</strong> ↔ <strong class="fp-text-warn">${esc(iss.meshB)}</strong></td>
                    <td>${esc(iss.axis)} (face) · rapport d${esc(iss.dim.toLowerCase())} <strong class="fp-text-warn">${iss.ratio.toFixed(1)}×</strong>
                        <span class="fp-note-sm">(${meshFmtLength(iss.cellA)} vs ${meshFmtLength(iss.cellB)})</span>
                    </td>
                </tr>`).join('')}
            </table>
            <p class="fp-note fp-note-tight">
                FDS demande que les tailles de cellules de part et d’autre d’une interface entre maillages restent dans un rapport de 2:1 pour une interpolation correcte. Au-delà, des erreurs de conservation de la masse peuvent apparaître à l’interface.
            </p>
        </div>` : '';

    wrap.innerHTML = `
        <div class="fp-card fp-mesh-card">
            <div class="fp-card-title">
                Résolution des maillages &amp; calcul parallèle
                <button class="fp-copy-btn" id="fp-copy-mesh">Copier le résumé</button>
            </div>
            <div class="fp-mesh-summary">
                <div class="fp-mesh-metric">
                    <span class="fp-ov-lbl">Maillages</span>
                    <strong>${meshInfo.rows.length}</strong>
                </div>
                <div class="fp-mesh-metric">
                    <span class="fp-ov-lbl">Cellules au total</span>
                    <strong>${meshFormatCells(meshInfo.totalCells)}</strong>
                </div>
                <div class="fp-mesh-metric">
                    <span class="fp-ov-lbl">Plage de tailles de cellule</span>
                    <strong>${meshInfo.rows.length ? `${meshFmtLength(meshInfo.minCell)} – ${meshFmtLength(meshInfo.maxCell)}` : '—'}</strong>
                </div>
                <div class="fp-mesh-metric">
                    <span class="fp-ov-lbl">Déséquilibre de charge MPI</span>
                    <strong${imbalance.ok ? '' : ' class="fp-text-warn"'}>${imbalance.text}</strong>
                </div>
                <div class="fp-mesh-metric">
                    <span class="fp-ov-lbl">HRR max. retenu</span>
                    <strong>${peakText}</strong>
                </div>
                <div class="fp-mesh-metric">
                    <span class="fp-ov-lbl">Diamètre caractéristique du feu</span>
                    <strong>${dStarText}</strong>
                </div>
                <div class="fp-mesh-metric">
                    <span class="fp-ov-lbl">Plage D*/dx</span>
                    <strong>${ratioRangeText}</strong>
                </div>
            </div>

            <div class="fp-note">
                ${fireInfo.peakHRR > 0
                    ? 'D* est estimé ici à partir du HRR des foyers détectés, avec la température ambiante de <code>&amp;MISC TMPA</code> si elle est renseignée.'
                    : 'D* nécessite une estimation de la puissance dégagée, par exemple via <code>HRRPUA</code> sur des vents ou un <code>HRRPUV</code> volumique.'}
            </div>

            <div class="fp-grid-2 fp-mesh-thresholds">
                <div>
                    <div class="fp-section-label">Seuils D*/dx usuels</div>
                    <table class="fp-prop-table">
                        <tr><td>Sous grossier</td><td><strong>&lt; 4</strong></td></tr>
                        <tr><td>Grossier</td><td><strong>4 à &lt; 10</strong></td></tr>
                        <tr><td>Moyen</td><td><strong>10 à &lt; 16</strong></td></tr>
                        <tr><td>Fin</td><td><strong>≥ 16</strong></td></tr>
                    </table>
                </div>
                <div>
                    <div class="fp-section-label">Situation de ce modèle</div>
                    <table class="fp-prop-table">
                        ${ratioSummary}
                    </table>
                </div>
            </div>

            <div class="fp-table-wrap">
                <table class="fp-source-table fp-mesh-table">
                    <thead><tr>
                        <th>Maillage</th><th>IJK</th><th>Taille de cellule dx × dy × dz</th><th>dx nominal</th><th>D*/dx</th><th>MPI_PROCESS</th>
                    </tr></thead>
                    <tbody>${resolutionRows || '<tr><td colspan="6">Aucune ligne &amp;MESH trouvée.</td></tr>'}</tbody>
                </table>
            </div>

            ${ifaceHtml}

            <div class="fp-grid-2 fp-mesh-parallel">
                <div>
                    <div class="fp-section-label">MPI</div>
                    <table class="fp-prop-table">
                        <tr><td>Affectations MPI_PROCESS</td><td>${mpiInfo.assignmentText}</td></tr>
                        <tr><td>Nombre de rangs MPI conseillé</td><td>${mpiInfo.rankText}</td></tr>
                    </table>
                </div>
                <div>
                    <div class="fp-section-label">OpenMP</div>
                    <table class="fp-prop-table">
                        <tr><td>Réglage des threads</td><td>${ompInfo.settingText}</td></tr>
                        <tr><td>Remarque</td><td>${ompInfo.note}</td></tr>
                    </table>
                </div>
            </div>

            ${codeBlock('Code FDS &MESH', (data.meshes || []).map(rawOf))}

            <div class="fp-note fp-bottom-note">
                Le diamètre caractéristique du feu et le rapport <strong>D*/dx</strong> sont de bons premiers contrôles, mais ne prouvent pas que le
                maillage est adapté. Confirmez la taille de maille par une étude de sensibilité sur les grandeurs utiles au cas.
                <a href="https://fdstutorial.com/fds-mesh-sensitivity-analysis-example/" target="_blank" rel="noopener">Tutoriel d’étude de sensibilité au maillage</a> (en anglais).
            </div>
        </div>`;

    // Wire up Copy Summary button
    const copyBtn = document.getElementById('fp-copy-mesh');
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            const lines = [
                `Résumé des maillages FDS`,
                `========================`,
                `Maillages      : ${meshInfo.rows.length}`,
                `Cellules       : ${meshFormatCells(meshInfo.totalCells)}`,
                `Tailles        : ${meshFmtLength(meshInfo.minCell)} – ${meshFmtLength(meshInfo.maxCell)}`,
                `Déséquilibre   : ${imbalance.text}`,
                `HRR max.       : ${peakText}`,
                `D*             : ${dStarText}`,
                `Plage D*/dx    : ${ratioRangeText}`,
                ``,
                `Détail par maillage :`,
                meshInfo.rows.map(r =>
                    `  ${r.id}: IJK=${r.ijk.join('×')}  dx=${r.cellX.toFixed(4)} dy=${r.cellY.toFixed(4)} dz=${r.cellZ.toFixed(4)} m  nominal=${r.nominalCell.toFixed(4)} m`
                ).join('\n'),
                ifaceIssues.length ? `\nProblèmes aux interfaces :\n` + ifaceIssues.map(iss =>
                    `  ${iss.meshA} ↔ ${iss.meshB}: face ${iss.axis}, rapport d${iss.dim.toLowerCase()} ${iss.ratio.toFixed(1)}×`
                ).join('\n') : '',
            ].filter(l => l !== undefined).join('\n');

            navigator.clipboard.writeText(lines).then(() => {
                copyBtn.textContent = 'Copié !';
                setTimeout(() => { copyBtn.textContent = 'Copier le résumé'; }, 1400);
            }).catch(() => {
                copyBtn.textContent = 'Échec de la copie';
                setTimeout(() => { copyBtn.textContent = 'Copier le résumé'; }, 1400);
            });
        });
    }
}

function meshAnalyzeMeshes(data) {
    const rows = (data.meshes || []).map((mesh, idx) => {
        const xb = mesh.xb || [0, 0, 0, 0, 0, 0];
        const ijk = mesh.ijk || [0, 0, 0];
        const spanX = Math.abs(xb[1] - xb[0]);
        const spanY = Math.abs(xb[3] - xb[2]);
        const spanZ = Math.abs(xb[5] - xb[4]);
        const cellX = ijk[0] ? spanX / ijk[0] : 0;
        const cellY = ijk[1] ? spanY / ijk[1] : 0;
        const cellZ = ijk[2] ? spanZ / ijk[2] : 0;
        const nominalCell = cellX > 0 && cellY > 0 && cellZ > 0
            ? Math.cbrt(cellX * cellY * cellZ)
            : Math.max(cellX, cellY, cellZ);
        const cells = (ijk[0] || 0) * (ijk[1] || 0) * (ijk[2] || 0);

        return {
            id: mesh.id || `Mesh_${idx + 1}`,
            ijk,
            cellX,
            cellY,
            cellZ,
            nominalCell,
            cells,
            mpiProcess: mesh._params ? mesh._params.MPI_PROCESS : null,
        };
    });

    const cellSizes = rows.map(row => row.nominalCell).filter(v => v > 0);
    return {
        rows,
        totalCells: rows.reduce((sum, row) => sum + row.cells, 0),
        minCell: cellSizes.length ? Math.min(...cellSizes) : 0,
        maxCell: cellSizes.length ? Math.max(...cellSizes) : 0,
    };
}

function meshEstimatePeakFireHRR(data) {
    let peakHRR = 0;
    const fireSurfs = Object.values(data.surfs || {}).filter(s =>
        s._params.HRRPUA != null || s._params.MLRPUA != null
    );

    fireSurfs.forEach(surf => {
        const hrrpua = Number(surf._params.HRRPUA);
        if (!isFinite(hrrpua) || hrrpua <= 0) return;

        const rampId = surf._params.RAMP_Q || surf._params.RAMP_MF;
        const ramp = rampId && data.ramps ? data.ramps[rampId] : null;
        const peakF = ramp && ramp.points && ramp.points.length
            ? Math.max(...ramp.points.map(pt => Number(pt.F)).filter(isFinite))
            : 1;

        const ventArea = (data.vents || [])
            .filter(v => meshSurfaceMatches(v.surf_id, surf.id))
            .reduce((sum, v) => sum + meshVentFaceArea(v), 0);

        const obstArea = (data.obsts || [])
            .filter(o => meshSurfaceMatches(o.surf_id, surf.id) ||
                         meshSurfaceMatches(o.surf_id6, surf.id) ||
                         meshSurfaceMatches(o.surf_ids, surf.id))
            .reduce((sum, o) => sum + meshBoxSurfaceArea(o.xb), 0);

        peakHRR += hrrpua * (ventArea + obstArea) * (isFinite(peakF) ? peakF : 1);
    });

    (data.inits || []).forEach(init => {
        const hrrpuv = init._params ? Number(init._params.HRRPUV) : 0;
        const volume = meshBoxVolume(init.xb);
        if (isFinite(hrrpuv) && hrrpuv > 0 && volume > 0) {
            peakHRR += hrrpuv * volume;
        }
    });

    return { peakHRR };
}

function meshCharacteristicFireDiameter(peakHRRkW, data) {
    const ambientC = data.misc && data.misc.TMPA != null ? Number(data.misc.TMPA) : 20;
    const ambientK = (isFinite(ambientC) ? ambientC : 20) + 273.15;
    const rho = 1.204 * 293.15 / ambientK;
    const cp = 1005;
    const g = 9.81;
    const qdotW = peakHRRkW * 1000;
    return Math.pow(qdotW / (rho * cp * ambientK * Math.sqrt(g)), 2 / 5);
}

function meshAnalyzeMPI(meshes) {
    const assignments = (meshes || [])
        .map(mesh => mesh._params ? mesh._params.MPI_PROCESS : null)
        .filter(v => v != null);
    const meshCount = meshes ? meshes.length : 0;

    if (!assignments.length) {
        const balanceText = meshDescribeCellBalance(meshes || []);
        return {
            assignmentText: meshCount > 1
                ? `MPI implicite : aucun <code>MPI_PROCESS</code> explicite, mais ${meshCount} maillages peuvent être répartis entre processus MPI.`
                : 'Aucune valeur <code>MPI_PROCESS</code> explicite.',
            rankText: meshCount > 1
                ? `Jusqu’à ${meshCount} rang${meshCount !== 1 ? 's' : ''} pour un maillage par rang ; avec moins de rangs, les maillages sont regroupés. ${balanceText}`
                : '—',
        };
    }

    const unique = [...new Set(assignments.map(String))].sort((a, b) => Number(a) - Number(b));
    const numeric = assignments.map(Number).filter(isFinite);
    const impliedRanks = numeric.length ? Math.max(...numeric) + 1 : unique.length;

    return {
        assignmentText: unique.map(v => `<code>${esc(v)}</code>`).join(', '),
        rankText: `${impliedRanks} rang${impliedRanks !== 1 ? 's' : ''} d’après les valeurs MPI_PROCESS`,
    };
}

function meshDescribeCellBalance(meshes) {
    const cellCounts = meshes
        .map(mesh => mesh.ijk ? (mesh.ijk[0] || 0) * (mesh.ijk[1] || 0) * (mesh.ijk[2] || 0) : 0)
        .filter(cells => cells > 0);
    if (!cellCounts.length) return '';

    const minCells = Math.min(...cellCounts);
    const maxCells = Math.max(...cellCounts);
    if (minCells === maxCells) {
        return `Charge équilibrée : ${meshFormatCells(minCells)} cellules par maillage.`;
    }

    return `Charge de ${meshFormatCells(minCells)} à ${meshFormatCells(maxCells)} cellules par maillage.`;
}

function meshAnalyzeOpenMP(data) {
    const found = meshFindThreadSetting(data);
    if (found) {
        return {
            settingText: `<code>${esc(found.key)}</code> = ${esc(found.value)}`,
            note: 'Le nombre de threads figure dans le fichier FDS.',
        };
    }

    return {
        settingText: 'Non précisé dans le fichier FDS',
        note: 'OpenMP se règle normalement hors du fichier .fds, par exemple avec OMP_NUM_THREADS ou le script de lancement.',
    };
}

function meshFindThreadSetting(data) {
    const candidates = ['OMP_NUM_THREADS', 'OPENMP_THREADS', 'N_THREADS', 'NUM_THREADS', 'N_OPENMP_THREADS'];
    const groups = [data.misc || {}, data.head || {}];
    for (const group of groups) {
        for (const key of candidates) {
            if (group[key] != null) return { key, value: group[key] };
        }
    }
    return null;
}

function meshSurfaceMatches(value, id) {
    if (!value || !id) return false;
    const values = Array.isArray(value) ? value : [value];
    return values.includes(id);
}

function meshVentFaceArea(vent) {
    if (!vent.xb) return 0;
    const [x1, x2, y1, y2, z1, z2] = vent.xb;
    const dx = Math.abs(x2 - x1), dy = Math.abs(y2 - y1), dz = Math.abs(z2 - z1);
    const dims = [dx, dy, dz].sort((a, b) => a - b);
    return dims[1] * dims[2];
}

function meshBoxSurfaceArea(xb) {
    if (!xb) return 0;
    const dx = Math.abs(xb[1] - xb[0]);
    const dy = Math.abs(xb[3] - xb[2]);
    const dz = Math.abs(xb[5] - xb[4]);
    const positive = [dx, dy, dz].filter(v => v > 0);
    if (positive.length < 2) return 0;
    if (positive.length === 2) return positive[0] * positive[1];
    return 2 * (dx * dy + dx * dz + dy * dz);
}

function meshBoxVolume(xb) {
    if (!xb) return 0;
    return Math.abs(xb[1] - xb[0]) * Math.abs(xb[3] - xb[2]) * Math.abs(xb[5] - xb[4]);
}

function meshFmtDims(ijk) {
    return Array.isArray(ijk) ? ijk.map(v => Number(v).toLocaleString()).join(' × ') : '—';
}

function meshFmtLength(v) {
    const n = Number(v);
    if (!isFinite(n) || n <= 0) return '—';
    if (n < 0.01) return `${(n * 1000).toFixed(1)} mm`;
    return `${n.toFixed(3)} m`;
}

function meshFormatCells(cells) {
    if (!cells) return '—';
    if (cells >= 1000000) return `${(cells / 1000000).toFixed(2)} M`;
    if (cells >= 1000) return `${(cells / 1000).toFixed(0)} k`;
    return cells.toLocaleString();
}

function meshResolutionBadge(ratio) {
    const category = meshResolutionCategory(ratio);
    return `<span class="fp-badge ${category.cls}">${ratio.toFixed(1)} · ${category.label}</span>`;
}

function meshResolutionCategory(ratio) {
    if (ratio < 4)  return { key: 'below',  label: 'Sous grossier', cls: 'fp-badge-res-bad' };
    if (ratio < 10) return { key: 'coarse', label: 'Grossier',     cls: 'fp-badge-res-coarse' };
    if (ratio < 16) return { key: 'medium', label: 'Moyen',        cls: 'fp-badge-res-medium' };
    return             { key: 'fine',   label: 'Fin',          cls: 'fp-badge-res-fine' };
}

function meshResolutionSummary(ratios) {
    if (!ratios.length) {
        return '<tr><td>Classement D*/dx</td><td>Indisponible sans estimation du HRR</td></tr>';
    }

    const counts = { below: 0, coarse: 0, medium: 0, fine: 0 };
    ratios.forEach(ratio => {
        counts[meshResolutionCategory(ratio).key]++;
    });

    return [
        ['Sous grossier', counts.below],
        ['Grossier', counts.coarse],
        ['Moyen', counts.medium],
        ['Fin', counts.fine],
    ].map(([label, count]) => `<tr><td>${label}</td><td>${count} maillage${count !== 1 ? 's' : ''}</td></tr>`).join('');
}

// ─── Mesh load imbalance ────────────────────────────────────────────────────

/**
 * Returns the ratio of the largest to smallest mesh cell count.
 * A ratio > 2 means MPI ranks will have very unequal workloads.
 */
function meshAnalyzeImbalance(meshes) {
    const cellCounts = (meshes || [])
        .map(m => m.ijk ? m.ijk[0] * m.ijk[1] * m.ijk[2] : 0)
        .filter(c => c > 0);

    if (cellCounts.length < 2) {
        return { ratio: 1, ok: true, text: cellCounts.length === 1 ? '—  (maillage unique)' : '—' };
    }

    const minC = Math.min(...cellCounts);
    const maxC = Math.max(...cellCounts);
    const ratio = maxC / minC;
    return {
        ratio,
        ok: ratio <= 2,
        text: `${ratio.toFixed(1)}×  (${meshFormatCells(minC)} – ${meshFormatCells(maxC)} cellules)`,
    };
}

// ─── Mesh interface compatibility check ────────────────────────────────────

/**
 * Finds pairs of meshes that share a face and checks whether the cell sizes
 * in the two transverse directions are within a 2:1 ratio.
 * FDS requires abutting meshes to have compatible cell sizes at their shared
 * boundary — large mismatches cause mass-conservation errors.
 */
function meshFindInterfaceIssues(meshes) {
    const tol = 1e-4;
    const issues = [];
    if (!meshes || meshes.length < 2) return issues;

    // Pre-compute per-mesh cell sizes
    const infos = meshes.map(m => {
        if (!m.xb || !m.ijk) return null;
        const [x1, x2, y1, y2, z1, z2] = m.xb;
        const [I, J, K] = m.ijk;
        return {
            id:  m.id || '?',
            xb:  m.xb,
            dx:  I > 0 ? Math.abs(x2 - x1) / I : 0,
            dy:  J > 0 ? Math.abs(y2 - y1) / J : 0,
            dz:  K > 0 ? Math.abs(z2 - z1) / K : 0,
        };
    });

    for (let i = 0; i < infos.length; i++) {
        for (let j = i + 1; j < infos.length; j++) {
            const a = infos[i], b = infos[j];
            if (!a || !b) continue;

            const [ax1, ax2, ay1, ay2, az1, az2] = a.xb;
            const [bx1, bx2, by1, by2, bz1, bz2] = b.xb;

            // For each axis, check if the two meshes share a face
            // (one mesh's max == the other's min along that axis)
            // AND that they actually overlap in the other two axes.
            const faceChecks = [
                {
                    axis: 'X',
                    shared: Math.abs(ax2 - bx1) < tol || Math.abs(bx2 - ax1) < tol,
                    ovlp1: Math.min(ay2, by2) - Math.max(ay1, by1),
                    ovlp2: Math.min(az2, bz2) - Math.max(az1, bz1),
                    transverse: [
                        { name: 'Y', a: a.dy, b: b.dy },
                        { name: 'Z', a: a.dz, b: b.dz },
                    ],
                },
                {
                    axis: 'Y',
                    shared: Math.abs(ay2 - by1) < tol || Math.abs(by2 - ay1) < tol,
                    ovlp1: Math.min(ax2, bx2) - Math.max(ax1, bx1),
                    ovlp2: Math.min(az2, bz2) - Math.max(az1, bz1),
                    transverse: [
                        { name: 'X', a: a.dx, b: b.dx },
                        { name: 'Z', a: a.dz, b: b.dz },
                    ],
                },
                {
                    axis: 'Z',
                    shared: Math.abs(az2 - bz1) < tol || Math.abs(bz2 - az1) < tol,
                    ovlp1: Math.min(ax2, bx2) - Math.max(ax1, bx1),
                    ovlp2: Math.min(ay2, by2) - Math.max(ay1, by1),
                    transverse: [
                        { name: 'X', a: a.dx, b: b.dx },
                        { name: 'Y', a: a.dy, b: b.dy },
                    ],
                },
            ];

            for (const fc of faceChecks) {
                if (!fc.shared || fc.ovlp1 <= tol || fc.ovlp2 <= tol) continue;

                // Check transverse cell sizes at this shared face
                for (const t of fc.transverse) {
                    if (t.a <= 0 || t.b <= 0) continue;
                    const ratio = Math.max(t.a, t.b) / Math.min(t.a, t.b);
                    if (ratio > 2 + tol) {
                        issues.push({
                            meshA: a.id, meshB: b.id,
                            axis:  fc.axis,
                            dim:   t.name,
                            cellA: t.a, cellB: t.b,
                            ratio,
                        });
                        break; // one warning per interface pair
                    }
                }
                break; // meshes can only share one face axis
            }
        }
    }

    return issues;
}
