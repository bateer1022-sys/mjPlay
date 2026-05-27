import { isValid } from './is-valid';
import { TileModel } from './model/TileModel';
import { canMatch } from './core/MatchRule';
import { BoardManager } from './core/BoardManager';
import { collectRemainingMatchPairs, findHint, HintPair } from './core/HintSolver';
import { ArtScoreDisplay } from './ui/ArtScoreDisplay';
import { GamePreloader, PreloadResult } from './ui/GamePreloader';
import { LoadingScreen } from './ui/LoadingScreen';
import {
    AUTO_CLEAR_BEFORE_SETTLEMENT_SEC,
    RATE_RES_KEYS,
    rateResPath,
    LOADING_HIDE_BEFORE_ENTRANCE,
    LOADING_LOG_TIMING,
    TARGET_FRAME_RATE,
    SETTLEMENT_MATCH_PAIRS,
    GUIDE_HAND_PATH,
    Z_ORDER,
    Z_ORDER_END_CHILD,
} from './ui/GamePreloadConfig';
import { loadGameSpriteFrame } from './ui/GameImgAtlas';
import { layoutShowAllCover } from './ui/ShowAllLayout';
import {
    layoutVictoryEndDimBackdrop,
    playVictoryEndSequence,
    resetVictoryEndUnlock,
} from './ui/VictoryEndPanel';
import super_html_playable from './super_html_playable';

const { ccclass, property } = cc._decorator;

const LEVEL_PATH = 'data/level_01';
const CHECK_SOUND_PATH = 'check';
/** 无操作多少秒后自动高亮可消的一对 */
const IDLE_GUIDE_SECONDS = 2;
/** 提示跑马灯/晃动固定展示时长（秒内点击不提前关掉） */
const HINT_DISPLAY_SECONDS = 3;
/** 点击不可消牌：Canvas 上 hit 节点闪烁 */
const HIT_BLINK_STEP = 0.1;
const HIT_BLINK_COUNT = 3;
const HIT_BLINK_PEAK = 220;
const HIT_BLINK_LOW = 50;

/** 消除：先外弹 → 对齐 Y 中心 → 横向靠拢碰撞 → 消失 */
const MATCH_OUTWARD_DURATION = 0.14;
const MATCH_OUTWARD_DIST = 44;
const MATCH_ALIGN_Y_DURATION = 0.2;
const MATCH_MOVE_X_DURATION = 0.16;
const MATCH_TOUCH_DURATION = 0.08;
/** 两牌贴边相碰后停留再淡出 */
const MATCH_TOUCH_HOLD_DURATION = 0.18;
const MATCH_FADE_DURATION = 0.2;
/** 贴边后向中线轻顶一下（像素），不越过对侧 */
const MATCH_TOUCH_NUDGE = 5;

/** 结算前剩余牌快速自动消除 */
const AUTO_CLEAR_PAIR_FADE = 0.16;
const AUTO_CLEAR_MOVE_DURATION = 0.12;
const AUTO_CLEAR_STAGGER_MAX = 0.09;

/** 连消评级：情绪由弱到强，每多消 RATE_MATCH_STEP 对才升一级 */
const RATE_MATCH_STEP = 2;
const RATE_POP_IN_DURATION = 0.22;
const RATE_HOLD_DURATION = 0.55;
const RATE_POP_OUT_DURATION = 0.2;
/** 各档位基准缩放，越往后情绪越强、字越大 */
const RATE_TIER_SCALES = [0.68, 0.76, 0.84, 0.92, 1.02];
/** 评级图最大占屏宽比例，避免 unbelievable 等长图超出 */
const RATE_MAX_WIDTH_RATIO = 0.88;

/** 积分：基础 + 连击 + 评级阶段额外叠加 */
const SCORE_BASE = 200;
const SCORE_COMBO_ADD = 40;
const SCORE_RATE_BONUS = [100, 200, 350, 500, 800];
const SCORE_TOP_MARGIN = 64;


@ccclass
export default class GameController extends cc.Component {

    @property(cc.Prefab)
    tilePrefab: cc.Prefab = null;

