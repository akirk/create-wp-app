<?php

namespace Akirk\CreateWpApp;

class Scaffolder {
    public static function create( array $config ): array {
        return ( new self() )->scaffold( $config );
    }

    public function scaffold( $config ): array {
        $this->load_support_classes();

        $config = $this->normalize_config( $config );
        $target_dir = $config['target_dir'];
        $is_full_setup = $config['setup_type'] === 'full';
        $messages = [];

        if ( $config['created_target_dir'] ) {
            $messages[] = '✓ Created target directory';
        }

        $this->seed_scaffold_files( $target_dir, $config['overwrite'], $messages );

        $replacements = $this->get_replacements( $config, $is_full_setup );
        $files_to_process = [
            'plugin-name.php',
            'templates/index.php',
        ];

        if ( $is_full_setup ) {
            $files_to_process[] = 'src/App.php';
        }

        foreach ( $files_to_process as $file ) {
            $path = $this->path( $target_dir, $file );
            if ( ! file_exists( $path ) ) {
                continue;
            }

            $content = file_get_contents( $path );
            $content = str_replace( array_keys( $replacements ), array_values( $replacements ), $content );
            file_put_contents( $path, $content );
            $messages[] = "✓ Updated $file";
        }

        $new_plugin_file = $config['slug'] . '.php';
        $plugin_file = $this->path( $target_dir, 'plugin-name.php' );
        $new_plugin_path = $this->path( $target_dir, $new_plugin_file );
        if ( file_exists( $plugin_file ) ) {
            if ( file_exists( $new_plugin_path ) && $config['overwrite'] ) {
                unlink( $new_plugin_path );
            }

            if ( ! file_exists( $new_plugin_path ) ) {
                rename( $plugin_file, $new_plugin_path );
                $messages[] = "✓ Renamed plugin-name.php to $new_plugin_file";
            } else {
                $messages[] = "- Skipped plugin-name.php rename because $new_plugin_file exists";
            }
        }

        $this->write_file( $target_dir, '.gitignore', "/vendor/\n", $config['overwrite'], $messages, 'Created .gitignore' );

        if ( ! $is_full_setup && is_dir( $this->path( $target_dir, 'src' ) ) ) {
            $this->remove_src_directory( $target_dir );
            $messages[] = '✓ Removed src/ directory (not needed for minimal setup)';
        }

        $this->update_composer_json( $target_dir, $config );
        $messages[] = '✓ Updated composer.json';

        if ( $config['dependency_mode'] === 'copy' ) {
            ( new DependencyCopier() )->copy_wp_app( $target_dir, $config['overwrite'], $config['wp_app_source_dir'] );
            $messages[] = '✓ Copied akirk/wp-app into vendor/';
        }

        if ( $config['autoload_mode'] === 'polyfill' ) {
            ( new AutoloadPolyfillFactory() )->write( $target_dir );
            $messages[] = '✓ Generated Composer-lite autoloader';
        } else {
            $this->dump_autoload( $target_dir );
            $messages[] = '✓ Regenerated autoloader';
        }

        $readme = "# {$config['plugin_name']}\n\nA WordPress app powered by [WpApp](https://github.com/akirk/wp-app).\n";
        $this->write_file( $target_dir, 'README.md', $readme, $config['overwrite'], $messages, 'Updated README.md' );

        $this->cleanup_setup_files( $target_dir, $is_full_setup );
        $messages[] = '✓ Cleaned up setup scripts';

        return [
            'config' => $config,
            'messages' => $messages,
            'in_plugins_dir' => strpos( $target_dir, 'wp-content/plugins' ) !== false,
        ];
    }

    public static function slug_to_title( string $slug ): string {
        return ucwords( str_replace( [ '-', '_' ], ' ', $slug ) );
    }

    public static function to_namespace( string $name ): string {
        return str_replace( ' ', '', ucwords( preg_replace( '/[^a-zA-Z0-9]+/', ' ', $name ) ) );
    }

    private function normalize_config( $config ): array {
        if ( is_object( $config ) ) {
            $config = get_object_vars( $config );
        }

        $config = is_array( $config ) ? $config : [];
        $target_dir = $config['target_dir'] ?? getcwd();
        $target_dir = rtrim( $target_dir, DIRECTORY_SEPARATOR );

        $created_target_dir = false;
        if ( ! is_dir( $target_dir ) ) {
            if ( ! mkdir( $target_dir, 0777, true ) && ! is_dir( $target_dir ) ) {
                throw new \RuntimeException( "Could not create target directory: $target_dir" );
            }

            $created_target_dir = true;
        }

        $slug = $config['slug'] ?? basename( $target_dir );
        $plugin_name = $config['plugin_name'] ?? self::slug_to_title( $slug );
        $setup_type = (string) ( $config['setup_type'] ?? 'minimal' );
        $setup_type = in_array( $setup_type, [ '2', 'f', 'full' ], true ) ? 'full' : 'minimal';
        $dependency_mode = (string) ( $config['dependency_mode'] ?? 'composer' );
        $dependency_mode = $dependency_mode === 'copy' ? 'copy' : 'composer';
        $autoload_mode = (string) ( $config['autoload_mode'] ?? 'composer' );
        $autoload_mode = $autoload_mode === 'polyfill' ? 'polyfill' : 'composer';

        return [
            'slug' => $slug,
            'plugin_name' => $plugin_name,
            'namespace' => $config['namespace'] ?? self::to_namespace( $plugin_name ),
            'author' => $config['author'] ?? '',
            'url_path' => $config['url_path'] ?? $slug,
            'setup_type' => $setup_type,
            'target_dir' => $target_dir,
            'created_target_dir' => $created_target_dir,
            'overwrite' => (bool) ( $config['overwrite'] ?? true ),
            'dependency_mode' => $dependency_mode,
            'autoload_mode' => $autoload_mode,
            'wp_app_source_dir' => $config['wp_app_source_dir'] ?? null,
        ];
    }

