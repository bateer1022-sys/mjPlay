/**
 * 关卡布局生成
 * node tools/build-playable-layout.js          — 默认生成 24 张迷你可解关卡
 * node tools/build-playable-layout.js trial    — 同默认（24 张）
 * node tools/build-playable-layout.js heart    — 双层心形 50
 * node tools/build-playable-layout.js playable — 试玩包三层 96
 * node tools/build-playable-layout.js turtle   — 三层玄龟 50
 * node tools/build-playable-layout.js dual2x8  — 6×8 底 + 对称双 2×8 顶（80）
 */
const fs = require('fs');
const path = require('path');
const { generateSolvableKeys } = require('./level-solver');
const { execSync } = require('child_process');

const L0_X = [-190, -102, -14, 74, 162];
const L0_Y = [242, 130, 18, -94, -206];
const L1_DX = 44;
const L1_DY = -56;
/** 心形两侧外扩 1 列（更胖、更像心） */
const WING_X = [L0_X[0] - 88, L0_X[4] + 88];

/**
 * 24 格心形轮廓（顶行中间留空 = 双凸）
 *   X X   X X
 *  X X X X X
 *  X X X X X
 *  X X X X X
 * X  X X X  X
 *     X
 */
function buildHeartMask24() {
    const cells = [];
    for (const c of [0, 1, 3, 4]) {
        cells.push([c, 0]);
    }
    for (let r = 1; r <= 3; r++) {
        for (let c = 0; c < 5; c++) {
            cells.push([c, r]);
        }
    }
    cells.push([2, 4]);
    cells.push([0, 4], [4, 4], [1, 4], [3, 4]);
    const seen = new Set();
    const out = [];
    for (const [c, r] of cells) {
        const k = c + ',' + r;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push([c, r]);
    }
    if (out.length !== 24) {
        throw new Error('Heart mask size ' + out.length + ', expected 24');
    }
    return out;
}

function l0Pos(col, row) {
    return { layer: 0, x: L0_X[col], y: L0_Y[row] };
}

function l1PosFromL0(col, row) {
    return { layer: 1, x: L0_X[col] + L1_DX, y: L0_Y[row] + L1_DY };
}

/** 双层心形：24 格心形 + 两侧各 1 格 ×2 层（共 50） */
function buildHeart2Layer50Slots() {
    const mask = buildHeartMask24();
    const slots = [];
    for (const [col, row] of mask) {
        slots.push(l0Pos(col, row));
        slots.push(l1PosFromL0(col, row));
    }
    slots.push({ layer: 0, x: WING_X[0], y: L0_Y[1] });
    slots.push({ layer: 1, x: WING_X[0] + L1_DX, y: L0_Y[1] + L1_DY });
    return slots;
}

/** 试玩紧凑：左右各 2 列 × 5 行 × 3 层（共 30，易解不死局） */
function buildTrial30Slots() {
    const L0_X = [-102, 74];
    const L1_X = [-58, 118];
    const ROW_Y = [242, 130, 18, -94, -206];
    const slots = [];
    for (const y of ROW_Y) {
        for (const x of L0_X) slots.push({ layer: 0, x, y });
        for (const x of L1_X) slots.push({ layer: 1, x, y });
    }
    for (let i = 0; i < ROW_Y.length; i++) {
        const y2 = ROW_Y[i] + (i % 2 === 0 ? -4 : 4);
        for (const x of L1_X) slots.push({ layer: 2, x, y: y2 });
    }
    return slots;
}

/** 试玩广告包：左右各 4×8 列，三层 stagger（共 96） */
function buildPlayable96Slots() {
    const L0_X = [-218, -42, 42, 218];
    const L1_X = [-174, -86, 86, 174];
    const L0_Y = [-346, -234, -106, 6, 134, 246, 374, 486];
    const slots = [];
    for (const y of L0_Y) {
        for (const x of L0_X) {
            slots.push({ layer: 0, x, y });
        }
    }
    for (const y of L0_Y) {
        for (const x of L1_X) {
            slots.push({ layer: 1, x, y });
        }
    }
    for (let i = 0; i < L0_Y.length; i++) {
        const y2 = L0_Y[i] + (i % 2 === 0 ? -4 : 4);
        for (const x of L1_X) {
            slots.push({ layer: 2, x, y: y2 });
        }
    }
    return slots;
}

