/**
 * 在 6×8 底层上增加对称的两个 2×8 上层组，并写出可解 level_01.json
 * node tools/build-dual2x8-layer.js
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

let solveNodes = 0;
const SOLVE_NODE_CAP = 800000;

function solve(board, cfg) {
    if (solveNodes++ > SOLVE_NODE_CAP) return false;
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
    const tryN = Math.min(pairs.length, 24);
    for (let pi = 0; pi < tryN; pi++) {
        const [a, b] = pairs[pi];
        const next = board.map((t) => ({ ...t }));
        next[a].removed = true;
        next[b].removed = true;
        if (solve(next, cfg)) return true;
    }
    return false;
}

/** 底层 6×8 + 上层左右各 2×8（顶行抬高，次行压住底层顶行，向内错位叠放） */
function buildDual2x8Over6x8Slots() {
    const BASE_X = [-220, -132, -44, 44, 132, 220];
    const BASE_Y = [372, 254, 136, 18, -100, -218, -336, -454];
    const COL_STEP = 88;
    const L1_Y = [490, 372];
    const L1_CX = [-88, 88];
    const L1_DX = 44;

    const slots = [];
    for (const y of BASE_Y) {
        for (const x of BASE_X) {
            slots.push({ layer: 0, x, y });
        }
    }
    for (const cx of L1_CX) {
        const dx = cx < 0 ? L1_DX : -L1_DX;
        for (const y of L1_Y) {
            for (let i = 0; i < 8; i++) {
                slots.push({
                    layer: 1,
                    x: cx + (i - 3.5) * COL_STEP + dx,
                    y,
                });
            }
        }
    }
    return slots;
}

function findKeys(cfg, slots, maxAttempts) {
    const pairCount = slots.length / 2;
    const pool = [];
    for (let i = 0; i < pairCount; i++) {
        pool.push(cfg.keyPool[i % cfg.keyPool.length]);
    }
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        solveNodes = 0;
        const bag = [];
        for (let i = 0; i < pairCount; i++) {
            bag.push(pool[i], pool[i]);
        }
        shuffle(bag);
        if (solve(buildBoard(slots, bag, cfg), cfg)) return bag;
    }
    return null;
}

const slots = buildDual2x8Over6x8Slots();
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

const t0 = Date.now();
const keys = findKeys(cfg, slots, 3000);
if (!keys) {
    console.error('Failed to find solvable keys for dual 2x8 (80 tiles)');
    process.exit(1);
}

const target = path.join(__dirname, '../assets/resources/data/level_01.json');
fs.writeFileSync(target, JSON.stringify({ ...cfg, slots, keys }, null, 2) + '\n');
const layers = {};
slots.forEach((s) => { layers[s.layer] = (layers[s.layer] || 0) + 1; });
console.log('OK dual2x8', { count: slots.length, layers, ms: Date.now() - t0 });
