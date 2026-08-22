// Generates and edits the plugin scaffold with an LLM, entirely in the browser.
// The model works on an in-memory file map through a small tool set; the
// result feeds the existing zip download and Playground flows in generator.js.
(function() {
    const STORAGE_KEY = 'create-wp-app-ai';
    const WP_APP_README_URL = 'https://raw.githubusercontent.com/akirk/wp-app/main/README.md';
    const MAX_ITERATIONS = 60;

    const promptInput = document.getElementById('ai-prompt');
    const providerSelect = document.getElementById('ai-provider');
    const endpointInput = document.getElementById('ai-endpoint');
    const modelInput = document.getElementById('ai-model');
    const apiKeyInput = document.getElementById('ai-api-key');
    const generateButton = document.getElementById('ai-generate-button');
    const stopButton = document.getElementById('ai-stop-button');
    const resetButton = document.getElementById('ai-reset-button');
    const logElement = document.getElementById('ai-log');
    const fileList = document.getElementById('ai-files');
    const fileViewer = document.getElementById('ai-file-viewer');
    const fileViewerTitle = document.getElementById('ai-file-viewer-title');
    const fileViewerContent = document.getElementById('ai-file-viewer-content');
    const endpointField = document.getElementById('ai-endpoint-field');
    const apiKeyField = document.getElementById('ai-api-key-field');

    const DEFAULTS = {
        anthropic: { model: 'claude-opus-5', endpoint: 'https://api.anthropic.com/v1/messages' },
        openai: { model: 'gpt-5', endpoint: 'https://api.openai.com/v1/chat/completions' },
        local: { model: 'qwen2.5-coder:14b', endpoint: 'http://localhost:11434/v1/chat/completions' }
    };

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
            model: modelInput.value.trim(),
            endpoint: endpointInput.value.trim(),
            apiKey: apiKeyInput.value.trim()
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    }

    function applyProviderSettings() {
        const provider = providerSelect.value;
        currentProvider = provider;
        const saved = loadSettings()[provider] || {};
        modelInput.value = saved.model || DEFAULTS[provider].model;
        endpointInput.value = saved.endpoint || DEFAULTS[provider].endpoint;
        apiKeyInput.value = saved.apiKey || '';
        endpointField.hidden = provider === 'anthropic';
        apiKeyField.querySelector('.hint').textContent = provider === 'local'
            ? 'Optional. Sent as a Bearer token if your local server requires one.'
            : 'Stored in this browser only and sent straight to the provider. Nothing goes through a server of ours.';
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

    function renderFiles() {
        fileList.replaceChildren();
        if (!files) {
            return;
        }

        for (const path of [...files.keys()].sort()) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'ai-file';
            button.textContent = path;
            button.addEventListener('click', () => {
                fileViewerTitle.textContent = path;
                fileViewerContent.textContent = files.get(path);
                fileViewer.hidden = false;
            });
            fileList.append(button);
        }
    }

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
                return `Edited ${path}`;
            }
            case 'delete_file': {
                const path = normalizePath(input.path);
                if (!files.delete(path)) {
                    throw new Error(`File not found: ${path}`);
                }
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
        const response = await fetch(endpointInput.value.trim() || DEFAULTS.anthropic.endpoint, {
            method: 'POST',
            signal,
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKeyInput.value.trim(),
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify({
                model: modelInput.value.trim(),
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
        const headers = { 'Content-Type': 'application/json' };
        const apiKey = apiKeyInput.value.trim();
        if (apiKey) {
            headers.Authorization = `Bearer ${apiKey}`;
        }

        const response = await fetch(endpointInput.value.trim(), {
            method: 'POST',
            signal,
            headers,
            body: JSON.stringify({
                model: modelInput.value.trim(),
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
        const provider = providerSelect.value;
        const call = provider === 'anthropic' ? callAnthropic : callOpenAI;
        const toolResults = provider === 'anthropic' ? toolResultsAnthropic : toolResultsOpenAI;
        const systemPrompt = buildSystemPrompt(await getWpAppReadme());

        turnStart = messages.length;
        messages.push({ role: 'user', content: messages.length ? prompt.trim() : buildFirstUserMessage(prompt) });
        appendLog('user', prompt.trim());

        for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
            const result = await call(systemPrompt, messages, abortController.signal);
            messages.push(result.assistantMessage);

            if (!result.toolCalls.length) {
                if (result.stopReason === 'max_tokens' || result.stopReason === 'length') {
                    appendLog('error', 'The model hit its output limit. Send a follow-up prompt such as "continue".');
                }
                return;
            }

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
            window.CreateWpApp.setGeneratedFiles(files, config.slug);

            const resultMessages = toolResults(results);
            messages.push(...(Array.isArray(resultMessages) ? resultMessages : [resultMessages]));
        }

        appendLog('error', `Stopped after ${MAX_ITERATIONS} tool rounds. Send a follow-up prompt to continue.`);
    }

    function resetConversation() {
        files = null;
        config = null;
        messages = [];
        window.CreateWpApp.setGeneratedFiles(null, null);
        logElement.replaceChildren();
        fileList.replaceChildren();
        fileViewer.hidden = true;
    }

    async function generate() {
        const prompt = promptInput.value.trim();
        if (!prompt) {
            promptInput.focus();
            return;
        }
        if (providerSelect.value !== 'local' && !apiKeyInput.value.trim()) {
            apiKeyInput.focus();
            window.CreateWpApp.setStatus('Enter an API key first.', true);
            return;
        }

        const form = document.getElementById('generator-form');
        if (!form.reportValidity()) {
            return;
        }

        saveSettings();
        const nextConfig = window.CreateWpApp.getConfig();
        if (!config || config.slug !== nextConfig.slug || config.setupType !== nextConfig.setupType) {
            resetConversation();
        }
        config = nextConfig;
        if (!files) {
            files = window.CreateWpApp.buildFiles(config);
            renderFiles();
        }

        abortController = new AbortController();
        generateButton.disabled = true;
        stopButton.hidden = false;
        window.CreateWpApp.setStatus('');

        try {
            await runAgent(prompt);
            promptInput.value = '';
            window.CreateWpApp.setStatus('Done. Download the zip or run it in Playground; send another prompt to refine.');
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
            generateButton.disabled = false;
            stopButton.hidden = true;
        }
    }

    providerSelect.addEventListener('change', () => {
        saveSettings();
        applyProviderSettings();
    });
    generateButton.addEventListener('click', generate);
    stopButton.addEventListener('click', () => abortController?.abort());
    resetButton.addEventListener('click', () => {
        resetConversation();
        window.CreateWpApp.setStatus('Reset to the plain scaffold.');
    });
    promptInput.addEventListener('keydown', (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault();
            generate();
        }
    });
    document.getElementById('ai-file-viewer-close').addEventListener('click', () => {
        fileViewer.hidden = true;
    });

    const saved = loadSettings();
    providerSelect.value = saved.provider && DEFAULTS[saved.provider] ? saved.provider : 'anthropic';
    applyProviderSettings();
})();
