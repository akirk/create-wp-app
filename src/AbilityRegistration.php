<?php

namespace Akirk\CreateWpApp;

class AbilityRegistration {
    public static function definition(): array {
        return [
            'name' => 'create_wp_app',
            'description' => 'Scaffold a WordPress app plugin powered by WpApp.',
            'instructions' => [
                'Generated apps include a BaseApp structure and lifecycle extension points.',
                'Read generated files before modifying them.',
                'Do not register post types, taxonomies, rewrite rules, dashboard widgets, REST routes, or other WordPress-hooked features directly inside __construct(); attach WordPress hooks there and run registration from the proper hook.',
                'Register custom post types and taxonomies on WordPress init.',
                'Register dashboard widgets on wp_dashboard_setup.',
                'Prefer custom post types, post meta, taxonomies, terms, term meta, and user meta before custom tables.',
                'Use custom tables or BaseStorage only when native WordPress storage does not fit.',
                'After modifying PHP, run or request a syntax/runtime check before navigating the app.',
            ],
            'parameters' => [
                'slug' => 'Plugin slug and directory basename.',
                'plugin_name' => 'Plugin display name.',
                'namespace' => 'PHP namespace for generated classes.',
                'author' => 'Plugin author display name.',
                'url_path' => 'URL path where the app should be mounted.',
                'target_dir' => 'Directory where files should be generated.',
                'overwrite' => 'Whether generated files may be overwritten.',
                'dependency_mode' => 'composer or copy.',
                'autoload_mode' => 'composer or polyfill.',
            ],
        ];
    }

    public static function create( array $config ): array {
        $config['setup_type'] = 'full';
        return Scaffolder::create( $config );
    }
}
