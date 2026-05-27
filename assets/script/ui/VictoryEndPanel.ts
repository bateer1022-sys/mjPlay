/** end 结算分步动画 */

import { isValid } from '../is-valid';
import { Z_ORDER_END_CHILD } from './GamePreloadConfig';
import { ArtScoreDisplay } from './ArtScoreDisplay';
import { layoutShowAllCover } from './ShowAllLayout';

const END_DIM_BACKDROP_NAME = 'end_dim_backdrop';
/** 纯黑遮罩透明度 0.5（0–255） */
const END_DIM_OPACITY = 128;

let cachedWhiteSpriteFrame: cc.SpriteFrame = null;

function getWhiteSpriteFrame(): cc.SpriteFrame {
    if (cachedWhiteSpriteFrame) {
        return cachedWhiteSpriteFrame;
    }
    const tex = new cc.Texture2D();
    tex.initWithData(
        new Uint8Array([255, 255, 255, 255]),
        cc.Texture2D.PixelFormat.RGBA8888,
        1,
        1
    );
    cachedWhiteSpriteFrame = new cc.SpriteFrame();
    cachedWhiteSpriteFrame.setTexture(tex);
    return cachedWhiteSpriteFrame;
}

const NODE_ICON = 'icon';
const NODE_VICTORY = 'victory';
const NODE_TASK_LIGHT = 'TaskLight';
/** 场景里常见节点名（优先 download，兼容旧名） */
const DOWNLOAD_BTN_NAMES = ['download', 'btn_download_en_250x80'];
const NODE_END_SCORE = 'end_score';
const STAR_NAMES = ['star1', 'star2', 'star3'];

const SPINE_VICTORY_APPEAR = 'Appear';
const SPINE_VICTORY_LOOP = 'Loop';
const SPINE_TASK_APPEAR = 'Appear1';

/** victory Appear 监听超时兜底（秒） */
const VICTORY_APPEAR_FALLBACK = 0.72;
/** icon 从小放大到场景设计缩放 */
const ICON_START_SCALE = 0.15;
const ICON_POP_DURATION = 0.26;
const ICON_SETTLE_DURATION = 0.08;
const STAR_START_SCALE = 0.1;
const STAR_POP_DURATION = 0.3;
const STAR_STAGGER = 0.07;
/** TaskLight Appear1 监听超时兜底（秒） */
const TASK_APPEAR_FALLBACK = 0.95;
/** 相对 TaskLight 的 Y 偏移（end 本地坐标） */
const SCORE_ABOVE_TASK_Y = 0;
const END_SCORE_Z_INDEX = 55;
const SCORE_FONT_SIZE = 54;
const SCORE_LINE_HEIGHT = 70;
const SCORE_PUNCH_SCALE = 1.08;
const SCORE_PUNCH_DURATION = 0.1;
const BTN_POP_DURATION = 0.24;
/** 下载按钮弹出后的呼吸缩放（相对设计缩放） */
const BTN_BREATH_PEAK_RATIO = 1.06;
const BTN_BREATH_HALF_DURATION = 0.55;
/** 星星弹出后多久接 TaskLight / 分数（可重叠，不必等星星全结束） */
const STEP_TASK_OVERLAP = 0.18;
/** 分数弹出后多久出下载按钮 */
const STEP_BTN_AFTER_SCORE = 0;

/** 结算页 download 按钮点击 */
export type VictoryEndDownloadCallback = () => void;

export const VICTORY_END_STYLE = {
    petalCenterX: 0,
    petalCenterY: 60,
};

interface StarSlot {
    node: cc.Node;
    targetX: number;
    targetY: number;
}

interface EndNodes {
    icon: cc.Node;
    iconTargetScale: number;
    victory: cc.Node;
    taskLight: cc.Node;
    downloadBtn: cc.Node;
    stars: StarSlot[];
}

