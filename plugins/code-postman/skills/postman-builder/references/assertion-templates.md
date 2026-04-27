# Assertion Templates — Postman 断言代码模板

## 1. 状态码断言

### 精确状态码

```javascript
pm.test("[HTTP] 状态码为 {code}", function () {
    pm.response.to.have.status({code});
});
```

### 状态码范围

```javascript
pm.test("[HTTP] 状态码为 2xx", function () {
    pm.expect(pm.response.code).to.be.within(200, 299);
});

pm.test("[HTTP] 状态码为 4xx", function () {
    pm.expect(pm.response.code).to.be.within(400, 499);
});
```

## 2. 响应体结构断言

### JSON 解析 + 字段存在性

```javascript
pm.test("[HTTP] 响应为合法 JSON", function () {
    pm.response.to.be.json;
});

pm.test("[HTTP] 响应包含 {field} 字段", function () {
    var json = pm.response.json();
    pm.expect(json).to.have.property("{field}");
});
```

### 嵌套字段

```javascript
pm.test("[HTTP] 响应包含嵌套字段 {path}", function () {
    var json = pm.response.json();
    pm.expect(json.data).to.have.property("{field}");
    pm.expect(json.data.{field}).to.be.a("{type}");
});
```

### 数组响应

```javascript
pm.test("[HTTP] 响应为数组且非空", function () {
    var json = pm.response.json();
    pm.expect(json).to.be.an("array");
    pm.expect(json.length).to.be.above(0);
});

pm.test("[HTTP] 数组元素包含 {field}", function () {
    var json = pm.response.json();
    pm.expect(json[0]).to.have.property("{field}");
});
```

### 分页响应

```javascript
pm.test("[HTTP] 分页结构完整", function () {
    var json = pm.response.json();
    pm.expect(json).to.have.property("data").that.is.an("array");
    pm.expect(json).to.have.property("total");
    pm.expect(json).to.have.property("page");
    pm.expect(json).to.have.property("size");
});
```

## 3. 字段值断言

### 值相等

```javascript
pm.test("[HTTP] {field} 值为 {expected}", function () {
    var json = pm.response.json();
    pm.expect(json.{field}).to.eql({expected});
});
```

### 类型验证

```javascript
pm.test("[HTTP] {field} 为 {type} 类型", function () {
    var json = pm.response.json();
    pm.expect(json.{field}).to.be.a("{type}");
});
```

类型映射：
- 字符串 → `"string"`
- 数字 → `"number"`
- 布尔 → `"boolean"`
- 数组 → `"array"`
- 对象 → `"object"`
- null → `"null"` (使用 `pm.expect(json.{field}).to.be.null`)

### 格式验证

```javascript
// Email 格式
pm.test("[HTTP] {field} 为合法 email", function () {
    var json = pm.response.json();
    pm.expect(json.{field}).to.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
});

// UUID 格式
pm.test("[HTTP] {field} 为合法 UUID", function () {
    var json = pm.response.json();
    pm.expect(json.{field}).to.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
});

// 非空字符串
pm.test("[HTTP] {field} 非空", function () {
    var json = pm.response.json();
    pm.expect(json.{field}).to.be.a("string").and.not.be.empty;
});

// 正数
pm.test("[HTTP] {field} 为正数", function () {
    var json = pm.response.json();
    pm.expect(json.{field}).to.be.above(0);
});
```

## 4. 错误响应断言

### 错误结构验证

```javascript
pm.test("[HTTP] 错误响应结构完整", function () {
    var json = pm.response.json();
    pm.expect(json).to.have.property("error");
    // 或根据代码中实际的错误结构
    pm.expect(json).to.have.property("message");
});

pm.test("[HTTP] 错误消息包含 {keyword}", function () {
    var json = pm.response.json();
    var msg = json.error || json.message || json.detail || "";
    pm.expect(msg.toLowerCase()).to.include("{keyword}".toLowerCase());
});
```

### 校验错误列表

```javascript
pm.test("[HTTP] 校验错误包含 {field} 的提示", function () {
    var json = pm.response.json();
    var errors = json.errors || json.details || json.validationErrors || [];
    var fieldError = errors.find(function (e) {
        return e.field === "{field}" || e.path === "{field}";
    });
    pm.expect(fieldError).to.not.be.undefined;
});
```

## 5. 变量提取

### 提取到环境变量

```javascript
var json = pm.response.json();
pm.environment.set("{resourceId}", json.id);
pm.environment.set("{resourceName}", json.name);
pm.environment.set("{token}", json.token || json.data.token);
```

### 提取到 Collection 变量

```javascript
pm.collectionVariables.set("{key}", json.value);
```

## 6. 响应头断言

```javascript
pm.test("[HTTP] Content-Type 为 JSON", function () {
    pm.expect(pm.response.headers.get("Content-Type")).to.include("application/json");
});

pm.test("[HTTP] 响应包含安全头 X-Content-Type-Options", function () {
    pm.expect(pm.response.headers.get("X-Content-Type-Options")).to.eql("nosniff");
});
```

## 7. 组合断言模板

### 正向请求完整断言块

```javascript
// 状态码
pm.test("[HTTP] 状态码为 {code}", function () {
    pm.response.to.have.status({code});
});

// 响应体
pm.test("[HTTP] 响应为合法 JSON", function () {
    pm.response.to.be.json;
});

var jsonData = pm.response.json();

// 字段存在性
pm.test("[HTTP] 响应包含必要字段", function () {
    pm.expect(jsonData).to.have.property("id");
    pm.expect(jsonData).to.have.property("{field1}");
    pm.expect(jsonData).to.have.property("{field2}");
});

// 关键字段值
pm.test("[HTTP] {field} 值正确", function () {
    pm.expect(jsonData.{field}).to.eql("{expected_value}");
});

// 变量提取
pm.environment.set("{resourceId}", jsonData.id);
```

### 反向请求完整断言块

```javascript
// 状态码
pm.test("[HTTP] 状态码为 {code}", function () {
    pm.response.to.have.status({code});
});

// 错误结构
pm.test("[HTTP] 错误响应结构完整", function () {
    var json = pm.response.json();
    pm.expect(json).to.have.property("error");
});

// 错误消息
pm.test("[HTTP] 错误消息包含 {keyword}", function () {
    var json = pm.response.json();
    var msg = json.error || json.message || json.detail || "";
    pm.expect(msg.toLowerCase()).to.include("{keyword}".toLowerCase());
});
```

### 安全测试断言块

```javascript
// 401 断言
pm.test("[安全] 未认证返回 401", function () {
    pm.response.to.have.status(401);
});

// 403 断言
pm.test("[安全] 越权返回 403", function () {
    pm.response.to.have.status(403);
});

// XSS 检查 — 响应中不应包含未转义的 script 标签
pm.test("[安全] 响应不包含可执行脚本", function () {
    var body = pm.response.text();
    pm.expect(body).to.not.include("<script>");
    pm.expect(body).to.not.include("</script>");
    pm.expect(body).to.not.include("onerror=");
});
```

## 8. Pre-request Script 模板

### 时间戳记录

```javascript
pm.environment.set("requestStartTime", new Date().toISOString());
```

### 变量初始化

```javascript
if (!pm.environment.get("{resourceId}")) {
    pm.environment.set("{resourceId}", "placeholder");
}
```

### 随机数据生成

```javascript
pm.environment.set("randomString", Math.random().toString(36).substring(2, 10));
pm.environment.set("timestamp", Date.now().toString());
```
