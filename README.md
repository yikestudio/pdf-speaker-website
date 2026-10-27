# PDF Speaker Website

独立静态官网：现代、克制的产品展示，16 种语言的首页、隐私政策与用户条款。
使用真实 App 截图与 App 生成的语音素材，不依赖远程字体、CDN、分析脚本、Cookie 或运行时框架。

官网地址：https://yikestudio.github.io/pdf-speaker-website/

独立仓库：https://github.com/yikestudio/pdf-speaker-website

## 本地运行

需要 Node.js 22 或更高版本。**没有 npm 依赖，不需要安装包。**

```sh
npm run check
npm run preview
# http://127.0.0.1:4173/zh-Hans/index.html
```

`npm run build` 输出 `_site/`，其中包含 48 个本地化页面、根入口、404、robots 和 sitemap。
页面内容全部预渲染；关闭 JavaScript 后仍可阅读、切换语言、打开政策和 FAQ。
JavaScript 负责根入口的浏览器语言选择、设备截图标签切换、语言菜单辅助交互、
试听语言筛选、音频互斥播放、就近加载音频元数据及断句高亮。
关闭 JavaScript 后，全部音色卡、文字稿、原生音频播放器与静态断句说明仍可使用；
动态筛选、互斥播放和同步高亮需要 JavaScript。没有自动播放或浏览器语音合成。
直接访问语言页面不会自动跳转。语言选择保留当前首页 / 政策 / 条款，不写入浏览器存储。
阿拉伯语使用 RTL；外观跟随系统；支持减少动态效果、键盘导航及窄屏。

## 配置

编辑 [site.config.json](site.config.json)：

- `appStoreUrl`：当前 `null`。获得真实链接后填写 `https://apps.apple.com/...`。首屏主按钮引导试听；下载入口在未配置时定位到明确的待发布说明，不伪装成可下载按钮，不跳转假地址。
- `siteUrl`：已配置正式 GitHub Pages 地址，**包含仓库子路径**。未配置时不输出虚假的 canonical，sitemap 为空。GitHub Actions 会自动传入 Pages 的实际 `SITE_URL`。
- `supportEmail`、`publisher`：沿用现有发布资料的工作室名称及公开支持邮箱。
- `priceUSD`：美国区参考价 `14.99`。各地区币种、税费和最终购买条件以 App Store 为准；网站不处理支付。
- `updated`：政策内容修订日期，不随构建日期自动变动。

不要将示例地址当成真实域名提交到 App Store。App 工程内的政策链接已接入本官网，
首次介绍和设置均按当前界面语言打开对应的 `terms.html` / `privacy.html`；以后更换域名或路径时须同步更新 App。
音频导出仅在 App 测试中增加了可选入口，没有替换本机已安装的 App。

## GitHub Pages 部署

1. 为**本目录**创建单独的 GitHub 仓库，将整个项目推送到 `main`，不要上传 `_site/`。
2. GitHub → Settings → Pages → Source 选择 **GitHub Actions**。
3. 推送或手动运行 [pages.yml](.github/workflows/pages.yml)。工作流构建、运行测试并发布 `_site/`，自动适配项目站点子路径及自定义域名。
4. 用实际公开地址验证首页、图片、音频播放与拖动、16 种语言、政策页、条款页和 404；开启 HTTPS。
5. 如使用自定义域名，在仓库 Pages 设置中配置域名和 DNS，再重新运行工作流以更新 canonical 与 sitemap。

经发布者确认，官网使用上述独立公开仓库，`main` 分支由此工作流自动发布。
当前尚未配置 App Store 购买链接，下载入口仍保留待配置说明；官网公开不代表 App 已上架。

普通网页使用相对资源与导航路径，所以适用于根域名和 `/<repository>/`。
404 的 `<base>` 从部署 URL 生成，深层未知路径也能回到正确项目主页。
测试子路径部署：

```sh
SITE_URL=https://your-actual-host.example/pdf-speaker npm run build
BASE_PATH=/pdf-speaker PORT=4174 npm run preview
```

上面域名仅为命令示例，不要保留为生产配置。

## 内容与素材

- [src/content/site.mjs](src/content/site.mjs)：16 种语言的官网文案。
- [src/content/showcase.mjs](src/content/showcase.mjs)：16 种语言的具体产品优势、试听和断句说明。
- [src/content/demo-passages.mjs](src/content/demo-passages.mjs)：16 套原创断句示例，每套包含标题与三行正文。
- [src/content/legal.mjs](src/content/legal.mjs)：16 种语言的隐私政策及补充使用条款。
- [src/content/app-copy.json](src/content/app-copy.json)：从 App 本地化导入的产品文案、图注。
- [public/assets/](public/assets/)：144 张经过 WebP 优化的真实本地化截图、品牌素材和前端文件。
- [public/assets/provenance.json](public/assets/provenance.json)：每张图的原始 PNG 与发布 WebP SHA256、界面和文档语言、书名、章节及 XCTest 附件来源。
- [public/assets/audio/](public/assets/audio/)：83 段真实生成的 MP3，以及所用语音资源的许可证副本。
- [public/assets/audio/manifest.json](public/assets/audio/manifest.json)：音频来源、内部引擎与音色 ID、文字稿、实测时长与波形、句段时间和文件 SHA256。
- [scripts/build.mjs](scripts/build.mjs)：无依赖静态生成器，构建时验证链接配置和语言完整性。

