#!/usr/bin/env php
<?php
/**
 * Augment an existing frontend app directory with WpApp plugin files.
 *
 * Usage:
 *   php /path/to/create-wp-app/scripts/augment.php [target-dir]
 *
 * Environment variables mirror scripts/configure.php where possible:
 *   WP_APP_SLUG
 *   WP_APP_PLUGIN_NAME
 *   WP_APP_NAMESPACE
 *   WP_APP_AUTHOR
 *   WP_APP_URL_PATH
 *   WP_APP_SOURCE_BUILD_DIR
 *   WP_APP_FRONTEND_ASSET_DIR
 *   WP_APP_DEPENDENCY_MODE
 *   WP_APP_AUTOLOAD_MODE
 */

use Akirk\CreateWpApp\ExistingAppAugmenter;

require_once __DIR__ . '/../src/ExistingAppAugmenter.php';

$target_dir = $argv[1] ?? getenv( 'WP_APP_TARGET_DIR' ) ?: getcwd();
$target_dir = rtrim( $target_dir, DIRECTORY_SEPARATOR );
if ( $target_dir === '' ) {
    $target_dir = DIRECTORY_SEPARATOR;
}

echo "\n";
echo "Augmenting existing app: $target_dir\n";
echo str_repeat( '-', 40 ) . "\n\n";

try {
    $result = ExistingAppAugmenter::augment( [
        'target_dir' => $target_dir,
    ] );
} catch ( RuntimeException $e ) {
    fwrite( STDERR, $e->getMessage() . PHP_EOL );
    exit( 1 );
}

foreach ( $result['messages'] as $message ) {
    echo "$message\n";
}

echo "\n";
echo "Done! Activate {$result['config']['plugin_name']} in WordPress and visit /{$result['config']['url_path']}/.\n";
echo "\n";
