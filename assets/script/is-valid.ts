/**
 * 节点/资源是否仍有效。
 * super-html 等试玩壳里 cc 常无 cc.isValid，业务代码应使用本函数而非 cc.isValid。
 */
export function isValid(target: any, strictMode?: boolean): boolean {
    if (target == null) {
        return false;
    }
    if (typeof cc !== 'undefined' && typeof cc.isValid === 'function') {
        return cc.isValid(target, strictMode);
    }
    if (typeof cc !== 'undefined' && cc.Object && target instanceof cc.Object) {
        return strictMode ? !!target.isValid : target.isValid !== false;
    }
    return false;
}