截图由真实 App 打开对应语言的原创示例 PDF 后重新拍摄，界面与正文均对应网页语言，
不在图片上覆盖或替换文字。繁体中文使用独立生成的繁体样例，不修改 App 内置书籍。
未伪造功能、评分或用户评价；这些画面不代表已经在商店发布。

如需更新 App 素材，可在本机安装了 `cwebp` 的环境中执行：

```sh
# 先运行 App 的 ReaderUITests.testLocalizedWebsiteScreenshots：
# TEST_RUNNER_PDF_SPEAKER_CAPTURE_LOCALES=all，或指定逗号分隔的语言列表。
# 每个平台可合并多个结果包，但必须包含全部 16 种语言。
npm run import-captures -- mac /absolute/path/to/Mac.xcresult
npm run import-captures -- iphone /absolute/path/to/iPhone.xcresult
npm run import-captures -- ipad /absolute/path/to/iPad.xcresult
npm run import-assets -- ../ListenToPDF/StoreAssets
npm run check
```

`import-captures` 将经过验证的原始附件与文档来源写入 App 工程的 `StoreAssets/WebsiteCaptures/`，
每个平台 80 张原始图；`import-assets` 只读取该素材目录，输出官网使用的 144 张 WebP。
每种网页语言包含 Mac、iPad、iPhone 各三张：主界面、文档视图、听书视图。
平台内三张图在宽屏并排、窄屏纵向展示，点击可在新标签页查看完整图片；关闭 JavaScript 后九张图全部保留。
拍摄使用隔离的 `.websitecaptures` App；PDF 导入入口仅在 DEBUG 中存在，常规 UI 测试不提供参数时跳过拍摄。
没有替换正式安装的 App。`import-assets` 不是构建或部署前提，导入后的素材与文案已独立保存在此项目。
正常构建仅需 Node.js，不需要 Xcode、Python、App 源码或 WebP 工具。

## 试听与智能断句演示

首页依次展示产品概览、可听的音色比较、33 种朗读语言、可播放的排版断句示例、
iPhone / iPad / Mac 真实界面及使用场景，最后说明隐私和购买条件。

- **32 种语言的双声音试听**：每种语言两段，同一语言的两种代表性声音朗读相同文字，
  另有一段中英文混读。加上繁体中文的两段独立文字稿变体，共 67 段试听文件。
  每页只显示当前中文书写变体，因此有 65 张录音卡；这不是 65 个独立音色，也不是全部 39 个内置音色的完整试听库。
