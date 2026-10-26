# 第三方项目与服务

本仓库插件源码采用 [MIT 许可证](LICENSE)。作者与维护者为 [yushuyingsakura](https://github.com/yushuyingsakura)。

插件使用下列独立项目或服务：

| 项目 | 用途 | 说明 |
| --- | --- | --- |
| [LiteLoaderQQNT](https://github.com/LiteLoaderQQNT/LiteLoaderQQNT) | QQ NT 插件加载器与插件接口 | 独立安装，许可见项目的 [LICENSE](https://github.com/LiteLoaderQQNT/LiteLoaderQQNT/blob/main/LICENSE)。 |
| [LibreTranslate](https://github.com/LibreTranslate/LibreTranslate) | 可选的自建翻译 API | 独立服务，采用 AGPL-3.0，许可见项目的 [LICENSE](https://github.com/LibreTranslate/LibreTranslate/blob/main/LICENSE)。 |
| [Argos Translate](https://github.com/argosopentech/argos-translate) | LibreTranslate 使用的本地翻译引擎 | 独立引擎，具体授权见项目的 [LICENSE](https://github.com/argosopentech/argos-translate/blob/master/LICENSE)。语言模型另按各自来源授权。 |
| [Happy DOM](https://github.com/capricorn86/happy-dom) | DOM 自动化测试 | MIT，仅作为开发依赖；许可见项目的 [LICENSE](https://github.com/capricorn86/happy-dom/blob/master/LICENSE)。 |
| [DeepL API](https://developers.deepl.com/) | 可选的官方在线翻译服务 | 使用服务方 API Key、套餐与服务条款；未提供密钥或私有接口。 |

发布 ZIP 只包含本插件，不附带上述加载器、翻译引擎、模型、原生启动器或注入组件。开发依赖的具体版本及包来源记录在 `package-lock.json`。

本项目为第三方插件，与腾讯 QQ、LiteLoaderQQNT、LibreTranslate 或 DeepL 的官方项目没有隶属或背书关系。相关名称与标识归其各自权利人所有。
