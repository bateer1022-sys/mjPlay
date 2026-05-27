/**
 * 还原 6×8 单层关卡（48 张）
 * node tools/restore-level-single-layer.js
 */
const fs = require('fs');
const path = require('path');

const BASE_X = [-220, -132, -44, 44, 132, 220];
const BASE_Y = [372, 254, 136, 18, -100, -218, -336, -454];

const slots = [];
for (const y of BASE_Y) {
    for (const x of BASE_X) {
        slots.push({ layer: 0, x, y });
    }
}

/** 双层改动前的固定牌面（可解） */
const keys = [
    't6', 'b4', 'b5', 't8', 'w4', 'w5', 'w5', 'w8', 't8', 'b1', 'b2', 't5',
    't1', 'w3', 'w6', 't6', 'w2', 'b3', 'b6', 'w9', 't4', 't1', 't7', 'b2',
    'b4', 't3', 'w1', 'w3', 'b5', 't9', 't9', 'w9', 'w2', 'w4', 't2', 'w7',
    't5', 'w1', 't3', 'w8', 't4', 'b3', 'b6', 'w7', 'b1', 't7', 'w6', 't2',
];

const level = {
    tileW: 85,
    tileH: 106,
    overlapX: 47,
    overlapY: 58,
    displayScale: 0.5,
    colStep: 88,
    rowStep: 118,
    keyPool: [
        'w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8', 'w9',
        't1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9',
        'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'b9',
    ],
    slots,
    keys,
};

const target = path.join(__dirname, '../assets/resources/data/level_01.json');
fs.writeFileSync(target, JSON.stringify(level, null, 2) + '\n');
console.log('OK single layer', { slots: slots.length });
