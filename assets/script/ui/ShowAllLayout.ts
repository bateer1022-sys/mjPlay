import { isValid } from '../is-valid';

/** 与 Canvas 上 bg 相同：按 SHOW_ALL 策略 cover 铺满可视区域 */
export function layoutShowAllCover(node: cc.Node, canvas: cc.Node): void {
    if (!node || !isValid(node) || !canvas || !isValid(canvas)) {
        return;
    }
    node.setPosition(0, 0);
    const scaleForShowAll = Math.min(
        cc.view.getCanvasSize().width / canvas.width,
        cc.view.getCanvasSize().height / canvas.height
    );
    const realWidth = node.width * scaleForShowAll;
    const realHeight = node.height * scaleForShowAll;
    node.scale = Math.max(
        cc.view.getCanvasSize().width / realWidth,
        cc.view.getCanvasSize().height / realHeight
    );
}
