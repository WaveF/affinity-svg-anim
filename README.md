# SVG Anim for Affinity

在 Affinity 中给元素设置动画，导出为可直接播放的 SVG。

- **Affinity 脚本** `dist/svg-anim-v0.4.1.js`：用一个对话框设置动画和导出。动画参数保存在元素的元数据里，重新选中元素时会显示出来。
- **播放器** `dist/svg-anim-runtime.min.js`：无依赖，约 13 KB，导出时可以内嵌进 SVG，也可以通过 jsDelivr 引用。

本项目由 [affinity-svg](https://gitee.com/wavef/affinity-svg) 发展而来，但不兼容旧版用图层名写的 `{{…}}` 表达式。

## 安装

1. 下载 [`dist/svg-anim-v0.4.1.js`](dist/svg-anim-v0.4.1.js)。
2. 在 Affinity 的 Scripts 面板中添加该脚本。
3. 导出文件默认保存到 `~/Downloads/SVG Anim`。如果 Affinity 提示没有写入权限，请在 Affinity 设置 › Scripting 中允许这个文件夹，或者改用桌面上的文件夹。

## 使用

运行脚本后，在对话框顶部选择模式。对话框底部会说明按 OK 将执行的操作。

### Animate（有选区时默认进入此模式）

- 每个元素最多 8 条 Track，各 Track 同时播放、效果叠加。Tracks 区下方用两行显示 1～4 和 5～8 的简述。最底部的 ← / → 与相邻轨道交换完整参数（包含空槽），选中状态跟随移动；Track 1 禁用 ←，Track 8 禁用 →，不循环跳转。轨道顺序与参数在点击 OK 后一起应用。
- 动画类型：Fade、Move（文档像素）、Rotate（顺时针，9 点轴心）、Scale、Skew（X/Y 倾斜，9 点轴心）、Draw stroke（描边绘制）、Count number（数字滚动）、Clock（时钟）、Frames（逐个显示子元素）。
- Timing：Duration、Delay、Stagger（作用于每个子元素时可设）、Easing、Direction、Play count、Pause between plays。
- Easing：31 种曲线，包括 Linear，以及 Sine / Quad / Cubic / Quart / Quint / Expo / Circ / Back / Elastic / Bounce 的 in、out、in-out。原来的 Ease in / out / in-out 改名为 Cubic in / out / in-out，曲线和保存的数据标识不变。
- Start：On load / When visible / On click / On hover。
- Layer name：给动画图层名加后缀，默认 `__anim`，方便在图层面板中辨认。清除动画时会去掉后缀；后缀不会出现在 SVG id 中。
- Export after applying：应用后按 Export 模式的设置立即导出。
- 选中多个元素时，同一组 Track 会写入全部元素。每次应用只占一步撤销。

### Export（没有选区时默认进入此模式）

- 导出范围：整个文档、当前跨页，或当前跨页上的某个画板。
- 可选择任一 SVG 预设、输出文件夹和文件名，并可同时生成一个 HTML 预览页。
- Player：
  - **Embed**：把播放器内嵌进 SVG，生成一个可离线播放的单文件。
  - **Link**：引用 jsDelivr 上的播放器，地址固定到发布版本：
    ```
    https://cdn.jsdelivr.net/gh/WaveF/affinity-svg-anim@v0.4.1/dist/svg-anim-runtime.min.js
    ```

### Config（顶部 Mode 右侧）

仅在 Animate 模式显示 Import / Export / Clear 按钮；Export 模式显示 “Only available in Animate mode”。当前 Track 的 Effect 为 None 时，Timing 显示 “Please set a Track Effect first.”。

- **Import**：在系统文件选择器中选取 JSON 预设，替换面板里的整套轨道；点击 OK 才应用到选区，Cancel 保留原动画。导入自动关闭 Export after applying。
- **Clear**：清空面板中全部 8 条轨道并切回 Animate，关闭 Export after applying；点击 OK 才移除选区元素上的动画和脚本后缀，Cancel 不修改文档。可一次撤销整次清除。
- **Export**：导出当前面板中的全部 8 个轨道槽，包括未点击 OK 的修改和空位；在弹窗中填写 JSON 文件的完整路径。已有文件会先询问是否覆盖。
- 配置包含轨道与图层后缀，不保存文档节点身份、自动命名状态或 SVG 输出路径。多选动画不一致时，导出的是面板当前展示的那一套。
- 文件格式含独立的 `format` / `schemaVersion` 标识，未知类型、超过 8 个轨道槽和无效参数会整体拒绝，不会部分应用。
- 文件读写受 Affinity Scripting 文件夹权限约束；桌面目录可用于测试。

JSON 格式示例（省略的轨道字段在导入时补默认值）：

```json
{
  "format": "svg-anim-preset",
  "schemaVersion": 1,
  "tracks": [{ "type": "skew", "ax": 20, "ay": 0, "pivot": "c" }, null],
  "suffix": "__anim"
}
```

Skew 从 0° 动画到指定的 X/Y 角度，UI 和播放器均不限制角度或缓动过冲。沿用 Scale 的父级 SVG 坐标轴。变换列表固定按 Move、Rotate、Scale、Skew 排列；每个 Skew 围绕 Pivot 写出 `skewX`、`skewY`（SVG 矩阵按从右向左作用于点，因此 Y 先作用）。

## 在网页中使用导出的 SVG

SVG 中的脚本只有在以下三种方式下才会运行：直接打开 SVG、内联到 HTML 中、用 `<object>` 或 `<iframe>` 嵌入。用 `<img src="x.svg">` 嵌入时脚本不会运行，动画不会播放。

调试接口：`document.querySelector('svg').__svgAnim.pause() / play() / restart() / seek(秒)`。

## 数据格式

元素 tag 键 `svganim`，值为 JSON：

```json
{"v":1,"tracks":[{"type":"move","x":0,"y":-20,"target":"self","dur":1,"delay":0,"stagger":0.1,"order":"forward",
  "ease":"inOut","dir":"alternate","loops":0,"loopDelay":0,"trigger":"load"}],
 "suffix":"__anim","auto":true}
```

- `suffix`：脚本加在图层名后的后缀。
- `auto`：图层原本没有名字，是脚本用默认名补上的；导出时这类图层不写 id。

导出的元素带有 `data-svganim='{"v":1,"n":<Affinity 子元素数>,"tracks":[…]}'`。播放器用 `n` 跳过 Affinity 为剪切、效果等额外生成的匿名 `<g>`。

| 字段 | 取值 |
| --- | --- |
| `type` | `fade` `move` `rotate` `scale` `skew` `draw` `count` `clock` `frames` |
| `target` | `self` / `children` |
| `dur` `delay` `stagger` `loopDelay` | 秒 |
| `order` | `forward` `reverse` `center` `random` |
| `ease` | `linear`；Cubic 使用兼容旧版的 `in` / `out` / `inOut`；其他系列 `sine` / `quad` / `quart` / `quint` / `expo` / `circ` / `back` / `elastic` / `bounce` 加 `In` / `Out` / `InOut` |
| `dir` | `normal` `reverse` `alternate` `alternateReverse` |
| `loops` | 播放次数，0 = 无限 |
| `trigger` | `load` `view` `click` `hover` |
| fade | `from` `to`（%） |
| move | `x` `y`（文档像素） |
| rotate | `angle`（度，顺时针为正），`pivot`：`tl tc tr cl c cr bl bc br` |
| scale | `sx` `sy`（%），`pivot` |
| skew | `ax` `ay`（度，不限范围），`pivot` |
| draw | `mode`：`reveal` `revealErase` `erase` `travel`；`seg`（%） |
| count | `start`（null = 当前文字）`end` `decimals`（null = 自动）`pad` `group` `random` |
| clock | `format`：`YYYY MM DD HH hh mm ss A` |

## 已知限制

- Affinity 自带的「文件 › 导出」不会包含动画，必须用本脚本的 Export 模式导出。
- 脚本导出时会临时改名，导出后再撤销。因此导出后文档会显示为已修改，并多出一条“重做”记录。
- 「平面化」类 SVG 预设会合并元素，动画元素会因此缺失；脚本会在导出报告中列出这些元素。

## 开发

```bash
npm install
npm run build              # 生成 dist/；设置 AFFINITY_EXPORTS=<目录> 时同时复制脚本到该目录
npm run test:core          # 数据模型
npm run test:config        # JSON、原子导入、取消、覆盖和按钮行为
npm run test:browser:build # 生成 tests/out/verification.html，在浏览器打开验证
npm run test:easing        # 全部 easing、旧版兼容、内嵌/外链播放器与表单回显
```

以下测试需要 Affinity 已启用 MCP（`http://localhost:6767/sse`）。通过 MCP 运行的脚本只能写入桌面，所以测试文件都放在桌面上：

```bash
npm run test:dialog
npm run test:order:affinity  # 轨道交换、边界、空槽、Clear 与撤销
npm run test:config:affinity # 真实控件、JSON 文件读写、Skew、应用和撤销
npm run test:easing:affinity # 31 种 easing 的原生对话框保存和回显；只创建并关闭自己的临时文档
cp <affinity-svg>/example/images/AppleWatch.af ~/Desktop/svganim-test-AppleWatch.af
npm run test:export        # 结果留在 ~/Desktop/svganim-test-out
python tests/runtime_test.py   # 需要 Playwright，测试播放器数值
python tests/real_test.py      # 在浏览器中播放 test:export 的导出结果
rm -rf ~/Desktop/svganim-test-out ~/Desktop/svganim-test-AppleWatch.af
```

### 发布新版本

1. 修改 `package.json` 中的 `version`，然后执行 `npm run build`。
2. 提交 `dist/`，打 tag `v<版本>` 并推送。脚本中的 jsDelivr 地址固定到这个 tag。

## v0.4.1

- 当前 Track 的 Effect 为 None 时，Timing 显示英文引导提示。
- Export 模式隐藏 Config 操作按钮，显示 “Only available in Animate mode”；切回 Animate 恢复按钮。

## v0.4.0

- Mode / Config 改用与 Selection 一致的原生分组标题字体。
- Tracks 底部增加 ← / →，完整交换相邻轨道并跟随选中，首尾方向禁用。
- Config 增加 Clear，清空所有轨道；OK 应用、Cancel 保留，整次操作可一次撤销。
- 保留 JSON 配置、Skew 和现有数据格式；导出播放器版本标识同步至 v0.4.0。GitHub tag 发布前使用 Embed 或本地 Link。

## v0.3.0

- 顶部两栏：Mode 与 Config Import / Export 普通操作按钮，支持 JSON 轨道预设。
- 新增 Skew X/Y 和九点 Pivot，与所有 Timing、Each child 和其他变换轨道组合使用。
- Effect / Timing 为隐藏控件补足占位空间，首次打开 None、Clock 或 Export 后再切换类型也能容纳完整布局。
- 同步更新内嵌和外链播放器，版本链接固定到 v0.3.0；该 tag 发布前请使用默认 Embed，或在 Link URL 中填写 `svg-anim-runtime.min.js` 生成同目录播放器。
- 原有 v0.2.2 动画数据继续使用，无需迁移。

## v0.2.2

- Easing 从 11 种补齐到 31 种；所有 10 个系列均有 in / out / in-out。
- 原有 Cubic（原名 Ease）、Sine in-out、Expo in-out、Back、Elastic out、Bounce out 曲线保持不变；旧动画无需迁移。
- 同步更新内嵌和外链播放器，默认 jsDelivr 链接固定到 `v0.2.2`。在 Link 的 Script URL 填 `svg-anim-runtime.min.js` 时，导出会在 SVG 旁写出配套播放器，可离线使用。

## License

MIT © WaveF
