# code-postman

从代码库逆向分析 API 并生成 Postman 测试集。

## 工作原理

1. **定位 API 代码** — 根据用户指定的端点（如 `POST /api/users`），在代码库中找到对应的路由定义和 handler 函数
2. **逆向提取接口规格** — 从代码中提取请求参数、校验规则、鉴权方式、响应结构和业务约束
3. **设计测试用例** — 按系统化方法论生成：正向测试、参数校验（缺失/类型/格式/边界/业务异常）、安全测试（未认证/越权/注入）、链路测试
4. **生成 Postman Collection** — 输出符合 v2.1.0 schema 的 JSON 文件，可直接导入 Postman

## 支持的框架

| 框架 | 路由识别 | 参数提取 | 校验提取 |
|------|---------|---------|---------|
| Express/Koa | `router.METHOD()` | req.params/query/body | Joi / Zod / express-validator |
| NestJS | `@Controller` + `@Post` | `@Body` / `@Param` / `@Query` | class-validator |
| Spring Boot | `@RequestMapping` | `@PathVariable` / `@RequestBody` | Bean Validation |
| FastAPI | `@router.post` | type hints | Pydantic |
| Django | URL patterns | request.GET/POST | DRF Serializer |
| Gin | `r.POST()` | c.Param / c.Query / Bind | binding tags |

## 使用方式

```
# 在一个代码库中，指定要测试的 API 端点
从代码生成 postman 测试 POST /api/users
```

Agent 会自动识别项目框架，分析代码，生成测试集。

## 输出文件

```
postman/
├── collections/
│   └── {api-name}.postman_collection.json
└── environments/
    └── dev.postman_environment.json
```

## 插件结构

```
code-postman/
├── .claude-plugin/
│   └── plugin.json
├── agents/
│   └── api-testgen.md              # Agent 编排（4 阶段工作流）
├── skills/
│   ├── code-analyzer/              # 代码逆向分析知识库
│   │   ├── SKILL.md
│   │   └── references/
│   │       └── framework-patterns.md
│   ├── test-methodology/           # 测试方法论知识库
│   │   ├── SKILL.md
│   │   └── references/
│   │       └── case-design-guide.md
│   └── postman-builder/            # Postman 构建知识库
│       ├── SKILL.md
│       └── references/
│           ├── collection-schema.md
│           └── assertion-templates.md
└── README.md
```
