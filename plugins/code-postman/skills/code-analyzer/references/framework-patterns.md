# Framework Patterns — 多框架代码逆向分析模式

## 1. Express / Koa (Node.js)

### 项目识别
- 配置文件：`package.json`
- 关键依赖：`express`、`koa`、`koa-router`
- 入口文件：`app.js`、`index.js`、`src/app.ts`、`src/index.ts`

### 路由定位
```bash
# Grep pattern
grep -rn "router\.\(get\|post\|put\|patch\|delete\)" src/
grep -rn "app\.\(get\|post\|put\|patch\|delete\)" src/
grep -rn "\.\(get\|post\|put\|patch\|delete\)(" src/routes/
```

路由定义示例：
```javascript
router.post('/api/users', authMiddleware, validateUser, userController.create);
router.get('/api/users/:id', authMiddleware, userController.getById);
```

### 参数提取
- Path params：`req.params.id` → 在 URL 中用 `:id` 标识
- Query params：`req.query.page`、`req.query.size`
- Request body：`req.body.username`、`req.body.email`

Grep 参数引用：
```bash
grep -rn "req\.params\." src/
grep -rn "req\.query\." src/
grep -rn "req\.body\." src/
```

### 校验提取
常见校验库和 Grep pattern：

**Joi:**
```bash
grep -rn "Joi\." src/
grep -rn "\.required()" src/
grep -rn "\.string()\|.number()\|.email()" src/
```
示例：
```javascript
const schema = Joi.object({
  username: Joi.string().alphanum().min(3).max(30).required(),
  email: Joi.string().email().required(),
  age: Joi.number().integer().min(0).max(150)
});
```
提取规则：字段名、type (string/number)、required、min/max length、format (email/alphanum)

**Zod:**
```bash
grep -rn "z\.\|zod" src/
grep -rn "z\.string()\|z\.number()\|z\.email()" src/
```
示例：
```typescript
const UserSchema = z.object({
  username: z.string().min(3).max(30),
  email: z.string().email(),
  role: z.enum(['admin', 'user']).default('user')
});
```

**express-validator:**
```bash
grep -rn "body(\|query(\|param(" src/
grep -rn "\.notEmpty()\|\.isEmail()\|\.isLength()" src/
```
示例：
```javascript
body('username').notEmpty().isLength({ min: 3, max: 30 }),
body('email').isEmail(),
body('age').optional().isInt({ min: 0, max: 150 }),
```

### 鉴权提取
```bash
grep -rn "authorization\|bearer\|jwt\|token\|auth" src/middleware/
grep -rn "req\.headers\['authorization'\]\|req\.headers\.authorization" src/
```
提取：Token 类型（Bearer JWT）、Header 名称、验证逻辑

### 响应提取
```bash
grep -rn "res\.status(\|res\.json(\|res\.send(" src/controllers/
```
示例：
```javascript
res.status(201).json({ id: user.id, username: user.username });
res.status(400).json({ error: 'Validation failed', details: [...] });
```

---

## 2. NestJS (Node.js/TypeScript)

### 项目识别
- 配置文件：`package.json`、`nest-cli.json`、`tsconfig.json`
- 关键依赖：`@nestjs/core`、`@nestjs/common`

### 路由定位
```bash
grep -rn "@Controller\|@Get\|@Post\|@Put\|@Patch\|@Delete" src/
```

路由定义示例：
```typescript
@Controller('users')
@UseGuards(AuthGuard)
export class UsersController {
  @Post()
  async create(@Body() createUserDto: CreateUserDto) { ... }

  @Get(':id')
  async findOne(@Param('id') id: string) { ... }
}
```

### 参数提取
- Decorator 直接标注参数来源：
  - `@Body()` → request body
  - `@Param('id')` → path parameter
  - `@Query('page')` → query parameter
  - `@Headers('authorization')` → header

```bash
grep -rn "@Body\|@Param\|@Query\|@Headers" src/
```

### 校验提取
NestJS 通常使用 `class-validator` + `class-transformer`：

```bash
grep -rn "class.*Dto" src/
# 找到 DTO 文件后读取
```

DTO 示例：
```typescript
export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(30)
  username: string;

  @IsEmail()
  email: string;

  @IsInt()
  @Min(0)
  @Max(150)
  @IsOptional()
  age?: number;

  @IsEnum(UserRole)
  role: UserRole;
}
```

提取规则：
- `@IsString()` / `@IsNumber()` / `@IsBoolean()` → type
- `@IsNotEmpty()` / `@IsOptional()` → required
- `@MinLength(n)` / `@MaxLength(n)` → length range
- `@Min(n)` / `@Max(n)` → value range
- `@IsEmail()` / `@IsUrl()` / `@IsUUID()` → format
- `@IsEnum(EnumType)` → enum values，需追踪 enum 定义

### 鉴权提取
```bash
grep -rn "@UseGuards\|@Public\|@Roles\|AuthGuard\|JwtAuthGuard" src/
grep -rn "canActivate\|ExecutionContext" src/guards/
```

