---
name: python
description: Python development workflow. Use when editing Python, pyproject.toml, uv/Poetry/pip environments, pytest, Ruff, mypy/Pyright, Django, Flask, FastAPI, migrations, packaging, or async code.
---

# Python

## Inspect first

- Read `pyproject.toml` and the nearest tool config, then check `.python-version`, lockfiles, test layout, and CI.
- Infer the environment runner from repository evidence: `uv.lock`/`uv run`, Poetry config/`poetry run`, Pipenv, tox/nox, or the active virtualenv.
- Do not create environments, install packages, refresh lockfiles, or switch runners unless the task requires it.
- Trace callers and nearby tests before changing shared functions, decorators, models, or dependency injection.

## Implementation

- Follow the repository's supported Python version and existing typing level.
- Narrow `Any` and untrusted input at boundaries; preserve sync/async boundaries rather than hiding blocking work in async functions.
- Prefer the standard library and existing dependencies. Do not add `sys.path` hacks or a package for a small helper.
- Keep imports compatible with the project's package layout; do not edit generated files.
- Preserve public exceptions and return shapes unless the requested change explicitly breaks them.

## Framework safety

- Django: inspect settings, URLs, models, managers/querysets, migrations, and the existing test style. Keep schema changes reversible and deployment-safe; do not run destructive database commands without approval.
- FastAPI/Flask: preserve dependency, request-context, validation, and error-handler patterns. Validate external input at the schema/request boundary.
- Database and queue work should be transactional where needed and safe to retry. Watch for hidden N+1 queries and unbounded reads.

## Smallest relevant checks

Use configured scripts first, then the narrowest installed tool:

```bash
python -m py_compile path/to/file.py
pytest path/to/test_file.py -q
ruff check path/to/file.py
ruff format --check path/to/file.py
mypy path/to/module.py
pyright path/to/module.py
python manage.py test app.tests.TestCase.test_name
python manage.py makemigrations --check --dry-run
```

Do not assume every command is installed. Run the repository's broader test/type/lint commands only when the change warrants them.
