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
        // Use BaseStorage to manage database tables, for example:
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