function findDownloadBtn(endRoot: cc.Node): cc.Node | null {
    for (let i = 0; i < DOWNLOAD_BTN_NAMES.length; i++) {
        const node = endRoot.getChildByName(DOWNLOAD_BTN_NAMES[i]);
        if (node && isValid(node)) {
            return node;
        }
    }
    const stack: cc.Node[] = [];
    for (let i = 0; i < endRoot.childrenCount; i++) {
        stack.push(endRoot.children[i]);
    }
    while (stack.length > 0) {
        const cur = stack.pop();
        if (!cur || !isValid(cur)) {
            continue;
        }
        for (let j = 0; j < DOWNLOAD_BTN_NAMES.length; j++) {
            if (cur.name === DOWNLOAD_BTN_NAMES[j]) {
                return cur;
            }
        }
        for (let k = 0; k < cur.childrenCount; k++) {
            stack.push(cur.children[k]);
        }
    }
    return null;
}

function getEndNodes(endRoot: cc.Node): EndNodes | null {
    if (!endRoot || !isValid(endRoot)) {
        return null;
    }
    const icon = endRoot.getChildByName(NODE_ICON);
    const victory = endRoot.getChildByName(NODE_VICTORY);
    const taskLight = endRoot.getChildByName(NODE_TASK_LIGHT);
    const downloadBtn = findDownloadBtn(endRoot);
    if (!icon || !victory || !taskLight || !downloadBtn) {
        cc.warn('[VictoryEndPanel] end 子节点缺失，需包含 icon / victory / TaskLight / download');
        return null;
    }
    const iconTargetScale = Math.max(Math.abs(icon.scaleX), 0.01);
    const stars: StarSlot[] = [];
    for (let i = 0; i < STAR_NAMES.length; i++) {
        const node = endRoot.getChildByName(STAR_NAMES[i]);
        if (node && isValid(node)) {
            stars.push({ node, targetX: node.x, targetY: node.y });
        }
    }
    return { icon, iconTargetScale, victory, taskLight, downloadBtn, stars };
}

function getPetalCenter(nodes: EndNodes): cc.Vec2 {
    return cc.v2(nodes.victory.x, nodes.victory.y);
}

function getCanvasFromEnd(endRoot: cc.Node): cc.Node | null {
    const parent = endRoot && endRoot.parent;
    return parent && isValid(parent) ? parent : null;
}

/** end 最底层半透明黑底，尺寸与 bg 相同（SHOW_ALL cover） */
export function ensureVictoryEndDimBackdrop(endRoot: cc.Node, canvas?: cc.Node): cc.Node | null {
    if (!endRoot || !isValid(endRoot)) {
        return null;
    }
    const canvasNode = canvas && isValid(canvas) ? canvas : getCanvasFromEnd(endRoot);
    if (!canvasNode) {
        return null;
    }

    const bg = canvasNode.getChildByName('bg');
    if (!bg || !isValid(bg)) {
        return null;
    }

    // 场景里 end 常为黑色 color，会乘到子节点上导致遮罩发闷、看不出透明
    endRoot.color = cc.Color.WHITE;
    endRoot.opacity = 255;

    let dim = endRoot.getChildByName(END_DIM_BACKDROP_NAME);
    if (!dim || !isValid(dim)) {
        dim = new cc.Node(END_DIM_BACKDROP_NAME);
        dim.setAnchorPoint(0.5, 0.5);
        dim.setPosition(0, 0);
        endRoot.insertChild(dim, 0);
    }

    const oldGraphics = dim.getComponent(cc.Graphics);
    if (oldGraphics) {
        oldGraphics.destroy();
    }

    let sprite = dim.getComponent(cc.Sprite);
    if (!sprite) {
        sprite = dim.addComponent(cc.Sprite);
    }
    sprite.spriteFrame = getWhiteSpriteFrame();
    sprite.type = cc.Sprite.Type.SIMPLE;
    sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;

    dim.active = true;
    dim.zIndex = Z_ORDER_END_CHILD.DIM_BACKDROP;
    dim.color = cc.Color.BLACK;
    dim.opacity = END_DIM_OPACITY;
    dim.setContentSize(bg.width, bg.height);
    layoutShowAllCover(dim, canvasNode);

    return dim;
}

