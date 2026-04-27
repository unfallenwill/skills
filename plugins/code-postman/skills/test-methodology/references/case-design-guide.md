# Case Design Guide — 测试用例设计指南

## 用例命名规范

```
TC-{类别}-{编号}: {简短描述}
```

类别缩写：
- `POS` — 正向测试
- `VAL` — 参数校验（反向）
- `SEC` — 安全测试
- `CHAIN` — 链路测试

示例：
- `TC-POS-001: 正常创建用户`
- `TC-VAL-001: 必填字段缺失-username`
- `TC-SEC-001: 未认证访问`

---

## 1. 正向测试（Happy Path）

### 目的
验证接口在合法输入下的正确行为。

### 用例设计

**对每个接口至少生成 1 个正向用例：**

- 填入所有必填字段 + 部分选填字段
- 使用完全合法的数据值
- 验证成功状态码（200/201/204）
- 验证响应体结构完整性
- 验证关键字段值合理（如 `id` 非空、`createTime` 为当前时间）

### 用例模板

```markdown
### TC-POS-001: {描述}
- **描述**: 使用完整合法参数请求接口
- **请求数据**:
  - Method: {METHOD}
  - URL: {{baseUrl}}{PATH}
  - Headers: Content-Type: application/json{, Authorization: Bearer {{authToken}}}
  - Body:
    ```json
    { "field": "valid_value", ... }
    ```
- **预期结果**:
  - 状态码: {200/201}
  - 响应体包含字段: {field1}, {field2}, ...
  - {field} 值为 {expected_value}
  - 如有 id 字段，保存为变量供后续使用
```

### Postman 断言要点

```javascript
pm.test("[正向] 状态码为 {expected}", () => {
    pm.response.to.have.status({expected});
});

pm.test("[正向] 响应体包含必要字段", () => {
    const json = pm.response.json();
    pm.expect(json).to.have.property("id");
    pm.expect(json).to.have.property("{field}");
});

pm.test("[正向] 提取变量供后续使用", () => {
    const json = pm.response.json();
    pm.environment.set("{resourceId}", json.id);
});
```

---

## 2. 反向测试 — 参数校验

### 目的
验证接口对非法输入的校验能力和错误提示质量。

### 2.1 必填项缺失

对每个必填字段生成一个用例。

```markdown
### TC-VAL-001: 必填字段缺失-{field_name}
- **描述**: 不传必填字段 {field_name}
- **请求数据**: Body 中移除 {field_name}
- **预期结果**:
  - 状态码: 400
  - 错误消息包含 "{field_name}" 相关提示（如 "{field_name}不能为空"）
```

### 2.2 类型错误

对每个有明确类型的字段生成用例。

```markdown
### TC-VAL-002: 类型错误-{field_name}传{wrong_type}
- **描述**: 将 {field_name} 从 {correct_type} 改为 {wrong_type}
- **请求数据**: "{field_name}": {wrong_value}
- **预期结果**:
  - 状态码: 400
  - 错误消息提示类型不匹配
```

类型错误组合：
| 原类型 | 错误值示例 |
|--------|-----------|
| string | `123` (数字), `true` (布尔), `{}` (对象), `[]` (数组) |
| number | `"abc"` (字符串), `true` (布尔), `null` |
| boolean | `"yes"` (字符串), `1` (数字) |
| array | `"not_array"` (字符串), `{}` (对象) |
| object | `"not_object"` (字符串), `[]` (数组) |

### 2.3 格式非法

对有格式要求的字段生成用例。

```markdown
### TC-VAL-003: 格式非法-{field_name}为无效{format}
- **描述**: {field_name} 使用非法的 {format} 格式
- **请求数据**: "{field_name}": "{invalid_value}"
- **预期结果**:
  - 状态码: 400
  - 错误消息提示格式不正确
```

格式非法值：
| 格式 | 非法值 |
|------|--------|
| email | `"abc"`, `"a@"`, `"@b.com"`, `"a b@c.com"` |
| phone | `"abc"`, `"123"`, `"1234567890123456"` |
| uuid | `"not-uuid"`, `"123-456"`, `""` |
| url | `"not-url"`, `"ftp://invalid"`, `""` |
| date | `"not-date"`, `"2023-13-45"`, `"99/99/9999"` |
| alphanum | `"ab c"`, `"ab@c"`, `"ab!c"` |

### 2.4 边界值

对有长度/范围约束的字段生成边界用例。

```markdown
### TC-VAL-004: 边界值-{field_name}{boundary_type}
- **描述**: {field_name} 使用{boundary_type}的值
- **请求数据**: "{field_name}": "{boundary_value}"
- **预期结果**:
  - 状态码: {400（不合法）/ 200（在边界上合法）}
```

边界值组合：
| 约束 | 测试值 | 预期 |
|------|--------|------|
| min_length=3 | `""` (空), `"ab"` (min-1), `"abc"` (min) | 400, 400, 200 |
| max_length=30 | 30字符 (max), 31字符 (max+1) | 200, 400 |
| min=0 | `-1`, `0` | 400, 200 |
| max=150 | `150`, `151` | 200, 400 |

