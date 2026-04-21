<?php

namespace {{namespace}};

use WpApp\WpApp;
use WpApp\BaseApp;
use WpApp\BaseStorage;

class App extends BaseApp {
    public function __construct() {
        // See https://github.com/akirk/wp-app for documentation.
        $this->app = new WpApp( $this->get_template_dir(), $this->get_url_path(), [
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
    }

    protected function get_url_path(): string {
        return '{{url-path}}';
    }

    protected function get_template_dir(): string {
        return dirname( __DIR__ ) . '/templates';
    }

    protected function setup_database(): void {
        // Before reaching for custom tables, consider whether WordPress-native
        // storage is sufficient — it often is, and comes for free:
        //
        //   Custom Post Types + post meta
        //     Good for: content items with titles, content, status, author,
        //     dates, and arbitrary key/value metadata.
        //     register_post_type( '{{slug}}_item', [ 'public' => false, ... ] );
        //     get_posts(), get_post_meta(), update_post_meta()
        //
        //   Taxonomies + terms + term meta
        //     Good for: hierarchical or flat categorization, tag-like grouping,
        //     or any "type/label" concept that multiple items share.
        //     register_taxonomy( '{{slug}}_category', '{{slug}}_item', [...] );
        //     wp_set_object_terms(), get_term_meta(), update_term_meta()
        //
        //   User meta
        //     Good for: per-user settings, preferences, or profile data.
        //     get_user_meta(), update_user_meta()
        //
        // Only use custom tables (BaseStorage) when native entities don't fit —
        // e.g. high-volume rows, relational data, or non-content records that
        // don't map cleanly to posts/terms.
        //
        // If you do need custom tables, use BaseStorage:
        //
        // class {{namespace}}Storage extends BaseStorage {
        //     protected function get_schema() {
        //         $charset_collate = $this->wpdb->get_charset_collate();
        //         return [
        //             "CREATE TABLE {$this->wpdb->prefix}{{slug}}_items (
        //                 id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        //                 user_id bigint(20) unsigned NOT NULL,
        //                 title varchar(255) NOT NULL,
        //                 created_at datetime DEFAULT CURRENT_TIMESTAMP,
        //                 PRIMARY KEY (id),
        //                 KEY user_id (user_id)
        //             ) $charset_collate;",
        //         ];
        //     }
        // }
        //
        // Then in __construct(): $this->storage = new {{namespace}}Storage();
        // And in activate():     $this->storage->create_tables();
    }

    protected function setup_routes(): void {
        // $this->app->route( '' );               // -> templates/index.php
        // $this->app->route( 'dashboard' );      // -> templates/dashboard.php
        // $this->app->route( 'item/{id}' );      // -> templates/item.php
    }

    protected function setup_menu(): void {
        // $this->app->add_menu_item( 'dashboard', 'Dashboard', home_url( '/{{url-path}}/dashboard' ) );
    }

    public function activate(): void {
        // $this->storage->create_tables(); // uncomment if using BaseStorage
        flush_rewrite_rules();
    }

    public function deactivate(): void {
        flush_rewrite_rules();
    }
}