    private boardNode: cc.Node = null;
    private board = new BoardManager();
    private selected: TileModel = null;
    private guideHighlight: HintPair = null;
    /** 当前提示是否在固定展示窗口内（3 秒内不因点击取消） */
    private hintDisplayLocked = false;
    private gameReady = false;
    private isRemoving = false;
    private checkClip: cc.AudioClip = null;
    private hitNode: cc.Node = null;
    private endNode: cc.Node = null;
    private comboNum = 0;
    /** 本局已成功消除的对数（达 SETTLEMENT_MATCH_PAIRS 即结算） */
    private matchPairCount = 0;
    private rateFrames: cc.SpriteFrame[] = [];
    private ratePopupNode: cc.Node = null;
    private scoreNum = 0;
    private scoreDisplay: ArtScoreDisplay = null;
    private scoreFont: cc.BitmapFont = null;
    private cachedLevelAsset: cc.JsonAsset = null;
    private loadingScreen: LoadingScreen = null;
    private isGameOver = false;
    /** 达结算条件后正在快速扫尾消除剩余牌 */
    private isAutoClearing = false;

    onLoad() {
        if (TARGET_FRAME_RATE > 0) {
            cc.game.setFrameRate(TARGET_FRAME_RATE);
        }
        cc.view.setResizeCallback(() => {
            this.layoutBackground();
            this.layoutHit();
            this.layoutScoreTop();
            this.layoutEndDimBackdrop();
            if (this.loadingScreen) {
                this.loadingScreen.layout();
            }
        });
    }

    onDestroy() {
        cc.view.setResizeCallback(null);
        this.unschedule(this.onIdleGuide);
    }

    start() {
        if (!this.tilePrefab) {
            cc.error('[GameController] 请在 Canvas 上绑定 mj 预制体');
            return;
        }
        this.boardNode = new cc.Node('Board');
        this.node.addChild(this.boardNode);
        this.hitNode = this.node.getChildByName('hit');
        if (this.hitNode && isValid(this.hitNode)) {
            this.hitNode.active = false;
            this.hitNode.opacity = 0;
        }
        this.endNode = this.node.getChildByName('end');
        this.hideEndPanel();
        this.layoutBackground();
        this.layoutHit();
        this.layoutScoreTop();
        this.boardNode.active = false;
        this.startWithLoading();

        const google_play = "https://apps.apple.com/us/app/mahjong-royal-tiles/id6747492600";
        const appstore = "https://play.google.com/store/apps/details?id=com.nebula.mahjongtile";

        super_html_playable.set_google_play_url(google_play);
        super_html_playable.set_app_store_url(appstore);
    }

    /** 显示加载界面，预加载资源后进入关卡 */
    private startWithLoading(): void {
        const loadT0 = LOADING_LOG_TIMING ? Date.now() : 0;
        this.loadingScreen = new LoadingScreen(this.node);
        this.loadingScreen.show(this.node);

        GamePreloader.run(() => {}, (result, err) => {
            if (err || !result) {
                if (this.loadingScreen) {
                    this.loadingScreen.hide();
                }
                cc.warn('[GameController]', err || '加载失败');
                return;
            }
            this.cachedLevelAsset = result.levelAsset;
            this.applyPreloadResult(result);
            GamePreloader.preloadGameplayAssets(() => this.refreshLazyAssets());

            const levelT0 = LOADING_LOG_TIMING ? Date.now() : 0;
            this.loadLevel(result.levelAsset, () => {
                this.boardNode.active = true;
                if (this.loadingScreen) {
                    this.loadingScreen.hide(() => {
                        if (LOADING_LOG_TIMING) {
                            cc.log(
                                `[GameController] 至关加载屏关闭 ${Date.now() - loadT0}ms` +
                                `（建关 ${Date.now() - levelT0}ms）`
                            );
                        }
                    });
                }
            });
        });
    }

    private applyPreloadResult(result: PreloadResult): void {
        if (result.checkClip) {
            this.checkClip = result.checkClip;
        }
        if (result.scoreFont) {
            this.scoreFont = result.scoreFont;
            this.scoreDisplay = ArtScoreDisplay.fromFont(result.scoreFont);
            this.scoreDisplay.mount(this.node, SCORE_TOP_MARGIN);
            this.scoreDisplay.setValue(0, false);
        }
        if (result.guideHandSf) {
            this.board.setGuideHandSprite(result.guideHandSf);
        }
    }

    /** 后台资源进缓存后刷新引用 */
    private refreshLazyAssets(): void {
        const frames: cc.SpriteFrame[] = new Array(RATE_RES_KEYS.length);
        let pending = RATE_RES_KEYS.length;
        RATE_RES_KEYS.forEach((key, idx) => {
            loadGameSpriteFrame(rateResPath(key), (frame) => {
                pending--;
                if (frame) {
                    frames[idx] = frame;
                }
                if (pending === 0) {
                    this.rateFrames = frames;
                }
            });
        });
        loadGameSpriteFrame(GUIDE_HAND_PATH, (sf) => {
            if (sf) {
                this.board.setGuideHandSprite(sf);
            }
        });
    }

