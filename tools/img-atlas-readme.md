# UI 碎图自动图集

## 目录结构

- `assets/resources/img/bg.jpg` — 背景，**不参与合图**
- `assets/resources/img/atlas/` — 其余 UI 碎图 + `ui.pac` 自动图集配置
- `assets/resources/img/atlas/牌面/` — 麻将牌面

## 合成一张图（构建时）

Cocos Creator 2.4 在 **构建发布** 时会把 `atlas` 目录下碎图打进图集，并自动把工程里的 SpriteFrame 引用指到图集。

1. 用 Creator 打开工程
2. 选中 `assets/resources/img/atlas/ui`（Auto Atlas）
3. 属性里可调：最大宽高 2048、间距、是否旋转等
4. **项目 → 构建发布**，勾选与纹理相关的默认选项即可

编辑器预览仍可用各子图路径（如 `img/atlas/good`）；合图后的单张大图在构建产物里。

## 代码引用

统一走 `GamePreloadConfig.ts`：

- `IMG_DIR = 'img/atlas'`
- `TILE_ICON_PATH = 'img/atlas/牌面/'`
- `rateResPath('good')` → `img/atlas/good`

加载使用 `GameImgAtlas.ts` 的 `loadGameSpriteFrame` / `preloadGameImgAtlas`，构建后优先从 `SpriteAtlas` 取帧。

## 新增碎图

把 PNG 放进 `assets/resources/img/atlas/`（或子目录），保存后 Creator 会自动纳入 `ui.pac`，无需改代码路径（文件名即资源名）。
