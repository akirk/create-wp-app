<?php

namespace Akirk\CreateWpApp;

class ExistingAppAugmenter {
    public static function augment( array $config ): array {
        return ( new self() )->run( $config );
    }

    public function run( array $config ): array {
        $this->load_support_classes();

        $target_dir = rtrim( $config['target_dir'] ?? getcwd(), DIRECTORY_SEPARATOR );
        if ( ! is_dir( $target_dir ) ) {
            throw new \RuntimeException( "Target directory does not exist: $target_dir" );
        }

        $config = $this->normalize_config( $target_dir, $config );
        $temporary_dir = $this->create_temporary_dir();

        try {
            $result = Scaffolder::create( [
                'slug' => $config['slug'],
                'plugin_name' => $config['plugin_name'],
                'namespace' => $config['namespace'],
                'author' => $config['author'],
                'url_path' => $config['url_path'],
                'setup_type' => 'minimal',
                'target_dir' => $temporary_dir,
                'overwrite' => true,
                'dependency_mode' => $config['dependency_mode'],
                'autoload_mode' => $config['autoload_mode'],
                'wp_app_source_dir' => $config['wp_app_source_dir'],
                'source_app_dir' => $target_dir,
                'source_build_dir' => $config['source_build_dir'],
                'frontend_asset_dir' => $config['frontend_asset_dir'],
            ] );

            $messages = [];
            $this->copy_file(
                $temporary_dir . DIRECTORY_SEPARATOR . $config['slug'] . '.php',
                $target_dir . DIRECTORY_SEPARATOR . $config['slug'] . '.php',
                $messages,
                "Added {$config['slug']}.php"
            );
            $this->replace_directory(
                $temporary_dir . DIRECTORY_SEPARATOR . 'templates',
                $target_dir . DIRECTORY_SEPARATOR . 'templates',
                $messages,
                'Added WpApp templates/'
            );
            $this->replace_directory(
                $temporary_dir . DIRECTORY_SEPARATOR . str_replace( '/', DIRECTORY_SEPARATOR, $config['frontend_asset_dir'] ),
                $target_dir . DIRECTORY_SEPARATOR . str_replace( '/', DIRECTORY_SEPARATOR, $config['frontend_asset_dir'] ),
                $messages,
                "Imported frontend build to {$config['frontend_asset_dir']}/"
            );

            $this->merge_composer_json(
                $temporary_dir . DIRECTORY_SEPARATOR . 'composer.json',
                $target_dir . DIRECTORY_SEPARATOR . 'composer.json',
                $config,
                $messages
            );
            $this->append_gitignore( $target_dir, $messages );

            if ( $config['dependency_mode'] === 'copy' || $config['autoload_mode'] === 'polyfill' ) {
                $this->replace_directory(
                    $temporary_dir . DIRECTORY_SEPARATOR . 'vendor',
                    $target_dir . DIRECTORY_SEPARATOR . 'vendor',
                    $messages,
                    'Added vendor/ runtime files'
                );
            } else {
                $messages[] = 'Next: run composer install in the app directory before activating the plugin.';
            }

            return [
                'config' => $config,
                'messages' => $messages,
            ];
        } finally {
            $this->remove_directory( $temporary_dir );
        }
    }

    private function normalize_config( string $target_dir, array $config ): array {
        $package = $this->read_package_json( $target_dir );
        $slug = $config['slug'] ?? getenv( 'WP_APP_SLUG' ) ?: ( $package['name'] ?? basename( $target_dir ) );
        $slug = $this->to_slug( (string) $slug );
        $plugin_name = $config['plugin_name'] ?? getenv( 'WP_APP_PLUGIN_NAME' ) ?: Scaffolder::slug_to_title( $slug );

        return [
            'slug' => $slug,
            'plugin_name' => $plugin_name,
            'namespace' => $config['namespace'] ?? getenv( 'WP_APP_NAMESPACE' ) ?: Scaffolder::to_namespace( $plugin_name ),
            'author' => $config['author'] ?? getenv( 'WP_APP_AUTHOR' ) ?: '',
            'url_path' => $config['url_path'] ?? getenv( 'WP_APP_URL_PATH' ) ?: $slug,
            'dependency_mode' => $config['dependency_mode'] ?? getenv( 'WP_APP_DEPENDENCY_MODE' ) ?: 'composer',
            'autoload_mode' => $config['autoload_mode'] ?? getenv( 'WP_APP_AUTOLOAD_MODE' ) ?: 'composer',
            'wp_app_source_dir' => $config['wp_app_source_dir'] ?? getenv( 'WP_APP_SOURCE_DIR' ) ?: null,
            'source_build_dir' => $config['source_build_dir'] ?? getenv( 'WP_APP_SOURCE_BUILD_DIR' ) ?: null,
            'frontend_asset_dir' => $config['frontend_asset_dir'] ?? getenv( 'WP_APP_FRONTEND_ASSET_DIR' ) ?: 'app',
        ];
    }

    private function read_package_json( string $target_dir ): array {
        $path = $target_dir . DIRECTORY_SEPARATOR . 'package.json';
        if ( ! is_file( $path ) ) {
            return [];
        }

        $json = json_decode( file_get_contents( $path ), true );
        return is_array( $json ) ? $json : [];
    }