    /** 本局是否已因点击收起引导小手 */
    private guideHandDismissedThisLevel = false;

    /** 引导小手：指向提示对子中靠左的一张 */
    private tryShowFirstGuideHand(hint: HintPair): void {
        if (this.guideHandDismissedThisLevel) {
            return;
        }
        this.board.showHintGuideHand(this.pickLeftGuideHandTile(hint));
    }

    private pickLeftGuideHandTile(hint: HintPair): TileModel {
        if (hint.a.x !== hint.b.x) {
            return hint.a.x < hint.b.x ? hint.a : hint.b;
        }
        return hint.a.y <= hint.b.y ? hint.a : hint.b;
    }

    /** 顶部居中：Widget 对齐（位图字体 Label） */
    private layoutScoreTop(): void {
        if (!this.scoreDisplay || !isValid(this.scoreDisplay.root)) {
            return;
        }
        this.scoreDisplay.setTopMargin(SCORE_TOP_MARGIN);
    }

    /** SHOW_ALL 下背景 cover 铺满可视区域（不含屏外黑边） */
    private layoutBackground(): void {
        const bg = this.node.getChildByName('bg');
        if (!bg || !isValid(bg)) {
            return;
        }
        layoutShowAllCover(bg, this.node);
        this.layoutEndDimBackdrop();
    }

    /** 结算 end 黑底与 bg 同步缩放 */
    private layoutEndDimBackdrop(): void {
        if (!this.endNode || !isValid(this.endNode) || !this.endNode.active) {
            return;
        }
        layoutVictoryEndDimBackdrop(this.endNode, this.node);
    }

    /** 与 bg 相同：hit 按 SHOW_ALL 铺满可视区域 */
    private layoutHit(): void {
        const hit = this.hitNode;
        if (!hit || !isValid(hit)) {
            return;
        }

        layoutShowAllCover(hit, this.node);
        hit.setPosition(0, 0);
    }

    /** 全屏 hit 遮罩闪烁（点击不可消牌） */
    private playHitBlink(): void {
        if (!this.hitNode || !isValid(this.hitNode)) {
            return;
        }
        const hit = this.hitNode;
        this.layoutHit();
        hit.stopAllActions();
        hit.zIndex = Z_ORDER.HIT;
        hit.active = true;
        hit.opacity = 0;

        const steps: cc.FiniteTimeAction[] = [];
        for (let i = 0; i < HIT_BLINK_COUNT; i++) {
            steps.push(cc.fadeTo(HIT_BLINK_STEP, HIT_BLINK_PEAK));
            steps.push(cc.fadeTo(HIT_BLINK_STEP, HIT_BLINK_LOW));
        }
        steps.push(cc.fadeTo(HIT_BLINK_STEP, 0));
        steps.push(cc.callFunc(() => {
            if (hit && isValid(hit)) {
                hit.active = false;
                hit.opacity = 0;
            }
        }, this));
        hit.runAction(cc.sequence(steps));
    }

    private loadLevel(cachedLevel?: cc.JsonAsset, onReady?: () => void) {
        this.gameReady = false;
        this.isGameOver = false;
        this.isAutoClearing = false;
        this.unschedule(this.finishAutoClearThenVictory);
        this.hideEndPanel();
        this.comboNum = 0;
        this.matchPairCount = 0;
        this.scoreNum = 0;
        if (this.scoreDisplay) {
            this.scoreDisplay.setValue(0, false);
        }
        this.board.hideHintGuideHand();
        this.guideHandDismissedThisLevel = false;
        this.clearGuideHighlight();
        this.unschedule(this.onIdleGuide);
        this.board.loadLevel(LEVEL_PATH, (err) => {
            if (err) {
                cc.warn('[GameController]', err);
                if (onReady) {
                    onReady();
                }
                return;
            }
            this.board.spawn(
                this.tilePrefab,
                this.boardNode,
                () => {
                    this.board.bindBoardClick(this.node, (tile) => this.onTileTap(tile));
                    this.gameReady = true;
                    this.resetIdleGuideTimer();
                    if (LOADING_HIDE_BEFORE_ENTRANCE && onReady) {
                        onReady();
                    }
                },
                () => {
                    this.showGuideHighlight();
                    if (!LOADING_HIDE_BEFORE_ENTRANCE && onReady) {
                        onReady();
                    }
                }
            );
        }, cachedLevel);
    }

