<?php
/**
 * Post-create-project configuration script.
 * Prompts for project details and customizes the scaffolded files.
 *
 * Supports non-interactive mode via environment variables:
 *   WP_APP_PLUGIN_NAME  - Plugin name (default: derived from slug)
 *   WP_APP_NAMESPACE    - PHP namespace (default: derived from plugin name)
 *   WP_APP_AUTHOR       - Plugin author
 *   WP_APP_URL_PATH     - URL path for the app (default: slug)
 *   WP_APP_SETUP_TYPE   - "1" for minimal, "2" for full (default: 1)
 */

$is_interactive = getenv( 'COMPOSER_NO_INTERACTION' ) !== '1'
    && stream_isatty( STDIN );

// Helper function to get value from env or prompt
function get_value( string $env_key, string $question, ?string $default, bool $interactive ): string {
    $env_value = getenv( $env_key );
    if ( $env_value !== false && $env_value !== '' ) {
        return $env_value;
    }

    if ( ! $interactive ) {
        return $default ?? '';
    }

    $default_text = $default !== null ? " [$default]" : '';
    echo "$question$default_text: ";
    $answer = trim( fgets( STDIN ) );
    return $answer !== '' ? $answer : ( $default ?? '' );
}

// Helper function to convert slug to title case
function slug_to_title( string $slug ): string {
    return ucwords( str_replace( [ '-', '_' ], ' ', $slug ) );
}

// Helper function to convert string to PascalCase namespace
function to_namespace( string $name ): string {
    return str_replace( ' ', '', ucwords( preg_replace( '/[^a-zA-Z0-9]+/', ' ', $name ) ) );
}

// Get the plugin slug from directory name (fixed, not changeable)
$slug = basename( getcwd() );

echo "\n";
echo "Creating WpApp plugin: $slug\n";
echo str_repeat( '-', 40 ) . "\n\n";

// Get configuration values
$plugin_name = get_value( 'WP_APP_PLUGIN_NAME', 'Plugin name', slug_to_title( $slug ), $is_interactive );
$namespace   = get_value( 'WP_APP_NAMESPACE', 'Namespace', to_namespace( $plugin_name ), $is_interactive );
$author      = get_value( 'WP_APP_AUTHOR', 'Author', '', $is_interactive );
$url_path    = get_value( 'WP_APP_URL_PATH', 'URL path', $slug, $is_interactive );

// Setup type selection
$setup_type_env = getenv( 'WP_APP_SETUP_TYPE' );
if ( $setup_type_env !== false && in_array( $setup_type_env, [ '1', '2' ], true ) ) {
    $setup_type = $setup_type_env;
} elseif ( $is_interactive ) {
    echo "\n";
    echo "Setup type:\n";
    echo "  [1] Minimal - simple WpApp setup\n";
    echo "  [2] Full - with BaseApp structure\n";
    $setup_type = get_value( '', 'Choose', '1', true );
} else {
    $setup_type = '1';
}

$is_full_setup = $setup_type === '2';

echo "\n";

// Define the minimal setup code
$minimal_setup_code = <<<'PHP'
use WpApp\WpApp;

add_action( 'plugins_loaded', function() {
    // See https://github.com/akirk/wp-app for documentation.
    $app = new WpApp( __DIR__ . '/templates', '{{url-path}}', [
        // Access control
        // 'require_login'      => false,
        // 'require_capability' => 'read',

        // Masterbar
        // 'show_masterbar_for_anonymous' => false,
        // 'show_wp_logo'                 => true,
        // 'show_site_name'               => true,
        // 'show_dark_mode_toggle'        => false,
        // 'clear_admin_bar'              => false,
        // 'add_app_node'                 => false,

        // App identity
        // 'app_name'     => '{{plugin-name}}',
        // 'my_apps'      => true,
        // 'my_apps_icon' => null,
    ] );
    $app->init();
} );
PHP;

// Define the full setup code with PSR-4 autoloader for plugin classes
$full_setup_code = <<<'PHP'
// Autoloader for plugin classes.
spl_autoload_register( function( $class ) {
    $prefix = '{{namespace}}\\';
    $len = strlen( $prefix );
    if ( strncmp( $prefix, $class, $len ) !== 0 ) {
        return;
    }
    $file = __DIR__ . '/src/' . str_replace( '\\', '/', substr( $class, $len ) ) . '.php';
    if ( file_exists( $file ) ) {
        require $file;
    }
} );

