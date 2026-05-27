export interface LevelSlot {
    layer: number;
    x: number;
    y: number;
}

export interface LevelConfig {
    tileW: number;
    tileH: number;
    overlapX: number;
    overlapY: number;
    /** 预制体根节点缩放，仅作配置备注；逻辑尺寸用 tileW/tileH（= 原尺寸 × scale） */
    displayScale?: number;
    keyPool: string[];
    /** 与 slots 一一对应时可保证可解；缺省时自动洗牌直到可解 */
    keys?: string[];
    slots: LevelSlot[];
}
