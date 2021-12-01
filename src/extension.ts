// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { analyzeLog } from './analyzers/order-of-execution-analyzer';

export function activate(context: vscode.ExtensionContext) {
    vscode.window.showInformationMessage('Log is in proccess...');
    let orderOfExecution = vscode.commands.registerCommand('log-booster.analyzeOrderOfExecution', analyzeLog);
    // let soqlAnalyzer = vscode.commands.registerCommand('log-booster.analyzeSOQL', analyzeSOQL);
    context.subscriptions.push(orderOfExecution);
    // context.subscriptions.push(soqlAnalyzer);
}

export function deactivate() {}
