/** 使用 Cocos 官方位图字体（.fnt + .png）+ Label 显示积分 */
import { isValid } from '../is-valid';
import { SCORE_GLOW_PATH, Z_ORDER, Z_ORDER_END_CHILD } from './GamePreloadConfig';
import { loadGameSpriteFrame } from './GameImgAtlas';

const SCORE_FONT_PATH = 'font/score_digits';
const SCORE_LABEL_FONT_SIZE = 54;
const SCORE_LABEL_LINE_HEIGHT = 70;
const SCORE_PUNCH_SCALE = 1.08;
const SCORE_PUNCH_DURATION = 0.12;
const SETTLE_POP_SCALE = 1.32;
const SETTLE_POP_IN_DURATION = 0.28;

/** 背光：由小变大并淡出 */
const SCORE_GLOW_SCALE_START = 0.35;
const SCORE_GLOW_SCALE_END = 1.15;
const SCORE_GLOW_DURATION = 0.48;

export class ArtScoreDisplay {
    readonly root: cc.Node;
    private readonly label: cc.Label;
    private readonly glowNode: cc.Node;
    private value = 0;
    private glowSf: cc.SpriteFrame = null;

    static load(onReady: (display: ArtScoreDisplay | null) => void): void {
        cc.resources.load(SCORE_FONT_PATH, cc.BitmapFont, (err, font) => {
            if (err || !font) {
                cc.warn('[ArtScoreDisplay] 位图字体加载失败:', SCORE_FONT_PATH, err);
                onReady(null);
                return;
            }
            onReady(ArtScoreDisplay.fromFont(font));
        });
    }

    static fromFont(font: cc.BitmapFont): ArtScoreDisplay {
        return new ArtScoreDisplay(font);
    }

    private constructor(font: cc.BitmapFont) {
        this.root = new cc.Node('ScorePanel');
        this.root.zIndex = Z_ORDER.SCORE_HUD;

        this.glowNode = new cc.Node('score_glow');
        this.glowNode.setAnchorPoint(0.5, 0.5);
        this.glowNode.active = false;
        this.glowNode.opacity = 0;
        this.root.addChild(this.glowNode);

        const labelNode = new cc.Node('score_label');
        labelNode.setAnchorPoint(0.5, 0.5);
        this.root.addChild(labelNode);

        this.label = labelNode.addComponent(cc.Label);
        this.label.font = font;
        this.label.fontSize = SCORE_LABEL_FONT_SIZE;
        this.label.lineHeight = SCORE_LABEL_LINE_HEIGHT;
        this.label.enableWrapText = false;
        this.label.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
        this.label.verticalAlign = cc.Label.VerticalAlign.CENTER;
        this.label.string = '0';

        const widget = this.root.addComponent(cc.Widget);
        widget.isAlignTop = true;
        widget.isAlignHorizontalCenter = true;
        widget.horizontalCenter = 0;
        widget.isAbsoluteTop = true;
        widget.alignMode = cc.Widget.AlignMode.ON_WINDOW_RESIZE;
    }

    mount(parent: cc.Node, topMargin: number): void {
        parent.addChild(this.root);
        this.setTopMargin(topMargin);
        this.setValue(0, false);
    }

    setTopMargin(top: number): void {
        const widget = this.root.getComponent(cc.Widget);
        if (widget) {
            widget.top = top;
            widget.updateAlignment();
        }
    }

    getValue(): number {
        return this.value;
    }

    setVisible(visible: boolean): void {
        if (isValid(this.root)) {
            this.root.active = visible;
        }
    }

    setValue(next: number, animate: boolean = true): void {
        this.value = Math.max(0, Math.floor(next));
        this.label.string = String(this.value);
        this.syncGlowToScore();
        if (animate) {
            this.playPunch();
            this.playScoreGlow();
        }
    }

    addValue(delta: number): void {
        if (delta <= 0) {
            return;
        }
        this.setValue(this.value + delta, true);
    }

    /** 背光与分数同锚点 (0.5,0.5)、同位置 */
    private syncGlowToScore(): void {
        const labelNode = this.label.node;
        if (!labelNode || !isValid(labelNode) || !isValid(this.glowNode)) {
            return;
        }
        labelNode.setAnchorPoint(0.5, 0.5);
        this.glowNode.setAnchorPoint(0.5, 0.5);
        this.glowNode.setPosition(labelNode.x, labelNode.y);
    }

    private playPunch(): void {
        const labelNode = this.label.node;
        labelNode.stopAllActions();
        const base = 1;
        labelNode.scale = base;
        labelNode.runAction(cc.sequence(
            cc.scaleTo(SCORE_PUNCH_DURATION, SCORE_PUNCH_SCALE).easing(cc.easeBackOut()),
            cc.scaleTo(SCORE_PUNCH_DURATION, base).easing(cc.easeSineOut())
        ));
    }

