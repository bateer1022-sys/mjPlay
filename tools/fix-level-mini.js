/**
 * 生成 18 张迷你关卡（保证可解）
 * node tools/fix-level-mini.js
 */
const fs = require('fs');
const path = require('path');

function tilesOverlap(a, b, cfg) {
    if (a.id === b.id || a.layer === b.layer) return false;
    const dx = Math.abs(a.x - b.x);
    const dy = Math.abs(a.y - b.y);
    const ox = cfg.overlapX > 0 ? cfg.overlapX : cfg.tileW * 0.5;
    const oy = cfg.overlapY > 0 ? cfg.overlapY : cfg.tileH * 0.5;
    return dx < ox && dy < oy;
}

function isCovered(tile, board, cfg) {
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

function isHNeigh(tile, other, cfg) {
    if (tile.layer !== other.layer) return false;
    if (!isSameRow(tile, other, cfg)) return false;
    const dx = Math.abs(tile.x - other.x);
    return dx >= cfg.tileW * 0.85 && dx <= cfg.tileW * 1.15;
}

function hasSide(tile, board, side, cfg) {
    for (const o of board) {
        if (o.removed || o.id === tile.id) continue;
        if (!isHNeigh(tile, o, cfg)) continue;
        if (side === 'left' && o.x < tile.x) return true;
        if (side === 'right' && o.x > tile.x) return true;
    }
    return false;
}

function isFree(tile, board, cfg) {
    if (tile.removed) return false;
    if (isCovered(tile, board, cfg)) return false;
    return !hasSide(tile, board, 'left', cfg) || !hasSide(tile, board, 'right', cfg);
}

function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
}

function buildBoard(slots, keys, cfg) {
    return slots.map((s, id) => ({
        id, key: keys[id], layer: s.layer, x: s.x, y: s.y,
        removed: false, free: true, covered: false, node: null,
    }));
}

function solve(board, cfg) {
    const left = board.filter((t) => !t.removed).length;
    if (left === 0) return true;
    for (const t of board) {
        if (t.removed) { t.free = false; continue; }
        t.free = isFree(t, board, cfg);
    }
    const free = board.filter((t) => !t.removed && t.free);
    const pairs = [];
    for (let i = 0; i < free.length; i++) {
        for (let j = i + 1; j < free.length; j++) {
            if (free[i].key === free[j].key) pairs.push([free[i].id, free[j].id]);
        }
    }
    if (!pairs.length) return false;
    shuffle(pairs);
    for (const [a, b] of pairs) {
        const next = board.map((t) => ({ ...t }));
        next[a].removed = true;
        next[b].removed = true;
        if (solve(next, cfg)) return true;
    }
    return false;
}

/** 24 张：底层 4×3，中层错位 2×3，顶层 2×3 */
function buildMini24Slots() {
    const colStep = 88;
    const rowStep = 118;
    const cx = -14;
    const L0_X = [cx - colStep * 1.5, cx - colStep * 0.5, cx + colStep * 0.5, cx + colStep * 1.5];
    const L1_X = [(L0_X[0] + L0_X[1]) * 0.5, (L0_X[2] + L0_X[3]) * 0.5];
    const L2_X = [L0_X[1], L0_X[2]];
    const midY = 18;
    const Y = [midY + rowStep, midY, midY - rowStep];
    const slots = [];
    for (const y of Y) {
        for (const x of L0_X) slots.push({ layer: 0, x, y });
        for (const x of L1_X) slots.push({ layer: 1, x, y });
        for (const x of L2_X) slots.push({ layer: 2, x, y });
    }
    return slots;
}

function findKeys(cfg, slots) {
    const pairCount = slots.length / 2;
    const pool = [];
    for (let i = 0; i < pairCount; i++) {
        pool.push(cfg.keyPool[i % cfg.keyPool.length]);
    }
    for (let attempt = 0; attempt < 20000; attempt++) {
        const bag = [];
        for (let i = 0; i < pairCount; i++) {
            bag.push(pool[i], pool[i]);
        }
        shuffle(bag);
        if (solve(buildBoard(slots, bag, cfg), cfg)) return bag;
    }
    return null;
}

const slots = buildMini24Slots();
const keyPool = [
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

const t = Date.now();
const keys = findKeys(cfg, slots);
if (!keys) {
    console.error('FAIL mini24');
    process.exit(1);
}

const target = path.join(__dirname, '../assets/resources/data/level_01.json');
fs.writeFileSync(target, JSON.stringify({ ...cfg, slots, keys }, null, 2) + '\n');
console.log('OK mini24', { count: slots.length, ms: Date.now() - t });