    /** 当前是否正在展示提示（跑马灯/晃动窗口内不再重复触发） */
    private isGuideHintActive(): boolean {
        return this.hintDisplayLocked && this.guideHighlight != null;
    }

    /** 高亮一对可消除的牌（入场完成 / 长时间无操作）：外缘跑马灯，固定展示 3 秒 */
    private showGuideHighlight(): void {
        if (!this.gameReady || this.isRemoving || this.board.entrancePlaying) return;
        if (this.isGuideHintActive()) {
            return;
        }
        const hint = findHint(this.board.tiles);
        if (!hint) {
            this.clearGuideHighlight();
            return;
        }
        this.clearGuideHighlight();
        this.guideHighlight = hint;
        this.guideHandDismissedThisLevel = false;
        this.hintDisplayLocked = true;
        this.unschedule(this.onHintDisplayEnd);
        this.scheduleOnce(this.onHintDisplayEnd, HINT_DISPLAY_SECONDS);
        this.board.showGuideHintPair(hint.a, hint.b);
        this.unschedule(this.showFirstGuideHandDeferred);
        this.scheduleOnce(this.showFirstGuideHandDeferred, 0.12);
    }

    private onHintDisplayEnd = (): void => {
        if (!this.isGuideHintActive()) {
            return;
        }
        this.hintDisplayLocked = false;
        this.clearGuideHighlight();
        this.resetIdleGuideTimer();
    };

    private showFirstGuideHandDeferred = (): void => {
        if (!this.guideHighlight || this.guideHandDismissedThisLevel) {
            return;
        }
        this.tryShowFirstGuideHand(this.guideHighlight);
    };

    private clearGuideHighlight(): void {
        this.unschedule(this.onHintDisplayEnd);
        this.unschedule(this.showFirstGuideHandDeferred);
        this.hintDisplayLocked = false;
        this.board.hideHintGuideHand();
        this.board.clearAllGuideMarquees();
        this.guideHighlight = null;
    }

    /** 点击选中牌时：取消全部跑马灯 / 晃动 / 小手提示 */
    private cancelHintsOnSelect(): void {
        this.guideHandDismissedThisLevel = true;
        this.clearGuideHighlight();
        this.resetIdleGuideTimer();
    }

    private resetIdleGuideTimer(): void {
        this.unschedule(this.onIdleGuide);
        if (!this.gameReady || this.isRemoving || this.board.entrancePlaying) return;
        this.scheduleOnce(this.onIdleGuide, IDLE_GUIDE_SECONDS);
    }

    private onIdleGuide(): void {
        if (!this.gameReady || this.isAutoClearing || this.selected || this.isRemoving || this.board.entrancePlaying) {
            return;
        }
        if (this.isGuideHintActive()) {
            this.unschedule(this.onIdleGuide);
            this.scheduleOnce(this.onIdleGuide, IDLE_GUIDE_SECONDS);
            return;
        }
        this.showGuideHighlight();
    }

    private onTileTap(tile: TileModel) {
        if (this.isGameOver || this.isAutoClearing || tile.removed || this.isRemoving || this.board.entrancePlaying) {
            return;
        }
        if (!tile.free) {
            if (this.selected && this.selected.id !== tile.id) {
                this.deselectTile(this.selected);
            }
            this.comboNum = 0;
            this.board.playBlockedFeedback(tile);
            this.playHitBlink();
            return;
        }

        if (!this.selected) {
            this.cancelHintsOnSelect();
            this.selectTile(tile);
            return;
        }

        if (this.selected.id === tile.id) {
            this.deselectTile(this.selected);
            this.resetIdleGuideTimer();
            return;
        }

        if (!this.selected.free) {
            this.cancelHintsOnSelect();
            this.deselectTile(this.selected);
            this.selectTile(tile);
            return;
        }

        if (canMatch(this.selected, tile)) {
            const first = this.selected;
            this.selected = null;
            this.removePair(first, tile);
            return;
        }

        this.cancelHintsOnSelect();
        this.switchSelection(tile);
    }

    private switchSelection(tile: TileModel) {
        const prev = this.selected;
        if (prev && prev.id !== tile.id) {
            this.deselectTile(prev);
        }
        this.selectTile(tile);
    }

    private selectTile(tile: TileModel) {
        if (!tile.node || !isValid(tile.node)) {
            return;
        }
        if (this.selected && this.selected.id !== tile.id) {
            this.deselectTile(this.selected);
        }
        this.selected = tile;
        this.board.bringTilesToFront([tile]);
        this.board.highlightTileSelect(tile);
    }