export function layoutVictoryEndDimBackdrop(endRoot: cc.Node, canvas?: cc.Node): void {
    ensureVictoryEndDimBackdrop(endRoot, canvas);
}

function hideNode(node: cc.Node): void {
    node.stopAllActions();
    node.active = false;
    node.opacity = 0;
}

/** 保持 active，仅透明（inactive 节点上 runAction 在 2.4 可能不执行） */
function hideNodeVisual(node: cc.Node): void {
    node.stopAllActions();
    node.active = true;
    node.opacity = 0;
}

/** icon：从 ICON_START_SCALE 弹到场景设计缩放（勿用当前 scale 当 base，prepare 会改小） */
function playIconPopBounce(icon: cc.Node, targetScale: number): void {
    icon.stopAllActions();
    icon.active = true;
    icon.opacity = 0;
    icon.setScale(ICON_START_SCALE);
    const peak = targetScale * 1.12;
    icon.runAction(cc.sequence(
        cc.spawn(
            cc.fadeIn(0.1),
            cc.scaleTo(ICON_POP_DURATION, peak).easing(cc.easeBackOut())
        ),
        cc.scaleTo(ICON_SETTLE_DURATION, targetScale).easing(cc.easeSineOut())
    ));
}

function playVictoryAppearThenLoop(victory: cc.Node, onAppearDone: () => void): void {
    victory.active = true;
    victory.opacity = 255;
    const sk = victory.getComponent(sp.Skeleton);
    if (!sk) {
        cc.warn('[VictoryEndPanel] victory 缺少 sp.Skeleton');
        onAppearDone();
        return;
    }
    sk.setCompleteListener(null);
    sk.loop = false;
    sk.setAnimation(0, SPINE_VICTORY_APPEAR, false);
    let done = false;
    const finish = (): void => {
        if (done || !isValid(victory)) {
            return;
        }
        done = true;
        sk.setCompleteListener(null);
        sk.loop = true;
        sk.setAnimation(0, SPINE_VICTORY_LOOP, true);
        onAppearDone();
    };
    sk.setCompleteListener(finish);
    victory.runAction(cc.sequence(
        cc.delayTime(VICTORY_APPEAR_FALLBACK),
        cc.callFunc(finish, null)
    ));
}

function playStarsPop(stars: StarSlot[], center: cc.Vec2): void {
    for (let i = 0; i < stars.length; i++) {
        const slot = stars[i];
        const node = slot.node;
        node.stopAllActions();
        node.active = true;
        node.zIndex = 20;
        node.setPosition(center.x, center.y);
        node.setScale(STAR_START_SCALE);
        node.opacity = 0;
        node.runAction(cc.sequence(
            cc.delayTime(i * STAR_STAGGER),
            cc.spawn(
                cc.fadeIn(0.08),
                cc.moveTo(STAR_POP_DURATION, slot.targetX, slot.targetY).easing(cc.easeBackOut()),
                cc.scaleTo(STAR_POP_DURATION, 1).easing(cc.easeBackOut())
            )
        ));
    }
}

function destroyEndScoreLabel(endRoot: cc.Node): void {
    const old = endRoot.getChildByName(NODE_END_SCORE);
    if (old && isValid(old)) {
        old.destroy();
    }
}