function buildTurtle50Slots() {
    const L1_X = [-146, -58, 118, 206];
    const L1_Y = [186, 74, -38, -150];
    const L2_X3 = [-102, -14, 74];
    const L2_Y3 = [242, 130, 18];
    const slots = [];
    for (const y of L0_Y) {
        for (const x of L0_X) {
            slots.push({ layer: 0, x, y });
        }
    }
    for (const y of L1_Y) {
        for (const x of L1_X) {
            slots.push({ layer: 1, x, y });
        }
    }
    for (const y of L2_Y3) {
        for (const x of L2_X3) {
            slots.push({ layer: 2, x, y });
        }
    }
    return slots;
}

function tilesOverlap(a, b, cfg) {
    if (a.id === b.id || a.layer === b.layer) return false;
    const dx = Math.abs(a.x - b.x);
    const dy = Math.abs(a.y - b.y);
    const ox = cfg.overlapX > 0 ? cfg.overlapX : cfg.tileW * 0.5;
    const oy = cfg.overlapY > 0 ? cfg.overlapY : cfg.tileH * 0.5;
    return dx < ox && dy < oy;
}

function isCoveredByPosition(tile, board, cfg) {
    for (const o of board) {
        if (o.removed || o.id === tile.id) continue;
        if (o.layer <= tile.layer) continue;
        if (tilesOverlap(tile, o, cfg)) return true;
    }
    return false;
}

function isSameRow(a, b, cfg) {
    return Math.abs(a.y - b.y) < cfg.tileH * 0.35;
}

function isHorizontalNeighbor(tile, other, cfg) {
    if (tile.layer !== other.layer) return false;
    if (!isSameRow(tile, other, cfg)) return false;
    const dx = Math.abs(tile.x - other.x);
    return dx >= cfg.tileW * 0.85 && dx <= cfg.tileW * 1.15;
}

function hasSideBlock(tile, board, side, cfg) {
    for (const o of board) {
        if (o.removed || o.id === tile.id) continue;
        if (!isHorizontalNeighbor(tile, o, cfg)) continue;
        if (side === 'left' && o.x < tile.x) return true;
        if (side === 'right' && o.x > tile.x) return true;
    }
    return false;
}

function isFree(tile, board, cfg) {
    if (tile.removed) return false;
    if (isCoveredByPosition(tile, board, cfg)) return false;
    return !hasSideBlock(tile, board, 'left', cfg) || !hasSideBlock(tile, board, 'right', cfg);
}

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

const mode = (process.argv[2] || 'trial').toLowerCase();
let slots;
let expectCount;
if (mode === 'turtle') {
    slots = buildTurtle50Slots();
    expectCount = 50;
} else if (mode === 'heart') {
    slots = buildHeart2Layer50Slots();
    expectCount = 50;
} else if (mode === 'playable') {
    slots = buildPlayable96Slots();
    expectCount = 96;
} else if (mode === 'dual2x8') {
    try {
        execSync('node tools/build-dual2x8-layer.js', { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
        process.exit(0);
    } catch (e) {
        process.exit(1);
    }
} else {
    try {
        execSync('node tools/fix-level-mini.js', { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
        process.exit(0);
    } catch (e) {
        process.exit(1);
    }
}

if (slots.length !== expectCount) {
    console.error('Slot count must be ' + expectCount + ', got', slots.length, mode);
    process.exit(1);
}

const keyPool = expectCount >= 96
    ? [
        'w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8', 'w9',
        't1', 't2', 't3', 't4', 't5', 't6', 't7', 't8',
        'b1', 'b2', 'b3', 'b4', 'b5', 'b6',
    ]
    : [
        'w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8', 'w9',
        't1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9',
        'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'b9',
    ];
const cfg = {
    tileW: 85,
    tileH: 106,
    overlapX: 47,
    overlapY: 58,
    displayScale: 0.5,
    colStep: 88,
    rowStep: 118,
    keyPool,
    slots,
};

const keys = generateSolvableKeys(cfg, 120);
if (!keys) {
    console.error('Failed to find solvable keys for', mode);
    process.exit(1);
}

const target = path.join(__dirname, '../assets/resources/data/level_01.json');
fs.writeFileSync(target, JSON.stringify({ ...cfg, slots, keys }, null, 2) + '\n');
const layers = {};
slots.forEach((s) => { layers[s.layer] = (layers[s.layer] || 0) + 1; });
if (mode === 'heart') {
    const g = Array(5).fill(0).map(() => Array(5).fill('.'));
    buildHeartMask24().forEach(([c, r]) => { g[r][c] = 'X'; });
    console.log('heart (row0=屏幕上方, 中间留空=双凸):');
    g.reverse().forEach((row) => console.log(' ' + row.join(' ')));
}
console.log('OK', mode, { count: slots.length, layers });
