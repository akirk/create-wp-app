<?php

namespace Akirk\CreateWpApp;

class AbilityRegistration {
    public static function definition(): array {
        return [
            'name' => 'create_wp_app',
            'description' => 'Scaffold a WordPress app plugin powered by WpApp.',
            'parameters' => [
                'slug' => 'Plugin slug and directory basename.',
                'plugin_name' => 'Plugin display name.',
                'namespace' => 'PHP namespace for full setup classes.',
                'author' => 'Plugin author display name.',
                'url_path' => 'URL path where the app should be mounted.',
                'setup_type' => 'minimal or full.',
                'target_dir' => 'Directory where files should be generated.',
                'overwrite' => 'Whether generated files may be overwritten.',
                'dependency_mode' => 'composer or copy.',
                'autoload_mode' => 'composer or polyfill.',
            ],
        ];
    }

    public static function create( array $config ): array {
        return Scaffolder::create( $config );
    }
}
