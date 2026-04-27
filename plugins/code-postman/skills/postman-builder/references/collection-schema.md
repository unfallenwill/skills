# Postman Collection v2.1.0 Schema

## Collection 顶层结构

```json
{
  "info": {
    "_postman_id": "{{GENERATE_UUID}}",
    "name": "Collection Name",
    "description": "Collection description",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "auth": {
    "type": "bearer",
    "bearer": [
      { "key": "token", "value": "{{authToken}}", "type": "string" }
    ]
  },
  "event": [
    {
      "listen": "prerequest",
      "script": {
        "type": "text/javascript",
        "exec": [""]
      }
    }
  ],
  "variable": [
    {
      "key": "baseUrl",
      "value": "http://localhost:8080"
    }
  ],
  "item": []
}
```

## Folder 结构

```json
{
  "name": "Folder Name",
  "description": "Folder description",
  "item": []
}
```

## Request Item 结构

```json
{
  "name": "TC-POS-001: 正常创建用户",
  "event": [
    {
      "listen": "prerequest",
      "script": {
        "type": "text/javascript",
        "exec": [
          "// Pre-request script lines"
        ]
      }
    },
    {
      "listen": "test",
      "script": {
        "type": "text/javascript",
        "exec": [
          "// Test script lines"
        ]
      }
    }
  ],
  "request": {
    "method": "POST",
    "header": [
      {
        "key": "Content-Type",
        "value": "application/json",
        "type": "text"
      }
    ],
    "auth": {
      "type": "bearer",
      "bearer": [
        { "key": "token", "value": "{{authToken}}", "type": "string" }
      ]
    },
    "url": {
      "raw": "{{baseUrl}}/api/users",
      "host": ["{{baseUrl}}"],
      "path": ["api", "users"]
    },
    "body": {
      "mode": "raw",
      "raw": "{\"username\": \"testuser\", \"email\": \"test@example.com\"}",
      "options": {
        "raw": {
          "language": "json"
        }
      }
    }
  },
  "response": []
}
```

### 无需认证的 Request

不设置 `auth` 字段，或设置：
```json
"auth": {
  "type": "noauth"
}
```

### GET 请求（无 Body）

```json
{
  "method": "GET",
  "header": [],
  "url": {
    "raw": "{{baseUrl}}/api/users/:id",
    "host": ["{{baseUrl}}"],
    "path": ["api", "users", ":id"],
    "variable": [
      {
        "key": "id",
        "value": "1"
      }
    ]
  }
}
```

### 带 Query 参数的请求

```json
"url": {
  "raw": "{{baseUrl}}/api/users?page=1&size=10",
  "host": ["{{baseUrl}}"],
  "path": ["api", "users"],
  "query": [
    { "key": "page", "value": "1" },
    { "key": "size", "value": "10" }
  ]
}
```

## Environment 文件结构

```json
{
  "id": "uuid-string",
  "name": "dev",
  "values": [
    {
      "key": "baseUrl",
      "value": "http://localhost:8080",
      "type": "default",
      "enabled": true
    },
    {
      "key": "authToken",
      "value": "",
      "type": "default",
      "enabled": true
    }
  ],
  "_postman_variable_scope": "environment",
  "_postman_exported_at": "2026-01-01T00:00:00.000Z",
  "_postman_exported_using": "Postman/10.0.0"
}
```

## 注意事项

- `info.schema` 必须是 `https://schema.getpostman.com/json/collection/v2.1.0/collection.json`
- `_postman_id` 和 `id` 字段必须使用真实 UUID（使用 `crypto.randomUUID()` 生成），不要使用占位字符串
- `event[].script.exec` 是字符串数组，每行一个字符串
- URL 变量使用 `{{variableName}}` 语法
- `body.raw` 中的 JSON 字符串必须合法
- 不需要认证的请求不要设置 `auth` 字段
- `_postman_exported_at` 等导出元数据字段可省略
- 文件编码为 UTF-8
