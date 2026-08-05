(function() {
    const form = document.getElementById('generator-form');
    const status = document.getElementById('status');
    const pluginNameInput = document.getElementById('plugin-name');
    const slugInput = document.getElementById('slug');
    const namespaceInput = document.getElementById('namespace');
    const urlPathInput = document.getElementById('url-path');
    const downloadButton = document.getElementById('download-button');
    const playgroundButton = document.getElementById('playground-button');
    const aiAssistantPluginUrl = 'https://github.com/akirk/ai-assistant/archive/refs/heads/main.zip';

    let slugEdited = false;
    let namespaceEdited = false;
    let urlPathEdited = false;

    const baseComposer = {
        type: 'wordpress-plugin',
        license: 'GPL-2.0-or-later',
        require: {
            php: '>=7.4',
            'akirk/wp-app': '^1.0'
        }
    };

    const autoloadPolyfill = `<?php

return ( static function(): bool {
$root_dir = dirname( __DIR__ );
$vendor_dir = __DIR__;

$load_composer_json = static function( string $path ): array {
    if ( ! file_exists( $path ) ) {
        return [];
    }

    $json = json_decode( file_get_contents( $path ), true );
    return is_array( $json ) ? $json : [];
};

$normalize_path = static function( string $path ): string {
    return str_replace( '\\\\', '/', rtrim( $path, '/\\\\' ) );
};

$is_path_inside = static function( string $path, string $base_dir ) use ( $normalize_path ): bool {
    $real_path = realpath( $path );
    $real_base_dir = realpath( $base_dir );

    if ( $real_path === false || $real_base_dir === false ) {
        return false;
    }

    $real_path = $normalize_path( $real_path );
    $real_base_dir = $normalize_path( $real_base_dir );

    return $real_path === $real_base_dir || strpos( $real_path . '/', $real_base_dir . '/' ) === 0;
};

$autoloads = [];
$root_composer = $load_composer_json( $root_dir . '/composer.json' );
if ( isset( $root_composer['autoload'] ) && is_array( $root_composer['autoload'] ) ) {
    $autoloads[] = [ $root_dir, $root_composer['autoload'] ];
}

$wp_app_dir = $vendor_dir . '/akirk/wp-app';
$wp_app_composer = $load_composer_json( $wp_app_dir . '/composer.json' );
if ( isset( $wp_app_composer['autoload'] ) && is_array( $wp_app_composer['autoload'] ) ) {
    $autoloads[] = [ $wp_app_dir, $wp_app_composer['autoload'] ];
}

$prefixes = [];
foreach ( $autoloads as $entry ) {
    list( $base_dir, $autoload ) = $entry;

    foreach ( $autoload['files'] ?? [] as $file ) {
        $path = $base_dir . '/' . $file;
        if ( is_file( $path ) && $is_path_inside( $path, $base_dir ) ) {
            require_once $path;
        }
    }

    foreach ( $autoload['psr-4'] ?? [] as $prefix => $paths ) {
        foreach ( (array) $paths as $path ) {
            $dir = $base_dir . '/' . $path;
            if ( is_dir( $dir ) && $is_path_inside( $dir, $base_dir ) ) {
                $prefixes[$prefix][] = rtrim( $dir, '/\\\\' ) . '/';
            }
        }
    }
}

uksort( $prefixes, static function( string $a, string $b ): int {
    return strlen( $b ) <=> strlen( $a );
} );

spl_autoload_register( static function( string $class ) use ( $prefixes, $is_path_inside ): void {
    if ( ! preg_match( '/^(?:[A-Za-z_\\x80-\\xff][A-Za-z0-9_\\x80-\\xff]*\\\\\\\\)*[A-Za-z_\\x80-\\xff][A-Za-z0-9_\\x80-\\xff]*$/', $class ) ) {
        return;
    }

    foreach ( $prefixes as $prefix => $dirs ) {
        $length = strlen( $prefix );
        if ( strncmp( $prefix, $class, $length ) !== 0 ) {
            continue;
        }

        $relative_class = substr( $class, $length );
        $relative_file = str_replace( '\\\\', '/', $relative_class ) . '.php';

        foreach ( $dirs as $dir ) {
            $file = $dir . $relative_file;
            if ( is_file( $file ) && $is_path_inside( $file, $dir ) ) {
                require $file;
                return;
            }
        }
    }
} );

return true;
} )();
`;

    const appTemplate = `<?php

namespace WpAppScaffoldNamespace;

use WpApp\\WpApp;
use WpApp\\BaseApp;
use WpApp\\BaseStorage;

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
            // 'app_name'            => $this->get_plugin_name(),
            // 'app_name_textdomain' => '{{slug}}',
            // 'my_apps'             => true,
            // 'my_apps_icon'        => null,
        ] );

        // Uncomment only when these extension points contain real code.
        // add_action( 'init', [ $this, 'register_post_types' ] );
        // add_action( 'init', [ $this, 'register_taxonomies' ] );
        // add_action( 'wp_dashboard_setup', [ $this, 'register_dashboard_widgets' ] );
    }

    protected function get_url_path(): string {
        return '{{url-path}}';
    }

    protected function get_template_dir(): string {
        return dirname( __DIR__ ) . '/templates';
    }

    protected function get_plugin_name(): string {
        if ( ! function_exists( 'get_file_data' ) ) {
            return '{{plugin-name}}';
        }

        $plugin_data = get_file_data( dirname( __DIR__ ) . '/{{slug}}.php', [ 'name' => 'Plugin Name' ] );

        return $plugin_data['name'] ?: '{{plugin-name}}';
    }

    protected function setup_storage(): void {
        /*
         * Prefer WordPress-native storage before custom tables:
         * - Custom post types and post meta for content-like records.
         * - Taxonomies, terms, and term meta for shared categories or labels.
         * - User meta for per-user settings, preferences, and profile data.
         *
         * Use BaseStorage only when native entities do not fit.
         */
    }

    protected function setup_database(): void {
        $this->setup_storage();
    }

    protected function setup_routes(): void {
        /*
         * Add WpApp routes here. BaseApp calls this method during init().
         *
         * $this->app->route( '' );               // -> templates/index.php
         * $this->app->route( 'overview' );       // -> templates/overview.php
         * $this->app->route( 'item/{id}' );      // -> templates/item.php
         */
    }

    protected function setup_menu(): void {
        /*
         * Add WpApp masterbar/menu entries here. BaseApp calls this method
         * during init(), after routes have been registered.
         *
         * $this->app->add_menu_item( 'overview', 'Overview', home_url( '/{{url-path}}/overview' ) );
         */
    }

    public function register_post_types(): void {
        /*
         * register_post_type( '{{identifier}}_item', [
         *     'label'        => '{{plugin-name}} Items',
         *     'public'       => false,
         *     'show_ui'      => true,
         *     'show_in_rest' => true,
         *     'supports'     => [ 'title', 'editor', 'author' ],
         * ] );
         */
    }

    public function register_taxonomies(): void {
        /*
         * register_taxonomy( '{{identifier}}_category', '{{identifier}}_item', [
         *     'label'        => '{{plugin-name}} Categories',
         *     'hierarchical' => true,
         *     'show_ui'      => true,
         *     'show_in_rest' => true,
         * ] );
         */
    }

    public function register_dashboard_widgets(): void {
        /*
         * wp_add_dashboard_widget(
         *     '{{identifier}}_dashboard',
         *     '{{plugin-name}}',
         *     [ $this, 'render_dashboard_widget' ]
         * );
         */
    }

    public function render_dashboard_widget(): void {
        /*
         * echo esc_html__( 'Add your dashboard summary here.', '{{slug}}' );
         */
    }

    public function activate(): void {
        /*
         * If using BaseStorage, create/update custom tables here:
         *
         * $this->storage->create_tables();
         */
        flush_rewrite_rules();
    }

    public function deactivate(): void {
        flush_rewrite_rules();
    }
}
`;

    const templateTemplate = `<!DOCTYPE html>
<html <?php wp_app_language_attributes(); ?>>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php wp_app_title(); ?></title>
    <?php wp_app_head(); ?>
    <style>
        :root { color-scheme: light dark; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", sans-serif; line-height: 1.6; background: var(--wp-app-color-background); color: var(--wp-app-color-text); }
        main { max-width: 680px; margin: 2rem auto; padding: 0 1rem; }
        h1 { margin-bottom: 0.5rem; }
        .subtitle { color: var(--wp-app-color-muted); margin-top: 0; }
        .card { background: var(--wp-app-color-surface); border-radius: 4px; padding: 1.5rem; margin: 1.5rem 0; }
        .card h2 { margin-top: 0; font-size: 1.1rem; }
        code { background: var(--wp-app-color-surface-alt); padding: 0.2em 0.4em; border-radius: 3px; font-size: 0.9em; }
        ul { padding-left: 1.25rem; }
        li { margin: 0.5rem 0; }
        a { color: var(--wp-app-color-link); }
    </style>
</head>
<body>
    <?php wp_app_body_open(); ?>

    <main>
        <h1><?php echo esc_html( '{{plugin-name}}' ); ?></h1>
        <p class="subtitle">Your WpApp application is running.</p>

        <div class="card">
            <h2>Getting Started</h2>
            <ul>
                <li>Edit <code>templates/index.php</code> to customize this page</li>
                <li>Add routes in your main plugin file to create new pages</li>
                <li>Configure options like <code>require_login</code> or <code>show_masterbar_for_anonymous</code></li>
            </ul>
        </div>

        <div class="card">
            <h2>Documentation</h2>
            <p>
                Learn about routing, the masterbar, access control, and more:<br>
                <a href="https://github.com/akirk/wp-app/blob/main/README.md" target="_blank">github.com/akirk/wp-app</a>
            </p>
        </div>
    </main>

    <?php wp_app_body_close(); ?>
</body>
</html>
`;

    const mainPluginTemplate = `<?php
/**
 * Plugin Name: {{plugin-name}}
 * Description: A WordPress app powered by WpApp.
 * Version: 1.0.0
 * Author: {{author}}
 * Text Domain: {{slug}}
 * Requires PHP: 7.4
 */

namespace WpAppScaffoldNamespace;

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

require_once __DIR__ . '/vendor/autoload.php';

/* CreateWpAppFullSetup */
`;

    const fullSetupCode = `// Autoloader for plugin classes.
spl_autoload_register( function( $class ) {
    $prefix = '{{namespace}}\\\\';
    $len = strlen( $prefix );
    if ( strncmp( $prefix, $class, $len ) !== 0 ) {
        return;
    }
    $file = __DIR__ . '/src/' . str_replace( '\\\\', '/', substr( $class, $len ) ) . '.php';
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
`;

    const minimalSetupCode = `add_action( 'plugins_loaded', function() {
    // See https://github.com/akirk/wp-app for documentation.
    $app = new \\WpApp\\WpApp( __DIR__ . '/templates', '{{url-path}}', [
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
        // $plugin_data = get_file_data( __FILE__, [ 'name' => 'Plugin Name' ] );
        // 'app_name'            => $plugin_data['name'],
        // 'app_name_textdomain' => '{{slug}}',
        // 'my_apps'             => true,
        // 'my_apps_icon'        => null,
    ] );
    $app->init();
} );

register_activation_hook( __FILE__, function() {
    flush_rewrite_rules();
} );

register_deactivation_hook( __FILE__, function() {
    flush_rewrite_rules();
} );
`;

    function slugify(value) {
        const slug = value
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
        return slug || 'wp-app';
    }

    function toNamespace(value) {
        const namespace = value
            .replace(/[^a-zA-Z0-9]+/g, ' ')
            .trim()
            .split(/\s+/)
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join('');
        return namespace || 'WpApp';
    }

    function toIdentifier(slug) {
        const identifier = slug
            .toLowerCase()
            .replace(/-/g, '_')
            .replace(/[^a-z0-9_]+/g, '_')
            .replace(/^_+|_+$/g, '');
        return identifier || 'wp_app';
    }

    function normalizeUrlPath(value, slug) {
        const path = value.trim().replace(/^\/+|\/+$/g, '');
        return path || slug;
    }

    function replaceTokens(content, config) {
        return content
            .replaceAll('{{plugin-name}}', config.pluginName)
            .replaceAll('{{namespace}}', config.namespace)
            .replaceAll('WpAppScaffoldNamespace', config.namespace)
            .replaceAll('{{slug}}', config.slug)
            .replaceAll('{{identifier}}', config.identifier)
            .replaceAll('{{url-path}}', config.urlPath)
            .replaceAll('{{author}}', config.author);
    }

    function getConfig() {
        const formData = new FormData(form);
        const pluginName = String(formData.get('pluginName') || '').trim() || 'My App';
        const slug = slugify(String(formData.get('slug') || pluginName));
        const namespace = toNamespace(String(formData.get('namespace') || pluginName));

        return {
            pluginName,
            slug,
            namespace,
            author: String(formData.get('author') || '').trim(),
            urlPath: normalizeUrlPath(String(formData.get('urlPath') || slug), slug),
            setupType: String(formData.get('setupType') || 'full'),
            installAiAssistant: formData.get('installAiAssistant') === '1',
            identifier: toIdentifier(slug)
        };
    }

    function buildComposer(config) {
        const composer = JSON.parse(JSON.stringify(baseComposer));
        composer.name = `${config.slug}/${config.slug}`;
        composer.version = '0.1.0';
        composer.description = `${config.pluginName} - A WordPress app powered by WpApp`;
        composer.config = {
            'autoloader-suffix': config.slug.replace(/[^a-zA-Z0-9]/g, '')
        };

        if (config.author) {
            composer.authors = [{ name: config.author }];
        }

        if (config.setupType === 'full') {
            composer.autoload = {
                'psr-4': {
                    [`${config.namespace}\\`]: 'src/'
                }
            };
        }

        return `${JSON.stringify(composer, null, 4)}\n`;
    }

    function buildFiles(config) {
        const setupCode = config.setupType === 'full' ? fullSetupCode : minimalSetupCode;
        const pluginPhp = replaceTokens(
            mainPluginTemplate.replace('/* CreateWpAppFullSetup */', setupCode),
            config
        );
        const files = new Map();
        files.set(`${config.slug}/${config.slug}.php`, pluginPhp);
        files.set(`${config.slug}/templates/index.php`, replaceTokens(templateTemplate, config));
        files.set(`${config.slug}/composer.json`, buildComposer(config));
        files.set(`${config.slug}/vendor/autoload.php`, autoloadPolyfill);
        files.set(`${config.slug}/README.md`, `# ${config.pluginName}\n\nA WordPress app powered by [WpApp](https://github.com/akirk/wp-app).\n\n## Setup\n\n1. Move this folder to \`wp-content/plugins/\` if needed.\n2. Activate the plugin in WordPress.\n3. Visit \`/${config.urlPath}/\`.\n\nWpApp is bundled in \`vendor/akirk/wp-app\` with a Composer-lite autoloader. You can still run \`composer install\` later to replace the bundled autoloader with Composer's generated one.\n`);
        files.set(`${config.slug}/.gitignore`, `/vendor/\n`);

        if (config.setupType === 'full') {
            files.set(`${config.slug}/src/App.php`, replaceTokens(appTemplate, config));
        }

        return files;
    }

    async function addBundledWpApp(zip, config) {
        const response = await fetch('assets/wp-app.zip');
        if (!response.ok) {
            throw new Error('Bundled WpApp asset is missing. Build the Pages artifact before previewing downloads locally.');
        }

        const dependencyZip = await window.JSZip.loadAsync(await response.arrayBuffer());
        const entries = Object.values(dependencyZip.files);

        for (const entry of entries) {
            if (entry.dir) {
                continue;
            }

            zip.file(`${config.slug}/vendor/akirk/wp-app/${entry.name}`, await entry.async('uint8array'));
        }
    }

    function getRelativeFiles(config) {
        const prefix = `${config.slug}/`;
        const files = {};

        for (const [path, content] of buildFiles(config)) {
            files[path.startsWith(prefix) ? path.slice(prefix.length) : path] = content;
        }

        return files;
    }

    function toBase64(value) {
        const bytes = new TextEncoder().encode(value);
        let binary = '';
        const chunkSize = 0x8000;

        for (let offset = 0; offset < bytes.length; offset += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
        }

        return btoa(binary);
    }

    function buildPlaygroundPhp(config) {
        const filesPayload = toBase64(JSON.stringify(getRelativeFiles(config)));
        const configPayload = toBase64(JSON.stringify(config));
        const wpAppZipUrl = new URL('assets/wp-app.zip', window.location.href).href;

        return `<?php require_once '/wordpress/wp-load.php';

$config = json_decode( base64_decode( ${JSON.stringify(configPayload)} ), true );
$files = json_decode( base64_decode( ${JSON.stringify(filesPayload)} ), true );
$wp_app_zip_url = ${JSON.stringify(wpAppZipUrl)};
$target_dir = WP_CONTENT_DIR . '/plugins/' . $config['slug'];

$remove_directory = static function( string $directory ) use ( &$remove_directory ): void {
    if ( ! is_dir( $directory ) ) {
        return;
    }

    foreach ( scandir( $directory ) as $entry ) {
        if ( $entry === '.' || $entry === '..' ) {
            continue;
        }

        $path = $directory . '/' . $entry;
        if ( is_dir( $path ) && ! is_link( $path ) ) {
            $remove_directory( $path );
            continue;
        }

        unlink( $path );
    }

    rmdir( $directory );
};

$ensure_directory = static function( string $directory ): void {
    if ( ! is_dir( $directory ) && ! mkdir( $directory, 0777, true ) && ! is_dir( $directory ) ) {
        throw new RuntimeException( 'Could not create directory: ' . $directory );
    }
};

$remove_directory( $target_dir );
$ensure_directory( $target_dir );

foreach ( $files as $relative_path => $content ) {
    $relative_path = ltrim( str_replace( '\\\\', '/', $relative_path ), '/' );
    if ( strpos( $relative_path, '..' ) !== false ) {
        throw new RuntimeException( 'Invalid scaffold path: ' . $relative_path );
    }

    $path = $target_dir . '/' . $relative_path;
    $ensure_directory( dirname( $path ) );
    file_put_contents( $path, $content );
}

$response = wp_remote_get( $wp_app_zip_url, [ 'timeout' => 60 ] );
if ( is_wp_error( $response ) ) {
    throw new RuntimeException( $response->get_error_message() );
}

$zip_body = wp_remote_retrieve_body( $response );
if ( $zip_body === '' ) {
    throw new RuntimeException( 'Downloaded WpApp bundle was empty.' );
}

$tmp_zip = tempnam( sys_get_temp_dir(), 'wp-app-' );
file_put_contents( $tmp_zip, $zip_body );

$wp_app_dir = $target_dir . '/vendor/akirk/wp-app';
$ensure_directory( $wp_app_dir );

if ( class_exists( 'ZipArchive' ) ) {
    $zip = new ZipArchive();
    if ( true !== $zip->open( $tmp_zip ) ) {
        throw new RuntimeException( 'Could not open WpApp bundle.' );
    }
    $zip->extractTo( $wp_app_dir );
    $zip->close();
} else {
    require_once ABSPATH . 'wp-admin/includes/file.php';
    WP_Filesystem();
    $unzipped = unzip_file( $tmp_zip, $wp_app_dir );
    if ( is_wp_error( $unzipped ) ) {
        throw new RuntimeException( $unzipped->get_error_message() );
    }
}

unlink( $tmp_zip );
flush_rewrite_rules();
`;
    }

    function buildPlaygroundBlueprint(config) {
        const steps = [
            {
                step: 'login',
                username: 'admin',
                password: 'password'
            }
        ];

        if (config.installAiAssistant) {
            steps.push({
                step: 'installPlugin',
                pluginData: {
                    resource: 'url',
                    url: aiAssistantPluginUrl
                },
                options: {
                    activate: true
                }
            });
        }

        steps.push(
            {
                step: 'runPHP',
                code: buildPlaygroundPhp(config)
            },
            {
                step: 'activatePlugin',
                pluginName: config.pluginName,
                pluginPath: `${config.slug}/${config.slug}.php`
            }
        );

        return {
            $schema: 'https://playground.wordpress.net/blueprint-schema.json',
            landingPage: `/${config.urlPath}/`,
            preferredVersions: {
                php: '8.3',
                wp: 'latest'
            },
            features: {
                networking: true
            },
            steps
        };
    }

    function syncDerivedFields() {
        const pluginName = pluginNameInput.value.trim();
        const slug = pluginName ? slugify(pluginName) : '';

        if (!slugEdited) {
            slugInput.value = slug;
        }

        if (!namespaceEdited) {
            namespaceInput.value = pluginName ? toNamespace(pluginName) : '';
        }

        if (!urlPathEdited) {
            urlPathInput.value = slug;
        }

    }

    slugInput.addEventListener('input', () => {
        slugEdited = true;
        if (!urlPathEdited) {
            urlPathInput.value = slugify(slugInput.value);
        }
    });

    namespaceInput.addEventListener('input', () => {
        namespaceEdited = true;
    });

    urlPathInput.addEventListener('input', () => {
        urlPathEdited = true;
    });

    pluginNameInput.addEventListener('input', syncDerivedFields);

    async function downloadZip() {
        if (!form.reportValidity()) {
            return;
        }

        status.classList.remove('error');
        status.textContent = '';

        if (!window.JSZip) {
            status.classList.add('error');
            status.textContent = 'Zip library failed to load. Check your network connection and try again.';
            return;
        }

        const config = getConfig();
        const zip = new window.JSZip();
        const files = buildFiles(config);

        for (const [path, content] of files) {
            zip.file(path, content);
        }

        try {
            status.textContent = 'Adding bundled WpApp...';
            await addBundledWpApp(zip, config);
            status.textContent = 'Building zip...';
            const blob = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${config.slug}.zip`;
            document.body.append(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            status.textContent = `Downloaded ${config.slug}.zip`;
        } catch (error) {
            status.classList.add('error');
            status.textContent = error.message;
        }
    }

    function runInPlayground() {
        if (!form.reportValidity()) {
            return;
        }

        const config = getConfig();
        const blueprint = buildPlaygroundBlueprint(config);
        const url = `https://playground.wordpress.net/#${toBase64(JSON.stringify(blueprint))}`;
        const playgroundWindow = window.open(url, '_blank', 'noopener');

        if (playgroundWindow) {
            status.classList.remove('error');
            status.textContent = 'Opening WordPress Playground...';
            return;
        }

        status.classList.add('error');
        status.innerHTML = '';
        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = 'Open WordPress Playground';
        status.append('Pop-up blocked. ', link);
    }

    form.addEventListener('submit', (event) => {
        event.preventDefault();
    });

    downloadButton.addEventListener('click', downloadZip);
    playgroundButton.addEventListener('click', runInPlayground);

    syncDerivedFields();
})();
