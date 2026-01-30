# create-wp-app

Scaffold a WordPress plugin powered by [WpApp](https://github.com/akirk/wp-app).

## Usage

```bash
composer create-project akirk/create-wp-app my-plugin
```

This will prompt you for:

- **Plugin name** — Display name for your plugin
- **Namespace** — PHP namespace for your classes
- **Author** — Plugin author (optional)
- **URL path** — Where your app lives (e.g., `/my-plugin/`)
- **Setup type** — Minimal or Full (with BaseApp structure)

## Screenshot

<img width="788" height="681" alt="create-wp-app" src="https://github.com/user-attachments/assets/f0180015-96e9-4ae1-af64-1cec0bae9de1" />

## Setup Types

### Minimal

A simple setup with just the essentials:

```
my-plugin/
├── my-plugin.php      # Main plugin file with WpApp initialization
├── templates/
│   └── index.php      # Your app's home page
├── composer.json
└── .gitignore
```

### Full

A structured setup for larger applications:

```
my-plugin/
├── my-plugin.php      # Main plugin file
├── src/
│   └── App.php        # BaseApp subclass with routes, menu, database hooks
├── templates/
│   └── index.php
├── composer.json
└── .gitignore
```

## Non-Interactive Mode

For CI/CD or scripting, use environment variables:

```bash
WP_APP_PLUGIN_NAME="My App" \
WP_APP_NAMESPACE="MyApp" \
WP_APP_AUTHOR="Your Name" \
WP_APP_URL_PATH="my-app" \
WP_APP_SETUP_TYPE="1" \
composer create-project --no-interaction akirk/create-wp-app my-plugin
```

## After Setup

1. Move the folder to `wp-content/plugins/` (if not already there)
2. Activate the plugin in WordPress
3. Visit your app at the URL path you configured

## Documentation

See the [WpApp documentation](https://github.com/akirk/wp-app/blob/main/README.md) for details on routing, the masterbar, access control, and more.

## License

GPL-2.0-or-later
