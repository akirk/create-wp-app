<?php

namespace {{namespace}};

use WpApp\WpApp;
use WpApp\BaseApp;

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
        // Set up your database tables here using BaseStorage classes.
    }

    protected function setup_routes(): void {
        // $this->app->route( 'posts/{id}' );
    }

    protected function setup_menu(): void {
        // $this->app->add_menu_item( 'dashboard', 'Dashboard', home_url( '/' . $this->get_url_path() ) );
    }
}
