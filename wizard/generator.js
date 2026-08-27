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

    // The scaffold templates live in templates.js as data, so the same files
    // can be built elsewhere from one source.
    const templates = window.CreateWpAppTemplates;
    const {
        baseComposer,
        mainPluginTemplate,
        fullSetupCode,
        minimalSetupCode,
        appTemplate,
        templateTemplate,
        readmeTemplate,
        gitignoreTemplate,
        autoloadPolyfill
    } = templates;

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
        files.set('README.md', replaceTokens(readmeTemplate, config));
        files.set('.gitignore', gitignoreTemplate);

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
        getStep: () => currentStep,
        fetchAsset
    };
})();
