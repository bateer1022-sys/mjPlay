import { isValid } from '../is-valid';
import { TileModel, getTileKind } from '../model/TileModel';
import { LevelConfig } from '../model/LevelConfig';
import {
    refreshTileStates,
    isFullyExposed,
    isCovered,
    isBothSidesBlocked,
    getSideNeighbor,
    getCoveringTiles,
} from './BoardRule';
import { generateSolvableKeys } from './LevelSolver';

import {
    FORBIDDEN_ICON_PATH,
    GUIDE_HAND_PATH,
    GUIDE_HAND_STYLE,
    HINT_SWAY_STYLE,
    SELECT_SWEEP_STYLE,
    TILE_ICON_PATH,
    Z_ORDER,
} from '../ui/GamePreloadConfig';
import TileHintMarquee, { tileFaceBoundsFromTrim } from '../ui/TileHintMarquee';
import { getCachedTileIcon, loadGameSpriteFrame } from '../ui/GameImgAtlas';
import { playMatchEliminationSpine } from '../ui/MatchEliminationSpine';

const ICON_PATH = TILE_ICON_PATH;
const Z_LAYER_STEP = 100;
/** 预制体遮黑 / 选中光效节点（mj.prefab → mask / selected） */
const TILE_MASK_NAME = 'mask';
const TILE_SELECTED_NAME = 'selected';
const TILE_ICON_NAME = 'icon';
const TILE_DI_NAME = 'di';
const TILE_FACE_NAME = 'up';
/** 同父节点下绘制顺序：selected 光效在下，icon 牌面在上，mask 最顶（压暗） */
const TILE_CHILD_Z = {
    di: 0,
    up: 1,
    selected: 2,
    icon: 3,
    mask: 4,
};
const TILE_SWEEP_NAME = 'select_sweep';
const TILE_SWEEP_CLIP_NAME = 'select_sweep_clip';
const TILE_HINT_MARQUEE_NAME = 'hint_marquee';
/** 提示跑马灯：挂在 hint_sway_pivot 上随牌晃动，z 高于 pivot 内子节点 */
const TILE_HINT_MARQUEE_Z = 100;
const TILE_HINT_SWAY_PIVOT_NAME = 'hint_sway_pivot';
const TILE_HINT_SWAY_TAG = 88031;
const GUIDE_HAND_NODE_NAME = 'hint_guide_hand';
const GUIDE_HAND_TAP_TAG = 88032;
const GUIDE_HAND_PRESS_Y = -16;
const GUIDE_HAND_PRESS_SCALE = 0.86;
const GUIDE_HAND_PRESS_IN = 0.12;
const GUIDE_HAND_PRESS_HOLD = 0.05;
const GUIDE_HAND_PRESS_OUT = 0.14;
const GUIDE_HAND_TAP_GAP = 0.42;
const TILE_MASK_OPACITY = 255;
/** 选中：外圈呼吸 + 扫光（扫光在牌面 up 矩形遮罩内） */
const SELECT_GLOW_PULSE = 0.52;
const SELECT_POP_IN = 0.14;
/** 选中：相对棋盘中线，左侧往左、右侧往右微移 */
const SELECT_SHIFT_X = 10;
const SELECT_SHIFT_DURATION = 0.1;
const SELECT_SHIFT_CENTER_EPS = 2;
const SELECT_OFFSET_ACTION_TAG = 88021;
/** 入场：屏外落下 → 按层瀑布落牌 → 每层落完即变暗 → 再落下一层 */
const ENTRANCE_DROP_ABOVE_MAX = 300;
const ENTRANCE_INTRA_STAGGER = 0.006;
const ENTRANCE_DROP_DURATION = 0.1;
const ENTRANCE_DIM_DURATION = 0.08;
const ENTRANCE_LAYER_GAP = 0.03;

/** 不可选时的晃动反馈 */
const BLOCK_SHAKE_X = 10;
const BLOCK_SHAKE_Y = 8;
const BLOCK_SHAKE_STEP = 0.045;

/** 左右夹住：中间闪黑 + 两侧禁止图标旋转回弹 */
const BLOCK_CENTER_FLASH_IN = 0.06;
const BLOCK_CENTER_FLASH_HOLD = 0.1;
const BLOCK_CENTER_FLASH_OUT = 0.12;
const BLOCK_FORBIDDEN_SIZE = 50;
const BLOCK_FORBIDDEN_SCALE = 0.8;
const BLOCK_FORBIDDEN_ROTATE = 32;
const BLOCK_FORBIDDEN_POP = 0.09;
const BLOCK_FORBIDDEN_SETTLE = 0.2;
const BLOCK_FORBIDDEN_WIGGLE = 0.09;
const BLOCK_FORBIDDEN_HOLD = 0.06;
const BLOCK_FORBIDDEN_FADE = 0.07;
/** 旋转弹簧：period 越小回弹越快 */
const BLOCK_FORBIDDEN_SPRING = 0.11;

export class BoardManager {
    config: LevelConfig = null;
    tiles: TileModel[] = [];
    spriteCache: { [key: string]: cc.SpriteFrame } = {};
    entrancePlaying = false;
    private boardRoot: cc.Node = null;
    private forbiddenIconSf: cc.SpriteFrame = null;
    private guideHandSf: cc.SpriteFrame = null;
    private guideHandNode: cc.Node = null;
    private guideHandTargetTile: TileModel = null;
    private guideHandTapRunning = false;
    private guideHandBaseX = 0;
    private guideHandBaseY = 0;
    private guideHandBaseScale = 1;
    private hintGuideTiles: TileModel[] = [];

    private resolveKeys(): string[] | null {
        const slotCount = this.config.slots.length;
        if (this.config.keys && this.config.keys.length === slotCount) {
            return this.config.keys;
        }
        return generateSolvableKeys(this.config);
    }

    loadLevel(path: string, onReady: (err?: string) => void, cachedLevel?: cc.JsonAsset): void {
        if (cachedLevel) {
            this.applyLevelAsset(cachedLevel, onReady);
            return;
        }
        cc.resources.load(path, cc.JsonAsset, (err, asset: cc.JsonAsset) => {
            if (err) {
                onReady('关卡加载失败');
                return;
            }
            this.applyLevelAsset(asset, onReady);
        });
    }

    private applyLevelAsset(asset: cc.JsonAsset, onReady: (err?: string) => void): void {
        this.config = asset.json as LevelConfig;
        if (!this.config.slots || this.config.slots.length === 0) {
            onReady('关卡数据为空');
            return;
        }
        const keys = this.resolveKeys();
        if (!keys) {
            onReady('无法生成可解关卡，请检查布局');
            return;
        }
        const uniqueKeys: string[] = [];
        for (let i = 0; i < keys.length; i++) {
            if (uniqueKeys.indexOf(keys[i]) === -1) {
                uniqueKeys.push(keys[i]);
            }
        }
        this.loadSprites(uniqueKeys, () => {
            this.buildTiles(keys);
            onReady();
        });
    }

