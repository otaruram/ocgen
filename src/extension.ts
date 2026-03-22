import * as vscode from 'vscode';
import { OCGenViewProvider } from './OCGenViewProvider';

export function activate(context: vscode.ExtensionContext) {
    const provider = new OCGenViewProvider(context.extensionUri, context);
    
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('ocgenView', provider, {
            webviewOptions: {
                retainContextWhenHidden: true
            }
        })
    );
}

export function deactivate() {}
