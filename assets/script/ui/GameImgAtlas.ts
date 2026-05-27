import { IMG_AUTO_ATLAS_PAC, IMG_DIR, TILE_ICON_PATH } from './GamePreloadConfig';

let cachedAtlas: cc.SpriteAtlas = null;
let atlasLoadPending: Array<(atlas: cc.SpriteAtlas | null) => void> = [];
const tileIconCache: { [key: string]: cc.SpriteFrame } = {};

/**
 * 预加载自动图集（构建后由 ui.pac 生成 SpriteAtlas；编辑器内仍可按子路径 load SpriteFrame）。
 */
export function preloadGameImgAtlas(onDone?: (atlas: cc.SpriteAtlas | null) => void): void {
    if (cachedAtlas) {
        if (onDone) {
            onDone(cachedAtlas);
        }
        return;
    }
    if (onDone) {
        atlasLoadPending.push(onDone);
    }
    cc.resources.load(IMG_AUTO_ATLAS_PAC, cc.SpriteAtlas, (err, atlas) => {
        if (!err && atlas) {
            cachedAtlas = atlas;
        }
        const pending = atlasLoadPending.slice();
        atlasLoadPending.length = 0;
        for (let i = 0; i < pending.length; i++) {
            pending[i](cachedAtlas);
        }
    });
}

/** 从图集或 resources 子路径加载 SpriteFrame（路径相对 resources，无扩展名） */
export function loadGameSpriteFrame(
    resPath: string,
    onReady: (frame: cc.SpriteFrame | null) => void
): void {
    const tryAtlas = (): void => {
        if (!cachedAtlas) {
            finishDirect();
            return;
        }
        const base = resPath.indexOf(IMG_DIR) === 0
            ? resPath.slice(IMG_DIR.length + 1)
            : resPath;
        const names = [base, base.split('/').pop() || base];
        for (let i = 0; i < names.length; i++) {
            const sf = cachedAtlas.getSpriteFrame(names[i]);
            if (sf) {
                onReady(sf);
                return;
            }
        }
        finishDirect();
    };

    const finishDirect = (): void => {
        cc.resources.load(resPath, cc.SpriteFrame, (err, sf) => {
            onReady(!err && sf ? sf : null);
        });
    };

    if (cachedAtlas) {
        tryAtlas();
        return;
    }
    preloadGameImgAtlas(() => tryAtlas());
}

/** 进局前批量预加载本关会用到的牌面图（写入缓存，开局不再逐个 load） */
export function preloadTileIconKeys(keys: string[], onDone: () => void): void {
    const unique: string[] = [];
    for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (k && unique.indexOf(k) === -1) {
            unique.push(k);
        }
    }
    if (unique.length === 0) {
        onDone();
        return;
    }

    let pending = unique.length;
    const finishOne = (): void => {
        pending--;
        if (pending <= 0) {
            onDone();
        }
    };

    preloadGameImgAtlas(() => {
        for (let i = 0; i < unique.length; i++) {
            const key = unique[i];
            if (tileIconCache[key]) {
                finishOne();
                continue;
            }
            const path = TILE_ICON_PATH + key;
            loadGameSpriteFrame(path, (sf) => {
                if (sf) {
                    tileIconCache[key] = sf;
                }
                finishOne();
            });
        }
    });
}

export function getCachedTileIcon(key: string): cc.SpriteFrame | null {
    return tileIconCache[key] || null;
}

export function clearGameImgAtlasCache(): void {
    cachedAtlas = null;
    atlasLoadPending.length = 0;
    for (const k in tileIconCache) {
        if (tileIconCache.hasOwnProperty(k)) {
            delete tileIconCache[k];
        }
    }
}
