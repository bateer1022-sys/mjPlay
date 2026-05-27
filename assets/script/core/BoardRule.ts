import { isValid } from '../is-valid';
import { TileModel } from '../model/TileModel';
import { LevelConfig } from '../model/LevelConfig';

function rectsOverlap(a: cc.Rect, b: cc.Rect): boolean {
    return a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y;
}

/** 仅不同层之间才算上下遮挡（同层绝不重叠） */
export function tilesOverlap(a: TileModel, b: TileModel, cfg: LevelConfig): boolean {
    if (a.id === b.id || a.layer === b.layer) return false;
    const dx = Math.abs(a.x - b.x);
    const dy = Math.abs(a.y - b.y);
    const ox = cfg.overlapX > 0 ? cfg.overlapX : cfg.tileW * 0.5;
    const oy = cfg.overlapY > 0 ? cfg.overlapY : cfg.tileH * 0.5;
    return dx < ox && dy < oy;
}

/** 关卡求解等无节点时：按布局坐标判断上层是否重合 */
export function isCoveredByPosition(tile: TileModel, board: TileModel[], cfg: LevelConfig): boolean {
    for (let i = 0; i < board.length; i++) {
        const other = board[i];
        if (other.removed || other.id === tile.id) continue;
        if (other.layer <= tile.layer) continue;
        if (tilesOverlap(tile, other, cfg)) return true;
    }
    return false;
}

/** 有节点时：按世界坐标包围盒判断上层是否与该牌有面积重叠 */
export function isCoveredByNodes(tile: TileModel, board: TileModel[]): boolean {
    if (!tile.node || !isValid(tile.node)) return false;
    const box = tile.node.getBoundingBoxToWorld();
    for (let i = 0; i < board.length; i++) {
        const other = board[i];
        if (other.removed || other.id === tile.id) continue;
        if (other.layer <= tile.layer) continue;
        if (!other.node || !isValid(other.node)) continue;
        const otherBox = other.node.getBoundingBoxToWorld();
        if (rectsOverlap(box, otherBox)) return true;
    }
    return false;
}

/** 运行时用坐标判定遮挡，避免 48 张牌反复 getBoundingBoxToWorld 卡死 */
export function isCovered(tile: TileModel, board: TileModel[], cfg: LevelConfig): boolean {
    if (tile.removed) return false;
    return isCoveredByPosition(tile, board, cfg);
}

/** 同一行：纵向偏差小于半张牌高 */
function isSameRow(a: TileModel, b: TileModel, cfg: LevelConfig): boolean {
    return Math.abs(a.y - b.y) < cfg.tileH * 0.35;
}

function isHorizontalNeighbor(tile: TileModel, other: TileModel, cfg: LevelConfig): boolean {
    if (tile.layer !== other.layer) return false;
    if (!isSameRow(tile, other, cfg)) return false;
    const dx = Math.abs(tile.x - other.x);
    const minGap = cfg.tileW * 0.85;
    const maxGap = cfg.tileW * 1.15;
    return dx >= minGap && dx <= maxGap;
}

export function hasSideBlock(tile: TileModel, board: TileModel[], side: 'left' | 'right', cfg: LevelConfig): boolean {
    return getSideNeighbor(tile, board, side, cfg) !== null;
}

/** 同层左右紧邻挡牌（取距离最近的一张） */
export function getSideNeighbor(
    tile: TileModel,
    board: TileModel[],
    side: 'left' | 'right',
    cfg: LevelConfig
): TileModel | null {
    let best: TileModel = null;
    let bestDx = Infinity;
    for (let i = 0; i < board.length; i++) {
        const other = board[i];
        if (other.removed || other.id === tile.id) continue;
        if (!isHorizontalNeighbor(tile, other, cfg)) continue;
        if (side === 'left' && other.x >= tile.x) continue;
        if (side === 'right' && other.x <= tile.x) continue;
        const dx = Math.abs(other.x - tile.x);
        if (dx < bestDx) {
            bestDx = dx;
            best = other;
        }
    }
    return best;
}

export function isBothSidesBlocked(tile: TileModel, board: TileModel[], cfg: LevelConfig): boolean {
    return (
        getSideNeighbor(tile, board, 'left', cfg) !== null &&
        getSideNeighbor(tile, board, 'right', cfg) !== null
    );
}

/** 压在该牌上的所有上层牌 */
export function getCoveringTiles(tile: TileModel, board: TileModel[], cfg: LevelConfig): TileModel[] {
    const list: TileModel[] = [];
    for (let i = 0; i < board.length; i++) {
        const other = board[i];
        if (other.removed || other.id === tile.id) continue;
        if (other.layer <= tile.layer) continue;
        if (tilesOverlap(tile, other, cfg)) list.push(other);
    }
    return list;
}

export function isFree(tile: TileModel, board: TileModel[], cfg: LevelConfig): boolean {
    if (tile.removed) return false;
    if (isCovered(tile, board, cfg)) return false;
    const leftBlocked = hasSideBlock(tile, board, 'left', cfg);
    const rightBlocked = hasSideBlock(tile, board, 'right', cfg);
    return !leftBlocked || !rightBlocked;
}

export function isFullyExposed(tile: TileModel, board: TileModel[], cfg: LevelConfig): boolean {
    if (tile.removed) return false;
    if (isCovered(tile, board, cfg)) return false;
    if (hasSideBlock(tile, board, 'left', cfg)) return false;
    if (hasSideBlock(tile, board, 'right', cfg)) return false;
    return true;
}

export function refreshTileStates(board: TileModel[], cfg: LevelConfig): void {
    for (let i = 0; i < board.length; i++) {
        const tile = board[i];
        if (tile.removed) {
            tile.covered = false;
            tile.free = false;
            continue;
        }
        tile.covered = isCovered(tile, board, cfg);
        tile.free = isFree(tile, board, cfg);
    }
}
