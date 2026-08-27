# WpApp Assistant Rules

Use these rules when creating or modifying a WpApp plugin scaffold.

## Generated App Lifecycle

- Read the generated files before modifying them.
- Keep `__construct()` focused on creating/configuring `WpApp`, assigning storage objects, and attaching WordPress hooks.
- Do not call `register_post_type()`, `register_taxonomy()`, `flush_rewrite_rules()`, `wp_add_dashboard_widget()`, REST route registration, or other WordPress-hooked feature registration directly from `__construct()`.
- List every post type and taxonomy the app registers in the `post_types` / `taxonomies` WpApp options. Front-end `require_login` / `require_capability` do not cover the REST API, so published entries would otherwise be readable anonymously over `/wp/v2/<type>` (`public => false` does not help; only `show_in_rest` matters). Declaring them gates REST reads with the app's capability and injects `show_in_rest` plus the gated controller, so `register_post_type()` / `register_taxonomy()` need no REST arguments. Use the map form (`[ 'book' => 'edit_posts' ]`) for a per-type capability. (Requires `akirk/wp-app ^1.6`; `\WpApp\Rest\Access::protect_post_type()` remains for types registered outside the app.)
- `require_capability` wins over `require_login` and implies it; `require_login => true` (the default) is shorthand for `require_capability => 'read'`.
- Use `launcher` / `app_icon` for My Apps and OpenStation integration (`my_apps` / `my_apps_icon` are the old names).
- Register custom post types and taxonomies on the WordPress `init` hook.
- Register dashboard widgets on the WordPress `wp_dashboard_setup` hook.
- Define WpApp routes in `setup_routes()` and WpApp menu/masterbar entries in `setup_menu()`.
- Run activation-only work, including custom table creation and rewrite flushing, from the plugin activation hook.

## Storage Choices

- Prefer WordPress-native storage before custom tables:
  - Custom post types and post meta for content-like records.
  - Taxonomies, terms, and term meta for shared categories, labels, and groupings.
  - User meta for per-user settings, preferences, and profile data.
- Use custom tables and `BaseStorage` only when native WordPress storage does not fit, such as high-volume rows, relational data, or records that do not map cleanly to posts, terms, or users.
- If using `BaseStorage`, instantiate the storage class during app construction and call `create_tables()` during plugin activation. `get_schema()` returns an array keyed by unprefixed table name whose values are the column definitions only; `create_tables()` adds the prefix, `CREATE TABLE` and the charset.

## Abilities

- Expose app data through the WordPress Abilities API: categories on `wp_abilities_api_categories_init`, abilities on `wp_abilities_api_init`, both guarded by `function_exists()`. Use the app's route slug as namespace and category; reuse `$this->app->get_required_capability()` in `permission_callback`; leave `meta.public` unset.
- The description and schemas are the whole API for the caller. One ability per verb-noun (`list-items`, `get-item`, `create-item`); never an `action` switch or a run-anything escape hatch.
- Descriptions say what is returned and what to do on failure. Every property has a description; inputs set `additionalProperties: false`; closed sets use `enum`; always give `output_schema`. IDs say which ability produced them and which accept them.
- Annotate `readonly` / `destructive` / `idempotent` accurately. Failures are `WP_Error` with stable codes, never `false`/`null`/`[]`. `list-*` pages (`page`, `per_page` with a maximum) and returns summaries; `get-*` returns the full record.
- Full guidance: `vendor/akirk/wp-app/docs/abilities.md`.

## Verification

- After modifying PHP, run or request a syntax check before navigating the app.
- If a WordPress runtime is available, activate the plugin and load the configured app URL after the syntax check passes.
