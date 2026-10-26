# 本地翻译服务

插件通过 LibreTranslate 的 `/translate` 接口使用本地模型。本仓库和发布 ZIP 不包含引擎、Python、加载器或语言模型，需要单独准备。

## Windows 手动安装示例

以下示例使用 Python 3.12 和 LibreTranslate 1.9.6。先在计划存放引擎的目录打开 PowerShell；这可以是非系统盘上的目录。

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install "libretranslate==1.9.6" "chardet==5.2.0"
.\.venv\Scripts\libretranslate.exe --host 127.0.0.1 --port 5000 --load-only en,zh,ja --disable-files-translation
```

示例固定了与该 LibreTranslate 版本配套使用的编码检测依赖。其他版本请按 [LibreTranslate 安装文档](https://docs.libretranslate.com/guides/installation/)准备。

首次启动会下载选定语种的模型，需要联网并等待服务就绪。`--load-only en,zh,ja` 选择英文、中文、日文；没有直译模型的语言组合可能通过英语中转。模型下载完成后，这些已安装语种可以离线翻译，质量取决于模型。

虚拟环境决定程序依赖的位置，模型和缓存的位置另由引擎配置。需要改变存储位置时，可在启动服务前设置 Argos 的 `XDG_DATA_HOME`、`XDG_CACHE_HOME`、`XDG_CONFIG_HOME` 和 `ARGOS_PACKAGES_DIR`；参见 [Argos 配置源码说明](https://github.com/argosopentech/argos-translate/blob/master/argostranslate/settings.py)。

## 连接插件

在 QQ 插件设置中选择 **LibreTranslate / 本地服务**，填写：

| 项目 | 值 |
| --- | --- |
| 完整接口地址 | `http://127.0.0.1:5000/translate` |
| API Key | 未启用密钥鉴权的自建服务可留空 |
| 目标语言 | 选择本地模型支持的语言 |

先点击 **保存并测试（保持暂停）**。测试成功后，勾选文本发送说明，打开自动翻译开关并保存。测试只发送固定问候语；首次测试也有助于加载模型。

服务需要在 QQ 翻译期间持续运行。插件不会自动安装或启动 LibreTranslate。上述命令只绑定本机 `127.0.0.1`，API Key 默认不启用；若自行启用了密钥鉴权，则需填写对应密钥。

## 排查连接问题

- 本地地址无法连接：确认启动服务的终端仍在运行、模型已经下载完成、端口与插件地址一致。
- 首次请求超时：等待模型启动后，保持暂停并重新测试。
- 提示不支持某种语言：检查该语种模型是否安装；插件中的语言选项不代表服务端已具备全部模型。
- 远程服务地址必须使用 HTTPS；HTTP 仅允许本机地址。完整接口与请求参数见 [LibreTranslate API 文档](https://docs.libretranslate.com/api/operations/translate/)。
