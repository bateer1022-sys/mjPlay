import { isValid } from '../is-valid';
import { layoutShowAllCover } from './ShowAllLayout';
import { LOADING_MIN_VISIBLE_SEC, Z_ORDER } from './GamePreloadConfig';

const LOADING_FADE_OUT = 0.18;

/**
 * 全屏加载：遮罩与 bg 同图同缩放，中央圆形转圈。
 */
export class LoadingScreen {
    readonly root: cc.Node;
    private readonly canvas: cc.Node;
    private maskNode: cc.Node = null;
    private shownAt = 0;

    constructor(canvas: cc.Node) {
        this.canvas = canvas;
        this.root = new cc.Node('LoadingScreen');
        this.root.zIndex = Z_ORDER.LOADING;
        this.root.opacity = 255;

        const spin = new cc.Node('Spinner');
        const spinG = spin.addComponent(cc.Graphics);
        spinG.strokeColor = cc.color(255, 210, 90, 220);
        spinG.lineWidth = 5;
        spinG.arc(0, 0, 32, 0.15 * Math.PI, 1.65 * Math.PI);
        spinG.stroke();
        this.root.addChild(spin);
        spin.runAction(cc.repeatForever(cc.rotateBy(1.1, 360)));
    }

    show(parent: cc.Node): void {
        if (!parent || !isValid(parent)) {
            return;
        }
        this.shownAt = Date.now();
        this.ensureMask();
        this.layout();
        this.root.stopAllActions();
        this.root.opacity = 255;
        if (this.root.parent !== parent) {
            this.root.removeFromParent(false);
            parent.addChild(this.root);
        }
        this.root.active = true;
    }

    /** 窗口变化时与 bg 一起重新铺满 */
    layout(): void {
        if (this.maskNode && isValid(this.maskNode)) {
            layoutShowAllCover(this.maskNode, this.canvas);
        }
    }

    hide(onDone?: () => void): void {
        const elapsed = (Date.now() - this.shownAt) / 1000;
        const wait = Math.max(0, LOADING_MIN_VISIBLE_SEC - elapsed);
        this.root.stopAllActions();
        this.root.runAction(cc.sequence(
            cc.delayTime(wait),
            cc.fadeOut(LOADING_FADE_OUT),
            cc.callFunc(() => {
                if (this.root && isValid(this.root)) {
                    this.root.active = false;
                    this.root.opacity = 255;
                }
                if (onDone) {
                    onDone();
                }
            })
        ));
    }

    private ensureMask(): void {
        if (this.maskNode && isValid(this.maskNode)) {
            return;
        }
        const bg = this.canvas.getChildByName('bg');
        if (!bg || !isValid(bg)) {
            return;
        }
        const bgSprite = bg.getComponent(cc.Sprite);
        if (!bgSprite || !bgSprite.spriteFrame) {
            return;
        }

        this.maskNode = new cc.Node('LoadingMask');
        this.maskNode.setAnchorPoint(0.5, 0.5);
        const maskSprite = this.maskNode.addComponent(cc.Sprite);
        maskSprite.spriteFrame = bgSprite.spriteFrame;
        maskSprite.sizeMode = bgSprite.sizeMode;
        maskSprite.type = bgSprite.type;
        this.root.addChild(this.maskNode);
        this.maskNode.setSiblingIndex(0);
    }
}