/** 分数挂在 end 上（勿挂在 Spine TaskLight 子节点，2.4 下常不显示） */
function ensureEndScoreLabel(
    endRoot: cc.Node,
    taskLight: cc.Node,
    font: cc.BitmapFont,
    score: number
): cc.Node {
    destroyEndScoreLabel(endRoot);
    const node = new cc.Node(NODE_END_SCORE);
    const label = node.addComponent(cc.Label);
    label.font = font;
    label.fontSize = SCORE_FONT_SIZE;
    label.lineHeight = SCORE_LINE_HEIGHT;
    label.enableWrapText = false;
    label.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
    label.verticalAlign = cc.Label.VerticalAlign.CENTER;
    label.string = String(Math.max(0, Math.floor(score)));
    node.setAnchorPoint(0.5, 0.5);
    node.setPosition(taskLight.x, taskLight.y + SCORE_ABOVE_TASK_Y);
    node.zIndex = END_SCORE_Z_INDEX;
    endRoot.addChild(node);
    return node;
}

function showSettlementScore(
    endRoot: cc.Node,
    taskLight: cc.Node,
    score: number,
    scoreFont: cc.BitmapFont | null,
    scoreDisplay: ArtScoreDisplay | null
): void {
    if (scoreDisplay && isValid(scoreDisplay.root)) {
        scoreDisplay.setValue(score, false);
        scoreDisplay.setVisible(true);
        scoreDisplay.mountOnEndSettle(
            endRoot,
            taskLight.x,
            taskLight.y + SCORE_ABOVE_TASK_Y
        );
        scoreDisplay.playSettleReveal();
        return;
    }
    const font = scoreFont || (scoreDisplay ? scoreDisplay.getBitmapFont() : null);
    if (!font) {
        cc.warn('[VictoryEndPanel] 无位图字体，跳过分数字幕');
        return;
    }
    const scoreNode = ensureEndScoreLabel(endRoot, taskLight, font, score);
    playScorePunch(scoreNode);
}

function playScorePunch(scoreNode: cc.Node): void {
    scoreNode.stopAllActions();
    scoreNode.active = true;
    scoreNode.opacity = 255;
    scoreNode.setScale(0.35);
    scoreNode.runAction(cc.sequence(
        cc.spawn(
            cc.fadeIn(0.06),
            cc.scaleTo(0.22, SCORE_PUNCH_SCALE).easing(cc.easeBackOut())
        ),
        cc.scaleTo(SCORE_PUNCH_DURATION, 1).easing(cc.easeSineOut())
    ));
}

function playTaskLightAppear1(taskLight: cc.Node, onDone: () => void): void {
    taskLight.stopAllActions();
    taskLight.active = true;
    taskLight.opacity = 255;
    const sk = taskLight.getComponent(sp.Skeleton);
    if (!sk) {
        cc.warn('[VictoryEndPanel] TaskLight 缺少 sp.Skeleton');
        onDone();
        return;
    }
    sk.setCompleteListener(null);
    sk.loop = false;
    sk.setAnimation(0, SPINE_TASK_APPEAR, false);
    let done = false;
    const finish = (): void => {
        if (done) {
            return;
        }
        done = true;
        sk.setCompleteListener(null);
        onDone();
    };
    sk.setCompleteListener(finish);
    taskLight.runAction(cc.sequence(
        cc.delayTime(TASK_APPEAR_FALLBACK),
        cc.callFunc(finish, null)
    ));
}

function playDownloadBtnBreathLoop(btn: cc.Node, baseScale: number): void {
    const peak = baseScale * BTN_BREATH_PEAK_RATIO;
    btn.runAction(cc.repeatForever(cc.sequence(
        cc.scaleTo(BTN_BREATH_HALF_DURATION, peak).easing(cc.easeSineInOut()),
        cc.scaleTo(BTN_BREATH_HALF_DURATION, baseScale).easing(cc.easeSineInOut())
    )));
}

export function unbindVictoryEndDownloadButton(btn: cc.Node): void {
    if (!btn || !isValid(btn)) {
        return;
    }
    btn.off('click');
    btn.off(cc.Node.EventType.TOUCH_END);
    const button = btn.getComponent(cc.Button);
    if (button) {
        button.clickEvents = [];
    }
}