### 响应提取
```bash
grep -rn "return\|@HttpCode\|@Header" src/controllers/
grep -rn "class.*Response\|interface.*Response" src/
```

---

## 3. Spring Boot (Java/Kotlin)

### 项目识别
- 配置文件：`pom.xml`、`build.gradle`、`application.yml`
- 关键依赖：`spring-boot-starter-web`

### 路由定位
```bash
grep -rn "@RequestMapping\|@GetMapping\|@PostMapping\|@PutMapping\|@PatchMapping\|@DeleteMapping" src/
grep -rn "@RestController\|@Controller" src/
```

路由定义示例：
```java
@RestController
@RequestMapping("/api/users")
public class UserController {
    @PostMapping
    public ResponseEntity<UserResponse> create(@Valid @RequestBody CreateUserRequest request) { ... }

    @GetMapping("/{id}")
    public ResponseEntity<UserResponse> getById(@PathVariable Long id) { ... }
}
```

### 参数提取
```bash
grep -rn "@RequestBody\|@PathVariable\|@RequestParam\|@RequestHeader" src/
```
- `@RequestBody` → request body（配合 `@Valid` 表示需要校验）
- `@PathVariable` → path parameter
- `@RequestParam` → query parameter
- `@RequestHeader` → header

### 校验提取 (Bean Validation / Jakarta Validation)
```bash
grep -rn "@NotNull\|@NotBlank\|@NotEmpty\|@Size\|@Min\|@Max\|@Pattern\|@Email" src/
```

DTO 示例：
```java
public class CreateUserRequest {
    @NotBlank(message = "用户名不能为空")
    @Size(min = 3, max = 30, message = "用户名长度3-30")
    private String username;

    @NotBlank @Email(message = "邮箱格式不正确")
    private String email;

    @Min(value = 0, message = "年龄不能为负数")
    @Max(value = 150)
    private Integer age;
}
```

提取规则：
- `@NotNull` / `@NotBlank` / `@NotEmpty` → required + 空值行为
- `@Size(min, max)` → length range
- `@Min` / `@Max` → value range
- `@Email` / `@Pattern(regexp)` → format
- `message` → 错误消息

### 鉴权提取
```bash
grep -rn "@PreAuthorize\|@Secured\|@RolesAllowed\|SecurityContext" src/
grep -rn "JwtAuthenticationFilter\|OncePerRequestFilter\|SecurityFilterChain" src/
```

### 响应提取
```bash
grep -rn "ResponseEntity\|@ResponseStatus\|@ExceptionHandler" src/
```
- 追踪 Response DTO 的字段定义
- 检查 `@ExceptionHandler` 中的错误响应结构

---

## 4. FastAPI (Python)

### 项目识别
- 配置文件：`pyproject.toml`、`requirements.txt`
- 关键依赖：`fastapi`、`uvicorn`
- 入口文件：`main.py`、`app.py`

### 路由定位
```bash
grep -rn "@router\.\(get\|post\|put\|patch\|delete\)\|@app\.\(get\|post\|put\|patch\|delete\)" src/
```

路由定义示例：
```python
@router.post("/users", response_model=UserResponse, status_code=201)
async def create_user(user: CreateUserRequest, db: Session = Depends(get_db)):
    ...
```

### 参数提取
```bash
grep -rn "Depends\|Query\|Path\|Body\|Header\|Cookie" src/
```
- 函数参数无默认值 → path param（如 `user_id: int`）
- `Query(...)` → query parameter
- `Body(...)` → request body field
- `Depends(...)` → 依赖注入（常用于 DB session、auth）

### 校验提取 (Pydantic)
```bash
grep -rn "class.*BaseModel\|class.*Schema\|class.*Request\|class.*DTO" src/
grep -rn "Field(\|constr\|conint\|validator\|field_validator" src/
```

Model 示例：
```python
class CreateUserRequest(BaseModel):
    username: str = Field(min_length=3, max_length=30, description="用户名")
    email: EmailStr
    age: Optional[int] = Field(None, ge=0, le=150)
    role: UserRole = UserRole.USER

    @field_validator('username')
    @classmethod
    def username_alphanumeric(cls, v):
        if not v.isalnum():
            raise ValueError('用户名只能包含字母和数字')
        return v
```

提取规则：
- Python type hints → 基础类型（`str`/`int`/`float`/`bool`/`list`/`dict`）
- `Optional[X]` 或 `X | None` → optional
- `Field(min_length, max_length)` → length range
- `Field(ge, le, gt, lt)` → value range
- `EmailStr` → email format
- `@field_validator` / `@validator` → 自定义校验规则（需读代码）
- `enum.Enum` → enum values

### 鉴权提取
```bash
grep -rn "OAuth2PasswordBearer\|HTTPBearer\|HTTPBasic\|Depends(get_current_user)" src/
grep -rn "security\|auth\|token" src/
```

