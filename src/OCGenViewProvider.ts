import * as vscode from 'vscode';
import fetch from 'node-fetch';

export class OCGenViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _context: vscode.ExtensionContext
    ) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data: any) => {
            switch (data.type) {
                case 'saveKey':
                    await this._context.secrets.store('sumopodKey', data.value);
                    webviewView.webview.postMessage({ type: 'keySaved' });
                    break;

                case 'checkKey':
                    const key = await this._context.secrets.get('sumopodKey');
                    webviewView.webview.postMessage({ 
                        type: 'keyStatus', 
                        hasKey: !!key 
                    });
                    break;

                case 'generate':
                    await this._handleGenerate(data.genType, data.prompt, data.model, data.svgSize);
                    break;

                case 'insertAtCursor':
                    this._insertAtCursor(data.content);
                    break;
            }
        });
    }

    private async _handleGenerate(genType: string, prompt: string, model: string, svgSize: string = '24') {
        const apiKey = await this._context.secrets.get('sumopodKey');
        
        if (!apiKey) {
            this._view?.webview.postMessage({ 
                type: 'error', 
                message: 'Please save your Sumopod API Key first' 
            });
            return;
        }

        const isImage = genType === 'svg' || genType === 'png';
        const viewBox = svgSize.includes('x') ? `0 0 ${svgSize.replace('x', ' ')}` : `0 0 ${svgSize} ${svgSize}`;
        
        const systemPrompt = isImage
            ? `You are an expert UI/UX designer. Your ONLY job is to write pure, valid SVG code. Output ONLY the raw <svg> tag and its contents. NO markdown formatting, NO explanations. IMPORTANT: Create HIGH-DEFINITION, detailed SVG with smooth curves and professional quality. Use viewBox='${viewBox}', add multiple paths for depth and detail, use gradients when appropriate, and ensure fill='currentColor' or define beautiful color schemes. Make it look polished and production-ready.`
            : `You are a helpful assistant that generates realistic mock data in JSON format. Based on the user's request, create detailed and realistic mock data. Output valid JSON only (array or object). Include diverse, realistic values with proper data types (strings, numbers, booleans, nested objects). Make the data production-ready and comprehensive.`;

        try {
            const response = await fetch('https://ai.sumopod.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.7
                })
            }) as any;

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorText}`);
            }

            const result: any = await response.json();
            let content = result.choices[0]?.message?.content || '';

            // Strip markdown code blocks if present
            content = content.trim();
            if (content.startsWith('```')) {
                content = content.replace(/^```(?:json|svg)?\n?/, '').replace(/\n?```$/, '');
            }

            this._view?.webview.postMessage({ 
                type: 'generated', 
                content: content.trim(),
                genType 
            });
        } catch (error: any) {
            this._view?.webview.postMessage({ 
                type: 'error', 
                message: error.message 
            });
        }
    }

    private _insertAtCursor(content: string) {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            editor.edit((editBuilder: vscode.TextEditorEdit) => {
                editBuilder.insert(editor.selection.active, content);
            });
            vscode.window.showInformationMessage('Content inserted at cursor!');
        } else {
            vscode.window.showWarningMessage('No active editor found');
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>OCGen AI</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-sideBar-background);
            padding: 16px;
        }

        .header {
            text-align: center;
            margin-bottom: 24px;
            padding-bottom: 16px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .logo {
            font-size: 48px;
            font-weight: bold;
            color: var(--vscode-textLink-foreground);
            margin-bottom: 8px;
        }

        .subtitle {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }

        .section {
            margin-bottom: 20px;
        }

        .section-title {
            font-size: 13px;
            font-weight: 600;
            margin-bottom: 8px;
            color: var(--vscode-foreground);
        }

        input, select, textarea {
            width: 100%;
            padding: 8px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 2px;
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
        }

        input:focus, select:focus, textarea:focus {
            outline: 1px solid var(--vscode-focusBorder);
        }

        textarea {
            resize: vertical;
            min-height: 80px;
        }

        button {
            width: 100%;
            padding: 10px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 2px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 600;
            margin-top: 8px;
        }

        button:hover {
            background: var(--vscode-button-hoverBackground);
        }

        button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .secondary-btn {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        .secondary-btn:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }

        .status {
            padding: 8px;
            border-radius: 2px;
            margin-top: 8px;
            font-size: 12px;
        }

        .status.success {
            background: var(--vscode-inputValidation-infoBackground);
            color: var(--vscode-inputValidation-infoForeground);
            border: 1px solid var(--vscode-inputValidation-infoBorder);
        }

        .status.error {
            background: var(--vscode-inputValidation-errorBackground);
            color: var(--vscode-inputValidation-errorForeground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
        }

        .link {
            color: var(--vscode-textLink-foreground);
            text-decoration: none;
            font-size: 12px;
        }

        .link:hover {
            text-decoration: underline;
        }

        .preview {
            margin-top: 16px;
            padding: 12px;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 2px;
            max-height: 300px;
            overflow: auto;
        }

        .preview svg {
            width: 100%;
            max-width: 200px;
            height: auto;
            display: block;
            margin: 0 auto;
        }

        .preview pre {
            font-family: var(--vscode-editor-font-family);
            font-size: 12px;
            white-space: pre-wrap;
            word-wrap: break-word;
        }

        .hidden {
            display: none;
        }

        .loading {
            text-align: center;
            padding: 20px;
            color: var(--vscode-descriptionForeground);
        }

        .button-group {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
            margin-top: 12px;
        }

        .button-group button {
            margin-top: 0;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">O&lt;{</div>
        <div class="subtitle">Your AI Code & Data Companion</div>
    </div>

    <div class="section">
        <div class="section-title">API Key</div>
        <div id="keyInput">
            <input type="password" id="apiKey" placeholder="Enter your Sumopod API Key">
            <button onclick="saveKey()">Save Key</button>
            <a href="https://ai.sumopod.com" target="_blank" class="link">Get your API key →</a>
        </div>
        <div id="keyStatus" class="hidden status success">
            ✅ Key is set
            <button class="secondary-btn" onclick="updateKey()">Update Key</button>
        </div>
    </div>

    <div class="section">
        <div class="section-title">Generation Type</div>
        <select id="genType" onchange="toggleSvgOptions()">
            <option value="svg">Generate minimalist SVG Icon</option>
            <option value="png">Generate minimalist PNG Icon</option>
            <option value="json">Generate realistic JSON Mock Data</option>
        </select>
    </div>

    <div class="section" id="svgSizeSection">
        <div class="section-title">SVG Size (viewBox)</div>
        <select id="svgSize">
            <option value="24">24x24 (Icon - Default)</option>
            <option value="32">32x32 (Small Icon)</option>
            <option value="48">48x48 (Medium Icon)</option>
            <option value="64">64x64 (Large Icon)</option>
            <option value="128">128x128 (XL Icon)</option>
            <option value="512">512x512 (HD Icon)</option>
            <option value="1920x1080">1920x1080 (Full HD Landscape)</option>
            <option value="1080x1920">1080x1920 (Full HD Portrait)</option>
            <option value="1200x630">1200x630 (Social Media)</option>
        </select>
    </div>

    <div class="section">
        <div class="section-title">AI Model</div>
        <select id="model">
            <option value="gpt-4o-mini">OCGen Lite (Fast & Efficient)</option>
            <option value="gpt-4o">OCGen Pro (Most Capable)</option>
            <option value="gpt-5-nano">OCGen Nano (Ultra Fast)</option>
            <option value="gemini/gemini-2.5-pro">OCGen Vision (Advanced)</option>
            <option value="claude-haiku-4-5">OCGen Premium (Claude Powered)</option>
        </select>
    </div>

    <div class="section">
        <div class="section-title">Prompt</div>
        <textarea id="prompt" placeholder="e.g., 'Shopping cart icon' or '5 Indonesian user profiles'"></textarea>
    </div>

    <button id="generateBtn" onclick="generate()">Generate</button>

    <div id="loading" class="loading hidden">⏳ Generating...</div>
    <div id="error" class="hidden status error"></div>

    <div id="previewSection" class="hidden">
        <div class="section-title">Preview</div>
        <div id="preview" class="preview"></div>
        <div class="button-group">
            <button class="secondary-btn" onclick="copyCode()">📋 Copy</button>
            <button class="secondary-btn" onclick="downloadFile()">💾 Download</button>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let generatedContent = '';

        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.type) {
                case 'keyStatus':
                    if (message.hasKey) {
                        document.getElementById('keyInput').classList.add('hidden');
                        document.getElementById('keyStatus').classList.remove('hidden');
                    }
                    break;
                
                case 'keySaved':
                    document.getElementById('keyInput').classList.add('hidden');
                    document.getElementById('keyStatus').classList.remove('hidden');
                    break;
                
                case 'generated':
                    generatedContent = message.content;
                    document.getElementById('loading').classList.add('hidden');
                    document.getElementById('generateBtn').disabled = false;
                    document.getElementById('previewSection').classList.remove('hidden');
                    
                    const preview = document.getElementById('preview');
                    if (message.genType === 'svg') {
                        preview.innerHTML = message.content;
                    } else if (message.genType === 'png') {
                        preview.innerHTML = '<div class="loading">Rendering PNG...</div>';
                        const svgStr = message.content;
                        const canvas = document.createElement('canvas');
                        const ctx = canvas.getContext('2d');
                        const img = new Image();
                        const blob = new Blob([svgStr], {type: 'image/svg+xml;charset=utf-8'});
                        const url = URL.createObjectURL(blob);
                        img.onload = () => {
                            // Extract width/height from SVG or fallback
                            const sizeMatch = svgStr.match(/viewBox="0 0 (\d+) (\d+)"/);
                            let w = sizeMatch ? parseInt(sizeMatch[1]) : 256;
                            let h = sizeMatch ? parseInt(sizeMatch[2]) : 256;
                            canvas.width = w;
                            canvas.height = h;
                            ctx.drawImage(img, 0, 0, w, h);
                            const pngDataUrl = canvas.toDataURL('image/png');
                            preview.innerHTML = '<img src="' + pngDataUrl + '" alt="PNG Preview" style="max-width: 100%; display: block; margin: 0 auto;" />';
                            generatedContent = pngDataUrl; 
                            URL.revokeObjectURL(url);
                        };
                        img.src = url;
                    } else {
                        preview.innerHTML = '<pre>' + JSON.stringify(JSON.parse(message.content), null, 2) + '</pre>';
                    }
                    break;
                
                case 'error':
                    document.getElementById('loading').classList.add('hidden');
                    document.getElementById('generateBtn').disabled = false;
                    const errorDiv = document.getElementById('error');
                    errorDiv.textContent = '❌ ' + message.message;
                    errorDiv.classList.remove('hidden');
                    setTimeout(() => errorDiv.classList.add('hidden'), 5000);
                    break;
            }
        });

        function saveKey() {
            const key = document.getElementById('apiKey').value.trim();
            if (key) {
                vscode.postMessage({ type: 'saveKey', value: key });
            }
        }

        function updateKey() {
            document.getElementById('keyInput').classList.remove('hidden');
            document.getElementById('keyStatus').classList.add('hidden');
            document.getElementById('apiKey').value = '';
        }

        function generate() {
            const prompt = document.getElementById('prompt').value.trim();
            if (!prompt) return;

            const genType = document.getElementById('genType').value;
            const svgSize = (genType === 'svg' || genType === 'png') ? document.getElementById('svgSize').value : '24';

            document.getElementById('generateBtn').disabled = true;
            document.getElementById('loading').classList.remove('hidden');
            document.getElementById('previewSection').classList.add('hidden');
            document.getElementById('error').classList.add('hidden');

            vscode.postMessage({
                type: 'generate',
                genType: genType,
                model: document.getElementById('model').value,
                prompt: prompt,
                svgSize: svgSize
            });
        }

        function toggleSvgOptions() {
            const genType = document.getElementById('genType').value;
            const svgSection = document.getElementById('svgSizeSection');
            if (genType === 'svg' || genType === 'png') {
                svgSection.style.display = 'block';
            } else {
                svgSection.style.display = 'none';
            }
        }

        function copyCode() {
            navigator.clipboard.writeText(generatedContent).then(() => {
                const btn = event.target;
                const originalText = btn.textContent;
                btn.textContent = '✅ Copied!';
                setTimeout(() => btn.textContent = originalText, 2000);
            });
        }

        function downloadFile() {
            const genType = document.getElementById('genType').value;
            const extension = genType === 'svg' ? 'svg' : (genType === 'png' ? 'png' : 'json');
            
            if (genType === 'png') {
                const a = document.createElement('a');
                a.href = generatedContent;
                a.download = 'ocgen-' + Date.now() + '.png';
                a.click();
            } else {
                const mimeType = genType === 'svg' ? 'image/svg+xml' : 'application/json';
                const blob = new Blob([generatedContent], { type: mimeType });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'ocgen-' + Date.now() + '.' + extension;
                a.click();
                URL.revokeObjectURL(url);
            }
        }

        // Check key status on load
        vscode.postMessage({ type: 'checkKey' });
        toggleSvgOptions();
    </script>
</body>
</html>`;
    }
}
