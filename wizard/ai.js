// Generates and edits the plugin scaffold with an LLM, entirely in the browser.
// The model works on an in-memory file map through a small tool set; the
// result feeds the existing zip download and Playground flows in generator.js.
(function() {
    const STORAGE_KEY = 'create-wp-app-ai';
    const WP_APP_README_URL = 'https://raw.githubusercontent.com/akirk/wp-app/main/README.md';
    const MAX_ITERATIONS = 60;

    const promptInput = document.getElementById('ai-prompt');
    const followupInput = document.getElementById('ai-followup');
    const followupButton = document.getElementById('ai-followup-button');
    const skipButton = document.getElementById('skip-ai-button');
    const aiResult = document.getElementById('ai-result');
    const scaffoldResult = document.getElementById('scaffold-result');
    const resultModel = document.getElementById('ai-result-model');
    const pluginNameInput = document.getElementById('plugin-name');
    const providerSelect = document.getElementById('ai-provider');
    const endpointInput = document.getElementById('ai-endpoint');
    const modelSelect = document.getElementById('ai-model');
    const apiKeyInput = document.getElementById('ai-api-key');
    const checkButton = document.getElementById('ai-check-button');
    const connectionStatus = document.getElementById('ai-connection');
    const form = document.getElementById('generator-form');
    const busyIndicator = document.getElementById('ai-busy');
    const downloadButton = document.getElementById('download-button');
    const playgroundButton = document.getElementById('playground-button');
    const generateButton = document.getElementById('ai-generate-button');
    const stopButton = document.getElementById('ai-stop-button');
    const logElement = document.getElementById('ai-log');
    const fileList = document.getElementById('ai-files');
    const fileViewer = document.getElementById('ai-file-viewer');
    const fileViewerTitle = document.getElementById('ai-file-viewer-title');
    const fileViewerContent = document.getElementById('ai-file-viewer-content');
    const fileDeleteButton = document.getElementById('ai-file-delete');
    const newFileToggle = document.getElementById('new-file-toggle');
    const newFileRow = document.getElementById('new-file-row');
    const newFilePath = document.getElementById('new-file-path');
    const newFileAdd = document.getElementById('new-file-add');
    const endpointField = document.getElementById('ai-endpoint-field');
    const apiKeyField = document.getElementById('ai-api-key-field');

    // `endpoint` is the API base URL. Chat and model-list paths hang off it.
    const PROVIDERS = {
        anthropic: {
            label: 'Anthropic',
            model: 'claude-opus-5',
            endpoint: 'https://api.anthropic.com',
            needsKey: true,
            chatPath: '/v1/messages',
            modelsPath: '/v1/models',
            api: 'anthropic'
        },
        openai: {
            label: 'OpenAI',
            model: 'gpt-5',
            endpoint: 'https://api.openai.com',
            needsKey: true,
            chatPath: '/v1/chat/completions',
            modelsPath: '/v1/models',
            api: 'openai'
        },
        ollama: {
            label: 'Ollama',
            model: '',
            endpoint: 'http://localhost:11434',
            needsKey: false,
            chatPath: '/v1/chat/completions',
            modelsPath: '/api/tags',
            api: 'openai'
        },
        lmstudio: {
            label: 'LM Studio',
            model: '',
            endpoint: 'http://127.0.0.1:1234',
            needsKey: false,
            chatPath: '/v1/chat/completions',
            modelsPath: '/v1/models',
            api: 'openai'
        }
    };

    // Fills the model dropdown; keeps `selected` if it is in the list, else
    // falls back to the provider default or the first entry.
    function setModelOptions(models, selected) {
        modelSelect.replaceChildren(...models.map((id) => {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = id;
            return option;
        }));
        if (models.includes(selected)) {
            modelSelect.value = selected;
        } else if (models.length) {
            modelSelect.value = models.includes(providerDef().model) ? providerDef().model : models[0];
        }
    }

    function providerDef() {
        return PROVIDERS[providerSelect.value];
    }

    function baseUrl() {
        return (endpointInput.value.trim() || providerDef().endpoint).replace(/\/+$/, '');
    }

    function authHeaders() {
        const apiKey = apiKeyInput.value.trim();
        if (providerDef().api === 'anthropic') {
            return {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true'
            };
        }
        return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
    }

    // Conversation state survives across prompts so the user can iterate.
    let files = null;
    let config = null;
    let messages = [];
    let abortController = null;
    let readmeCache = null;
    let turnStart = 0;

    /* ---------- settings ---------- */

    function loadSettings() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        } catch (error) {
            return {};
        }
    }

    let currentProvider = null;

    function saveSettings() {
        const settings = loadSettings();
        const provider = currentProvider || providerSelect.value;
        settings.provider = providerSelect.value;
        settings[provider] = {
            model: modelSelect.value.trim(),
            endpoint: endpointInput.value.trim(),
            apiKey: apiKeyInput.value.trim()
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    }

    function applyProviderSettings() {
        const provider = providerSelect.value;
        currentProvider = provider;
        const saved = loadSettings()[provider] || {};
        const def = PROVIDERS[provider];
        const model = saved.model || def.model;
        setModelOptions(model ? [model] : [], model);
        endpointInput.value = saved.endpoint || def.endpoint;
        apiKeyInput.value = saved.apiKey || '';
        endpointField.hidden = def.needsKey;
        apiKeyField.hidden = !def.needsKey;
        setConnection('', '');
        if (!def.needsKey || apiKeyInput.value) {
            checkConnection();
        }
    }

    /* ---------- connection check + model list ---------- */

    function setConnection(text, state) {
        connectionStatus.textContent = text;
        connectionStatus.className = `ai-connection ${state}`;
    }

    async function listModels() {
        const def = providerDef();
        const response = await fetch(baseUrl() + def.modelsPath, { headers: authHeaders() });
        if (!response.ok) {
            throw await providerError(response);
        }
        const data = await response.json();
        // Anthropic + OpenAI + LM Studio: { data: [{ id }] }; Ollama: { models: [{ name }] }
        const items = data.data || data.models || [];
        return items.map((item) => item.id || item.name).filter(Boolean).sort();
    }

    let checkSequence = 0;

    async function checkConnection() {
        const def = providerDef();
        if (def.needsKey && !apiKeyInput.value.trim()) {
            setConnection('Enter an API key to list models.', '');
            return;
        }

        const sequence = ++checkSequence;
        setConnection('Connecting…', 'pending');
        checkButton.disabled = true;

        try {
            const models = await listModels();
            if (sequence !== checkSequence) {
                return;
            }
            if (!models.length) {
                setConnection(`Connected, but ${def.label} reports no models.`, 'error');
            } else {
                setModelOptions(models, modelSelect.value);
                setConnection(`Connected. ${models.length} model${models.length === 1 ? '' : 's'} available.`, 'ok');
            }
            saveSettings();
        } catch (error) {
            if (sequence !== checkSequence) {
                return;
            }
            const hint = def.needsKey ? '' : ` Is ${def.label} running at ${baseUrl()}${def.label === 'LM Studio' ? ' with the server started and CORS enabled' : ''}?`;
            setConnection(`Could not connect: ${error.message}.${hint}`, 'error');
        } finally {
            if (sequence === checkSequence) {
                checkButton.disabled = false;
            }
        }
    }

    /* ---------- log + file UI ---------- */

    function appendLog(kind, text) {
        const line = document.createElement('div');
        line.className = `ai-log-line ai-log-${kind}`;
        line.textContent = text;
        logElement.append(line);
        logElement.scrollTop = logElement.scrollHeight;
        return line;
    }

    function setBusy(text) {
        busyIndicator.textContent = text;
        busyIndicator.hidden = !text;
        if (text) {
            logElement.append(busyIndicator);
            logElement.scrollTop = logElement.scrollHeight;
        } else {
            busyIndicator.remove();
        }
    }

    // path → 'new' | 'modified' | 'deleted', compared with the plain scaffold.
    const fileStatus = new Map();
    let scaffoldFiles = null;
    let lastTouched = null;
    // Files changed by hand since the model's last turn; it is told about them.
    const manualEdits = new Set();
    let openPath = null;
    // Changes since the last zip download; leaving the page would lose them.
    let unsavedChanges = false;

    function updateFileStatus(path) {
        const original = scaffoldFiles.get(path);
        const current = files.get(path);
        if (current === undefined) {
            fileStatus.set(path, original === undefined ? undefined : 'deleted');
        } else if (original === undefined) {
            fileStatus.set(path, 'new');
        } else if (original !== current) {
            fileStatus.set(path, 'modified');
        } else {
            fileStatus.delete(path);
        }
        lastTouched = path;
        unsavedChanges = fileStatus.size > 0;
    }

    document.addEventListener('wizard:downloaded', () => {
        unsavedChanges = false;
    });

    window.addEventListener('beforeunload', (event) => {
        if (unsavedChanges || abortController) {
            event.preventDefault();
            event.returnValue = '';
        }
    });

    function renderFiles() {
        fileList.replaceChildren();
        if (!files) {
            return;
        }

        const paths = new Set([...files.keys(), ...[...fileStatus.entries()].filter(([, status]) => status === 'deleted').map(([path]) => path)]);
        for (const path of [...paths].sort()) {
            const status = fileStatus.get(path);
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `ai-file${status ? ` is-${status}` : ''}${path === lastTouched ? ' is-latest' : ''}`;
            button.disabled = status === 'deleted';
            button.append(path);
            if (status) {
                const badge = document.createElement('span');
                badge.className = 'ai-file-badge';
                badge.textContent = status;
                button.append(badge);
            }
            button.addEventListener('click', () => openFile(path));
            fileList.append(button);
        }
    }

    /* ---------- manual editing ---------- */

    function isManaged(path) {
        return path === 'vendor' || path.startsWith('vendor/');
    }

    // CodeMirror when it loaded, else the plain textarea.
    const MODES = {
        php: 'application/x-httpd-php',
        html: 'htmlmixed',
        js: 'javascript',
        json: 'application/json',
        css: 'css',
        md: 'markdown',
        xml: 'xml'
    };
    let syncingEditor = false;
    const codeMirror = window.CodeMirror ? window.CodeMirror.fromTextArea(fileViewerContent, {
        lineNumbers: true,
        lineWrapping: false,
        indentUnit: 4,
        matchBrackets: true,
        autoCloseBrackets: true,
        viewportMargin: 20
    }) : null;

    const editor = {
        get: () => (codeMirror ? codeMirror.getValue() : fileViewerContent.value),
        set(value, path) {
            syncingEditor = true;
            if (codeMirror) {
                codeMirror.setOption('mode', MODES[String(path).split('.').pop()] || null);
                codeMirror.setValue(value);
                codeMirror.clearHistory();
            } else {
                fileViewerContent.value = value;
            }
            syncingEditor = false;
        },
        setReadOnly(readOnly) {
            fileViewer.classList.toggle('is-readonly', readOnly);
            if (codeMirror) {
                codeMirror.setOption('readOnly', readOnly);
            } else {
                fileViewerContent.readOnly = readOnly;
            }
        },
        focus: () => (codeMirror ? codeMirror.focus() : fileViewerContent.focus()),
        refresh: () => codeMirror && codeMirror.refresh(),
        onChange(handler) {
            if (codeMirror) {
                codeMirror.on('change', () => !syncingEditor && handler());
            } else {
                fileViewerContent.addEventListener('input', handler);
            }
        }
    };

    function syncEditorLock() {
        editor.setReadOnly(Boolean(abortController) || (openPath !== null && isManaged(openPath)));
    }

    function openFile(path) {
        openPath = path;
        fileViewerTitle.textContent = path;
        editor.set(files.get(path), path);
        // vendor/ is off limits for the model too, see normalizePath().
        syncEditorLock();
        fileDeleteButton.hidden = isManaged(path);
        fileViewer.hidden = false;
        editor.refresh();
        // On narrow screens the list sits below the editor.
        fileViewer.scrollIntoView({ block: 'nearest' });
    }

    function closeFile() {
        openPath = null;
        fileViewer.hidden = true;
    }

    // Keeps the editor in sync after the model changed or removed the open file.
    function refreshOpenFile() {
        if (!openPath) {
            return;
        }
        if (!files.has(openPath)) {
            closeFile();
        } else if (editor.get() !== files.get(openPath)) {
            editor.set(files.get(openPath), openPath);
        }
    }

    function commitManualChange(path) {
        updateFileStatus(path);
        manualEdits.add(path);
        renderFiles();
        window.CreateWpApp.setGeneratedFiles(files, config.slug);
    }

    editor.onChange(() => {
        if (!openPath || abortController || isManaged(openPath)) {
            return;
        }
        files.set(openPath, editor.get());
        commitManualChange(openPath);
    });

    fileDeleteButton.addEventListener('click', () => {
        if (!openPath || abortController) {
            return;
        }
        if (!window.confirm(`Delete ${openPath}?`)) {
            return;
        }
        const path = openPath;
        files.delete(path);
        closeFile();
        commitManualChange(path);
    });

    newFileToggle.addEventListener('click', () => {
        newFileRow.hidden = !newFileRow.hidden;
        if (!newFileRow.hidden) {
            newFilePath.focus();
        }
    });

    function addNewFile() {
        if (abortController) {
            return;
        }
        let path;
        try {
            path = normalizePath(newFilePath.value);
        } catch (error) {
            window.CreateWpApp.setStatus(error.message, true);
            return;
        }
        window.CreateWpApp.setStatus('');
        newFilePath.value = '';
        newFileRow.hidden = true;
        if (!files.has(path)) {
            files.set(path, '');
            commitManualChange(path);
        }
        openFile(path);
        editor.focus();
    }

    newFileAdd.addEventListener('click', addNewFile);
    newFilePath.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            addNewFile();
        }
    });

    /* ---------- tools over the in-memory file map ---------- */

    const TOOLS = [
        {
            name: 'list_files',
            description: 'List all files in the plugin, with their sizes in bytes.',
            input_schema: { type: 'object', properties: {}, additionalProperties: false }
        },
        {
            name: 'read_file',
            description: 'Read a file from the plugin. Paths are relative to the plugin root.',
            input_schema: {
                type: 'object',
                properties: { path: { type: 'string' } },
                required: ['path'],
                additionalProperties: false
            }
        },
        {
            name: 'write_file',
            description: 'Create or fully overwrite a file in the plugin. Paths are relative to the plugin root. Parent directories are implicit.',
            input_schema: {
                type: 'object',
                properties: { path: { type: 'string' }, content: { type: 'string' } },
                required: ['path', 'content'],
                additionalProperties: false
            }
        },
        {
            name: 'edit_file',
            description: 'Replace an exact, unique occurrence of old_string in a file with new_string. Fails if old_string is missing or ambiguous.',
            input_schema: {
                type: 'object',
                properties: { path: { type: 'string' }, old_string: { type: 'string' }, new_string: { type: 'string' } },
                required: ['path', 'old_string', 'new_string'],
                additionalProperties: false
            }
        },
        {
            name: 'delete_file',
            description: 'Delete a file from the plugin.',
            input_schema: {
                type: 'object',
                properties: { path: { type: 'string' } },
                required: ['path'],
                additionalProperties: false
            }
        }
    ];

    function normalizePath(path) {
        const clean = String(path || '').replace(/\\/g, '/').replace(/^\.?\/+/, '').replace(/\/+/g, '/');
        if (!clean || clean.split('/').includes('..')) {
            throw new Error(`Invalid path: ${path}`);
        }
        if (clean === 'vendor' || clean.startsWith('vendor/')) {
            throw new Error('vendor/ is managed by the scaffold and cannot be modified.');
        }
        return clean;
    }

    function runTool(name, input) {
        switch (name) {
            case 'list_files': {
                return [...files.keys()].sort().map((path) => `${path} (${new TextEncoder().encode(files.get(path)).length} bytes)`).join('\n');
            }
            case 'read_file': {
                const path = normalizePath(input.path);
                if (!files.has(path)) {
                    throw new Error(`File not found: ${path}`);
                }
                return files.get(path);
            }
            case 'write_file': {
                const path = normalizePath(input.path);
                files.set(path, String(input.content ?? ''));
                updateFileStatus(path);
                return `Wrote ${path}`;
            }
            case 'edit_file': {
                const path = normalizePath(input.path);
                if (!files.has(path)) {
                    throw new Error(`File not found: ${path}`);
                }
                const content = files.get(path);
                const oldString = String(input.old_string ?? '');
                const first = content.indexOf(oldString);
                if (!oldString || first === -1) {
                    throw new Error(`old_string not found in ${path}`);
                }
                if (content.indexOf(oldString, first + 1) !== -1) {
                    throw new Error(`old_string occurs more than once in ${path}; include more context`);
                }
                files.set(path, content.slice(0, first) + String(input.new_string ?? '') + content.slice(first + oldString.length));
                updateFileStatus(path);
                return `Edited ${path}`;
            }
            case 'delete_file': {
                const path = normalizePath(input.path);
                if (!files.delete(path)) {
                    throw new Error(`File not found: ${path}`);
                }
                updateFileStatus(path);
                return `Deleted ${path}`;
            }
            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    }

    function describeToolCall(name, input) {
        if (name === 'list_files') {
            return 'list_files';
        }
        if (name === 'edit_file') {
            return `edit_file ${input.path}`;
        }
        if (name === 'write_file') {
            return `write_file ${input.path} (${String(input.content || '').length} chars)`;
        }
        return `${name} ${input.path || ''}`;
    }

    /* ---------- prompt ---------- */

    async function getWpAppReadme() {
        if (readmeCache !== null) {
            return readmeCache;
        }
        try {
            const response = await fetch(WP_APP_README_URL);
            readmeCache = response.ok ? await response.text() : '';
        } catch (error) {
            readmeCache = '';
        }
        return readmeCache;
    }

    function buildSystemPrompt(readme) {
        const parts = [
            `You are building a WordPress plugin that is an "app" powered by the WpApp library (akirk/wp-app). The plugin lives in wp-content/plugins/${config.slug}/ and is already scaffolded; your job is to turn it into the app the user describes by editing files with the provided tools.`,
            '',
            'Plugin facts:',
            `- Plugin name: ${config.pluginName}`,
            `- Slug / text domain / folder: ${config.slug}`,
            `- PHP namespace: ${config.namespace}`,
            `- App URL path: /${config.urlPath}/ (routes are relative to it)`,
            `- Setup type: ${config.setupType} (${config.setupType === 'full' ? 'src/App.php extends WpApp\\BaseApp; put app logic there and in templates/' : 'WpApp is configured inline in the main plugin file'})`,
            '- WpApp is available as vendor/akirk/wp-app with a working autoloader in vendor/autoload.php. Do not touch vendor/. Do not run or reference Composer.',
            '- There is no build step: write plain PHP, CSS and vanilla JavaScript. Put assets under assets/ and enqueue them with plugin_dir_url().',
            '',
            'Rules:',
            '- Read the existing files before changing them and follow the structure and extension points they already provide.',
            '- Keep __construct() limited to configuring WpApp, assigning properties and adding hooks. Register post types, taxonomies, rewrite rules, shortcodes, blocks on init; REST routes on rest_api_init; dashboard widgets on wp_dashboard_setup; admin menus on admin_menu. Never register those directly in the constructor.',
            '- Define WpApp routes in setup_routes() and menu entries in setup_menu(). Each route maps to a template in templates/.',
            '- Flush rewrite rules only on activation and deactivation.',
            '- Prefer WordPress-native storage: custom post types and post meta for records, taxonomies for shared labels, user meta for per-user settings, options for small site-wide settings. Use custom tables and BaseStorage only when those do not fit; then create tables on activation.',
            '- Escape all output (esc_html, esc_attr, esc_url, wp_kses_post), verify nonces and capabilities on every write, and use $wpdb->prepare for custom SQL.',
            '- Use WpApp CSS variables (--wp-app-color-primary, --wp-app-color-background, --wp-app-color-surface, --wp-app-color-text, --wp-app-color-muted, --wp-app-color-border, --wp-app-color-link, --wp-app-color-focus, ...) instead of hard-coded colours so the app follows the admin colour scheme.',
            '- Write complete, working files. Every PHP file must be syntactically valid; double check braces, semicolons and string quoting because there is no linter here.',
            '- Keep the plugin header in the main plugin file intact.',
            '- Work until the app is functional end to end, then reply with a short summary of what you built and how to use it. Do not ask questions; make reasonable assumptions and mention them in the summary.'
        ];

        if (readme) {
            parts.push('', '--- WpApp documentation (README.md) ---', '', readme);
        }

        return parts.join('\n');
    }

    function buildFirstUserMessage(prompt) {
        const listing = runTool('list_files', {});
        return `${prompt.trim()}\n\nCurrent files in the plugin:\n${listing}`;
    }

    /* ---------- providers ---------- */

    async function readSSE(response, onEvent) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    break;
                }
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();
                for (const rawLine of lines) {
                    const line = rawLine.trim();
                    if (!line.startsWith('data: ')) {
                        continue;
                    }
                    const data = line.slice(6);
                    if (data === '[DONE]') {
                        return;
                    }
                    try {
                        onEvent(JSON.parse(data));
                    } catch (error) {
                        // Ignore non-JSON keepalive lines.
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }
    }

    async function providerError(response) {
        let detail = '';
        try {
            const data = await response.json();
            detail = data.error?.message || data.message || JSON.stringify(data);
        } catch (error) {
            detail = response.statusText;
        }
        return new Error(`Provider returned ${response.status}: ${detail}`);
    }

    // Returns { text, toolCalls: [{id, name, input}], stopReason, assistantMessage }
    async function callAnthropic(systemPrompt, history, signal) {
        const response = await fetch(baseUrl() + providerDef().chatPath, {
            method: 'POST',
            signal,
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({
                model: modelSelect.value.trim(),
                max_tokens: 64000,
                stream: true,
                system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
                tools: TOOLS,
                messages: history
            })
        });

        if (!response.ok) {
            throw await providerError(response);
        }

        const blocks = [];
        let stopReason = null;
        let textLine = null;

        await readSSE(response, (event) => {
            if (event.type === 'content_block_start') {
                const block = event.content_block;
                if (block.type === 'tool_use') {
                    blocks[event.index] = { type: 'tool_use', id: block.id, name: block.name, json: '' };
                } else if (block.type === 'text') {
                    blocks[event.index] = { type: 'text', text: '' };
                    textLine = appendLog('assistant', '');
                    setBusy('Writing…');
                } else {
                    blocks[event.index] = block;
                }
            } else if (event.type === 'content_block_delta') {
                const block = blocks[event.index];
                if (event.delta.type === 'text_delta') {
                    block.text += event.delta.text;
                    textLine.textContent = block.text;
                    logElement.scrollTop = logElement.scrollHeight;
                } else if (event.delta.type === 'input_json_delta') {
                    block.json += event.delta.partial_json;
                } else if (event.delta.type === 'thinking_delta' && block) {
                    block.thinking = (block.thinking || '') + event.delta.thinking;
                } else if (event.delta.type === 'signature_delta' && block) {
                    block.signature = event.delta.signature;
                }
            } else if (event.type === 'message_delta') {
                stopReason = event.delta.stop_reason || stopReason;
            } else if (event.type === 'error') {
                throw new Error(event.error?.message || 'Stream error');
            }
        });

        const content = blocks.filter(Boolean).map((block) => {
            if (block.type === 'tool_use') {
                return { type: 'tool_use', id: block.id, name: block.name, input: block.json ? JSON.parse(block.json) : {} };
            }
            return block;
        });

        return {
            stopReason,
            text: content.filter((b) => b.type === 'text').map((b) => b.text).join('\n'),
            toolCalls: content.filter((b) => b.type === 'tool_use'),
            assistantMessage: { role: 'assistant', content }
        };
    }

    function toolResultsAnthropic(results) {
        return {
            role: 'user',
            content: results.map((result) => ({
                type: 'tool_result',
                tool_use_id: result.id,
                content: result.output,
                is_error: result.isError || undefined
            }))
        };
    }

    // OpenAI-compatible chat completions, also used for Ollama / LM Studio.
    async function callOpenAI(systemPrompt, history, signal) {
        const response = await fetch(baseUrl() + providerDef().chatPath, {
            method: 'POST',
            signal,
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({
                model: modelSelect.value.trim(),
                stream: true,
                messages: [{ role: 'system', content: systemPrompt }, ...history],
                tools: TOOLS.map((tool) => ({
                    type: 'function',
                    function: { name: tool.name, description: tool.description, parameters: tool.input_schema }
                }))
            })
        });

        if (!response.ok) {
            throw await providerError(response);
        }

        let text = '';
        let textLine = null;
        const toolCalls = [];
        let finishReason = null;

        await readSSE(response, (event) => {
            const choice = event.choices?.[0];
            if (!choice) {
                return;
            }
            finishReason = choice.finish_reason || finishReason;
            const delta = choice.delta || {};
            if (delta.content) {
                if (!textLine) {
                    textLine = appendLog('assistant', '');
                    setBusy('Writing…');
                }
                text += delta.content;
                textLine.textContent = text;
                logElement.scrollTop = logElement.scrollHeight;
            }
            for (const call of delta.tool_calls || []) {
                const slot = toolCalls[call.index] || (toolCalls[call.index] = { id: call.id, name: '', args: '' });
                if (call.id) {
                    slot.id = call.id;
                }
                if (call.function?.name) {
                    slot.name += call.function.name;
                }
                if (call.function?.arguments) {
                    slot.args += call.function.arguments;
                }
            }
        });

        const calls = toolCalls.filter(Boolean).map((call, index) => ({
            id: call.id || `call_${index}`,
            name: call.name,
            input: call.args ? JSON.parse(call.args) : {}
        }));

        return {
            stopReason: calls.length ? 'tool_use' : finishReason,
            text,
            toolCalls: calls,
            assistantMessage: {
                role: 'assistant',
                content: text || null,
                tool_calls: calls.length ? calls.map((call) => ({
                    id: call.id,
                    type: 'function',
                    function: { name: call.name, arguments: JSON.stringify(call.input) }
                })) : undefined
            }
        };
    }

    function toolResultsOpenAI(results) {
        return results.map((result) => ({ role: 'tool', tool_call_id: result.id, content: result.output }));
    }

    /* ---------- agent loop ---------- */

    async function runAgent(prompt) {
        const api = providerDef().api;
        const call = api === 'anthropic' ? callAnthropic : callOpenAI;
        const toolResults = api === 'anthropic' ? toolResultsAnthropic : toolResultsOpenAI;
        const systemPrompt = buildSystemPrompt(await getWpAppReadme());

        turnStart = messages.length;
        let content = messages.length ? prompt.trim() : buildFirstUserMessage(prompt);
        if (manualEdits.size) {
            const edited = [...manualEdits].sort().map((path) => (files.has(path) ? path : `${path} (deleted)`));
            content += `\n\nNote: the user edited these files by hand since your last turn, so any contents you remember are stale. Re-read them before changing them:\n${edited.join('\n')}`;
            manualEdits.clear();
        }
        messages.push({ role: 'user', content });
        appendLog('user', prompt.trim());

        for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
            setBusy('Thinking…');
            const result = await call(systemPrompt, messages, abortController.signal);
            messages.push(result.assistantMessage);

            if (!result.toolCalls.length) {
                if (result.stopReason === 'max_tokens' || result.stopReason === 'length') {
                    const line = appendLog('error', 'The model hit its output limit before finishing. ');
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = 'secondary small';
                    button.textContent = 'Continue';
                    button.addEventListener('click', () => {
                        button.disabled = true;
                        generate('Continue where you left off.');
                    });
                    line.append(button);
                }
                return;
            }

            setBusy('Applying changes…');
            const results = [];
            for (const toolCall of result.toolCalls) {
                const line = appendLog('tool', describeToolCall(toolCall.name, toolCall.input));
                try {
                    results.push({ id: toolCall.id, output: runTool(toolCall.name, toolCall.input) });
                } catch (error) {
                    line.textContent += ` — ${error.message}`;
                    line.classList.add('ai-log-error');
                    results.push({ id: toolCall.id, output: `Error: ${error.message}`, isError: true });
                }
            }
            renderFiles();
            refreshOpenFile();
            window.CreateWpApp.setGeneratedFiles(files, config.slug);
            downloadButton.title = `Snapshot after ${iteration + 1} round${iteration ? 's' : ''} of changes`;

            const resultMessages = toolResults(results);
            messages.push(...(Array.isArray(resultMessages) ? resultMessages : [resultMessages]));
        }

        appendLog('error', `Stopped after ${MAX_ITERATIONS} tool rounds. Send a follow-up prompt to continue.`);
    }

    function resetConversation() {
        files = null;
        scaffoldFiles = null;
        config = null;
        messages = [];
        fileStatus.clear();
        manualEdits.clear();
        lastTouched = null;
        unsavedChanges = false;
        window.CreateWpApp.setGeneratedFiles(null, null);
        logElement.replaceChildren();
        fileList.replaceChildren();
        closeFile();
    }

    // Shows the result step for the given mode and seeds the file map.
    function showResult(withAi) {
        const nextConfig = window.CreateWpApp.getConfig();
        if (!config || config.slug !== nextConfig.slug || config.setupType !== nextConfig.setupType) {
            resetConversation();
        }
        config = nextConfig;
        if (!files) {
            scaffoldFiles = window.CreateWpApp.buildFiles(config);
            files = new Map(scaffoldFiles);
            renderFiles();
        }
        for (const element of document.querySelectorAll('.result-plugin-name')) {
            element.textContent = config.pluginName;
        }
        if (withAi) {
            resultModel.textContent = 'Using ' + modelSelect.value + ' via ' + providerDef().label + '.';
        }
        aiResult.hidden = !withAi;
        scaffoldResult.hidden = withAi;
        window.CreateWpApp.goToStep(3);
    }

    async function generate(prompt) {
        prompt = String(prompt || '').trim();
        if (!prompt) {
            return;
        }
        if (providerDef().needsKey && !apiKeyInput.value.trim()) {
            apiKeyInput.focus();
            window.CreateWpApp.setStatus('Enter an API key first.', true);
            return;
        }
        if (!modelSelect.value) {
            modelSelect.focus();
            window.CreateWpApp.setStatus('Check the connection and choose a model first.', true);
            return;
        }
        if (!form.reportValidity()) {
            return;
        }

        saveSettings();
        showResult(true);

        abortController = new AbortController();
        setGenerating(true);
        window.CreateWpApp.setStatus('');

        try {
            await runAgent(prompt);
            followupInput.value = '';
            appendLog('done', 'Finished. Download the zip or run it in Playground, or send another prompt to refine.');
            window.CreateWpApp.setStatus('');
        } catch (error) {
            if (error.name === 'AbortError') {
                appendLog('error', 'Stopped. File changes made so far are kept; the interrupted turn is dropped from the conversation.');
                messages.length = turnStart;
            } else {
                appendLog('error', error.message);
                window.CreateWpApp.setStatus(error.message, true);
            }
        } finally {
            abortController = null;
            setGenerating(false);
        }
    }

    // Lock everything that must not change mid-run and show progress.
    function setGenerating(active) {
        setBusy(active ? 'Starting…' : '');
        if (!active) {
            downloadButton.title = '';
        }
        generateButton.disabled = active;
        generateButton.classList.toggle('is-busy', active);
        generateButton.textContent = active ? 'Generating…' : 'Generate with AI';
        stopButton.hidden = !active;
        followupButton.hidden = active;
        followupInput.disabled = active;
        syncEditorLock();
        fileDeleteButton.disabled = active;
        newFileToggle.disabled = active;
        newFileAdd.disabled = active;
        // The zip can be downloaded at any time; it reflects the files so far.
        playgroundButton.disabled = active;
        for (const button of document.querySelectorAll('.stepbar .step, .back-button')) {
            button.disabled = active || button.disabled;
        }
        if (!active) {
            window.CreateWpApp.goToStep(3);
        }
        form.classList.toggle('is-generating', active);
    }

    providerSelect.addEventListener('change', () => {
        saveSettings();
        applyProviderSettings();
    });
    generateButton.addEventListener('click', () => generate(promptInput.value));
    followupButton.addEventListener('click', () => generate(followupInput.value));
    skipButton.addEventListener('click', () => {
        if (abortController) {
            return;
        }
        showResult(false);
    });

    // Prefill the prompt from the plugin name until the user edits it.
    let promptEdited = false;
    promptInput.addEventListener('input', () => {
        promptEdited = promptInput.value.trim() !== '';
    });
    document.addEventListener('wizard:step', (event) => {
        if (event.detail.step === 2 && !promptEdited) {
            const name = pluginNameInput.value.trim();
            promptInput.value = name ? `Build a ${name} app.` : '';
        }
        // Reached via the step pill: seed the plain scaffold if there is
        // nothing yet, or if the name/setup changed since it was built.
        if (event.detail.step === 3) {
            const next = window.CreateWpApp.getConfig();
            if (!files || config.slug !== next.slug || config.setupType !== next.setupType) {
                showResult(false);
            }
        }
    });
    checkButton.addEventListener('click', () => {
        saveSettings();
        checkConnection();
    });
    apiKeyInput.addEventListener('change', () => {
        saveSettings();
        checkConnection();
    });
    endpointInput.addEventListener('change', () => {
        saveSettings();
        checkConnection();
    });
    modelSelect.addEventListener('change', saveSettings);
    stopButton.addEventListener('click', () => abortController?.abort());
    promptInput.addEventListener('keydown', (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault();
            generate(promptInput.value);
        }
    });
    followupInput.addEventListener('keydown', (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault();
            generate(followupInput.value);
        }
    });
    document.getElementById('ai-file-viewer-close').addEventListener('click', closeFile);

    const saved = loadSettings();
    providerSelect.value = saved.provider && PROVIDERS[saved.provider] ? saved.provider : 'anthropic';
    applyProviderSettings();
})();