    private loadSprites(keys: string[], done: () => void): void {
        let loaded = 0;
        if (keys.length === 0) {
            done();
            return;
        }
        const finishOne = (): void => {
            loaded++;
            if (loaded === keys.length) {
                done();
            }
        };
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const cached = getCachedTileIcon(key);
            if (cached) {
                this.spriteCache[key] = cached;
                finishOne();
                continue;
            }
            loadGameSpriteFrame(ICON_PATH + key, (sf) => {
                if (sf) {
                    this.spriteCache[key] = sf;
                }
                finishOne();
            });
        }
    }

    private buildTiles(keys: string[]): void {
        this.tiles = [];
        for (let i = 0; i < this.config.slots.length; i++) {
            const slot = this.config.slots[i];
            const key = keys[i];
            this.tiles.push({
                id: i,
                key: key,
                kind: getTileKind(key),
                layer: slot.layer,
                x: slot.x,
                y: slot.y,
                removed: false,
                free: true,
                covered: false,
                node: null,
            });
        }
        refreshTileStates(this.tiles, this.config);
    }

    /** 换牌面：TRIMMED 保持比例，由预制体 scale 控制整体大小 */
    private applyTileIcon(icon: cc.Node, key: string): void {
        const sf = this.spriteCache[key];
        if (!sf) return;
        const sprite = icon.getComponent(cc.Sprite);
        if (!sprite) return;
        sprite.sizeMode = cc.Sprite.SizeMode.TRIMMED;
        sprite.spriteFrame = sf;
    }

    spawn(tilePrefab: cc.Prefab, parent: cc.Node, onBoardReady?: () => void, onEntranceDone?: () => void): void {
        this.boardRoot = parent;
        this.ensureForbiddenIcon(() => {});
        const dropY = this.getEntranceDropY();
        for (let i = 0; i < this.tiles.length; i++) {
            const tile = this.tiles[i];
            const node = cc.instantiate(tilePrefab);
            node.setPosition(tile.x, dropY);
            parent.addChild(node);
            tile.node = node;
            tile.baseScale = node.scaleX;

            const icon = node.getChildByName('icon');
            if (icon) {
                this.applyTileIcon(icon, tile.key);
            }
            this.initTileMask(node, false);
            this.stopTileSelectEffect(node);
            this.ensureTileChildLayerOrder(node);
            tile.dimMaskOn = false;
            this.setTileEntranceHidden(tile);
        }
        this.applySameLayerDepthOrder();
        refreshTileStates(this.tiles, this.config);
        if (onBoardReady) {
            onBoardReady();
        }
        this.playEntranceAnim(dropY, onEntranceDone);
    }

    /**
     * 同层立体感叠放：右下最前（y 小、x 大 z 最高），左上最后
     */
    private applySameLayerDepthOrder(): void {
        const groups: { [layer: number]: TileModel[] } = {};
        for (let i = 0; i < this.tiles.length; i++) {
            const tile = this.tiles[i];
            if (tile.removed) continue;
            if (!groups[tile.layer]) {
                groups[tile.layer] = [];
            }
            groups[tile.layer].push(tile);
        }

        const layerIds: number[] = [];
        for (const key in groups) {
            if (groups.hasOwnProperty(key)) {
                layerIds.push(parseInt(key, 10));
            }
        }
        layerIds.sort((a, b) => a - b);

        for (let li = 0; li < layerIds.length; li++) {
            const layer = layerIds[li];
            const group = groups[layer];
            group.sort((a, b) => {
                if (a.y !== b.y) {
                    return b.y - a.y;
                }
                return a.x - b.x;
            });
            for (let i = 0; i < group.length; i++) {
                const tile = group[i];
                const z = layer * Z_LAYER_STEP + i;
                tile.baseZIndex = z;
                if (tile.node && isValid(tile.node)) {
                    tile.node.zIndex = z;
                }
            }
        }
    }

    /** 屏外起始高度：最高牌面之上再抬高一段 */
    private getEntranceDropY(): number {
        let maxY = 0;
        for (let i = 0; i < this.tiles.length; i++) {
            if (this.tiles[i].y > maxY) maxY = this.tiles[i].y;
        }
        return maxY + ENTRANCE_DROP_ABOVE_MAX;
    }

    private setTileEntranceHidden(tile: TileModel): void {
        if (!tile.node || !isValid(tile.node)) return;
        tile.node.opacity = 0;
    }

    /** 入场落下过程中保持高亮，不体现遮挡 */
    private applyEntranceBright(tile: TileModel): void {
        if (!tile.node || !isValid(tile.node)) return;
        tile.node.opacity = 255;
        tile.node.color = cc.Color.WHITE;
        const icon = tile.node.getChildByName('icon');
        if (icon && isValid(icon)) {
            icon.opacity = 255;
            icon.color = cc.Color.WHITE;
        }
        tile.dimMaskOn = false;
        this.initTileMask(tile.node, false);
        this.stopTileSelectEffect(tile.node);
    }

    /** 读取预制体顶层遮黑（不运行时创建） */
    private getTileMaskNode(root: cc.Node): cc.Node | null {
        if (!root || !isValid(root)) return null;
        const mask = root.getChildByName(TILE_MASK_NAME);
        return mask && isValid(mask) ? mask : null;
    }

    private getTileSelectedNode(root: cc.Node): cc.Node | null {
        if (!root || !isValid(root)) return null;
        let selected = root.getChildByName(TILE_SELECTED_NAME);
        if (!selected || !isValid(selected)) {
            const walk = (node: cc.Node): cc.Node | null => {
                if (node.name === TILE_SELECTED_NAME) return node;
                for (let i = 0; i < node.childrenCount; i++) {
                    const hit = walk(node.children[i]);
                    if (hit) return hit;
                }
                return null;
            };
            selected = walk(root);
        }
        return selected && isValid(selected) ? selected : null;
    }

    private getFaceTrimBounds(face: cc.Node): { left: number; right: number; bottom: number; top: number } {
        const scaleX = Math.abs(face.scaleX);
        const scaleY = Math.abs(face.scaleY);
        return tileFaceBoundsFromTrim(face.width, face.height, scaleX, scaleY);
    }

    /** 跑马灯父节点：优先 hint_sway_pivot，与牌面一起晃动 */
    private getHintMarqueeParent(root: cc.Node): cc.Node {
        const pivot = root.getChildByName(TILE_HINT_SWAY_PIVOT_NAME);
        return pivot && isValid(pivot) ? pivot : root;
    }

    /** 跑马灯对齐牌面可见区域 */
    private alignHintMarqueeToFace(marquee: cc.Node, face: cc.Node, _root: cc.Node): void {
        const bounds = this.getFaceTrimBounds(face);
        const w = bounds.right - bounds.left;
        const h = bounds.top - bounds.bottom;
        const cx = (bounds.left + bounds.right) * 0.5;
        const cy = (bounds.bottom + bounds.top) * 0.5;
        const world = face.convertToWorldSpaceAR(cc.v2(cx, cy));
        const parent = marquee.parent;
        const local = parent.convertToNodeSpaceAR(world);
        marquee.setAnchorPoint(0.5, 0.5);
        marquee.setPosition(local.x, local.y);
        marquee.setContentSize(w, h);
        marquee.setScale(1);
        marquee.angle = face.angle;
    }

    private findHintMarqueeNode(root: cc.Node): cc.Node | null {
        if (!root || !isValid(root)) {
            return null;
        }
        const pivot = root.getChildByName(TILE_HINT_SWAY_PIVOT_NAME);
        if (pivot && isValid(pivot)) {
            const onPivot = pivot.getChildByName(TILE_HINT_MARQUEE_NAME);
            if (onPivot && isValid(onPivot)) {
                return onPivot;
            }
        }
        let node = root.getChildByName(TILE_HINT_MARQUEE_NAME);
        if (node && isValid(node)) {
            return node;
        }
        const face = this.getTileFaceNode(root);
        if (face) {
            node = face.getChildByName(TILE_HINT_MARQUEE_NAME);
            if (node && isValid(node)) {
                return node;
            }
        }
        return null;
    }

    /** 清理棋盘层遗留的跑马灯节点（含挂在牌 pivot 下的） */
    private destroyBoardHintMarquees(): void {
        for (let i = 0; i < this.tiles.length; i++) {
            const tile = this.tiles[i];
            if (!tile.removed && tile.node && isValid(tile.node)) {
                this.stopTileHintMarquee(tile);
            }
        }
        if (!this.boardRoot || !isValid(this.boardRoot)) {
            return;
        }
        const children = this.boardRoot.children.slice();
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            if (!child || !isValid(child)) {
                continue;
            }
            if (child.name.indexOf(TILE_HINT_MARQUEE_NAME) === 0) {
                child.destroy();
            }
        }
    }

    /** 取消棋盘上所有跑马灯 / 晃动提示 */
    clearAllGuideMarquees(): void {
        const guided = this.hintGuideTiles.slice();
        for (let i = 0; i < guided.length; i++) {
            this.restoreTileHint(guided[i]);
        }
        this.hintGuideTiles = [];
        for (let i = 0; i < this.tiles.length; i++) {
            const tile = this.tiles[i];
            if (tile.removed || !tile.node || !isValid(tile.node)) {
                continue;
            }
            this.stopTileHintMarquee(tile);
            this.stopTileHintSway(tile);
        }
        this.destroyBoardHintMarquees();
    }

    private isHintGuideTile(tile: TileModel): boolean {
        return this.hintGuideTiles.findIndex((t) => t.id === tile.id) >= 0;
    }

    /** 保证跑马灯在 pivot 上、对齐牌面、层级最高 */
    private syncHintMarquee(tile: TileModel): void {
        if (tile.removed || !tile.node || !isValid(tile.node)) {
            return;
        }
        const root = tile.node;
        const face = this.getTileFaceNode(root);
        if (!face) {
            return;
        }
        const pivot = root.getChildByName(TILE_HINT_SWAY_PIVOT_NAME);
        if (!pivot || !isValid(pivot)) {
            return;
        }

        const marquee = this.findHintMarqueeNode(root);
        if (!marquee || !isValid(marquee)) {
            return;
        }

        const staleOnRoot = root.getChildByName(TILE_HINT_MARQUEE_NAME);
        if (staleOnRoot && isValid(staleOnRoot) && staleOnRoot !== marquee) {
            staleOnRoot.destroy();
        }
        const staleOnFace = face.getChildByName(TILE_HINT_MARQUEE_NAME);
        if (staleOnFace && isValid(staleOnFace) && staleOnFace !== marquee) {
            staleOnFace.destroy();
        }

        if (marquee.parent !== pivot) {
            this.reparentKeepWorld(marquee, pivot);
        }
        marquee.active = true;
        marquee.opacity = 255;
        this.alignHintMarqueeToFace(marquee, face, root);
        this.bringHintMarqueeToFront(root);

        const ctrl = marquee.getComponent(TileHintMarquee);
        if (ctrl) {
            const bounds = this.getFaceTrimBounds(face);
            const visHalfW = (bounds.right - bounds.left) * 0.5;
            const visHalfH = (bounds.top - bounds.bottom) * 0.5;
            const cornerR = Math.min(visHalfW, visHalfH) * 0.24;
            ctrl.setupRect(bounds.left, bounds.right, bounds.bottom, bounds.top, 2, cornerR);
        }
    }

    private refreshAllHintMarquees(): void {
        for (let i = 0; i < this.hintGuideTiles.length; i++) {
            this.syncHintMarquee(this.hintGuideTiles[i]);
        }
    }

    private refreshHintMarqueesOnRoot(root: cc.Node): void {
        for (let i = 0; i < this.hintGuideTiles.length; i++) {
            const tile = this.hintGuideTiles[i];
            if (tile.node === root) {
                this.syncHintMarquee(tile);
            }
        }
    }

    private bringHintMarqueeToFront(root: cc.Node): void {
        const marquee = this.findHintMarqueeNode(root);
        if (!marquee || !isValid(marquee)) {
            return;
        }
        const parent = marquee.parent;
        if (!parent || !isValid(parent)) {
            return;
        }
        marquee.setSiblingIndex(parent.childrenCount - 1);
        marquee.zIndex = TILE_HINT_MARQUEE_Z;
    }

    /** 统一牌面子节点层级（含 hint_sway_pivot 内） */
    private ensureTileChildLayerOrder(root: cc.Node): void {
        if (!root || !isValid(root)) {
            return;
        }
        const pivot = root.getChildByName(TILE_HINT_SWAY_PIVOT_NAME);
        const parents: cc.Node[] = [root];
        if (pivot && isValid(pivot)) {
            parents.push(pivot);
        }
        for (let pi = 0; pi < parents.length; pi++) {
            const parent = parents[pi];
            const chain: { name: string; z: number }[] = [
                { name: TILE_DI_NAME, z: TILE_CHILD_Z.di },
                { name: TILE_FACE_NAME, z: TILE_CHILD_Z.up },
                { name: TILE_SELECTED_NAME, z: TILE_CHILD_Z.selected },
                { name: TILE_ICON_NAME, z: TILE_CHILD_Z.icon },
                { name: TILE_MASK_NAME, z: TILE_CHILD_Z.mask },
            ];
            let idx = 0;
            for (let ci = 0; ci < chain.length; ci++) {
                const item = chain[ci];
                let node: cc.Node = null;
                if (item.name === TILE_FACE_NAME && parent === root) {
                    node = this.findDescendantByName(root, TILE_FACE_NAME);
                } else if (parent === root && item.name !== TILE_FACE_NAME) {
                    node = parent.getChildByName(item.name);
                } else {
                    node = parent.getChildByName(item.name);
                }
                if (!node || !isValid(node) || node.parent !== parent) {
                    continue;
                }
                node.setSiblingIndex(idx);
                node.zIndex = item.z;
                idx++;
            }
        }
        this.bringHintMarqueeToFront(root);
        this.refreshHintMarqueesOnRoot(root);
        const clip = root.getChildByName(TILE_SWEEP_CLIP_NAME);
        if (clip && isValid(clip)) {
            clip.setSiblingIndex(root.childrenCount - 1);
            clip.zIndex = 1000;
            this.bringHintMarqueeToFront(root);
        }
    }

    private stopTileSelectEffect(root: cc.Node): void {
        if (!root || !isValid(root)) return;
        const selected = this.getTileSelectedNode(root);
        if (selected && isValid(selected)) {
            selected.stopAllActions();
            selected.active = false;
            selected.opacity = 255;
            selected.setScale(1);
            this.ensureTileChildLayerOrder(root);
        }
        const clip = root.getChildByName(TILE_SWEEP_CLIP_NAME);
        if (clip && isValid(clip)) {
            clip.stopAllActions();
            clip.destroy();
        }
        const sweep = root.getChildByName(TILE_SWEEP_NAME);
        if (sweep && isValid(sweep)) {
            sweep.stopAllActions();
            sweep.destroy();
        }
    }

    /** 递归查找子节点（提示晃动后 up 可能在 hint_sway_pivot 下） */
    private findDescendantByName(node: cc.Node, name: string): cc.Node | null {
        if (!node || !isValid(node)) {
            return null;
        }
        if (node.name === name) {
            return node;
        }
        for (let i = 0; i < node.children.length; i++) {
            const hit = this.findDescendantByName(node.children[i], name);
            if (hit) {
                return hit;
            }
        }
        return null;
    }

    /** 牌面图节点（扫光裁剪区域与之对齐） */
    private getTileFaceNode(root: cc.Node): cc.Node | null {
        return this.findDescendantByName(root, TILE_FACE_NAME);
    }

    setGuideHandSprite(sf: cc.SpriteFrame): void {
        if (sf) {
            this.guideHandSf = sf;
        }
    }

    /** 扫光遮罩对齐牌面可见区域（与跑马灯裁切一致，支持 up 在 pivot 下） */
    private alignSweepClipToFace(clip: cc.Node, face: cc.Node, root: cc.Node): void {
        const bounds = this.getFaceTrimBounds(face);
        const w = bounds.right - bounds.left;
        const h = bounds.top - bounds.bottom;
        const cx = (bounds.left + bounds.right) * 0.5;
        const cy = (bounds.bottom + bounds.top) * 0.5;
        const world = face.convertToWorldSpaceAR(cc.v2(cx, cy));
        const local = root.convertToNodeSpaceAR(world);
        clip.setAnchorPoint(0.5, 0.5);
        clip.setPosition(local.x, local.y);
        clip.setContentSize(w, h);
        clip.setScale(1);
        clip.angle = face.angle;
    }

    private getOrCreateSweepClip(root: cc.Node): cc.Node | null {
        const face = this.getTileFaceNode(root);
        if (!face) return null;

        let clip = root.getChildByName(TILE_SWEEP_CLIP_NAME);
        if (!clip || !isValid(clip)) {
            clip = new cc.Node(TILE_SWEEP_CLIP_NAME);
            const mask = clip.addComponent(cc.Mask);
            mask.type = cc.Mask.Type.RECT;
            root.addChild(clip);
        }
        this.alignSweepClipToFace(clip, face, root);
        return clip;
    }

    private buildSelectSweepBar(barW: number, barH: number): cc.Node {
        const node = new cc.Node(TILE_SWEEP_NAME);
        const g = node.addComponent(cc.Graphics);
        const hw = barW * 0.5;
        const hh = barH * 0.5;
        g.clear();
        g.fillColor = cc.color(255, 248, 210, Math.floor(SELECT_SWEEP_STYLE.peakOpacity * 0.35));
        g.roundRect(-hw - 2, -hh, barW + 4, barH, 2);
        g.fill();
        g.fillColor = cc.color(255, 252, 230, SELECT_SWEEP_STYLE.peakOpacity);
        g.roundRect(-hw, -hh, barW, barH, 1);
        g.fill();
        node.setContentSize(barW, barH);
        node.setAnchorPoint(0.5, 0.5);
        node.angle = SELECT_SWEEP_STYLE.angle;
        return node;
    }

    /** 选中特效：外圈弹出 + 呼吸 + 横向扫光循环 */
    private startTileSelectEffect(tile: TileModel): void {
        const root = tile.node;
        if (!root || !isValid(root)) return;
        this.stopTileSelectEffect(root);

        const selected = this.getTileSelectedNode(root);
        if (!selected) return;

        const sprite = selected.getComponent(cc.Sprite);
        if (sprite) {
            sprite.enabled = true;
            if (!sprite.spriteFrame) {
                cc.warn('[BoardManager] selected 节点缺少 SpriteFrame，请检查 mj 预制体');
            }
        }

        selected.active = true;
        selected.opacity = 160;
        this.ensureTileChildLayerOrder(root);

        selected.stopAllActions();
        selected.runAction(cc.sequence(
            cc.fadeTo(SELECT_POP_IN, 255).easing(cc.easeSineOut()),
            cc.callFunc(() => {
                if (!selected || !isValid(selected)) return;
                this.playSelectGlowPulse(selected);
            }, this)
        ));

        this.playSelectSweep(root);
    }

    private playSelectGlowPulse(selected: cc.Node): void {
        if (!selected || !isValid(selected)) return;
        selected.stopAllActions();
        selected.runAction(cc.repeatForever(cc.sequence(
            cc.fadeTo(SELECT_GLOW_PULSE, 255).easing(cc.easeSineInOut()),
            cc.fadeTo(SELECT_GLOW_PULSE, 190).easing(cc.easeSineInOut())
        )));
    }

    /** 细条扫光：在牌面可见区域内完整从左扫到右 */
    private playSelectSweep(root: cc.Node): void {
        const clip = this.getOrCreateSweepClip(root);
        if (!clip) return;

        const face = this.getTileFaceNode(root);
        if (face) {
            this.alignSweepClipToFace(clip, face, root);
        }

        const clipW = clip.width;
        const clipH = clip.height;
        const inset = SELECT_SWEEP_STYLE.edgeInset;
        const fromX = -clipW * 0.5 + inset;
        const toX = clipW * 0.5 - inset;
        const barW = SELECT_SWEEP_STYLE.barWidth;
        const barH = clipH * SELECT_SWEEP_STYLE.barHeightRatio;

        const sweep = this.buildSelectSweepBar(barW, barH);
        clip.addChild(sweep);

        this.ensureTileChildLayerOrder(root);

        const duration = SELECT_SWEEP_STYLE.duration;
        const gap = SELECT_SWEEP_STYLE.gap;
        const peak = SELECT_SWEEP_STYLE.peakOpacity;

        const runOnce = (): void => {
            if (!sweep || !isValid(sweep)) return;
            sweep.setPosition(fromX, 0);
            sweep.opacity = 0;
        };

        runOnce();
        sweep.runAction(cc.repeatForever(cc.sequence(
            cc.spawn(
                cc.moveTo(duration, toX, 0).easing(cc.easeSineInOut()),
                cc.sequence(
                    cc.fadeTo(duration * 0.2, peak),
                    cc.fadeTo(duration * 0.5, peak),
                    cc.fadeTo(duration * 0.3, 0)
                )
            ),
            cc.delayTime(gap),
            cc.callFunc(runOnce, this)
        )));
    }

    setTileSelectGlow(tile: TileModel, on: boolean): void {
        if (tile.removed || !tile.node || !isValid(tile.node)) return;
        if (on) {
            this.startTileSelectEffect(tile);
        } else {
            this.stopTileSelectEffect(tile.node);
        }
    }

    private getOrCreateHintMarquee(tile: TileModel): TileHintMarquee | null {
        const root = tile.node;
        if (!root || !isValid(root)) {
            return null;
        }
        const face = this.getTileFaceNode(root);
        if (!face) {
            return null;
        }
        this.getOrCreateHintSwayPivot(tile);
        const marqueeParent = this.getHintMarqueeParent(root);

        let marqueeNode = this.findHintMarqueeNode(root);
        const legacyOnFace = face.getChildByName(TILE_HINT_MARQUEE_NAME);
        if (legacyOnFace && isValid(legacyOnFace) && legacyOnFace !== marqueeNode) {
            if (marqueeNode && isValid(marqueeNode)) {
                legacyOnFace.destroy();
            } else {
                marqueeNode = legacyOnFace;
                this.reparentKeepWorld(marqueeNode, marqueeParent);
            }
        }
        if (marqueeNode && marqueeNode.parent !== marqueeParent) {
            this.reparentKeepWorld(marqueeNode, marqueeParent);
        }
        if (!marqueeNode || !isValid(marqueeNode)) {
            marqueeNode = new cc.Node(TILE_HINT_MARQUEE_NAME);
            marqueeParent.addChild(marqueeNode);
            marqueeNode.addComponent(cc.Graphics);
            marqueeNode.addComponent(TileHintMarquee);
        }

        marqueeNode.active = true;
        this.alignHintMarqueeToFace(marqueeNode, face, root);
        this.bringHintMarqueeToFront(root);

        const ctrl = marqueeNode.getComponent(TileHintMarquee);
        if (!ctrl) {
            return null;
        }
        const bounds = this.getFaceTrimBounds(face);
        const visHalfW = (bounds.right - bounds.left) * 0.5;
        const visHalfH = (bounds.top - bounds.bottom) * 0.5;
        const cornerR = Math.min(visHalfW, visHalfH) * 0.24;
        ctrl.setupRect(bounds.left, bounds.right, bounds.bottom, bounds.top, 2, cornerR);
        return ctrl;
    }

    private stopTileHintMarquee(tile: TileModel): void {
        if (!tile.node || !isValid(tile.node)) {
            return;
        }
        const marqueeNode = this.findHintMarqueeNode(tile.node);
        if (marqueeNode && isValid(marqueeNode)) {
            marqueeNode.active = false;
            marqueeNode.destroy();
        }
    }

    /** 同时只保留一对提示（跑马灯 + 底锚点晃动） */
    showGuideHintPair(a: TileModel, b: TileModel): void {
        this.destroyBoardHintMarquees();
        this.clearHintTilesOnly();
        this.hintGuideTiles = [a, b];
        for (let i = 0; i < this.hintGuideTiles.length; i++) {
            const tile = this.hintGuideTiles[i];
            this.getOrCreateHintSwayPivot(tile);
            this.getOrCreateHintMarquee(tile);
            this.startTileHintSway(tile);
        }
        const left = a.x <= b.x ? a : b;
        const right = a.x <= b.x ? b : a;
        this.bringMatchPairToFront(left, right);
        this.refreshAllHintMarquees();
    }

    private clearHintTilesOnly(): void {
        for (let i = 0; i < this.hintGuideTiles.length; i++) {
            this.restoreTileHint(this.hintGuideTiles[i]);
        }
        this.hintGuideTiles = [];
    }

    clearGuideHintEffects(): void {
        this.clearAllGuideMarquees();
    }

    /** 提示：牌面外缘跑马灯 + 底锚点左右晃几下后静止 */
    highlightTileHint(tile: TileModel): void {
        this.getOrCreateHintSwayPivot(tile);
        this.getOrCreateHintMarquee(tile);
        this.startTileHintSway(tile);
    }

    restoreTileHint(tile: TileModel): void {
        this.stopTileHintMarquee(tile);
        this.stopTileHintSway(tile);
        this.restoreTileZIndex(tile);
        const idx = this.hintGuideTiles.findIndex((t) => t.id === tile.id);
        if (idx >= 0) {
            this.hintGuideTiles.splice(idx, 1);
        }
    }

    /** 引导小手：挂棋盘层 + 世界坐标，offset 为棋盘像素，不受晃动 pivot 影响 */
    showHintGuideHand(tile: TileModel): void {
        if (!tile.node || !isValid(tile.node) || tile.removed) {
            return;
        }
        if (!this.boardRoot || !isValid(this.boardRoot)) {
            return;
        }
        this.guideHandTargetTile = tile;
        this.ensureGuideHandSprite(() => {
            if (!this.guideHandSf) {
                cc.warn('[BoardManager] 引导小手图加载失败:', GUIDE_HAND_PATH);
                return;
            }
            this.hideHintGuideHand();
            const hand = new cc.Node(GUIDE_HAND_NODE_NAME);
            const sprite = hand.addComponent(cc.Sprite);
            sprite.spriteFrame = this.guideHandSf;
            sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
            const rect = this.guideHandSf.getRect();
            hand.setContentSize(rect.width, rect.height);
            hand.setAnchorPoint(0, 1);
            hand.setScale(GUIDE_HAND_STYLE.scale);
            this.boardRoot.addChild(hand, Z_ORDER.GUIDE_HAND);
            hand.opacity = 255;
            this.guideHandNode = hand;
            this.applyGuideHandPosition(tile);
            this.playGuideHandTap(hand, tile);
        });
    }

    hideHintGuideHand(): void {
        this.guideHandTargetTile = null;
        if (!this.guideHandNode || !isValid(this.guideHandNode)) {
            this.guideHandNode = null;
            return;
        }
        this.stopGuideHandTap(this.guideHandNode);
        this.guideHandNode.destroy();
        this.guideHandNode = null;
    }

    /** 麻将根节点中心 → 棋盘坐标；节点锚点 (0,0) 落该点 */
    private getGuideHandBoardPosition(tile: TileModel): cc.Vec2 | null {
        if (!tile.node || !isValid(tile.node) || !this.boardRoot || !isValid(this.boardRoot)) {
            return null;
        }
        const world = tile.node.convertToWorldSpaceAR(cc.v2(0, 0));
        const local = this.boardRoot.convertToNodeSpaceAR(world);
        return cc.v2(
            local.x + GUIDE_HAND_STYLE.offsetX,
            local.y + GUIDE_HAND_STYLE.offsetY
        );
    }

    private applyGuideHandPosition(tile: TileModel): void {
        if (!this.guideHandNode || !isValid(this.guideHandNode)) {
            return;
        }
        const pos = this.getGuideHandBoardPosition(tile);
        if (!pos) {
            return;
        }
        this.guideHandNode.setPosition(pos.x, pos.y);
        this.guideHandBaseX = pos.x;
        this.guideHandBaseY = pos.y;
    }

    private playGuideHandTap(hand: cc.Node, tile: TileModel): void {
        if (!hand || !isValid(hand)) {
            return;
        }
        this.stopGuideHandTap(hand);
        this.applyGuideHandPosition(tile);
        this.guideHandTapRunning = true;
        this.guideHandBaseScale = hand.scale;
        this.runGuideHandTapCycle(hand, tile);
    }

    private runGuideHandTapCycle(hand: cc.Node, tile: TileModel): void {
        if (!this.guideHandTapRunning || !hand || !isValid(hand)) {
            return;
        }
        if (!tile.node || !isValid(tile.node) || tile.removed) {
            return;
        }
        this.applyGuideHandPosition(tile);
        const bx = this.guideHandBaseX;
        const by = this.guideHandBaseY;
        const bs = this.guideHandBaseScale;
        const seq = cc.sequence(
            cc.spawn(
                cc.moveTo(GUIDE_HAND_PRESS_IN, bx, by + GUIDE_HAND_PRESS_Y).easing(cc.easeSineIn()),
                cc.scaleTo(GUIDE_HAND_PRESS_IN, bs * GUIDE_HAND_PRESS_SCALE).easing(cc.easeSineIn())
            ),
            cc.delayTime(GUIDE_HAND_PRESS_HOLD),
            cc.spawn(
                cc.moveTo(GUIDE_HAND_PRESS_OUT, bx, by).easing(cc.easeSineOut()),
                cc.scaleTo(GUIDE_HAND_PRESS_OUT, bs).easing(cc.easeBackOut())
            ),
            cc.delayTime(GUIDE_HAND_TAP_GAP),
            cc.callFunc(() => this.runGuideHandTapCycle(hand, tile), this)
        );
        seq.setTag(GUIDE_HAND_TAP_TAG);
        hand.runAction(seq);
    }

    private stopGuideHandTap(hand: cc.Node): void {
        this.guideHandTapRunning = false;
        if (!hand || !isValid(hand)) {
            return;
        }
        hand.stopActionByTag(GUIDE_HAND_TAP_TAG);
        if (this.guideHandTargetTile) {
            this.applyGuideHandPosition(this.guideHandTargetTile);
        }
        hand.setScale(this.guideHandBaseScale);
    }

    private ensureGuideHandSprite(done: () => void): void {
        if (this.guideHandSf) {
            done();
            return;
        }
        loadGameSpriteFrame(GUIDE_HAND_PATH, (sf) => {
            if (sf) {
                this.guideHandSf = sf;
                done();
                return;
            }
            cc.resources.load(GUIDE_HAND_PATH, cc.Texture2D, (errTex, tex) => {
                if (!errTex && tex) {
                    this.guideHandSf = new cc.SpriteFrame(tex as cc.Texture2D);
                }
                done();
            });
        });
    }

    private isHintSwaySkipNode(name: string): boolean {
        return name === TILE_HINT_SWAY_PIVOT_NAME
            || name === GUIDE_HAND_NODE_NAME;
    }

    private reparentKeepWorld(child: cc.Node, newParent: cc.Node): void {
        if (!child.parent || !isValid(child.parent)) {
            newParent.addChild(child);
            return;
        }
        const world = child.parent.convertToWorldSpaceAR(child.getPosition());
        child.removeFromParent(false);
        newParent.addChild(child);
        child.setPosition(newParent.convertToNodeSpaceAR(world));
    }

    /** 底边 (0.5,0) 晃动轴：子节点 pivot，不改牌根节点锚点/坐标 */
    private getOrCreateHintSwayPivot(tile: TileModel): cc.Node | null {
        const root = tile.node;
        if (!root || !isValid(root)) {
            return null;
        }
        let pivot = root.getChildByName(TILE_HINT_SWAY_PIVOT_NAME);
        if (pivot && isValid(pivot)) {
            return pivot;
        }

        pivot = new cc.Node(TILE_HINT_SWAY_PIVOT_NAME);
        pivot.setAnchorPoint(0.5, 0);
        const halfH = root.height * Math.abs(root.scaleY) * 0.5;
        pivot.setPosition(0, -halfH);
        root.addChild(pivot, 0);

        const children = root.children.slice();
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            if (!child || !isValid(child) || child === pivot) {
                continue;
            }
            if (this.isHintSwaySkipNode(child.name)) {
                continue;
            }
            this.reparentKeepWorld(child, pivot);
        }
        this.ensureTileChildLayerOrder(root);
        return pivot;
    }

    private dissolveHintSwayPivot(tile: TileModel): void {
        const root = tile.node;
        if (!root || !isValid(root)) {
            return;
        }
        const pivot = root.getChildByName(TILE_HINT_SWAY_PIVOT_NAME);
        if (!pivot || !isValid(pivot)) {
            return;
        }
        pivot.stopActionByTag(TILE_HINT_SWAY_TAG);
        pivot.angle = 0;

        const children = pivot.children.slice();
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            if (!child || !isValid(child)) {
                continue;
            }
            this.reparentKeepWorld(child, root);
        }
        pivot.destroy();
        this.ensureTileChildLayerOrder(root);
    }

    private startTileHintSway(tile: TileModel): void {
        if (tile.removed || !tile.node || !isValid(tile.node)) {
            return;
        }
        const pivot = this.getOrCreateHintSwayPivot(tile);
        if (!pivot) {
            return;
        }
        pivot.stopActionByTag(TILE_HINT_SWAY_TAG);
        pivot.angle = 0;

        const angle = HINT_SWAY_STYLE.angle;
        const step = HINT_SWAY_STYLE.step;
        const gap = HINT_SWAY_STYLE.gap;
        const wiggle = cc.sequence(
            cc.rotateBy(step, angle),
            cc.rotateBy(step * 2, -angle * 2),
            cc.rotateBy(step, angle),
            cc.rotateTo(step, 0),
            cc.delayTime(gap),
            cc.callFunc(() => this.refreshAllHintMarquees(), this)
        );
        const sway = cc.repeatForever(wiggle);
        sway.setTag(TILE_HINT_SWAY_TAG);
        pivot.runAction(sway);
        this.syncHintMarquee(tile);
    }

    private stopTileHintSway(tile: TileModel): void {
        this.dissolveHintSwayPivot(tile);
    }

    /** 初始化/复位遮黑：亮牌隐藏，暗牌显示 */
    private initTileMask(root: cc.Node, covered: boolean): void {
        const mask = this.getTileMaskNode(root);
        if (!mask) return;
        mask.stopAllActions();
        mask.active = covered;
        mask.opacity = TILE_MASK_OPACITY;
    }

    private setTileDimMask(tile: TileModel, covered: boolean, fadeDuration: number): void {
        if (!tile.node || !isValid(tile.node)) return;
        const mask = this.getTileMaskNode(tile.node);
        if (!mask) return;

        const shown = !!tile.dimMaskOn;
        if (shown === covered) {
            return;
        }
        tile.dimMaskOn = covered;

        mask.stopAllActions();
        if (covered) {
            mask.active = true;
            if (fadeDuration > 0) {
                mask.opacity = 0;
                mask.runAction(cc.fadeTo(fadeDuration, TILE_MASK_OPACITY));
            } else {
                mask.opacity = TILE_MASK_OPACITY;
            }
            return;
        }

        if (fadeDuration > 0) {
            mask.runAction(cc.sequence(
                cc.fadeTo(fadeDuration, 0),
                cc.callFunc(() => {
                    if (!mask || !isValid(mask)) return;
                    mask.active = false;
                    mask.opacity = TILE_MASK_OPACITY;
                }, this)
            ));
        } else {
            mask.active = false;
            mask.opacity = TILE_MASK_OPACITY;
        }
    }

    private getEntranceLayerIds(): number[] {
        const seen: { [layer: number]: boolean } = {};
        const layers: number[] = [];
        for (let i = 0; i < this.tiles.length; i++) {
            const layer = this.tiles[i].layer;
            if (!seen[layer]) {
                seen[layer] = true;
                layers.push(layer);
            }
        }
        layers.sort((a, b) => a - b);
        return layers;
    }

    private getTilesInLayer(layer: number): TileModel[] {
        const list: TileModel[] = [];
        for (let i = 0; i < this.tiles.length; i++) {
            if (this.tiles[i].layer === layer) list.push(this.tiles[i]);
        }
        list.sort((a, b) => {
            if (a.y !== b.y) return b.y - a.y;
            return a.x - b.x;
        });
        return list;
    }

    private playEntranceAnim(dropY: number, onComplete?: () => void): void {
        const layers = this.getEntranceLayerIds();
        if (layers.length === 0) {
            this.entrancePlaying = false;
            this.refreshVisuals();
            if (onComplete) onComplete();
            return;
        }
        this.entrancePlaying = true;
        this.runEntranceLayer(dropY, layers, 0, onComplete);
    }

    private runEntranceLayer(
        dropY: number,
        layers: number[],
        layerIndex: number,
        onComplete?: () => void
    ): void {
        if (layerIndex >= layers.length) {
            this.entrancePlaying = false;
            this.refreshVisuals();
            if (onComplete) onComplete();
            return;
        }

        const layerTiles = this.getTilesInLayer(layers[layerIndex]);
        const validTiles: TileModel[] = [];
        for (let i = 0; i < layerTiles.length; i++) {
            const node = layerTiles[i].node;
            if (node && isValid(node)) validTiles.push(layerTiles[i]);
        }

        if (validTiles.length === 0) {
            this.runEntranceLayer(dropY, layers, layerIndex + 1, onComplete);
            return;
        }

        const lastIndex = validTiles.length - 1;
        for (let i = 0; i < validTiles.length; i++) {
            const tile = validTiles[i];
            const node = tile.node;
            const delay = i * ENTRANCE_INTRA_STAGGER;
            const reveal = cc.callFunc(() => {
                node.setPosition(tile.x, dropY);
                this.applyEntranceBright(tile);
            }, this);
            const drop = cc.moveTo(ENTRANCE_DROP_DURATION, tile.x, tile.y)
                .easing(cc.easeQuadraticActionOut());

            if (i === lastIndex) {
                node.runAction(cc.sequence(
                    cc.delayTime(delay),
                    reveal,
                    drop,
                    cc.callFunc(() => {
                        this.refreshVisualsSmooth(ENTRANCE_DIM_DURATION);
                    }, this),
                    cc.delayTime(ENTRANCE_DIM_DURATION + ENTRANCE_LAYER_GAP),
                    cc.callFunc(() => {
                        this.runEntranceLayer(dropY, layers, layerIndex + 1, onComplete);
                    }, this)
                ));
            } else {
                node.runAction(cc.sequence(cc.delayTime(delay), reveal, drop));
            }
        }
    }

    /** 仅对已显示的牌做渐变变暗（落一层暗一层） */
    private refreshVisualsSmooth(fadeDuration: number): void {
        refreshTileStates(this.tiles, this.config);
        for (let i = 0; i < this.tiles.length; i++) {
            const tile = this.tiles[i];
            if (tile.removed || !tile.node || !isValid(tile.node)) continue;
            if (tile.node.opacity <= 0) continue;
            this.applyVisualFade(tile, fadeDuration);
        }
    }

    private applyVisualFade(tile: TileModel, duration: number): void {
        if (!tile.node || !isValid(tile.node)) return;
        tile.node.opacity = 255;
        tile.node.color = cc.Color.WHITE;
        const icon = tile.node.getChildByName('icon');
        if (icon && isValid(icon)) {
            icon.opacity = 255;
            icon.color = cc.Color.WHITE;
        }
        this.setTileDimMask(tile, tile.covered, duration);
    }

    /** 全局点击：仅在高亮牌中，用 Board 坐标 + 锚点矩形做命中 */
    bindBoardClick(root: cc.Node, onTileTap: (tile: TileModel) => void): void {
        if (!root || !isValid(root)) return;
        root.on(cc.Node.EventType.TOUCH_END, (e: cc.Event.EventTouch) => {
            if (this.entrancePlaying) return;
            const picked = this.pickTileAtTouch(e);
            if (picked) {
                e.stopPropagation();
                onTileTap(picked);
            }
        }, this, true);
    }

    /** 触摸点 → Board 本地坐标（兼容 SHOW_ALL / Canvas 缩放） */
    private touchToBoardLocal(e: cc.Event.EventTouch): cc.Vec2 | null {
        if (!this.boardRoot || !isValid(this.boardRoot)) return null;
        return this.boardRoot.convertToNodeSpaceAR(e.getLocation());
    }

    /** 高亮牌 = 未盖遮罩变暗（与画面一致） */
    private isBrightTile(tile: TileModel): boolean {
        if (tile.removed || !tile.node || !isValid(tile.node)) return false;
        if (tile.node.opacity <= 0) return false;
        if (tile.covered) return false;
        const mask = this.getTileMaskNode(tile.node);
        if (mask && mask.active && mask.opacity > 20) return false;
        return true;
    }

    /** 牌在 Board 本地坐标下的矩形：tile 坐标 + 关卡宽高 + 锚点 */
    private getTileRectInBoard(tile: TileModel): { minX: number; maxX: number; minY: number; maxY: number } {
        const cfg = this.config;
        const w = cfg ? cfg.tileW : 85;
        const h = cfg ? cfg.tileH : 106;
        const n = tile.node;
        const ax = n && isValid(n) ? n.anchorX : 0.5;
        const ay = n && isValid(n) ? n.anchorY : 0.5;
        const minX = tile.x - w * ax;
        const minY = tile.y - h * ay;
        return { minX, maxX: minX + w, minY, maxY: minY + h };
    }

    private pointInTileRect(boardX: number, boardY: number, tile: TileModel): boolean {
        const r = this.getTileRectInBoard(tile);
        return boardX >= r.minX && boardX <= r.maxX && boardY >= r.minY && boardY <= r.maxY;
    }

    /** 点击点命中牌（含变暗牌，便于上层遮挡反馈）；重叠取 layer、zIndex 最高 */
    pickTileAtTouch(e: cc.Event.EventTouch): TileModel | null {
        const local = this.touchToBoardLocal(e);
        if (!local) return null;
        return this.pickTileAtBoardLocal(local);
    }

    pickBrightTileAtTouch(e: cc.Event.EventTouch): TileModel | null {
        const local = this.touchToBoardLocal(e);
        if (!local) return null;
        return this.pickBrightTileAtBoardLocal(local);
    }

    pickBrightTileAtScreen(screenPos: cc.Vec2): TileModel | null {
        if (!this.boardRoot || !isValid(this.boardRoot)) return null;
        const local = this.boardRoot.convertToNodeSpaceAR(screenPos);
        return this.pickBrightTileAtBoardLocal(local);
    }

    private pickTileAtBoardLocal(local: cc.Vec2): TileModel | null {
        let best: TileModel = null;
        for (let i = 0; i < this.tiles.length; i++) {
            const t = this.tiles[i];
            if (t.removed || !t.node || !isValid(t.node)) continue;
            if (t.node.opacity <= 0) continue;
            if (!this.pointInTileRect(local.x, local.y, t)) continue;
            if (!best) {
                best = t;
                continue;
            }
            if (t.layer > best.layer) {
                best = t;
                continue;
            }
            if (t.layer === best.layer && t.node.zIndex > best.node.zIndex) {
                best = t;
            }
        }
        return best;
    }

    private pickBrightTileAtBoardLocal(local: cc.Vec2): TileModel | null {
        let best: TileModel = null;
        for (let i = 0; i < this.tiles.length; i++) {
            const t = this.tiles[i];
            if (!this.isBrightTile(t)) continue;
            if (!this.pointInTileRect(local.x, local.y, t)) continue;
            if (!best) {
                best = t;
                continue;
            }
            if (t.layer > best.layer) {
                best = t;
                continue;
            }
            if (t.layer === best.layer && t.node.zIndex > best.node.zIndex) {
                best = t;
            }
        }
        return best;
    }

    /** 点击不可选牌：两侧夹住则中间闪黑+禁止图标；上层遮挡则压牌竖晃 */
    playBlockedFeedback(tile: TileModel): void {
        if (!this.config || tile.removed || !tile.node || !isValid(tile.node)) return;
        const cfg = this.config;
        const board = this.tiles;

        if (isCovered(tile, board, cfg)) {
            const covers = getCoveringTiles(tile, board, cfg);
            if (covers.length > 0) {
                this.playTileNudge(covers, 0, BLOCK_SHAKE_Y);
                return;
            }
        }

        if (isBothSidesBlocked(tile, board, cfg)) {
            const left = getSideNeighbor(tile, board, 'left', cfg);
            const right = getSideNeighbor(tile, board, 'right', cfg);
            this.playBothSidesBlockedFeedback(tile, left, right);
        }
    }

    /** 左右都有牌：中间闪黑；左右牌横晃；禁止图标出现在中牌与左右牌之间 */
    private playBothSidesBlockedFeedback(
        center: TileModel,
        left: TileModel | null,
        right: TileModel | null
    ): void {
        if (!center.node || !isValid(center.node)) return;
        this.flashCenterBlocked(center);

        const shakeGroup: TileModel[] = [center];
        if (left) shakeGroup.push(left);
        if (right) shakeGroup.push(right);
        this.playTileNudge(shakeGroup, BLOCK_SHAKE_X, 0);

        this.ensureForbiddenIcon(() => {
            if (left) this.spawnForbiddenBadgeBetween(center, left);
            if (right) this.spawnForbiddenBadgeBetween(center, right);
        });
    }

    private ensureForbiddenIcon(done: () => void): void {
        if (this.forbiddenIconSf) {
            done();
            return;
        }
        loadGameSpriteFrame(FORBIDDEN_ICON_PATH, (sf) => {
            if (sf) {
                this.forbiddenIconSf = sf;
            }
            done();
        });
    }

    /** 中间牌短暂变黑再恢复（用预制体 mask，不改变 covered 状态） */
    private flashCenterBlocked(tile: TileModel): void {
        if (!tile.node || !isValid(tile.node)) return;
        const mask = this.getTileMaskNode(tile.node);
        if (!mask) return;

        const wasCovered = tile.covered;
        const wasDimOn = !!tile.dimMaskOn;
        mask.stopAllActions();
        mask.active = true;
        mask.opacity = 0;
        mask.runAction(cc.sequence(
            cc.fadeTo(BLOCK_CENTER_FLASH_IN, TILE_MASK_OPACITY),
            cc.delayTime(BLOCK_CENTER_FLASH_HOLD),
            cc.fadeTo(BLOCK_CENTER_FLASH_OUT, 0),
            cc.callFunc(() => {
                if (!mask || !isValid(mask)) return;
                if (wasCovered || wasDimOn) {
                    mask.active = true;
                    mask.opacity = TILE_MASK_OPACITY;
                } else {
                    mask.active = false;
                    mask.opacity = TILE_MASK_OPACITY;
                }
            }, this)
        ));
    }

    /** 禁止图标落在中牌与邻牌之间的空隙（两牌中心连线的中点） */
    private spawnForbiddenBadgeBetween(center: TileModel, side: TileModel): void {
        if (!this.forbiddenIconSf) return;
        const parent = this.boardRoot && isValid(this.boardRoot)
            ? this.boardRoot
            : (center.node && isValid(center.node) ? center.node.parent : null);
        if (!parent || !isValid(parent)) return;

        const badge = new cc.Node('ForbiddenBadge');
        badge.setContentSize(BLOCK_FORBIDDEN_SIZE, BLOCK_FORBIDDEN_SIZE);
        const sprite = badge.addComponent(cc.Sprite);
        sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = this.forbiddenIconSf;

        parent.addChild(badge, 10000);
        badge.setPosition((center.x + side.x) * 0.5, (center.y + side.y) * 0.5);
        badge.opacity = 0;
        const onLeft = side.x < center.x;
        const startAngle = onLeft ? -BLOCK_FORBIDDEN_ROTATE : BLOCK_FORBIDDEN_ROTATE;
        const peakAngle = -startAngle;
        badge.angle = startAngle;
        const overshootScale = BLOCK_FORBIDDEN_SCALE * 1.08;
        badge.setScale(BLOCK_FORBIDDEN_SCALE * 0.5);

        const pop = cc.spawn(
            cc.fadeIn(BLOCK_FORBIDDEN_POP * 0.55),
            cc.rotateTo(BLOCK_FORBIDDEN_POP, peakAngle * 1.08).easing(cc.easeBackOut()),
            cc.scaleTo(BLOCK_FORBIDDEN_POP, overshootScale)
        );
        const springSettle = cc.spawn(
            cc.rotateTo(BLOCK_FORBIDDEN_SETTLE, 0).easing(cc.easeElasticOut(BLOCK_FORBIDDEN_SPRING)),
            cc.scaleTo(BLOCK_FORBIDDEN_SETTLE * 0.85, BLOCK_FORBIDDEN_SCALE)
        );
        const rotateSnap = cc.sequence(
            cc.rotateBy(BLOCK_FORBIDDEN_WIGGLE * 0.45, -7)
                .easing(cc.easeElasticOut(BLOCK_FORBIDDEN_SPRING * 0.9)),
            cc.rotateBy(BLOCK_FORBIDDEN_WIGGLE * 0.55, 7)
                .easing(cc.easeElasticOut(BLOCK_FORBIDDEN_SPRING * 0.85))
        );

        badge.runAction(cc.sequence(
            pop,
            springSettle,
            rotateSnap,
            cc.delayTime(BLOCK_FORBIDDEN_HOLD),
            cc.spawn(
                cc.fadeOut(BLOCK_FORBIDDEN_FADE),
                cc.scaleTo(BLOCK_FORBIDDEN_FADE, BLOCK_FORBIDDEN_SCALE * 0.7)
            ),
            cc.callFunc(() => {
                if (badge && isValid(badge)) badge.destroy();
            }, this)
        ));
    }

    private playTileNudge(tiles: TileModel[], offsetX: number, offsetY: number): void {
        const ox = offsetX;
        const oy = offsetY;
        if (ox === 0 && oy === 0) return;
        const step = BLOCK_SHAKE_STEP;
        for (let i = 0; i < tiles.length; i++) {
            const tile = tiles[i];
            if (tile.removed || !tile.node || !isValid(tile.node)) continue;
            const node = tile.node;
            node.stopAllActions();
            node.runAction(cc.sequence(
                cc.moveBy(step, ox, oy),
                cc.moveBy(step * 2, -ox * 2, -oy * 2),
                cc.moveBy(step, ox, oy)
            ));
        }
    }

    setTileScale(tile: TileModel, scale: number): void {
        if (tile.removed || !tile.node || !isValid(tile.node)) return;
        tile.node.setScale(scale);
    }

    getBaseScale(tile: TileModel): number {
        return tile.baseScale !== undefined ? tile.baseScale : 1;
    }

    /** 消除碰撞时播放 Spine 特效（棋盘坐标） */
    playMatchEliminationEffect(x: number, y: number): void {
        if (!this.boardRoot || !isValid(this.boardRoot)) {
            return;
        }
        playMatchEliminationSpine(this.boardRoot, x, y);
    }

    /** 消除靠拢时两牌中心间距（贴边相碰、不重叠） */
    getMatchMeetCenterGap(tile?: TileModel, tight?: boolean): number {
        const cfg = this.config;
        const scale = cfg && cfg.displayScale !== undefined ? cfg.displayScale : 0.5;
        const w = cfg ? cfg.tileW * scale : 85 * 0.5;
        let nodeW = w;
        if (tile && tile.node && isValid(tile.node)) {
            const measured = tile.node.width * Math.abs(tile.node.scaleX);
            if (measured > 0) {
                nodeW = measured;
            }
        }
        if (tight) {
            return nodeW * 1.1;
        }
        return nodeW + 4;
    }

    restoreTileScale(tile: TileModel): void {
        this.setTileScale(tile, this.getBaseScale(tile));
        this.setTileSelectGlow(tile, false);
        this.setTileSelectOffset(tile, false);
    }

    highlightTileScale(tile: TileModel, _multiplier?: number): void {
        this.setTileSelectGlow(tile, true);
    }

    /** 玩家选中：外圈光效 + 扫光 + 相对中线左右微移 */
    highlightTileSelect(tile: TileModel, _multiplier?: number): void {
        this.setTileSelectGlow(tile, true);
        this.setTileSelectOffset(tile, true);
    }

    restoreTileSelect(tile: TileModel): void {
        this.restoreTileScale(tile);
    }

    /** 消除动画一开始就清掉选中（光效/扫光/偏移），避免与碰撞动画叠在一起 */
    clearTileSelectForMatch(tile: TileModel): void {
        if (!tile.node || !isValid(tile.node)) {
            return;
        }
        const node = tile.node;
        this.stopTileSelectEffect(node);
        node.stopActionByTag(SELECT_OFFSET_ACTION_TAG);
        node.setPosition(tile.x, tile.y);
        this.setTileScale(tile, this.getBaseScale(tile));
        this.stopTileHintMarquee(tile);
        this.stopTileHintSway(tile);
    }

    /** 当前关卡牌面在 X 方向的中线（用于选中左右偏移） */
    private getBoardCenterX(): number {
        let minX = Infinity;
        let maxX = -Infinity;
        for (let i = 0; i < this.tiles.length; i++) {
            const t = this.tiles[i];
            if (t.removed) continue;
            if (t.x < minX) minX = t.x;
            if (t.x > maxX) maxX = t.x;
        }
        if (!Number.isFinite(minX)) return 0;
        return (minX + maxX) * 0.5;
    }

    private getSelectShiftX(tile: TileModel): number {
        const dx = tile.x - this.getBoardCenterX();
        if (Math.abs(dx) <= SELECT_SHIFT_CENTER_EPS) return 0;
        return dx < 0 ? -SELECT_SHIFT_X : SELECT_SHIFT_X;
    }

    private setTileSelectOffset(tile: TileModel, on: boolean): void {
        if (tile.removed || !tile.node || !isValid(tile.node)) return;
        const node = tile.node;
        node.stopActionByTag(SELECT_OFFSET_ACTION_TAG);
        const shift = on ? this.getSelectShiftX(tile) : 0;
        const move = cc.moveTo(SELECT_SHIFT_DURATION, tile.x + shift, tile.y)
            .easing(cc.easeSineOut());
        move.setTag(SELECT_OFFSET_ACTION_TAG);
        node.runAction(move);
    }

    /** 上面无牌且左右无挡牌时，选中可置顶 */
    shouldRaiseOnSelect(tile: TileModel): boolean {
        return isFullyExposed(tile, this.tiles, this.config);
    }

    applyVisual(tile: TileModel): void {
        if (tile.removed || !tile.node || !isValid(tile.node)) return;
        tile.node.opacity = 255;
        tile.node.color = cc.Color.WHITE;
        const icon = tile.node.getChildByName('icon');
        if (icon && isValid(icon)) {
            icon.opacity = 255;
            icon.color = cc.Color.WHITE;
        }
        this.setTileDimMask(tile, tile.covered, 0);
        this.setTileSelectGlow(tile, false);
    }

    refreshVisuals(): void {
        refreshTileStates(this.tiles, this.config);
        for (let i = 0; i < this.tiles.length; i++) {
            const tile = this.tiles[i];
            if (tile.removed) continue;
            this.applyVisual(tile);
        }
    }

    getActiveCount(): number {
        let n = 0;
        for (let i = 0; i < this.tiles.length; i++) {
            if (!this.tiles[i].removed) n++;
        }
        return n;
    }

    private getMaxZIndex(): number {
        let maxZ = 0;
        for (let i = 0; i < this.tiles.length; i++) {
            const tile = this.tiles[i];
            if (tile.removed || !tile.node || !isValid(tile.node)) continue;
            if (tile.node.zIndex > maxZ) maxZ = tile.node.zIndex;
        }
        return maxZ;
    }

    /** 选中 / 提示时置顶，避免放大后被其它牌挡住 */
    bringTilesToFront(tiles: TileModel[]): void {
        let top = this.getMaxZIndex();
        for (let i = 0; i < tiles.length; i++) {
            const tile = tiles[i];
            if (tile.removed || !tile.node || !isValid(tile.node)) continue;
            if (tile.baseZIndex === undefined) {
                tile.baseZIndex = tile.node.zIndex;
            }
            tile.node.zIndex = top + 1 + i;
        }
    }

    /** 消除过程中：左牌在下、右牌在上 */
    bringMatchPairToFront(left: TileModel, right: TileModel): void {
        const top = this.getMaxZIndex();
        const lift = (tile: TileModel, z: number) => {
            if (!tile.node || !isValid(tile.node)) {
                return;
            }
            if (tile.baseZIndex === undefined) {
                tile.baseZIndex = tile.node.zIndex;
            }
            tile.node.zIndex = z;
        };
        lift(left, top + 1);
        lift(right, top + 2);
    }

    restoreTileZIndex(tile: TileModel): void {
        if (tile.removed || !tile.node || !isValid(tile.node)) return;
        if (tile.baseZIndex !== undefined) {
            tile.node.zIndex = tile.baseZIndex;
        }
    }

    restoreTilesZIndex(tiles: TileModel[]): void {
        for (let i = 0; i < tiles.length; i++) {
            this.restoreTileZIndex(tiles[i]);
        }
    }
}