### 响应提取
```bash
grep -rn "response_model\|JSONResponse\|HTTPException" src/
```
- `response_model=UserResponse` → 追踪 Response model 字段
- `HTTPException(status_code=404, detail="...")` → 错误响应
- `status_code=201` → 成功状态码

---

## 5. Django (Python)

### 项目识别
- 配置文件：`manage.py`、`pyproject.toml`
- 关键依赖：`django`、`djangorestframework`

### 路由定位
```bash
grep -rn "path(\|re_path(\|url(" */urls.py
grep -rn "@action\|@api_view" src/
```

URL patterns 示例：
```python
urlpatterns = [
    path('api/users/', UserListCreateView.as_view()),
    path('api/users/<int:pk>/', UserDetailView.as_view()),
]
```

### 参数提取
- Django 视图函数：`request.GET`、`request.POST`、`request.data`
- URL 参数：`<int:pk>`、`<str:slug>`、`<uuid:id>`
- DRF Serializer 字段定义

```bash
grep -rn "request\.GET\|request\.POST\|request\.data\|request\.query_params" src/
```

### 校验提取 (DRF Serializer)
```bash
grep -rn "class.*Serializer\|class.*ModelSerializer" src/
grep -rn "required=\|allow_blank=\|max_length=\|min_length=\|min_value=\|max_value=" src/
```

Serializer 示例：
```python
class CreateUserSerializer(serializers.Serializer):
    username = serializers.CharField(
        required=True, min_length=3, max_length=30
    )
    email = serializers.EmailField(required=True)
    age = serializers.IntegerField(required=False, min_value=0, max_value=150)
    role = serializers.ChoiceField(choices=['admin', 'user'], default='user')
```

### 鉴权提取
```bash
grep -rn "authentication_classes\|permission_classes\|IsAuthenticated\|AllowAny" src/
grep -rn "DEFAULT_AUTHENTICATION_CLASSES\|DEFAULT_PERMISSION_CLASSES" */settings.py
```

### 响应提取
```bash
grep -rn "Response(\|JsonResponse(\|HttpResponse(" src/
grep -rn "status=HTTP_\|status_codes" src/
```

---

## 6. Gin (Go)

### 项目识别
- 配置文件：`go.mod`
- 关键依赖：`github.com/gin-gonic/gin`

### 路由定位
```bash
grep -rn "\.GET(\|\.POST(\|\.PUT(\|\.PATCH(\|\.DELETE(" *.go
grep -rn "\.Group(" *.go
```

路由定义示例：
```go
r.POST("/api/users", authMiddleware(), userHandler.Create)
r.GET("/api/users/:id", authMiddleware(), userHandler.GetByID)
```

### 参数提取
```bash
grep -rn "c\.Param\|c\.Query\|c\.Bind\|c\.ShouldBindJSON\|c\.GetHeader" *.go
```
- `c.Param("id")` → path parameter
- `c.Query("page")` → query parameter
- `c.ShouldBindJSON(&req)` → request body
- `c.GetHeader("Authorization")` → header

### 校验提取 (binding tags)
```bash
grep -rn "binding:" *.go
grep -rn "validate:" *.go
```

Struct 示例：
```go
type CreateUserRequest struct {
    Username string `json:"username" binding:"required,min=3,max=30,alphanum"`
    Email    string `json:"email" binding:"required,email"`
    Age      int    `json:"age" binding:"omitempty,min=0,max=150"`
    Role     string `json:"role" binding:"omitempty,oneof=admin user"`
}
```

提取规则：
- `binding:"required"` → required
- `min=N,max=N` → length range (string) or value range (number)
- `email` → email format
- `oneof=A B` → enum values
- `omitempty` → optional
- `alphanum` / `url` / `uuid` → format

### 鉴权提取
```bash
grep -rn "authMiddleware\|jwt\|token\|Authorization" *.go
grep -rn "c\.Set(\"userID\"\|c\.Get(\"userID\"" *.go
```

### 响应提取
```bash
grep -rn "c\.JSON(\|c\.AbortWithStatusJSON(" *.go
```
示例：
```go
c.JSON(201, gin.H{"id": user.ID, "username": user.Username})
c.AbortWithStatusJSON(400, gin.H{"error": "Validation failed"})
```

---

## 通用分析策略

当框架类型不确定或代码结构不规范时，使用以下通用策略：

1. **入口文件追踪**：从 `main.go` / `app.js` / `main.py` 开始，追踪路由注册
2. **关键词搜索**：`grep -rn "api/\|/v1/\|/v2/" .` 找到 API 路径定义
3. **import 追踪**：找到路由文件后，import 的 DTO/Model/Schema 文件包含校验规则
4. **error 处理追踪**：`grep -rn "throw\|raise\|Error\|Exception\|status.*400\|status.*401\|status.*404\|status.*500"` 找到错误处理逻辑
5. **测试文件参考**：`grep -rn "test\|spec" .` 找到测试文件，测试文件通常包含请求示例