### 2.5 业务逻辑异常

从代码中的业务逻辑提取异常场景。

```markdown
### TC-VAL-005: 业务异常-{description}
- **描述**: {business_rule_description}
- **请求数据`: {request_data}
- **预期结果**:
  - 状态码: {400/409/422}
  - 错误消息: {expected_error_message}
```

常见业务异常：
- **重复创建**：使用已存在的唯一字段值 → 409 Conflict
- **操作不存在资源**：使用不存在的 ID → 404 Not Found
- **状态冲突**：操作当前状态不允许的操作 → 409/422
- **非法枚举值**：传入 enum 范围外的值 → 400
- **外键不存在**：关联的资源 ID 不存在 → 400/422
- **空请求体**：`{}` 或不传 body → 400

---

## 3. 安全测试

### 3.1 未认证访问

```markdown
### TC-SEC-001: 未认证访问
- **描述**: 不带 Authorization header 请求需要认证的接口
- **请求数据**: 移除 Authorization header
- **预期结果**:
  - 状态码: 401
  - 错误消息包含认证相关提示
```

### 3.2 越权访问

```markdown
### TC-SEC-002: 越权访问-操作他人资源
- **描述**: 使用普通用户 Token 操作属于其他用户的资源
- **请求数据**: URL 中的资源 ID 替换为其他用户的资源 ID
- **预期结果**:
  - 状态码: 403
  - 错误消息提示无权限
```

注意：如果接口只检查资源存在性而不检查所有权，可能返回 200 或 404，这本身就是安全隐患。

### 3.3 注入尝试

```markdown
### TC-SEC-003: XSS注入尝试-{field_name}
- **描述**: 在 {field_name} 中注入 script 标签
- **请求数据**: "{field_name}": "<script>alert(1)</script>"
- **预期结果**:
  - 接口应正确处理（返回 400 或安全转义存储）
  - 响应中不应包含可执行的 script 标签

### TC-SEC-004: SQL注入尝试-{field_name}
- **描述**: 在 {field_name} 中注入 SQL 语句
- **请求数据**: "{field_name}": "' OR '1'='1"
- **预期结果**:
  - 接口应返回 400 或正常处理（参数化查询）
  - 不应返回数据库错误或异常数据
```

---

## 4. 链路测试

### 目的
验证多个接口之间的协作关系和数据传递。

### 适用场景
当用户指定的 API 属于一个资源的 CRUD 操作时，生成完整链路。

### 用例设计

识别资源的完整操作链：
1. **创建** (POST) → 获取返回的 id
2. **查询** (GET by id) → 使用创建返回的 id
3. **列表** (GET list) → 验证新创建的记录在列表中
4. **更新** (PUT/PATCH) → 使用创建返回的 id
5. **删除** (DELETE) → 使用创建返回的 id
6. **验证删除** (GET by id) → 验证返回 404

### 变量传递

在链路测试中，前一个请求的 Tests Script 提取变量，后一个请求使用变量：

```javascript
// 创建请求的 Tests Script
const json = pm.response.json();
pm.environment.set("userId", json.id);
pm.environment.set("username", json.username);

// 后续请求的 URL
// {{baseUrl}}/api/users/{{userId}}
```

### 链路用例模板

```markdown
### TC-CHAIN-001: {Resource} CRUD完整链路
- **步骤**:
  1. POST /api/{resource} → 创建，提取 id
  2. GET /api/{resource}/{{id}} → 查询，验证数据一致
  3. GET /api/{resource}?page=1 → 列表，验证包含新记录
  4. PUT /api/{resource}/{{id}} → 更新，验证更新成功
  5. DELETE /api/{resource}/{{id}} → 删除
  6. GET /api/{resource}/{{id}} → 验证返回 404
```

---

## 用例优先级

当用例数量很多时，按以下优先级排序：

1. **P0 — 正向测试**：必须通过，否则功能不可用
2. **P1 — 必填缺失 + 类型错误**：基本校验，用户体验关键
3. **P1 — 未认证 + 越权**：安全基线
4. **P2 — 格式非法 + 边界值**：数据质量保障
5. **P2 — 业务逻辑异常**：业务规则完整性
6. **P3 — 注入尝试**：深度安全测试
7. **P3 — 链路测试**：集成完整性

## 生成约束

- **每个必填字段**至少生成：缺失 + 类型错误 = 2 个用例
- **每个有格式要求的字段**至少生成：1 个格式非法用例
- **每个有长度/范围约束的字段**至少生成：2 个边界值用例（min-1 和 max+1）
- **每个接口**至少生成：1 个正向 + 1 个未认证 = 2 个用例
- **每个唯一性约束**生成：1 个重复值用例
- 总用例数上限：50 个（超过时按优先级裁剪）
