import { isValid } from '../is-valid';
import { MATCH_ELIMINATION_SPINE } from './GamePreloadConfig';

let cachedData: sp.SkeletonData = null;

/** 预加载消除 Spine（进局后台加载，避免首消卡顿） */
export function preloadMatchEliminationSpine(onDone?: () => void): void {
    if (cachedData) {
        if (onDone) {
            onDone();
        }
        return;
    }
    cc.resources.load(MATCH_ELIMINATION_SPINE.path, sp.SkeletonData, (err, data) => {
        if (!err && data) {
            cachedData = data;
        } else {
            cc.warn('[MatchEliminationSpine] load failed:', MATCH_ELIMINATION_SPINE.path, err);
        }
        if (onDone) {
            onDone();
        }
    });
}

/** 在棋盘坐标 (x,y) 播放一次消除特效 */
export function playMatchEliminationSpine(parent: cc.Node, x: number, y: number): void {
    if (!parent || !isValid(parent)) {
        return;
    }

    const spawn = (data: sp.SkeletonData): void => {
        if (!data || !isValid(parent)) {
            return;
        }
        const node = new cc.Node('match_elim_spine');
        const sk = node.addComponent(sp.Skeleton);
        sk.skeletonData = data;
        sk.premultipliedAlpha = false;
        node.setPosition(x, y);
        node.setScale(MATCH_ELIMINATION_SPINE.scale);
        parent.addChild(node, MATCH_ELIMINATION_SPINE.zIndex);

        sk.setAnimation(0, MATCH_ELIMINATION_SPINE.anim, false);
        sk.setCompleteListener(() => {
            if (node && isValid(node)) {
                node.destroy();
            }
        });
        node.runAction(cc.sequence(
            cc.delayTime(1.2),
            cc.callFunc(() => {
                if (node && isValid(node)) {
                    node.destroy();
                }
            })
        ));
    };

    if (cachedData) {
        spawn(cachedData);
        return;
    }
    preloadMatchEliminationSpine(() => {
        if (cachedData) {
            spawn(cachedData);
        }
    });
}