    private deselectTile(tile: TileModel, restoreZ: boolean = true) {
        if (this.selected && this.selected.id === tile.id) {
            this.selected = null;
        }
        if (!tile.removed && tile.node && isValid(tile.node)) {
            this.board.restoreTileSelect(tile);
            if (restoreZ) this.board.restoreTileZIndex(tile);
            this.board.applyVisual(tile);
        }
        this.resetIdleGuideTimer();
    }

    private removePair(a: TileModel, b: TileModel) {
        if (!a.node || !b.node || !isValid(a.node) || !isValid(b.node)) return;

        this.unschedule(this.onIdleGuide);
        this.clearGuideHighlight();
        this.selected = null;
        this.board.clearTileSelectForMatch(a);
        this.board.clearTileSelectForMatch(b);
        const leftTile = a.x <= b.x ? a : b;
        const rightTile = a.x <= b.x ? b : a;
        this.board.bringMatchPairToFront(leftTile, rightTile);
        a.removed = true;
        b.removed = true;
        this.isRemoving = true;

        const midY = (a.y + b.y) * 0.5;
        const midX = (a.x + b.x) * 0.5;
        const pairDist = Math.abs(leftTile.x - rightTile.x);
        const meetGap = Math.max(
            this.board.getMatchMeetCenterGap(leftTile, true),
            this.board.getMatchMeetCenterGap(rightTile, true)
        );
        const halfGap = meetGap * 0.5;
        const leftStopX = midX - halfGap;
        const rightStopX = midX + halfGap;
        const outwardDist = Math.max(MATCH_OUTWARD_DIST, pairDist * 0.2 + 28);

        this.playMatchCollideAnim(leftTile, midX, midY, 'left', leftStopX, outwardDist);
        this.playMatchCollideAnim(rightTile, midX, midY, 'right', rightStopX, outwardDist);

        const meetMoment =
            MATCH_OUTWARD_DURATION + MATCH_ALIGN_Y_DURATION + MATCH_MOVE_X_DURATION + MATCH_TOUCH_DURATION;
        this.scheduleOnce(() => {
            this.board.bringMatchPairToFront(leftTile, rightTile);
            this.board.playMatchEliminationEffect(midX, midY);
        }, meetMoment);

        const bumpDelay =
            MATCH_OUTWARD_DURATION +
            MATCH_ALIGN_Y_DURATION +
            MATCH_MOVE_X_DURATION +
            MATCH_TOUCH_DURATION +
            MATCH_TOUCH_HOLD_DURATION;
        this.comboNum++;
        this.matchPairCount++;
        const rateTier = this.getRateTierIndex(this.comboNum);
        const scoreGain = this.calcMatchScoreGain(this.comboNum, rateTier);
        this.scheduleOnce(() => {
            this.playCheckSound();
            if (rateTier !== null) {
                this.playRatePopup(rateTier);
            }
            this.addScore(scoreGain);
        }, bumpDelay);

        const total =
            MATCH_OUTWARD_DURATION +
            MATCH_ALIGN_Y_DURATION +
            MATCH_MOVE_X_DURATION +
            MATCH_TOUCH_DURATION +
            MATCH_TOUCH_HOLD_DURATION +
            MATCH_FADE_DURATION;

        this.scheduleOnce(() => {
            this.isRemoving = false;
            this.board.refreshVisuals();
            this.checkWin();
        }, total + 0.05);
    }

    /**
     * 1. 沿左右先往外弹开（保持当前 Y）
     * 2. 移到两牌 Y 中心高度
     * 3. 横向靠拢到中线两侧（中心距 = 牌宽，贴边不叠）
     * 4. 轻顶相碰 → 停留片刻 → 淡出销毁
     */
    private playMatchCollideAnim(
        tile: TileModel,
        midX: number,
        midY: number,
        side: 'left' | 'right',
        stopX: number,
        outwardDist: number
    ): void {
        const node = tile.node;
        this.board.clearTileSelectForMatch(tile);
        const startX = tile.x;
        const startY = tile.y;
        node.setPosition(startX, startY);
        const outX = side === 'left' ? startX - outwardDist : startX + outwardDist;
        const baseScale = this.board.getBaseScale(tile);
        const touchX = side === 'left'
            ? Math.min(stopX + MATCH_TOUCH_NUDGE, midX - 1)
            : Math.max(stopX - MATCH_TOUCH_NUDGE, midX + 1);

        node.stopAllActions();
        node.runAction(cc.sequence(
            cc.moveTo(MATCH_OUTWARD_DURATION, outX, startY).easing(cc.easeBackOut()),
            cc.moveTo(MATCH_ALIGN_Y_DURATION, outX, midY).easing(cc.easeSineOut()),
            cc.moveTo(MATCH_MOVE_X_DURATION, stopX, midY).easing(cc.easeCubicActionIn()),
            // cc.moveTo(MATCH_TOUCH_DURATION, touchX, midY).easing(cc.easeSineIn()),
            // cc.delayTime(MATCH_TOUCH_HOLD_DURATION),
            cc.spawn(
                cc.sequence(
                    cc.scaleTo(MATCH_FADE_DURATION * 0.35, baseScale * 1.06),
                    cc.scaleTo(MATCH_FADE_DURATION, 0).easing(cc.easeBackIn())
                ),
                cc.fadeOut(MATCH_FADE_DURATION)
            ),
            cc.callFunc(() => {
                if (node && isValid(node)) node.destroy();
            })
        ));
    }