- **33 种朗读语言均可选择**：希伯来语保留支持说明，不提供录音。
  App 使用设备上可用的系统声音；由于 Apple 系统声音录音的公开发布授权限制，本网站没有录制或发布该声音。
  参见 [macOS Tahoe 软件许可第 2.F 节](https://www.apple.com/legal/sla/docs/macOSTahoe.pdf)。
- **16 段断句演示**：每种语言一段。无标点的大标题因字号差异与正文断开；
  正文的两行视觉换行合并为一句；标点再分出下一句。播放或拖动进度时，排版原文与实际句段同步高亮。
- 使用 App 实际的语音合成、分句和停顿规则生成，不是浏览器 TTS、麦克风录音或屏幕实录。
  音频以正常速度导出，去除了生成等待；不能据此推断真实设备的合成速度。
- 标题后的语音间隔约 **0.45 秒**，包含已有首尾静音，而非在原文中插入假标点。
  MP3 为 96 kbps，保留 gapless 元数据；发布后的音频也执行了静音区间检查。
- **39 个内置音色、33 种具体朗读语言、16 种界面语言、3 个平台**是不同统计口径。
  不保证每个声音支持全部语言，不将同一音色的多个语言条目重复计算为独立音色。
  各设备有独立书库和进度，没有暗示云同步。

如需重新生成音频，需要 macOS、Xcode、App 工程中的语音资源及 `ffmpeg`：

```sh
npm run export-app-audio -- ../ListenToPDF
npm run check
npm run check-audio
```

非默认 Xcode 安装位置需设置 `DEVELOPER_DIR`。导出入口是 App 测试
`OfflineSpeechTests.testExportWebsiteAudioSamples`，常规 App 测试未提供导出参数时会明确跳过。
原始 WAV 作为 XCTest 附件保留在结果包中；可复用成功的结果包重新编码，无需再次合成：

```sh
npm run export-app-audio -- ../ListenToPDF /absolute/path/to/Website-Audio.xcresult
```

manifest 保留源 WAV 与发布文件的校验和、结果包名称及导入时工作树源码的校验和；
它不是对历史二进制源码的反向认证。素材附有 Supertonic MIT 与 MOSS Apache-2.0 许可证副本，
不代表 App 内其他模型和依赖的商业授权已完成核实。
普通构建和 GitHub Pages 部署使用已提交的素材，不会运行 Xcode 或现场合成语音。
本地预览支持 HTTP 字节范围和正确的媒体长度，便于真实验证音频拖动。

## 发布前必须确认

政策与条款是根据目前实现准备的**发布前草案**，不是法律审查结论，也不是 App Store 合规认证：

- 由发布者审核全部文本和翻译，补充所在地要求的法定主体、地址、交易者或其他披露。工作室品牌和邮箱不能替代法定主体认证。
- 条款采用对 Apple 标准 EULA 的补充说明，未擅自选择管辖法院、排除强制消费者权利或承诺永久更新；发布者需确认 App Store 的实际 EULA 设置。
- 确认最终二进制、第三方 SDK、系统资源和支持邮件处理与隐私描述一致；如新增分析、上传、账号或存储偏好，须同步修改政策。
- GitHub Pages 会接收网站访问请求；网站无自建分析不等于托管方不处理 IP。隐私页已区分网站托管与 App 本地处理。
- 商店资源资料中仍存在商业授权待核实项（Matcha Baker、Piper 声音数据、eSpeak NG 及依赖等）。上线销售前必须取得授权、替换或移除不适用资源。营销文案不能替代授权。
- 33 种朗读语言、16 种界面语言、语言混读与声音可用性均有明确边界；不要改为“每种声音都支持全部语言”或“跨设备自动同步”。
- 完成 App Store 上架、价格与通用购买配置后再填写真实下载 URL。

## 设计与验证

官网遵循 Web 语义和 WCAG 基础，不照搬原生 App 导航。首屏以原文高亮与听书真实画面形成视觉重点，背景与装饰不抢内容。
首屏同时展示 Mac、iPad 与 iPhone 的真实界面；16 种语言均突出离线听读，
并说明本地 PDF 与设备上可用声音的使用前提，不暗示云端文件无需网络即可获取。
后台播放文案限定为 iPhone / iPad 切换应用或锁屏后继续朗读，依据 App 的后台音频配置和播放会话实现，
不承诺 Mac 睡眠后继续播放；本轮未进行真机后台播放专项测试。
iPhone 框中的灵动岛是静态硬件装饰，不代表实现了 Live Activity。
标题使用系统无衬线，正文 17px；按钮最小 44px；正文颜色经过对比度测试：
浅色正文 `#18243b`、次级 `#56627a`，底色 `#f7f8fc`；蓝色 `#4058d5`。
深色正文 `#f1f4fc`、次级 `#b2bed3`，底色 `#111827` / `#182236`；蓝色 `#aabaff`。
正文、次级文字和主要按钮文本均通过 4.5:1 的测试阈值。

[tests/site.test.mjs](tests/site.test.mjs) 检查所有语言键、法律内容、50 个文档、全部内部链接与锚点、
图片说明、语言切换语义、真实截图来源、素材体积、下载占位状态、URL 校验与文本对比度。
[tests/audio.test.mjs](tests/audio.test.mjs) 检查 16 语言新增内容、83 个音频文件、32 种录音语言和希伯来语排除规则、
真实来源与波形、句段和原文映射、450ms 边界及渐进增强。
[tests/preview.test.mjs](tests/preview.test.mjs) 检查项目子路径下的媒体类型、长度、HEAD、
首部 / 尾部 / 开放式字节范围及不可满足范围。
[scripts/check-audio.mjs](scripts/check-audio.mjs) 使用 ffmpeg 完整解码音频，检查时长、非空语音和实际段落静音。
本轮验证结果：

- 19 项 Node 自动化测试全部通过，覆盖三平台各三种视图、离线文案、截图文档语言及发布文件校验和。
- 83 个 MP3 完整解码通过；16 个段落静音区间全部通过，最大 RMS 为 0.000067，低于 0.002 阈值。
- 新版图库：16 种语言 × 3 个平台 × 320px / 768px / 1440px × 浅色 / 深色，共 288 个浏览器布局检查通过。
- 全部 16 种语言、3 个平台在 320px 宽度、200% 文字、深色和减少动态效果下无横向溢出，另计 48 项检查。
- 全部 83 个音频在浏览器加载并触发解码成功；已实际验证点击播放、音频互斥、切语言停播、
  文字稿展开及本地化错误提示。
- 断句演示的三个句段、第二句对应两行原文、段落停顿标识、暂停后拖动以及播放结束清理均通过浏览器验证。
- 已验证三端截图切换、方向键 / Home / End、RTL 按键方向、语言菜单 Escape 关闭、
  法律页切换语言后仍留在同类页面、FAQ 展开和下载占位定位。
- 已检查浅色桌面、深色阿拉伯语手机截图；所有本地化产品图片可解码。
- 阻断增强脚本后，65 张录音卡、希伯来语说明及原生播放器可用；产品截图、语言切换与政策导航仍可使用。
- 项目子路径下的样式、图片、政策导航及嵌套未知地址的 404 返回均已实测；
  新增音频的真实播放、拖动与同步高亮也已通过子路径浏览器验证。

这些结果不替代母语审校、法律审核或正式公网发布后的验收。
