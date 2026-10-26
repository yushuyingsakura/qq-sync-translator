# QQ 收信同步翻译

在 QQ NT 收到的文字消息下方显示译文，保留原文。支持 DeepL 官方 API，以及可自建、无需 API Key 的 LibreTranslate 服务。

当前版本：**v0.1.1**。项目维护者：[yushuyingsakura](https://github.com/yushuyingsakura)。

## 使用条件

- Windows QQ NT，以及已经能够正常工作的 LiteLoaderQQNT 插件加载器。
- 一项可用的翻译服务：DeepL API，或兼容的 LibreTranslate `/translate` 接口。

目前仅在 **QQ NT 9.9.33-52230 + LiteLoaderQQNT 1.4.1** 中完成实机验证。其他版本和主题可能需要适配。

这是第三方插件。LiteLoaderQQNT 项目已归档，其[仓库说明](https://github.com/LiteLoaderQQNT/LiteLoaderQQNT)提示可能触发 QQ 账号限制。请先了解加载器的状态和风险。

## 安装

1. 从 [Releases](https://github.com/yushuyingsakura/qq-sync-translator/releases) 下载 `qq-sync-translator-0.1.1.zip`。
2. 打开 **QQ 设置 → LiteLoaderQQNT → 安装插件**，选择该 ZIP，然后完整退出 QQ 并重新启动。
3. 在插件设置中打开 **QQ 收信同步翻译**，或点击聊天窗口右下角的 **⚙ 设置**。
4. 选择翻译服务并填写配置，点击 **保存并测试（保持暂停）**。它只发送固定问候语，同时保持自动翻译关闭。
5. 测试成功后，勾选文本发送说明，选择目标语言，开启自动翻译并保存。

也可手动将插件放入加载器数据目录的 `plugins/qq_sync_translator`，确保 `manifest.json` 直接位于该文件夹内，再重启 QQ。

安装插件不需要运行 npm。发布包只包含插件源码，不包含加载器、翻译引擎、模型或原生启动组件。

## 翻译服务

| 服务 | 配置 | 说明 |
| --- | --- | --- |
| DeepL 官方 API | API Key，以及 API Free / API Pro 套餐 | 需要自己的 API 账号；网页会员与 API 套餐不同。 |
| LibreTranslate | 完整 `/translate` 地址，可选 API Key | 未启用密钥鉴权的自建服务可以不填写 Key。 |

本机服务示例地址：`http://127.0.0.1:5000/translate`。这只是接口地址，必须有实际运行的服务。安装与启动方法见[本地翻译说明](docs/LOCAL_TRANSLATION.md)。

远程服务必须使用 HTTPS；HTTP 仅允许本机地址。语言支持、翻译质量和费用取决于所选服务。官方接口资料：[DeepL](https://developers.deepl.com/api-reference/translate/request-translation)、[LibreTranslate](https://docs.libretranslate.com/api/operations/translate/)。

## 功能与范围

- 自动翻译当前打开会话中进入可见区域的收到的文字消息，原文保持不变。
- 支持暂停、单条失败重试、请求限速、在途请求合并和内存缓存。
- 不改写输入框、不代发消息、不读取聊天数据库。
- 未打开会话的后台消息、图片 OCR、语音、文件和转发卡片不处理。混合图文消息只提取可识别的正文文字。
- 切换会话或滚动历史时，新进入可见区域的历史消息也可能被翻译。
- 只处理能确认收信方向的消息；自己发出的消息会优先排除。

默认译成简体中文，最长处理 3000 字符，请求最小间隔 500 毫秒，最多缓存 500 条译文。缓存仅存在于当前运行内存，退出 QQ 或重新保存设置后清空。

目标为中文时，可以跳过疑似纯中文消息。此判断基于文字脚本，纯汉字的日语可能被误判；需要时可关闭该选项。纯链接、数字和表情默认跳过。

v0.1.1 增加了对 QQ 原生 `text-element--other` 收信标记的支持，并迁移旧版默认识别规则。

## 数据与密钥

自动翻译初始关闭，开启前需要同意将待翻译文字发送到所选服务。使用本机 LibreTranslate 时，推理由本机服务完成。

API Key 通过 Electron `safeStorage` 加密后保存在加载器的插件数据目录，设置页不会读取已保存的明文密钥。密钥框留空会保留当前服务的密钥，勾选删除并保存可清除。复制设置到其他 Windows 用户或机器后，可能需要重新填写密钥。

插件本身不把聊天原文或译文写入磁盘、日志或仓库。登录身份仅在内存中用于区分自己的消息。翻译服务的数据处理方式由服务提供者决定。

## 没有译文时

先确认自动翻译已保存开启、连接测试成功，并打开了包含收到的文字消息的会话。图片和自己发送的消息不会被翻译。

在聊天窗口的 **⚙ 设置 → 高级选项与兼容性诊断** 中刷新诊断：

| 结果 | 排查方向 |
| --- | --- |
| `messageLists` 为 0 | 消息列表尚未出现，或页面结构不匹配。 |
| `renderedMessages` 为 0 | 当前没有已渲染消息，或消息行选择器需要适配。 |
| `unknown` 较多 | 未识别到明确的收信标记。 |
| 有 `incoming` 但无译文 | 检查服务、可见区域、文字选择器、中文跳过规则与长度限制。 |

QQ 更新可能改变页面结构。高级设置可以调整选择器；请根据真实结构修改，保留对自己消息的排除规则。

遇到鉴权或额度错误，请检查 API Key、API 套餐与服务配额。本地连接失败请检查服务是否启动、端口和接口路径是否正确。

## 开发与测试

使用 Node.js 20+：

```sh
npm ci
npm test
```

当前 31 项自动化测试覆盖消息识别、虚拟列表复用、翻译请求、配置、缓存、密钥接口及主进程桥接。详细覆盖与验证边界见[测试说明](docs/TESTING.md)。

## 许可与相关项目

本插件采用 [MIT 许可证](LICENSE)。独立加载器、翻译服务和开发依赖见[第三方说明](THIRD_PARTY_NOTICES.md)。本项目与腾讯 QQ 及相关服务的官方项目没有隶属或背书关系。
