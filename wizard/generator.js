(function() {
    const form = document.getElementById('generator-form');
    const status = document.getElementById('status');
    const pluginNameInput = document.getElementById('plugin-name');
    const slugInput = document.getElementById('slug');
    const namespaceInput = document.getElementById('namespace');
    const urlPathInput = document.getElementById('url-path');
    const downloadButton = document.getElementById('download-button');
    const playgroundButton = document.getElementById('playground-button');
    const playgroundFrame = document.getElementById('playground-frame');

    let slugEdited = false;
    let namespaceEdited = false;
    let urlPathEdited = false;

    const baseComposer = {
        type: 'wordpress-plugin',
        license: 'GPL-2.0-or-later',
        require: {
            php: '>=7.4',
            'akirk/wp-app': '^1.5'
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
            // 'require_login'      => true,
            // 'require_capability' => 'read',

            // Masterbar
            // 'show_masterbar_for_anonymous' => true,
            // 'show_wp_logo'                 => true,
            // 'show_site_name'               => true,
            // 'admin_bar_app_link'           => true,
            // 'clear_admin_bar'              => false,

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
         *     // Gate anonymous REST reads; front-end require_login does NOT cover
         *     // the REST API. Requires akirk/wp-app ^1.5.
         *     'rest_controller_class' => \WpApp\Rest\Access::protect_post_type( '{{identifier}}_item', 'read' ),
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
         *     'rest_controller_class' => \WpApp\Rest\Access::protect_taxonomy( '{{identifier}}_category', 'read' ),
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
        // 'require_login'      => true,
        // 'require_capability' => 'read',

        // Masterbar
        // 'show_masterbar_for_anonymous' => true,
        // 'show_wp_logo'                 => true,
        // 'show_site_name'               => true,
        // 'admin_bar_app_link'           => true,
        // 'clear_admin_bar'              => false,

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
        files.set(`${config.slug}.php`, pluginPhp);
        files.set('templates/index.php', replaceTokens(templateTemplate, config));
        files.set('composer.json', buildComposer(config));
        files.set('vendor/autoload.php', autoloadPolyfill);
        files.set('README.md', `# ${config.pluginName}\n\nA WordPress app powered by [WpApp](https://github.com/akirk/wp-app).\n\n## Setup\n\n1. Move this folder to \`wp-content/plugins/\` if needed.\n2. Activate the plugin in WordPress.\n3. Visit \`/${config.urlPath}/\`.\n\nWpApp is bundled in \`vendor/akirk/wp-app\` with a Composer-lite autoloader. You can still run \`composer install\` later to replace the bundled autoloader with Composer's generated one.\n`);
        files.set('.gitignore', `/vendor/\n`);

        if (config.setupType === 'full') {
            files.set('src/App.php', replaceTokens(appTemplate, config));
        }

        return files;
    }

    // Files edited by the AI module. When set, downloads and Playground runs
    // use these instead of the plain scaffold. Keys are plugin-relative paths.
    let generatedFiles = null;
    let generatedSlug = null;

    function setGeneratedFiles(files, slug) {
        generatedFiles = files;
        generatedSlug = slug;
    }

    function getCurrentFiles(config) {
        if (generatedFiles && generatedSlug === config.slug) {
            return generatedFiles;
        }

        return buildFiles(config);
    }

    async function buildZip(config, files) {
        const zip = new window.JSZip();

        for (const [path, content] of files) {
            zip.file(`${config.slug}/${path}`, content);
        }

        const dependencyZip = await window.JSZip.loadAsync(await fetchAsset('wp-app.zip'));
        for (const entry of Object.values(dependencyZip.files)) {
            if (!entry.dir) {
                zip.file(`${config.slug}/vendor/akirk/wp-app/${entry.name}`, await entry.async('uint8array'));
            }
        }

        return zip;
    }

    async function fetchAsset(name) {
        const response = await fetch(`assets/${name}`);
        if (!response.ok) {
            throw new Error(`Bundled asset ${name} is missing. Build the Pages artifact before previewing locally.`);
        }

        return new Uint8Array(await response.arrayBuffer());
    }

    // The plugin is installed from zip bytes held in memory, so the blueprint
    // never has to travel through a URL and can carry a large generated app.
    function buildPlaygroundBlueprint(config, zipBytes) {
        const steps = [
            {
                step: 'login',
                username: 'admin',
                password: 'password'
            },
            {
                step: 'installPlugin',
                pluginData: {
                    resource: 'literal',
                    name: `${config.slug}.zip`,
                    contents: zipBytes
                },
                options: {
                    activate: true,
                    targetFolderName: config.slug
                }
            }
        ];

        return {
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

    function setStatus(message, isError = false) {
        status.classList.toggle('error', isError);
        status.textContent = message;
    }

    async function downloadZip() {
        if (!form.reportValidity()) {
            return;
        }

        setStatus('');

        if (!window.JSZip) {
            setStatus('Zip library failed to load. Check your network connection and try again.', true);
            return;
        }

        const config = getConfig();

        try {
            setStatus('Building zip...');
            const zip = await buildZip(config, getCurrentFiles(config));
            const blob = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${config.slug}.zip`;
            document.body.append(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            setStatus(`Downloaded ${config.slug}.zip`);
            document.dispatchEvent(new CustomEvent('wizard:downloaded'));
        } catch (error) {
            setStatus(error.message, true);
        }
    }

    // Boots WordPress Playground in an iframe on this page and installs the
    // plugin zip directly from memory, so no blueprint has to travel via URL.
    async function runInPlayground() {
        if (!form.reportValidity()) {
            return;
        }

        setStatus('');

        if (!window.JSZip) {
            setStatus('Zip library failed to load. Check your network connection and try again.', true);
            return;
        }

        const config = getConfig();
        playgroundButton.disabled = true;

        try {
            setStatus('Building zip...');
            const zip = await buildZip(config, getCurrentFiles(config));
            const zipBytes = await zip.generateAsync({ type: 'uint8array' });
            const blueprint = buildPlaygroundBlueprint(config, zipBytes);

            setStatus('Loading WordPress Playground...');
            const playgroundApi = await import('https://playground.wordpress.net/client/index.js');

            const iframe = document.createElement('iframe');
            iframe.className = 'playground-iframe';
            iframe.title = 'WordPress Playground';
            playgroundFrame.hidden = false;
            playgroundFrame.replaceChildren(iframe);
            iframe.scrollIntoView({ behavior: 'smooth', block: 'start' });

            await playgroundApi.startPlaygroundWeb({
                iframe,
                remoteUrl: 'https://playground.wordpress.net/remote.html',
                blueprint
            });

            setStatus(`Running ${config.pluginName} in Playground.`);
        } catch (error) {
            playgroundFrame.hidden = true;
            playgroundFrame.replaceChildren();
            setStatus(`WordPress Playground could not be loaded: ${error.message || error}`, true);
        } finally {
            playgroundButton.disabled = false;
        }
    }

    // Enter in the name fields acts like Next; later steps have no submit.
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        if (currentStep === 1) {
            goToStep(2);
        }
    });

    /* ---------- steps ---------- */

    const stepButtons = [...document.querySelectorAll('.stepbar .step')];
    const stepPanels = [...document.querySelectorAll('.step-panel')];
    let highestStep = 1;
    let currentStep = 1;

    // Steps ahead of the furthest one visited become clickable as soon as
    // the form is valid, i.e. once the name fields are filled in.
    function syncStepButtons() {
        const formValid = form.checkValidity();
        for (const button of stepButtons) {
            const number = Number(button.dataset.step);
            button.classList.toggle('is-current', number === currentStep);
            button.classList.toggle('is-done', number < currentStep);
            button.disabled = number === currentStep || (number > highestStep && !formValid);
        }
    }

    function goToStep(step) {
        if (step > 1 && !form.reportValidity()) {
            return false;
        }

        const changed = step !== currentStep;
        currentStep = step;
        highestStep = Math.max(highestStep, step);

        for (const panel of stepPanels) {
            panel.hidden = Number(panel.dataset.stepPanel) !== step;
        }

        syncStepButtons();

        if (changed) {
            document.dispatchEvent(new CustomEvent('wizard:step', { detail: { step } }));
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        return true;
    }

    for (const button of stepButtons) {
        button.addEventListener('click', () => goToStep(Number(button.dataset.step)));
    }

    form.addEventListener('input', syncStepButtons);

    for (const button of document.querySelectorAll('.back-button')) {
        button.addEventListener('click', () => goToStep(Number(button.dataset.step)));
    }


    // Navigating away from the result hides a running Playground.
    document.addEventListener('wizard:step', (event) => {
        if (event.detail.step !== 3) {
            playgroundFrame.hidden = true;
            playgroundFrame.replaceChildren();
        }
    });

    downloadButton.addEventListener('click', downloadZip);
    playgroundButton.addEventListener('click', runInPlayground);

    syncDerivedFields();
    syncStepButtons();

    // Shared with ai.js.
    window.CreateWpApp = {
        getConfig,
        buildFiles,
        setGeneratedFiles,
        setStatus,
        runInPlayground,
        goToStep,
        getStep: () => currentStep
    };
})();