    /** 本局消除得分：基础分 + 连击加成 + 评级阶段奖励 */
    private calcMatchScoreGain(combo: number, rateTier: number | null): number {
        let gain = SCORE_BASE + SCORE_COMBO_ADD * combo;
        if (rateTier !== null) {
            gain += SCORE_RATE_BONUS[rateTier] || 0;
        }
        return gain;
    }

    private addScore(delta: number): void {
        this.scoreNum += delta;
        if (this.scoreDisplay) {
            this.scoreDisplay.addValue(delta);
        }
    }

    /**
     * 连消 2 对 → good，4 对 → great … 10+ → unbelievable。
     * 未到下一档间隔时不弹字。
     */
    private getRateTierIndex(combo: number): number | null {
        if (combo <= 0 || combo % RATE_MATCH_STEP !== 0) {
            return null;
        }
        const idx = Math.floor(combo / RATE_MATCH_STEP) - 1;
        if (idx < 0) {
            return null;
        }
        return Math.min(idx, RATE_RES_KEYS.length - 1);
    }

    /** 评级图在屏宽内的最大缩放（设计坐标） */
    private getRatePopupFitCap(frame: cc.SpriteFrame): number {
        const spriteW = frame ? frame.getRect().width : 0;
        if (spriteW <= 0 || !this.node || !isValid(this.node)) {
            return Number.POSITIVE_INFINITY;
        }
        return (this.node.width * RATE_MAX_WIDTH_RATIO) / spriteW;
    }

    private getRatePopupTargetScale(tierIndex: number, frame: cc.SpriteFrame): number {
        const tierScale = RATE_TIER_SCALES[tierIndex] || RATE_TIER_SCALES[0];
        return Math.min(tierScale, this.getRatePopupFitCap(frame));
    }

    /** 屏幕正中弹出评级字，带弹出与收回动画 */
    playRatePopup(tierIndex: number): void {
        if (!this.node || !isValid(this.node)) {
            return;
        }
        const frame = this.rateFrames[tierIndex];
        if (!frame) {
            return;
        }

        if (this.ratePopupNode && isValid(this.ratePopupNode)) {
            this.ratePopupNode.stopAllActions();
            this.ratePopupNode.destroy();
            this.ratePopupNode = null;
        }

        const node = new cc.Node('RatePopup');
        node.setPosition(0, 0);
        node.zIndex = Z_ORDER.RATE_POPUP;
        node.scale = 0;
        node.opacity = 0;
        this.node.addChild(node);
        this.ratePopupNode = node;

        const sprite = node.addComponent(cc.Sprite);
        sprite.spriteFrame = frame;
        sprite.sizeMode = cc.Sprite.SizeMode.TRIMMED;

        const targetScale = this.getRatePopupTargetScale(tierIndex, frame);
        const fitCap = this.getRatePopupFitCap(frame);
        const popPeak = Math.min(targetScale * 1.14, fitCap);
        const popOutScale = Math.min(targetScale * 1.22, fitCap);
        node.stopAllActions();
        node.runAction(cc.sequence(
            cc.spawn(
                cc.scaleTo(RATE_POP_IN_DURATION, popPeak).easing(cc.easeBackOut()),
                cc.fadeIn(RATE_POP_IN_DURATION * 0.65)
            ),
            cc.scaleTo(0.06, targetScale).easing(cc.easeSineOut()),
            cc.delayTime(RATE_HOLD_DURATION),
            cc.spawn(
                cc.scaleTo(RATE_POP_OUT_DURATION, popOutScale).easing(cc.easeBackIn()),
                cc.fadeOut(RATE_POP_OUT_DURATION)
            ),
            cc.callFunc(() => {
                if (this.ratePopupNode === node) {
                    this.ratePopupNode = null;
                }
                if (node && isValid(node)) {
                    node.destroy();
                }
            }, this)
        ));
    }

