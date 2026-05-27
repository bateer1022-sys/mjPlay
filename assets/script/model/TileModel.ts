import { TileKind } from './TileModelKinds';

export { TileKind } from './TileModelKinds';

export interface TileModel {
    id: number;
    key: string;
    kind: TileKind;
    layer: number;
    x: number;
    y: number;
    removed: boolean;
    /** 是否可点击消除（上无遮挡且左右至少一侧空） */
    free: boolean;
    /** 上层是否有牌与之重合（仅用于半透明显示） */
    covered: boolean;
    node: cc.Node;
    /** 正常叠放时的 zIndex，取消选中后恢复 */
    baseZIndex?: number;
    /** 预制体默认缩放（如 0.5），选中放大/取消都基于此值 */
    baseScale?: number;
    /** 预制体 mask 遮黑是否已显示（避免重复动画导致闪烁） */
    dimMaskOn?: boolean;
}

export function getTileKind(key: string): TileKind {
    if (key.indexOf('H_') === 0) return TileKind.Flower;
    if (key.indexOf('J_') === 0) return TileKind.Season;
    if (key.indexOf('Z_') === 0) return TileKind.Honor;
    return TileKind.Suit;
}

const CN_NUM = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const SUIT_SUFFIX: { [suit: string]: string } = { w: '万', t: '条', b: '筒' };

const SPECIAL_NAMES: { [key: string]: string } = {
    Z_dong: '东', Z_nan: '南', Z_xi: '西', Z_bei: '北',
    Z_zhong: '红中', Z_fa: '发财', Z_bai: '白板',
    J_chun: '春', J_xia: '夏', J_qiu: '秋', J_dong: '冬',
    H_mei: '梅', H_lan: '兰', H_ju: '菊', H_zhu: '竹',
};

/** 资源 key → 底部状态栏等处的麻将术语显示名 */
export function getTileDisplayName(key: string): string {
    if (SPECIAL_NAMES[key]) {
        return SPECIAL_NAMES[key];
    }
    const m = key.match(/^([wtb])(\d)$/);
    if (m) {
        const n = parseInt(m[2], 10);
        if (n >= 1 && n <= 9) {
            return CN_NUM[n] + SUIT_SUFFIX[m[1]];
        }
    }
    return key;
}
