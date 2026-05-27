import { isValid } from '../is-valid';

const { ccclass } = cc._decorator;

/** gameplay_img_mj_up 纹理四边透明/背景边距（源图像素，按需改数值） */
export interface TileFaceTrimPx {
    left: number;
    right: number;
    top: number;
    bottom: number;
}

export const MJ_TILE_FACE_TRIM: TileFaceTrimPx = {
    left: 5,
    right: 10,
    top: 5,
    bottom: 15,
};

/** 由牌面尺寸与四边裁切算出跑马灯边界（中心锚点坐标系） */
export function tileFaceBoundsFromTrim(
    faceWidth: number,
    faceHeight: number,
    scaleX: number,
    scaleY: number,
    trim: TileFaceTrimPx = MJ_TILE_FACE_TRIM
): { left: number; right: number; bottom: number; top: number } {
    const halfW = faceWidth * scaleX * 0.5;
    const halfH = faceHeight * scaleY * 0.5;
    return {
        left: -halfW + trim.left * scaleX,
        right: halfW - trim.right * scaleX,
        bottom: -halfH + trim.bottom * scaleY,
        top: halfH - trim.top * scaleY,
    };
}

/** 跑马灯颜色与线宽（按需调整） */
export const HINT_MARQUEE_STYLE = {
    trackColor: { r: 255, g: 180, b: 0, a: 255 },
    glowColor: { r: 255, g: 90, b: 0, a: 220 },
    brightOuterColor: { r: 255, g: 255, b: 255, a: 255 },
    brightCoreColor: { r: 0, g: 255, b: 220, a: 255 },
    trackLineWidth: 5,
    glowLineWidth: 12,
    brightOuterLineWidth: 14,
    brightCoreLineWidth: 7,
    speed: 1.05,
    segmentFrac: 0.34,
};

/** 沿圆角麻将牌面可见区域外缘的跑马灯描边（空闲提示） */
@ccclass
export default class TileHintMarquee extends cc.Component {
    private graphics: cc.Graphics = null;
    private left = -80;
    private right = 80;
    private bottom = -100;
    private top = 100;
    private cornerR = 18;
    private phase = 0;
    private pulse = 0;
    private speed = HINT_MARQUEE_STYLE.speed;
    private segmentFrac = HINT_MARQUEE_STYLE.segmentFrac;
    private trackColor = cc.color(
        HINT_MARQUEE_STYLE.trackColor.r,
        HINT_MARQUEE_STYLE.trackColor.g,
        HINT_MARQUEE_STYLE.trackColor.b,
        HINT_MARQUEE_STYLE.trackColor.a
    );
    private brightOuterColor = cc.color(
        HINT_MARQUEE_STYLE.brightOuterColor.r,
        HINT_MARQUEE_STYLE.brightOuterColor.g,
        HINT_MARQUEE_STYLE.brightOuterColor.b,
        HINT_MARQUEE_STYLE.brightOuterColor.a
    );
    private brightCoreColor = cc.color(
        HINT_MARQUEE_STYLE.brightCoreColor.r,
        HINT_MARQUEE_STYLE.brightCoreColor.g,
        HINT_MARQUEE_STYLE.brightCoreColor.b,
        HINT_MARQUEE_STYLE.brightCoreColor.a
    );
    private glowColor = cc.color(
        HINT_MARQUEE_STYLE.glowColor.r,
        HINT_MARQUEE_STYLE.glowColor.g,
        HINT_MARQUEE_STYLE.glowColor.b,
        HINT_MARQUEE_STYLE.glowColor.a
    );
    private trackLineWidth = HINT_MARQUEE_STYLE.trackLineWidth;
    private brightOuterLineWidth = HINT_MARQUEE_STYLE.brightOuterLineWidth;
    private brightCoreLineWidth = HINT_MARQUEE_STYLE.brightCoreLineWidth;
    private glowLineWidth = HINT_MARQUEE_STYLE.glowLineWidth;

    /**
     * 按牌面可见矩形设置（中心锚点坐标系）。
     * @param left right bottom top 相对牌面节点中心的边界
     */
    setupRect(
        left: number,
        right: number,
        bottom: number,
        top: number,
        inset: number = 2,
        cornerRadius?: number
    ): void {
        this.left = left + inset;
        this.right = right - inset;
        this.bottom = bottom + inset;
        this.top = top - inset;
        const w = Math.max(8, (this.right - this.left) * 0.5);
        const h = Math.max(8, (this.top - this.bottom) * 0.5);
        this.cornerR = cornerRadius !== undefined
            ? cornerRadius
            : Math.min(w, h) * 0.22;
        this.cornerR = Math.min(this.cornerR, w * 0.45, h * 0.45);
        this.graphics = this.getComponent(cc.Graphics) || this.addComponent(cc.Graphics);
        this.phase = 0;
        this.pulse = 0;
        this.redraw();
    }