    private playCheckSound(): void {
        if(!super_html_playable.is_audio()) { 
            return;
        }
        if (this.checkClip) {
            cc.audioEngine.playEffect(this.checkClip, false);
            return;
        }
        cc.resources.load(CHECK_SOUND_PATH, cc.AudioClip, (err, clip) => {
            if (!err && clip) {
                this.checkClip = clip;
                cc.audioEngine.playEffect(clip, false);
            }
        });
    }

    private checkWin() {
        if (this.isAutoClearing) {
            return;
        }
        if (this.matchPairCount >= SETTLEMENT_MATCH_PAIRS) {
            this.beginVictoryWithAutoClear();
            return;
        }
        const left = this.board.getActiveCount();
        if (left === 0) {
            this.showVictory();
            return;
        }
        this.resetIdleGuideTimer();
    }

    /** 剩余牌在 AUTO_CLEAR_BEFORE_SETTLEMENT_SEC 内快速配对消除，再出结算 */
    private beginVictoryWithAutoClear(): void {
        if (this.isGameOver || this.isAutoClearing) {
            return;
        }
        const pairs = collectRemainingMatchPairs(this.board.tiles);
        if (pairs.length === 0) {
            this.showVictory();
            return;
        }

        this.isAutoClearing = true;
        this.gameReady = false;
        this.unschedule(this.onIdleGuide);
        this.board.hideHintGuideHand();
        this.clearGuideHighlight();
        if (this.selected) {
            this.deselectTile(this.selected);
            this.selected = null;
        }

        const budget = AUTO_CLEAR_BEFORE_SETTLEMENT_SEC;
        const pairAnim = AUTO_CLEAR_MOVE_DURATION + AUTO_CLEAR_PAIR_FADE;
        const n = pairs.length;
        const stagger = n <= 1
            ? 0
            : Math.min(AUTO_CLEAR_STAGGER_MAX, (budget - pairAnim) / (n - 1));

        for (let i = 0; i < n; i++) {
            const pair = pairs[i];
            this.scheduleOnce(() => {
                this.removePairAuto(pair.a, pair.b);
            }, i * stagger);
        }

        this.unschedule(this.finishAutoClearThenVictory);
        this.scheduleOnce(this.finishAutoClearThenVictory, budget);
    }

    private finishAutoClearThenVictory = (): void => {
        if (!this.isAutoClearing) {
            return;
        }
        this.isAutoClearing = false;
        this.fadeOutUnpairedRemainders();
        this.board.refreshVisuals();
        this.showVictory();
    };

    /** 无法配对的零星剩余牌直接淡出 */
    private fadeOutUnpairedRemainders(): void {
        for (let i = 0; i < this.board.tiles.length; i++) {
            const tile = this.board.tiles[i];
            if (tile.removed || !tile.node || !isValid(tile.node)) {
                continue;
            }
            tile.removed = true;
            const node = tile.node;
            node.stopAllActions();
            node.runAction(cc.sequence(
                cc.fadeOut(AUTO_CLEAR_PAIR_FADE),
                cc.callFunc(() => {
                    if (node && isValid(node)) {
                        node.destroy();
                    }
                })
            ));
        }
    }

    /** 结算扫尾：短移动 + 淡出，可并行多对 */
    private removePairAuto(a: TileModel, b: TileModel): void {
        if (!a.node || !b.node || !isValid(a.node) || !isValid(b.node) || a.removed || b.removed) {
            return;
        }

        this.board.clearTileSelectForMatch(a);
        this.board.clearTileSelectForMatch(b);
        const leftTile = a.x <= b.x ? a : b;
        const rightTile = a.x <= b.x ? b : a;
        this.board.bringMatchPairToFront(leftTile, rightTile);

        a.removed = true;
        b.removed = true;

        const midX = (leftTile.x + rightTile.x) * 0.5;
        const midY = (leftTile.y + rightTile.y) * 0.5;
        this.board.playMatchEliminationEffect(midX, midY);

        this.comboNum++;
        this.addScore(this.calcMatchScoreGain(this.comboNum, null));

        this.playAutoClearTileAnim(leftTile, midX, midY, 'left');
        this.playAutoClearTileAnim(rightTile, midX, midY, 'right');
    }

