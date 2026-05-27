/** Node 复现 LevelSolver + BoardRule（坐标判定） */
function tilesOverlap(a, b, cfg) {
    if (a.id === b.id || a.layer === b.layer) return false;
    const dx = Math.abs(a.x - b.x);
    const dy = Math.abs(a.y - b.y);
    const ox = cfg.overlapX > 0 ? cfg.overlapX : cfg.tileW * 0.5;
    const oy = cfg.overlapY > 0 ? cfg.overlapY : cfg.tileH * 0.5;
    return dx < ox && dy < oy;
}

function isCoveredByPosition(tile, board, cfg) {
    for (let i = 0; i < board.length; i++) {
        const other = board[i];
        if (other.removed || other.id === tile.id) continue;
        if (other.layer <= tile.layer) continue;
        if (tilesOverlap(tile, other, cfg)) return true;
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
    for (let i = 0; i < board.length; i++) {
        const other = board[i];
        if (other.removed || other.id === tile.id) continue;
        if (!isHorizontalNeighbor(tile, other, cfg)) continue;
        if (side === 'left' && other.x < tile.x) return true;
        if (side === 'right' && other.x > tile.x) return true;
    }
    return false;
}

function isFree(tile, board, cfg) {
    if (tile.removed) return false;
    if (isCoveredByPosition(tile, board, cfg)) return false;
    return !hasSideBlock(tile, board, 'left', cfg) || !hasSideBlock(tile, board, 'right', cfg);
}

function makeTempTile(id, slot, key) {
    return {
        id, key, layer: slot.layer, x: slot.x, y: slot.y,
        removed: false, free: true, covered: false, node: null,
    };
}

function collectFreeIndices(cfg, keys, placed) {
    const list = [];
    for (let i = 0; i < cfg.slots.length; i++) {
        if (keys[i]) continue;
        if (isFree(makeTempTile(i, cfg.slots[i], 'w1'), placed, cfg)) list.push(i);
    }
    return list;
}

function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

function shufflePairs(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

function tryBuildKeys(cfg, keys, placed, pool, poolIndex, nodes, nodeLimit) {
    if (poolIndex >= pool.length) return true;
    if (nodes.n++ > nodeLimit) return false;

    const freeIndices = collectFreeIndices(cfg, keys, placed);
    if (freeIndices.length < 2) return false;
    freeIndices.sort((a, b) => cfg.slots[b].layer - cfg.slots[a].layer);

    const pairs = [];
    for (let a = 0; a < freeIndices.length; a++) {
        for (let b = a + 1; b < freeIndices.length; b++) {
            pairs.push([freeIndices[a], freeIndices[b]]);
        }
    }
    shufflePairs(pairs);
    const tryPairs = pairs.length > 48 ? pairs.slice(0, 48) : pairs;

    const key = pool[poolIndex];
    for (let pi = 0; pi < tryPairs.length; pi++) {
        const i1 = tryPairs[pi][0];
        const i2 = tryPairs[pi][1];
        keys[i1] = key;
        keys[i2] = key;
        placed.push(makeTempTile(i1, cfg.slots[i1], key));
        placed.push(makeTempTile(i2, cfg.slots[i2], key));

        if (tryBuildKeys(cfg, keys, placed, pool, poolIndex + 1, nodes, nodeLimit)) {
            return true;
        }

        keys[i1] = null;
        keys[i2] = null;
        placed.pop();
        placed.pop();
    }
    return false;
}

function generateSolvableKeys(cfg, maxAttempts) {
    const slotCount = cfg.slots.length;
    const pairCount = Math.floor(slotCount / 2);
    if (pairCount * 2 !== slotCount) return null;

    const attempts = maxAttempts || 80;
    const nodeLimit = Math.max(500000, pairCount * pairCount * 8000);

    for (let attempt = 0; attempt < attempts; attempt++) {
        const keys = new Array(slotCount);
        for (let i = 0; i < slotCount; i++) keys[i] = null;
        const placed = [];
        const pool = [];
        for (let i = 0; i < pairCount; i++) {
            pool.push(cfg.keyPool[i % cfg.keyPool.length]);
        }
        shuffleArray(pool);

        const nodes = { n: 0 };
        if (tryBuildKeys(cfg, keys, placed, pool, 0, nodes, nodeLimit)) {
            return keys.slice();
        }
    }
    return null;
}

module.exports = { generateSolvableKeys };