    private function to_slug( string $value ): string {
        $value = strtolower( preg_replace( '/[^a-zA-Z0-9]+/', '-', $value ) );
        $value = trim( $value, '-' );

        return $value !== '' ? $value : 'wp-app';
    }

    private function create_temporary_dir(): string {
        $temporary_dir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'create-wp-app-augment-' . getmypid() . '-' . bin2hex( random_bytes( 4 ) );
        if ( ! mkdir( $temporary_dir, 0777, true ) && ! is_dir( $temporary_dir ) ) {
            throw new \RuntimeException( "Could not create temporary directory: $temporary_dir" );
        }

        return $temporary_dir;
    }

    private function copy_file( string $source, string $destination, array &$messages, string $message ): void {
        if ( ! is_file( $source ) ) {
            throw new \RuntimeException( "Missing generated file: $source" );
        }

        copy( $source, $destination );
        $messages[] = "✓ $message";
    }

    private function replace_directory( string $source, string $destination, array &$messages, string $message ): void {
        if ( ! is_dir( $source ) ) {
            throw new \RuntimeException( "Missing generated directory: $source" );
        }

        if ( is_dir( $destination ) ) {
            $this->remove_directory( $destination );
        }

        $this->copy_directory( $source, $destination );
        $messages[] = "✓ $message";
    }

    private function merge_composer_json( string $source, string $destination, array $config, array &$messages ): void {
        $composer_exists = is_file( $destination );
        $generated = json_decode( file_get_contents( $source ), true );
        $existing = $composer_exists ? json_decode( file_get_contents( $destination ), true ) : [];
        $composer_json = is_array( $existing ) ? $existing : [];
        $generated = is_array( $generated ) ? $generated : [];

        foreach ( [ 'name', 'description', 'type', 'license' ] as $field ) {
            if ( ! isset( $composer_json[$field] ) && isset( $generated[$field] ) ) {
                $composer_json[$field] = $generated[$field];
            }
        }

        $composer_json['require'] = array_merge( $composer_json['require'] ?? [], $generated['require'] ?? [] );
        $composer_json['config']['autoloader-suffix'] = preg_replace( '/[^a-zA-Z0-9]/', '', $config['slug'] );

        file_put_contents( $destination, json_encode( $composer_json, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) . "\n" );
        $messages[] = $composer_exists ? '✓ Updated composer.json' : '✓ Added composer.json';
    }

    private function append_gitignore( string $target_dir, array &$messages ): void {
        $path = $target_dir . DIRECTORY_SEPARATOR . '.gitignore';
        $contents = is_file( $path ) ? file_get_contents( $path ) : '';

        if ( strpos( "\n" . $contents . "\n", "\n/vendor/\n" ) !== false ) {
            return;
        }

        $prefix = $contents !== '' && substr( $contents, -1 ) !== "\n" ? "\n" : '';
        file_put_contents( $path, $contents . $prefix . "/vendor/\n" );
        $messages[] = '✓ Updated .gitignore';
    }

    private function copy_directory( string $source, string $destination ): void {
        if ( ! is_dir( $destination ) ) {
            if ( ! mkdir( $destination, 0777, true ) && ! is_dir( $destination ) ) {
                throw new \RuntimeException( "Could not create directory: $destination" );
            }
        }

        $entries = scandir( $source );
        if ( $entries === false ) {
            throw new \RuntimeException( "Could not read directory: $source" );
        }

        foreach ( $entries as $entry ) {
            if ( in_array( $entry, [ '.', '..' ], true ) ) {
                continue;
            }

            $source_path = $source . DIRECTORY_SEPARATOR . $entry;
            $destination_path = $destination . DIRECTORY_SEPARATOR . $entry;

            if ( is_dir( $source_path ) && ! is_link( $source_path ) ) {
                $this->copy_directory( $source_path, $destination_path );
                continue;
            }

            copy( $source_path, $destination_path );
        }
    }

    private function remove_directory( string $directory ): void {
        if ( ! is_dir( $directory ) ) {
            return;
        }

        $entries = scandir( $directory );
        if ( $entries === false ) {
            throw new \RuntimeException( "Could not read directory: $directory" );
        }

        foreach ( $entries as $entry ) {
            if ( in_array( $entry, [ '.', '..' ], true ) ) {
                continue;
            }

            $path = $directory . DIRECTORY_SEPARATOR . $entry;
            if ( is_dir( $path ) && ! is_link( $path ) ) {
                $this->remove_directory( $path );
                continue;
            }

            unlink( $path );
        }

        rmdir( $directory );
    }

    private function load_support_classes(): void {
        foreach ( [ 'Scaffolder', 'ComposerJsonFactory', 'AutoloadPolyfillFactory', 'DependencyCopier', 'StaticAppImporter' ] as $class ) {
            $qualified_class = __NAMESPACE__ . '\\' . $class;
            if ( ! class_exists( $qualified_class ) ) {
                require_once __DIR__ . DIRECTORY_SEPARATOR . $class . '.php';
            }
        }
    }
}
