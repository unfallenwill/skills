# Template: Django / web application

Django's default app layout (models/views/urls/templates) makes it easy for low-level
modules to silently import high-level concerns. Two rules cover most Django projects:

1. **Layers** within each app: views → services → models (views may use models directly in
   simple apps, but services must not import views).
2. **Forbidden**: models (and ORM/query utilities) must never import views, serializers,
   or anything request-facing.

Assumed layout (one or more apps under `myproject/<app>/`):

```
myproject/
└── shop/
    ├── views.py          # request handlers        (high)
    ├── services.py       # business logic
    ├── models.py         # ORM models              (low)
    └── ...
```

Goal: keep dependency direction views → services → models, and forbid the ORM layer from
reaching request-handling code.

## pyproject.toml

```toml
[tool.importlinter]
root_package = "myproject"
exclude_type_checking_imports = true

# Apply the same layering inside every Django app without repeating it per app.
[[tool.importlinter.contracts]]
id = "app-layers"
name = "Django app layering (views > services > models)"
type = "layers"
layers = ["views", "(services)", "models"]
containers = ["myproject.shop", "myproject.accounts"]

[[tool.importlinter.contracts]]
id = "no-views-from-models"
name = "Models must not import views or serializers"
type = "forbidden"
source_modules = ["myproject.shop.models", "myproject.accounts.models"]
forbidden_modules = ["myproject.shop.views", "myproject.accounts.views"]
```

For the `.importlinter` (INI) form, apply the translation table in `../config-formats.md`.

Notes on this template:

- `containers` applies the `views / services / models` layering to each listed app
  independently. `myproject.shop.models` may not import `myproject.shop.views`, but it may
  import `myproject.accounts.views` — usually undesirable, so the explicit `forbidden`
  contract catches cross-app upward leaks.
- `(services)` is optional: apps without a `services.py` still pass.
- To forbid a Django helper from low layers, set `include_external_packages = true` and use
  root-level names only (`django`, not `django.http`); otherwise model the rule against your
  own packages.

## Django-specific pitfalls

- **Fat models importing signals/services** → if `models.py` genuinely needs to call
  business logic, that is usually the violation telling you to move the call to a service
  or signal handler rather than to suppress it.
- **`apps.py` importing models** → `AppConfig.ready()` runs at startup; keep heavy imports
  out of it or exempt that one edge with `ignore_imports`.
- **Test/management commands importing views** → keep `tests/` and management commands
  outside the layered packages, or scope `root_package` to the production package.