/** 绑定 download 节点点击（仅 reset 时用；正常绑定在 GameController.bindEndDownloadButton） */
export function bindVictoryEndDownloadButton(btn: cc.Node, onClick: VictoryEndDownloadCallback): void {
    if (!btn || !isValid(btn) || !onClick) {
        return;
    }
    unbindVictoryEndDownloadButton(btn);
    const button = btn.getComponent(cc.Button);
    if (button) {
        button.interactable = true;
        btn.on('click', onClick, btn);
        return;
    }
    btn.on(cc.Node.EventType.TOUCH_END, onClick, btn);
}

function playDownloadBtnReveal(btn: cc.Node): void {
    btn.stopAllActions();
    btn.active = true;
    btn.zIndex = Z_ORDER_END_CHILD.DOWNLOAD;
    const targetScale = Math.max(Math.abs(btn.scaleX), 0.01);
    btn.setScale(targetScale * 0.55);
    btn.opacity = 0;
    btn.runAction(cc.sequence(
        cc.spawn(
            cc.fadeIn(BTN_POP_DURATION),
            cc.sequence(
                cc.scaleTo(BTN_POP_DURATION, targetScale * 1.08).easing(cc.easeBackOut()),
                cc.scaleTo(0.08, targetScale).easing(cc.easeSineOut())
            )
        ),
        cc.callFunc(() => {
            if (!btn || !isValid(btn)) {
                return;
            }
            btn.setScale(targetScale);
            playDownloadBtnBreathLoop(btn, targetScale);
        }, null)
    ));
}

/** 下载按钮延时必须挂在 endRoot（勿挂在 active=false 的按钮上） */
function scheduleDownloadBtnReveal(endRoot: cc.Node, btn: cc.Node, delay: number): void {
    endRoot.runAction(cc.sequence(
        cc.delayTime(delay),
        cc.callFunc(() => playDownloadBtnReveal(btn), null)
    ));
}

function resolveEndRoot(endRoot: cc.Node, nodes: EndNodes): cc.Node {
    if (endRoot && isValid(endRoot)) {
        return endRoot;
    }
    if (nodes && nodes.icon && isValid(nodes.icon.parent)) {
        return nodes.icon.parent;
    }
    return endRoot;
}

function prepareEndPanel(endRoot: cc.Node, nodes?: EndNodes): void {
    // 兼容旧 quick_compile 缓存：曾写成 prepareEndPanel(nodes)
    let panel = nodes;
    let root = endRoot;
    if (!panel && endRoot && (endRoot as EndNodes).icon) {
        panel = endRoot as unknown as EndNodes;
        root = panel.icon.parent;
    }
    if (!panel || !panel.icon) {
        cc.warn('[VictoryEndPanel] prepareEndPanel: 无效的 end 节点结构');
        return;
    }
    root = resolveEndRoot(root, panel);
    root.opacity = 255;
    ensureVictoryEndDimBackdrop(root);

    panel.icon.stopAllActions();
    panel.victory.stopAllActions();
    panel.taskLight.stopAllActions();
    panel.downloadBtn.stopAllActions();

    panel.icon.active = true;
    panel.icon.opacity = 0;
    panel.icon.setScale(ICON_START_SCALE);

    panel.victory.active = true;
    panel.victory.opacity = 255;

    hideNode(panel.taskLight);
    hideNodeVisual(panel.downloadBtn);

    const center = getPetalCenter(panel);
    for (let i = 0; i < panel.stars.length; i++) {
        const slot = panel.stars[i];
        slot.node.stopAllActions();
        slot.node.active = false;
        slot.node.opacity = 0;
        slot.node.setPosition(center.x, center.y);
        slot.node.setScale(STAR_START_SCALE);
    }

    destroyEndScoreLabel(root);
}

