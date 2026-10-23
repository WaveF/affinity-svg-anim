# SVG Anim for Affinity

在 Affinity 中给元素设置动画，导出为可直接播放的 SVG。

- **Affinity 脚本** `dist/svg-anim-v0.2.1.js`：用一个对话框设置动画和导出。动画参数保存在元素的元数据里，重新选中元素时会显示出来。
- **播放器** `dist/svg-anim-runtime.min.js`：无依赖，约 11 KB，导出时可以内嵌进 SVG，也可以通过 jsDelivr 引用。

本项目由 [affinity-svg](https://gitee.com/wavef/affinity-svg) 发展而来，但不兼容旧版用图层名写的 `{{…}}` 表达式。

## 安装

1. 下载 [`dist/svg-anim-v0.2.1.js`](dist/svg-anim-v0.2.1.js)。
2. 在 Affinity 的 Scripts 面板中添加该脚本。
3. 导出文件默认保存到 `~/Downloads/SVG Anim`。如果 Affinity 提示没有写入权限，请在 Affinity 设置 › Scripting 中允许这个文件夹，或者改用桌面上的文件夹。

## 使用

运行脚本后，在对话框顶部选择模式。对话框底部会说明按 OK 将执行的操作。

### Animate（有选区时默认进入此模式）

- 每个元素最多 8 条 Track，各 Track 同时播放、效果叠加。Tracks 区下方用两行显示 1～4 和 5～8 的简述。
- 动画类型：Fade、Move（文档像素）、Rotate（顺时针，9 点轴心）、Scale、Draw stroke（描边绘制）、Count number（数字滚动）、Clock（时钟）、Frames（逐个显示子元素）。
- Timing：Duration、Delay、Stagger（作用于每个子元素时可设）、Easing、Direction、Play count、Pause between plays。
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
    https://cdn.jsdelivr.net/gh/WaveF/affinity-svg-anim@v0.2.1/dist/svg-anim-runtime.min.js
    ```

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
| `type` | `fade` `move` `rotate` `scale` `draw` `count` `clock` `frames` |
| `target` | `self` / `children` |
| `dur` `delay` `stagger` `loopDelay` | 秒 |
| `order` | `forward` `reverse` `center` `random` |
| `ease` | `linear` `in` `out` `inOut` `sineInOut` `expoInOut` `backIn` `backOut` `backInOut` `elasticOut` `bounceOut` |
| `dir` | `normal` `reverse` `alternate` `alternateReverse` |
| `loops` | 播放次数，0 = 无限 |
| `trigger` | `load` `view` `click` `hover` |
| fade | `from` `to`（%） |
| move | `x` `y`（文档像素） |
| rotate | `angle`（度，顺时针为正），`pivot`：`tl tc tr cl c cr bl bc br` |
| scale | `sx` `sy`（%），`pivot` |
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
```

以下测试需要 Affinity 已启用 MCP（`http://localhost:6767/sse`）。通过 MCP 运行的脚本只能写入桌面，所以测试文件都放在桌面上：

```bash
npm run test:dialog
cp <affinity-svg>/example/images/AppleWatch.af ~/Desktop/svganim-test-AppleWatch.af
npm run test:export        # 结果留在 ~/Desktop/svganim-test-out
python tests/runtime_test.py   # 需要 Playwright，测试播放器数值
python tests/real_test.py      # 在浏览器中播放 test:export 的导出结果
rm -rf ~/Desktop/svganim-test-out ~/Desktop/svganim-test-AppleWatch.af
```

### 发布新版本

1. 修改 `package.json` 中的 `version`，然后执行 `npm run build`。
2. 提交 `dist/`，打 tag `v<版本>` 并推送。脚本中的 jsDelivr 地址固定到这个 tag。

## License

MIT © WaveF
