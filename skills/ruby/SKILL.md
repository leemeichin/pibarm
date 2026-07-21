---
name: ruby
description: Ruby and Rails development workflow. Use when editing Ruby, Rails, Bundler, RSpec/Minitest, RuboCop, Active Record migrations or queries, jobs, policies, services, or gems.
---

# Ruby

## Inspect first

- Read `Gemfile`, `Gemfile.lock`, `.ruby-version`, project lint/test config, and CI before choosing commands.
- Prefer checked-in binstubs and the repository's test framework; otherwise use `bundle exec`.
- Trace the real flow and sibling conventions before changing shared modules, callbacks, concerns, policies, services, or jobs.
- Do not update gems or the lockfile unless dependency work is requested.
- For ambiguous symbols or diagnostics, load deferred `code_intel` with `search_tools`; fall back to `rg`/`read` when unavailable.

## Ruby

- Match the supported Ruby version and local style. Prefer clear methods and stdlib over metaprogramming or a new gem.
- Preserve keyword/positional argument behavior and public exception/return contracts.
- Avoid global monkey patches. Reuse an existing extension point or keep the change local.
- Add the smallest focused RSpec/Minitest example for non-trivial behavior.

## Rails

- Trace routes through controller/component, policy, model/query, job, and serializer layers that actually participate.
- Keep authentication, authorization, strong parameters, and output escaping at their trust boundaries.
- Prefer Active Record scopes/relations and framework lifecycle features over custom plumbing; check query count and N+1 risk.
- Keep jobs idempotent and explicit about transaction/after-commit boundaries.
- Migrations must be reversible and safe across rolling deploys. Avoid destructive changes or large in-migration backfills without explicit approval and an operational plan.
- Do not run `db:drop`, `db:reset`, destructive migrations, or production-facing tasks.

## Smallest relevant checks

Use only commands present in the project:

```bash
bundle exec ruby -c path/to/file.rb
bundle exec rspec path/to/spec.rb
bin/rails test path/to/test.rb
bin/rubocop path/to/file.rb
bundle exec rubocop path/to/file.rb
bin/rails zeitwerk:check
bin/rails db:migrate:status
```

Start with the touched file/example, then expand to the owning package or application when needed.
