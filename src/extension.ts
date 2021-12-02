import * as vscode from 'vscode';
import { analyzeLog } from './analyzers/order-of-execution-analyzer';
import { analyzeSOQL } from './analyzers/soql-analyzer';

export function activate(context: vscode.ExtensionContext) {
    let orderOfExecution = vscode.commands.registerCommand('apex-log-booster.analyzeOrderOfExecution', analyzeLog);
    let soqlAnalyzer = vscode.commands.registerCommand('apex-log-booster.analyzeSOQL', analyzeSOQL);
    context.subscriptions.push(orderOfExecution);
    context.subscriptions.push(soqlAnalyzer);
}

export function deactivate() {}
