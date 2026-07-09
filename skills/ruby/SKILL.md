---
name: ruby
description: Ruby and Rails development workflow. Use when editing Ruby, Rails, Bundler, RSpec, RuboCop, migrations, jobs, policies, services, or gems.
---

# Ruby

## Inspect first

- Read `Gemfile`, `Gemfile.lock`, `.ruby-version`, `.rubocop.yml`, `Rakefile`, and Rails dirs when relevant.
- Prefer existing app patterns over new abstractions.

## Common checks

Run the smallest relevant check:

```bash
bundle exec ruby -c path/to/file.rb
bundle exec rspec path/to/spec.rb
bundle exec rubocop path/to/file.rb
bin/rails test path/to/test.rb
bin/rails zeitwerk:check
```

## Rails safety

- Migrations must be reversible or explain why not.
- Avoid data-loss migrations without explicit approval.
- For policies/services/jobs, grep sibling patterns before editing.
- Prefer framework features over custom plumbing.
