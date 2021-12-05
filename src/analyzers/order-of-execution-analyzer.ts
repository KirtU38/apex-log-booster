import * as vscode from 'vscode';
import { LogType } from './classes/helper';
import { LOG_OBJECTS } from './classes/helper';
import { LogLine } from './classes/helper';
import { TextWrap } from './classes/helper';

const filePostfix = 'analyzed';
let regex: RegExp;

export function analyzeLog() : void {
    if(!vscode.window.activeTextEditor) {
        return;
    }
    constructRegex();
    let currentFileUri = vscode.window.activeTextEditor.document.uri;
    let newFilePath = currentFileUri.toString().replace('.log', '-' + filePostfix + '.log');
    let newFileUri = vscode.Uri.parse(newFilePath);
    let wsEdit = new vscode.WorkspaceEdit();
    wsEdit.createFile(newFileUri, { overwrite: true, ignoreIfExists: false });

    // Variables from Settings
    let config = vscode.workspace.getConfiguration();
    let showLineNumbers: boolean = config.get('logFormat.showLineNumbers')!;
    // Main Variables
    let mainLogSection: LogLine[] = [];

    // Main Logic
    vscode.workspace.openTextDocument(currentFileUri).then((doc) => {
        for (let i = 0; i < doc.lineCount; i++) {
            let line = doc.lineAt(i);
            if (line.text.match(regex)) {
                let formatted = formatLine(line.text, i);
                if(formatted) {
                    mainLogSection.push(formatted);
                }
            }
        }

        // Print
        let finalFileText: TextWrap = {text: ''};
        printMainSection(mainLogSection, finalFileText, showLineNumbers);

        // Insert in the new document
        wsEdit.insert(newFileUri, new vscode.Position(1, 1), finalFileText.text);
        vscode.workspace.applyEdit(wsEdit).then(() => {
            vscode.workspace.openTextDocument(newFileUri);
            vscode.window.showInformationMessage('Log successfully analyzed!');
        });
    });
}

function constructRegex() : void {
    if(regex) {
        return;
    }
    let regexString = '(';
    for (const key of LOG_OBJECTS.keys()) {
        if(LOG_OBJECTS.get(key)!.hook) {
            regexString += LOG_OBJECTS.get(key)!.hook + '|';        
        }
    }
    regexString = regexString.substr(0, regexString.length -1);
    regexString += ')';
    regex = new RegExp(regexString, 'i');
}

function formatLine(line: string, i: number) : LogLine | null {
    for (const logType of LOG_OBJECTS.keys()) {
        let logInfoObject = LOG_OBJECTS.get(logType);
        if(!logInfoObject || !logInfoObject.orderAnalyzer || line.search(logInfoObject.hook) === -1) {
            continue;
        };
        if(logType === LogType.triggerStarted || logType === LogType.triggerFinished) {
            if(line.search('CODE_UNIT_STARTED') !== -1) {
                return {type: LogType.triggerStarted, text: line.replace(LOG_OBJECTS.get(LogType.triggerStarted)!.matcher, LOG_OBJECTS.get(LogType.triggerStarted)!.replacer), lineNumber: i};
            } else {
                return {type: LogType.triggerFinished, text: line.replace(LOG_OBJECTS.get(LogType.triggerFinished)!.matcher, LOG_OBJECTS.get(LogType.triggerFinished)!.replacer), lineNumber: i};
            }
        }
        return {type: logType, text: line.replace(logInfoObject.matcher, logInfoObject.replacer), lineNumber: i + 1};
    }
    return null;
}

function printMainSection(mainLogSection: LogLine[], finalFileText: TextWrap, showLineNumbers: boolean) : void {
    if(mainLogSection.length === 0) {
        return;
    }
    for (const e of mainLogSection) {
        let lineNumber = '';
        if(showLineNumbers) {
            lineNumber = ' :' + e.lineNumber;
        }
        finalFileText.text += e.text + lineNumber + '\n';
    }
    finalFileText.text += '\n';
}