    private function get_replacements( array $config, bool $is_full_setup ): array {
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

register_activation_hook( __FILE__, function() {
    flush_rewrite_rules();
} );

register_deactivation_hook( __FILE__, function() {
    flush_rewrite_rules();
} );
PHP;

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

register_activation_hook( __FILE__, function() {
    $app = new App();
    $app->activate();
} );

register_deactivation_hook( __FILE__, function() {
    flush_rewrite_rules();
} );
PHP;

        $replacements = [
            '{{plugin-name}}' => $config['plugin_name'],
            '{{namespace}}' => $config['namespace'],
            '{{slug}}' => $config['slug'],
            '{{url-path}}' => $config['url_path'],
            '{{author}}' => $config['author'],
            '{{minimal-setup}}' => $is_full_setup ? '' : $minimal_setup_code,
            '{{full-setup}}' => $is_full_setup ? $full_setup_code : '',
        ];

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

        return $replacements;
    }

    private function update_composer_json( string $target_dir, array $config ): void {
        $composer_path = $this->path( $target_dir, 'composer.json' );
        $composer_json = json_decode( file_get_contents( $composer_path ), true );
        $composer_json = ( new ComposerJsonFactory() )->create( is_array( $composer_json ) ? $composer_json : [], $config );
        file_put_contents( $composer_path, json_encode( $composer_json, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) . "\n" );
    }

    private function seed_scaffold_files( string $target_dir, bool $overwrite, array &$messages ): void {
        $source_dir = dirname( __DIR__ );
        $files = [
            'composer.json',
            'plugin-name.php',
            'README.md',
            'src/App.php',
            'templates/index.php',
        ];

        foreach ( $files as $file ) {
            $source = $this->path( $source_dir, $file );
            $destination = $this->path( $target_dir, $file );

            if ( ! file_exists( $source ) || realpath( $source ) === realpath( $destination ) ) {
                continue;
            }

            if ( file_exists( $destination ) && ! $overwrite ) {
                $messages[] = "- Skipped $file because it exists";
                continue;
            }

            $destination_dir = dirname( $destination );
            if ( ! is_dir( $destination_dir ) ) {
                mkdir( $destination_dir, 0777, true );
            }

            copy( $source, $destination );
            $messages[] = "✓ Created $file";
        }
    }

    private function load_support_classes(): void {
        foreach ( [ 'ComposerJsonFactory', 'AutoloadPolyfillFactory', 'DependencyCopier' ] as $class ) {
            $qualified_class = __NAMESPACE__ . '\\' . $class;
            if ( ! class_exists( $qualified_class ) ) {
                require_once __DIR__ . DIRECTORY_SEPARATOR . $class . '.php';
            }
        }
    }

    private function dump_autoload( string $target_dir ): void {
        $command = 'cd ' . escapeshellarg( $target_dir ) . ' && composer dump-autoload --quiet 2>/dev/null || composer dump-autoload';
        passthru( $command );
    }

    private function write_file( string $target_dir, string $file, string $content, bool $overwrite, array &$messages, string $message ): void {
        $path = $this->path( $target_dir, $file );
        if ( file_exists( $path ) && ! $overwrite ) {
            $messages[] = "- Skipped $file because it exists";
            return;
        }

        file_put_contents( $path, $content );
        $messages[] = "✓ $message";
    }

    private function remove_src_directory( string $target_dir ): void {
        foreach ( glob( $this->path( $target_dir, 'src/*' ) ) as $file ) {
            if ( is_file( $file ) ) {
                unlink( $file );
            }
        }

        rmdir( $this->path( $target_dir, 'src' ) );
    }

    private function cleanup_setup_files( string $target_dir, bool $is_full_setup ): void {
        foreach ( glob( $this->path( $target_dir, 'scripts/*' ) ) as $file ) {
            if ( is_file( $file ) ) {
                unlink( $file );
            }
        }

        if ( is_dir( $this->path( $target_dir, 'scripts' ) ) ) {
            rmdir( $this->path( $target_dir, 'scripts' ) );
        }

        if ( $is_full_setup ) {
            foreach ( [ 'Scaffolder.php', 'ComposerJsonFactory.php', 'AutoloadPolyfillFactory.php', 'DependencyCopier.php', 'AbilityRegistration.php' ] as $file ) {
                $path = $this->path( $target_dir, 'src/' . $file );
                if ( file_exists( $path ) ) {
                    unlink( $path );
                }
            }
        }
    }

    private function path( string $target_dir, string $path ): string {
        return $target_dir . DIRECTORY_SEPARATOR . str_replace( '/', DIRECTORY_SEPARATOR, $path );
    }
}
