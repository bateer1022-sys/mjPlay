import { TileModel } from '../model/TileModel';
import { TileKind } from '../model/TileModelKinds';

export function canMatch(a: TileModel, b: TileModel): boolean {
    if (a.removed || b.removed || a.id === b.id) return false;
    if (a.kind === TileKind.Flower && b.kind === TileKind.Flower) return true;
    if (a.kind === TileKind.Season && b.kind === TileKind.Season) return true;
    return a.key === b.key;
}