    private playScoreGlow(): void {
        const run = (): void => {
            if (!this.glowSf || !isValid(this.glowNode)) {
                return;
            }
            let sprite = this.glowNode.getComponent(cc.Sprite);
            if (!sprite) {
                sprite = this.glowNode.addComponent(cc.Sprite);
            }
            sprite.spriteFrame = this.glowSf;
            sprite.sizeMode = cc.Sprite.SizeMode.TRIMMED;

            this.syncGlowToScore();

            this.glowNode.stopAllActions();
            this.glowNode.active = true;
            this.glowNode.opacity = 255;
            this.glowNode.setScale(SCORE_GLOW_SCALE_START);
            this.glowNode.runAction(cc.spawn(
                cc.scaleTo(SCORE_GLOW_DURATION, SCORE_GLOW_SCALE_END).easing(cc.easeSineOut()),
                cc.sequence(
                    cc.delayTime(SCORE_GLOW_DURATION * 0.2),
                    cc.fadeOut(SCORE_GLOW_DURATION * 0.8).easing(cc.easeSineIn())
                )
            ));
            this.glowNode.runAction(cc.sequence(
                cc.delayTime(SCORE_GLOW_DURATION + 0.02),
                cc.callFunc(() => {
                    if (this.glowNode && isValid(this.glowNode)) {
                        this.glowNode.active = false;
                        this.glowNode.opacity = 0;
                    }
                }, null)
            ));
        };

        if (this.glowSf) {
            run();
            return;
        }
        loadGameSpriteFrame(SCORE_GLOW_PATH, (sf) => {
            if (sf) {
                this.glowSf = sf;
            }
            run();
        });
    }

    getBitmapFont(): cc.BitmapFont | null {
        return this.label && this.label.font ? this.label.font : null;
    }

    /** 挂到 end 节点上，在 TaskLight 附近显示结算分 */
    mountOnEndSettle(endRoot: cc.Node, localX: number, localY: number): void {
        if (!endRoot || !isValid(endRoot) || !isValid(this.root)) {
            return;
        }
        const widget = this.root.getComponent(cc.Widget);
        if (widget) {
            widget.enabled = false;
        }
        if (this.root.parent !== endRoot) {
            this.root.removeFromParent(false);
            endRoot.addChild(this.root);
        }
        this.root.setPosition(localX, localY);
        this.root.zIndex = Z_ORDER_END_CHILD.SCORE;
        this.root.active = true;
    }

    /** 结算结束，恢复顶部 HUD */
    remountToGameHud(canvas: cc.Node, topMargin: number): void {
        if (!canvas || !isValid(canvas) || !isValid(this.root)) {
            return;
        }
        if (this.glowNode && isValid(this.glowNode)) {
            this.glowNode.stopAllActions();
            this.glowNode.active = false;
            this.glowNode.opacity = 0;
        }
        this.root.stopAllActions();
        this.root.scale = 1;
        this.root.opacity = 255;
        if (this.root.parent !== canvas) {
            this.root.removeFromParent(false);
            canvas.addChild(this.root);
        }
        this.root.zIndex = Z_ORDER.SCORE_HUD;
        const widget = this.root.getComponent(cc.Widget);
        if (widget) {
            widget.enabled = true;
            widget.isAlignTop = true;
            widget.isAlignHorizontalCenter = true;
            widget.horizontalCenter = 0;
            widget.isAbsoluteTop = true;
        }
        this.setTopMargin(topMargin);
    }

    /** 通关结算：沿用顶部唯一位图 Label，避免再建 Label 导致主分数消失 */
    playSettleReveal(): void {
        if (this.glowNode && isValid(this.glowNode)) {
            this.glowNode.stopAllActions();
            this.glowNode.active = false;
        }
        this.root.zIndex = Z_ORDER_END_CHILD.SCORE;
        this.label.string = String(this.value);
        this.root.stopAllActions();
        this.root.scale = 0.3;
        this.root.opacity = 0;
        this.root.runAction(cc.spawn(
            cc.scaleTo(SETTLE_POP_IN_DURATION, SETTLE_POP_SCALE).easing(cc.easeBackOut()),
            cc.fadeIn(SETTLE_POP_IN_DURATION * 0.7)
        ));
        this.root.runAction(cc.sequence(
            cc.delayTime(SETTLE_POP_IN_DURATION),
            cc.scaleTo(0.08, 1).easing(cc.easeSineOut())
        ));
    }
}