add_action( 'plugins_loaded', function() {
    $app = new App();
    $app->init();
} );
PHP;

// Placeholder replacements
$replacements = [
    '{{plugin-name}}' => $plugin_name,
    '{{namespace}}'   => $namespace,
    '{{slug}}'        => $slug,
    '{{url-path}}'    => $url_path,
    '{{author}}'      => $author,
];

if ( $is_full_setup ) {
    $replacements['{{minimal-setup}}'] = '';
    $replacements['{{full-setup}}']    = $full_setup_code;
} else {
    $replacements['{{minimal-setup}}'] = $minimal_setup_code;
    $replacements['{{full-setup}}']    = '';
}

// Apply replacements to placeholder values themselves (e.g., namespace in setup code)
$replacements['{{minimal-setup}}'] = str_replace(
    array_keys( $replacements ),
    array_values( $replacements ),
    $replacements['{{minimal-setup}}']
);
$replacements['{{full-setup}}'] = str_replace(
    array_keys( $replacements ),
    array_values( $replacements ),
    $replacements['{{full-setup}}']
);

// Files to process (composer.json handled separately)
$files_to_process = [
    'plugin-name.php',
    'templates/index.php',
];

if ( $is_full_setup ) {
    $files_to_process[] = 'src/App.php';
}

// Process each file
foreach ( $files_to_process as $file ) {
    if ( ! file_exists( $file ) ) {
        continue;
    }

    $content = file_get_contents( $file );
    $content = str_replace( array_keys( $replacements ), array_values( $replacements ), $content );
    file_put_contents( $file, $content );
    echo "✓ Updated $file\n";
}

// Rename main plugin file
$new_plugin_file = "$slug.php";
if ( file_exists( 'plugin-name.php' ) && ! file_exists( $new_plugin_file ) ) {
    rename( 'plugin-name.php', $new_plugin_file );
    echo "✓ Renamed plugin-name.php to $new_plugin_file\n";
}

// Rename gitignore to .gitignore
if ( file_exists( 'gitignore' ) && ! file_exists( '.gitignore' ) ) {
    rename( 'gitignore', '.gitignore' );
    echo "✓ Created .gitignore\n";
}

// Remove src directory if minimal setup
if ( ! $is_full_setup && is_dir( 'src' ) ) {
    array_map( 'unlink', glob( 'src/*' ) );
    rmdir( 'src' );
    echo "✓ Removed src/ directory (not needed for minimal setup)\n";
}

// Update composer.json with project details
$composer_json = json_decode( file_get_contents( 'composer.json' ), true );
$composer_json['name'] = $slug;
$composer_json['description'] = "$plugin_name - A WordPress app powered by WpApp";
unset( $composer_json['scripts'] );
if ( ! empty( $author ) ) {
    $composer_json['authors'] = [ [ 'name' => $author ] ];
} else {
    unset( $composer_json['authors'] );
}
if ( $is_full_setup ) {
    $composer_json['autoload']['psr-4'] = [ "$namespace\\" => 'src/' ];
} else {
    unset( $composer_json['autoload'] );
}
file_put_contents( 'composer.json', json_encode( $composer_json, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) . "\n" );
echo "✓ Updated composer.json\n";

// Clean up: remove scripts directory
array_map( 'unlink', glob( 'scripts/*' ) );
rmdir( 'scripts' );
echo "✓ Cleaned up setup scripts\n";

echo "\n";
echo "Done! Your plugin is ready.\n";
echo "\n";

// Check if already in wp-content/plugins
$in_plugins_dir = strpos( getcwd(), 'wp-content/plugins' ) !== false;

echo "Next steps:\n";
echo "\n";
echo "  Option A: Run locally with WordPress Playground\n";
echo "    npx @wp-playground/cli@latest server --auto-mount=$slug --login\n";
echo "\n";
echo "  Option B: Install in WordPress\n";
$step = 1;
if ( ! $in_plugins_dir ) {
    echo "    $step. Move this folder to wp-content/plugins/\n";
    $step++;
}
echo "    $step. Activate the plugin in WordPress\n";
$step++;
echo "    $step. Visit /$url_path/ to see your app\n";
echo "\n";