function playStepTaskAndScore(
    endRoot: cc.Node,
    nodes: EndNodes,
    score: number,
    scoreFont: cc.BitmapFont | null,
    scoreDisplay: ArtScoreDisplay | null
): void {
    playTaskLightAppear1(nodes.taskLight, () => {});
    showSettlementScore(endRoot, nodes.taskLight, score, scoreFont, scoreDisplay);
    scheduleDownloadBtnReveal(endRoot, nodes.downloadBtn, STEP_BTN_AFTER_SCORE);
}

/**
 * ① icon 弹跳 + victory Appear（并行）
 * ② Appear 结束 → 星星飞出，并短延迟重叠 TaskLight + 分数
 * ③ 下载按钮
 */
export function playVictoryEndSequence(
    endRoot: cc.Node,
    score: number,
    scoreFont: cc.BitmapFont | null,
    scoreDisplay: ArtScoreDisplay | null = null
): void {
    const nodes = getEndNodes(endRoot);
    if (!nodes) {
        return;
    }
    prepareEndPanel(endRoot, nodes);
    endRoot.stopAllActions();

    const center = getPetalCenter(nodes);

    playIconPopBounce(nodes.icon, nodes.iconTargetScale);
    playVictoryAppearThenLoop(nodes.victory, () => {
        playStarsPop(nodes.stars, center);
        endRoot.runAction(cc.sequence(
            cc.delayTime(STEP_TASK_OVERLAP),
            cc.callFunc(
                () => playStepTaskAndScore(endRoot, nodes, score, scoreFont, scoreDisplay),
                null
            )
        ));
    });
}

/** @deprecated 使用 playVictoryEndSequence */
export function playVictoryEndSequenceLegacy(endRoot: cc.Node): void {
    playVictoryEndSequence(endRoot, 0, null);
}

/** @deprecated */
export function playVictoryEndUnlock(endRoot: cc.Node): void {
    playVictoryEndSequence(endRoot, 0, null);
}

export function resetVictoryEndUnlock(endRoot: cc.Node): void {
    if (!endRoot || !isValid(endRoot)) {
        return;
    }
    endRoot.stopAllActions();
    const nodes = getEndNodes(endRoot);
    if (!nodes) {
        return;
    }

    const victorySk = nodes.victory.getComponent(sp.Skeleton);
    if (victorySk) {
        victorySk.setCompleteListener(null);
        victorySk.loop = false;
    }
    const taskSk = nodes.taskLight.getComponent(sp.Skeleton);
    if (taskSk) {
        taskSk.setCompleteListener(null);
        taskSk.loop = false;
    }

    nodes.icon.stopAllActions();
    nodes.icon.active = true;
    nodes.icon.opacity = 255;
    nodes.icon.setScale(nodes.iconTargetScale);

    nodes.victory.stopAllActions();
    nodes.victory.active = true;
    nodes.victory.opacity = 255;

    nodes.taskLight.stopAllActions();
    nodes.taskLight.active = true;
    nodes.taskLight.opacity = 255;

    nodes.downloadBtn.stopAllActions();
    unbindVictoryEndDownloadButton(nodes.downloadBtn);
    nodes.downloadBtn.active = true;
    nodes.downloadBtn.zIndex = Z_ORDER_END_CHILD.DOWNLOAD;
    nodes.downloadBtn.opacity = 255;
    nodes.downloadBtn.setScale(Math.max(Math.abs(nodes.downloadBtn.scaleX), 0.01));

    endRoot.opacity = 255;
    ensureVictoryEndDimBackdrop(endRoot);

    destroyEndScoreLabel(endRoot);

    for (let i = 0; i < nodes.stars.length; i++) {
        const slot = nodes.stars[i];
        slot.node.stopAllActions();
        slot.node.active = true;
        slot.node.setPosition(slot.targetX, slot.targetY);
        slot.node.setScale(1);
        slot.node.opacity = 255;
    }
}