    update(dt: number): void {
        if (!this.graphics || !isValid(this.graphics)) {
            return;
        }
        this.phase = (this.phase + dt * this.speed) % 1;
        this.pulse = (this.pulse + dt * 4.5) % (Math.PI * 2);
        this.redraw();
    }

    private redraw(): void {
        const g = this.graphics;
        const r = this.cornerR;
        g.clear();

        const pulseA = 0.82 + 0.18 * Math.sin(this.pulse);

        g.lineWidth = this.glowLineWidth;
        g.strokeColor = cc.color(
            this.glowColor.r,
            this.glowColor.g,
            this.glowColor.b,
            Math.min(255, Math.floor(this.glowColor.a * pulseA))
        );
        this.strokeRoundRect(g, r + 3);

        g.lineWidth = this.trackLineWidth;
        g.strokeColor = this.trackColor;
        this.strokeRoundRect(g, r);

        g.lineWidth = this.brightOuterLineWidth;
        g.strokeColor = this.brightOuterColor;
        this.strokeSegment(g, r, this.phase, this.segmentFrac);

        g.lineWidth = this.brightCoreLineWidth;
        g.strokeColor = this.brightCoreColor;
        this.strokeSegment(g, r, this.phase, this.segmentFrac);
    }

    private clampRadius(r: number): number {
        const w = this.right - this.left;
        const h = this.top - this.bottom;
        return Math.min(Math.max(4, r), w * 0.45, h * 0.45);
    }

    private strokeRoundRect(g: cc.Graphics, r: number): void {
        const radius = this.clampRadius(r);
        const w = this.right - this.left;
        const h = this.top - this.bottom;
        g.roundRect(this.left, this.bottom, w, h, radius);
        g.stroke();
    }

    private perimeter(r: number): number {
        const radius = this.clampRadius(r);
        const w = this.right - this.left;
        const h = this.top - this.bottom;
        const straight = 2 * (w - 2 * radius) + 2 * (h - 2 * radius);
        const arcs = Math.PI * 2 * radius;
        return straight + arcs;
    }

    /** 圆角矩形路径采样（顺时针，从顶边左端开始） */
    private pointOnRoundRect(t: number, r: number): cc.Vec2 {
        const radius = this.clampRadius(r);
        const L = this.left;
        const R = this.right;
        const B = this.bottom;
        const T = this.top;

        const topLen = (R - L) - 2 * radius;
        const sideLen = (T - B) - 2 * radius;
        const arcLen = Math.PI * 0.5 * radius;
        const total = this.perimeter(r);
        let d = (t % 1) * total;

        if (d < topLen) {
            return cc.v2(L + radius + d, T);
        }
        d -= topLen;

        if (d < arcLen) {
            const ang = Math.PI * 0.5 - (d / arcLen) * (Math.PI * 0.5);
            return cc.v2(
                (R - radius) + Math.cos(ang) * radius,
                (T - radius) + Math.sin(ang) * radius
            );
        }
        d -= arcLen;

        if (d < sideLen) {
            return cc.v2(R, T - radius - d);
        }
        d -= sideLen;

        if (d < arcLen) {
            const ang = 0 - (d / arcLen) * (Math.PI * 0.5);
            return cc.v2(
                (R - radius) + Math.cos(ang) * radius,
                (B + radius) + Math.sin(ang) * radius
            );
        }
        d -= arcLen;

        if (d < topLen) {
            return cc.v2(R - radius - d, B);
        }
        d -= topLen;

        if (d < arcLen) {
            const ang = -Math.PI * 0.5 - (d / arcLen) * (Math.PI * 0.5);
            return cc.v2(
                (L + radius) + Math.cos(ang) * radius,
                (B + radius) + Math.sin(ang) * radius
            );
        }
        d -= arcLen;

        if (d < sideLen) {
            return cc.v2(L, B + radius + d);
        }
        d -= sideLen;

        const ang = Math.PI - (d / arcLen) * (Math.PI * 0.5);
        return cc.v2(
            (L + radius) + Math.cos(ang) * radius,
            (T - radius) + Math.sin(ang) * radius
        );
    }

    private strokeSegment(
        g: cc.Graphics,
        r: number,
        startT: number,
        lenFrac: number
    ): void {
        const steps = 36;
        for (let i = 0; i <= steps; i++) {
            const t = (startT + lenFrac * (i / steps)) % 1;
            const p = this.pointOnRoundRect(t, r);
            if (i === 0) {
                g.moveTo(p.x, p.y);
            } else {
                g.lineTo(p.x, p.y);
            }
        }
        g.stroke();
    }
}
