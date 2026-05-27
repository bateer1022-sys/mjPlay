import { isValid } from '../is-valid';
import { TileModel } from '../model/TileModel';
import { canMatch } from './MatchRule';

export interface HintPair {
    a: TileModel;
    b: TileModel;
}

export function findHint(board: TileModel[]): HintPair | null {
    const freeTiles: TileModel[] = [];
    for (let i = 0; i < board.length; i++) {
        if (!board[i].removed && board[i].free) freeTiles.push(board[i]);
    }
    for (let i = 0; i < freeTiles.length; i++) {
        for (let j = i + 1; j < freeTiles.length; j++) {
            if (canMatch(freeTiles[i], freeTiles[j])) {
                return { a: freeTiles[i], b: freeTiles[j] };
            }
        }
    }
    return null;
}

/** 结算前扫尾：在剩余牌中贪心配对（不要求 free，用于快速自动消除） */
export function collectRemainingMatchPairs(board: TileModel[]): HintPair[] {
    const active: TileModel[] = [];
    for (let i = 0; i < board.length; i++) {
        const t = board[i];
        if (!t.removed && t.node && isValid(t.node)) {
            active.push(t);
        }
    }
    const used = new Set<number>();
    const pairs: HintPair[] = [];
    for (let i = 0; i < active.length; i++) {
        const a = active[i];
        if (used.has(a.id)) {
            continue;
        }
        for (let j = i + 1; j < active.length; j++) {
            const b = active[j];
            if (used.has(b.id)) {
                continue;
            }
            if (canMatch(a, b)) {
                pairs.push({ a, b });
                used.add(a.id);
                used.add(b.id);
                break;
            }
        }
    }
    return pairs;
}
