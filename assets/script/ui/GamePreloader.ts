import { LevelConfig } from '../model/LevelConfig';
import { GUIDE_HAND_PATH, LOADING_LOG_TIMING, RATE_RES_KEYS, rateResPath } from './GamePreloadConfig';
import { loadGameSpriteFrame, preloadGameImgAtlas, preloadTileIconKeys } from './GameImgAtlas';
import { preloadMatchEliminationSpine } from './MatchEliminationSpine';

const LEVEL_PATH = 'data/level_01';
const CHECK_SOUND_PATH = 'check';
const SCORE_FONT_PATH = 'font/score_digits';

export interface PreloadResult {
    levelAsset: cc.JsonAsset;
    checkClip?: cc.AudioClip;
    scoreFont?: cc.BitmapFont;
    guideHandSf?: cc.SpriteFrame;
}

type ProgressFn = (ratio: number) => void;

/**
 * 阻塞预加载：关卡 JSON → 并行加载音效/字体/图集牌面/小手。
 * 评级图、消除 Spine 进局后后台加载。
 */
export class GamePreloader {
    static run(onProgress: ProgressFn, onComplete: (result: PreloadResult | null, err?: string) => void): void {
        const t0 = LOADING_LOG_TIMING ? Date.now() : 0;
        onProgress(0);

        cc.resources.load(LEVEL_PATH, cc.JsonAsset, (err, asset) => {
            if (err || !asset) {
                onComplete(null, '关卡数据加载失败');
                return;
            }

            const level = asset.json as LevelConfig;
            const iconKeys = level && level.keyPool ? level.keyPool : [];
            let done = 0;
            const total = 4;
            const result: Partial<PreloadResult> = { levelAsset: asset };

            const tick = (): void => {
                done++;
                onProgress(Math.min(1, done / total));
                if (done < total) {
                    return;
                }
                if (LOADING_LOG_TIMING) {
                    cc.log(`[GamePreloader] 阻塞预加载 ${Date.now() - t0}ms（含 ${iconKeys.length} 种牌面）`);
                }
                onComplete(result as PreloadResult);
            };

            cc.resources.load(CHECK_SOUND_PATH, cc.AudioClip, (e1, clip) => {
                if (!e1 && clip) {
                    result.checkClip = clip;
                }
                tick();
            });
            cc.resources.load(SCORE_FONT_PATH, cc.BitmapFont, (e2, font) => {
                if (!e2 && font) {
                    result.scoreFont = font;
                }
                tick();
            });
            loadGameSpriteFrame(GUIDE_HAND_PATH, (sf) => {
                if (sf) {
                    result.guideHandSf = sf;
                }
                tick();
            });
            preloadTileIconKeys(iconKeys, tick);
        });
    }

    /** 进局后在后台加载，不阻塞首屏 */
    static preloadGameplayAssets(onDone?: () => void): void {
        const t0 = LOADING_LOG_TIMING ? Date.now() : 0;
        let pending = 1 + RATE_RES_KEYS.length;
        const finish = (): void => {
            pending--;
            if (pending <= 0) {
                if (LOADING_LOG_TIMING) {
                    cc.log(`[GamePreloader] 后台预加载 ${Date.now() - t0}ms`);
                }
                if (onDone) {
                    onDone();
                }
            }
        };

        preloadMatchEliminationSpine(finish);
        for (let i = 0; i < RATE_RES_KEYS.length; i++) {
            loadGameSpriteFrame(rateResPath(RATE_RES_KEYS[i]), () => finish());
        }
    }
}
