<?php
/**
 * Post-create-project configuration script.
 * Prompts for project details and customizes the scaffolded files.
 */

// Helper function to prompt for input
function prompt( string $question, ?string $default = null ): string {
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

// Prompt for configuration
$plugin_name = prompt( 'Plugin name', slug_to_title( $slug ) );
$namespace   = prompt( 'Namespace', to_namespace( $plugin_name ) );
$author      = prompt( 'Author', '' );
$url_path    = prompt( 'URL path', $slug );

echo "\n";
echo "Setup type:\n";
echo "  [1] Minimal - simple WpApp setup\n";
echo "  [2] Full - with BaseApp structure\n";
$setup_type = prompt( 'Choose', '1' );

$is_full_setup = $setup_type === '2';

echo "\n";

// Define the minimal setup code
$minimal_setup_code = <<<'PHP'
use WpApp\WpApp;

add_action( 'init', function() {
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

// Define the full setup code
$full_setup_code = <<<'PHP'
add_action( 'init', function() {
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

// Apply replacements to placeholder values themselves (e.g., url-path in minimal code)
$replacements['{{minimal-setup}}'] = str_replace(
    array_keys( $replacements ),
    array_values( $replacements ),
    $replacements['{{minimal-setup}}']
);

// Files to process
$files_to_process = [
    'plugin-name.php',
    'templates/index.php',
    'composer.json',
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

// Remove src directory if minimal setup
if ( ! $is_full_setup && is_dir( 'src' ) ) {
    array_map( 'unlink', glob( 'src/*' ) );
    rmdir( 'src' );
    echo "✓ Removed src/ directory (not needed for minimal setup)\n";
}

// Clean up composer.json: remove scripts section, empty authors, and autoload if no src
$composer_json = json_decode( file_get_contents( 'composer.json' ), true );
unset( $composer_json['scripts'] );
if ( empty( $composer_json['authors'][0]['name'] ) ) {
    unset( $composer_json['authors'] );
}
if ( ! $is_full_setup ) {
    unset( $composer_json['autoload'] );
}
file_put_contents( 'composer.json', json_encode( $composer_json, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) . "\n" );

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
$step = 1;
if ( ! $in_plugins_dir ) {
    echo "  $step. Move this folder to wp-content/plugins/\n";
    $step++;
}
echo "  $step. Activate the plugin in WordPress\n";
$step++;
echo "  $step. Visit /$url_path/ to see your app\n";
echo "\n";