    private playAutoClearTileAnim(
        tile: TileModel,
        midX: number,
        midY: number,
        side: 'left' | 'right'
    ): void {
        const node = tile.node;
        if (!node || !isValid(node)) {
            return;
        }
        const startX = tile.x;
        const startY = tile.y;
        const targetX = side === 'left' ? midX - 8 : midX + 8;
        const baseScale = this.board.getBaseScale(tile);
        node.stopAllActions();
        node.setScale(baseScale);
        node.runAction(cc.sequence(
            cc.spawn(
                cc.moveTo(AUTO_CLEAR_MOVE_DURATION, targetX, midY).easing(cc.easeSineOut()),
                cc.fadeTo(AUTO_CLEAR_MOVE_DURATION, 230),
                cc.scaleTo(AUTO_CLEAR_MOVE_DURATION, baseScale * 1.04)
            ),
            cc.spawn(
                cc.scaleTo(AUTO_CLEAR_PAIR_FADE, 0).easing(cc.easeBackIn()),
                cc.fadeOut(AUTO_CLEAR_PAIR_FADE)
            ),
            cc.callFunc(() => {
                if (node && isValid(node)) {
                    node.destroy();
                }
            })
        ));
    }

    private hideEndPanel(): void {
        if (!this.endNode || !isValid(this.endNode)) {
            return;
        }
        this.unschedule(this.bindEndDownloadButton);
        const download = this.endNode.getChildByName('download');
        if (download && isValid(download)) {
            download.targetOff(this);
        }
        resetVictoryEndUnlock(this.endNode);
        this.endNode.stopAllActions();
        this.endNode.active = false;
        this.endNode.scale = 1;
        this.endNode.opacity = 255;
        if (this.scoreDisplay) {
            this.scoreDisplay.remountToGameHud(this.node, SCORE_TOP_MARGIN);
            this.scoreDisplay.setVisible(true);
        }
    }

    /** 显示 Canvas 上配置的 end 节点：分步播放 icon / victory / 星星 / TaskLight / 下载按钮 */
    private showEndPanel(): void {
        if (!this.endNode || !isValid(this.endNode)) {
            cc.warn('[GameController] 未找到 Canvas/end 节点');
            return;
        }
        super_html_playable.game_end();
        this.endNode.zIndex = Z_ORDER.END_PANEL;
        this.endNode.active = true;
        this.endNode.stopAllActions();
        this.endNode.scale = 1;
        this.endNode.opacity = 255;
        this.endNode.color = cc.Color.WHITE;
        layoutVictoryEndDimBackdrop(this.endNode, this.node);
        playVictoryEndSequence(
            this.endNode,
            this.scoreNum,
            this.scoreFont,
            this.scoreDisplay
        );
        this.bindEndDownloadButton();
        this.scheduleOnce(() => this.bindEndDownloadButton(), 2);
    }

    /** 绑定 end/download（有 Button 用 clickEvents，否则 TOUCH_END） */
    private bindEndDownloadButton(): void {
        if (!this.endNode || !isValid(this.endNode)) {
            return;
        }
        const btn = this.endNode.getChildByName('download');
        if (!btn || !isValid(btn)) {
            cc.warn('[GameController] end/download 节点不存在');
            return;
        }
        btn.active = true;
        btn.opacity = 255;
        btn.zIndex = Z_ORDER_END_CHILD.DOWNLOAD;

        btn.targetOff(this);
        const button = btn.getComponent(cc.Button);
        if (button) {
            button.interactable = true;
            button.clickEvents = [];
            const ev = new cc.Component.EventHandler();
            ev.target = this.node;
            ev.component = 'GameController';
            ev.handler = 'onEndDownloadClick';
            button.clickEvents.push(ev);
            return;
        }
        btn.on(cc.Node.EventType.TOUCH_END, this.onEndDownloadClick, this);
    }

    /** 结算 download（public：供 Button.clickEvents 调用） */
    public onEndDownloadClick(): void {
        super_html_playable.download();
    }

    private showVictory(): void {
        if (this.isGameOver) {
            return;
        }
        this.isGameOver = true;
        this.gameReady = false;
        if (this.scoreDisplay) {
            this.scoreDisplay.setVisible(false);
        }
        this.unschedule(this.onIdleGuide);
        this.board.hideHintGuideHand();
        this.clearGuideHighlight();
        if (this.selected) {
            this.deselectTile(this.selected);
            this.selected = null;
        }

        this.scheduleOnce(() => {
            if (this.scoreDisplay) {
                this.scoreDisplay.setValue(this.scoreNum, false);
            }
            this.showEndPanel();
        }, 0.2);
    }
}
