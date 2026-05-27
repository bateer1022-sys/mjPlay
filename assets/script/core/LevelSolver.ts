import { TileModel, getTileKind } from '../model/TileModel';
import { LevelConfig, LevelSlot } from '../model/LevelConfig';
import { isFree } from './BoardRule';

function shuffleArray(arr: string[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
    }
}

function shuffleIndices(arr: number[][] | number[]): void {
    const list = arr as number[][];
    for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = list[i];
        list[i] = list[j];
        list[j] = tmp;
    }
}

function makeTempTile(id: number, slot: LevelSlot, key: string): TileModel {
    return {
        id: id,
        key: key,
        kind: getTileKind(key),
        layer: slot.layer,
        x: slot.x,
        y: slot.y,
        removed: false,
        free: true,
        covered: false,
        node: null,
    };
}

function collectFreeIndices(
    cfg: LevelConfig,
    keys: (string | null)[],
    placed: TileModel[]
): number[] {
    const list: number[] = [];
    for (let i = 0; i < cfg.slots.length; i++) {
        if (keys[i]) continue;
        const probe = makeTempTile(i, cfg.slots[i], 'w1');
        if (isFree(probe, placed, cfg)) list.push(i);
    }
    return list;
}

function sortFreeByLayerDesc(indices: number[], cfg: LevelConfig): void {
    indices.sort((a, b) => cfg.slots[b].layer - cfg.slots[a].layer);
}

/** 反向构造：每步尝试所有可放对子，回溯保证能放满 */
function tryBuildKeys(
    cfg: LevelConfig,
    keys: (string | null)[],
    placed: TileModel[],
    pool: string[],
    poolIndex: number,
    nodes: { n: number },
    nodeLimit: number
): boolean {
    if (poolIndex >= pool.length) return true;
    if (nodes.n++ > nodeLimit) return false;

    const freeIndices = collectFreeIndices(cfg, keys, placed);
    if (freeIndices.length < 2) return false;
    sortFreeByLayerDesc(freeIndices, cfg);

    const pairs: number[][] = [];
    for (let a = 0; a < freeIndices.length; a++) {
        for (let b = a + 1; b < freeIndices.length; b++) {
            pairs.push([freeIndices[a], freeIndices[b]]);
        }
    }
    shuffleIndices(pairs);
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

/**
 * 反向构造可解牌面（保证存在一条按自由牌顺序的消牌路径）
 */
export function generateSolvableKeys(cfg: LevelConfig): string[] | null {
    const slotCount = cfg.slots.length;
    const pairCount = Math.floor(slotCount / 2);
    if (pairCount * 2 !== slotCount) return null;

    const nodeLimit = Math.max(500000, pairCount * pairCount * 8000);

    for (let attempt = 0; attempt < 80; attempt++) {
        const keys: (string | null)[] = new Array(slotCount);
        for (let i = 0; i < slotCount; i++) keys[i] = null;
        const placed: TileModel[] = [];

        const pool: string[] = [];
        for (let i = 0; i < pairCount; i++) {
            pool.push(cfg.keyPool[i % cfg.keyPool.length]);
        }
        shuffleArray(pool);

        const nodes = { n: 0 };
        if (tryBuildKeys(cfg, keys, placed, pool, 0, nodes, nodeLimit)) {
            const result: string[] = new Array(slotCount);
            for (let i = 0; i < slotCount; i++) result[i] = keys[i] as string;
            return result;
        }
    }
    return null;
}
