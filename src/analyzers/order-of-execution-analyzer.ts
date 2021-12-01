import * as vscode from 'vscode';
import { LogType } from './classes/helper';
import { LOG_OBJECTS } from './classes/helper';

const filePostfix = 'analyzed';
let regex: RegExp;

export function analyzeLog() : void {
    constructRegex();
    if(!vscode.window.activeTextEditor) {
        return;
    }
    let currentFileUri = vscode.window.activeTextEditor.document.uri;
    let newFilePath = currentFileUri.toString().replace('.log', '-' + filePostfix + '.log');
    let newFileUri = vscode.Uri.parse(newFilePath);
    let wsEdit = new vscode.WorkspaceEdit();
    wsEdit.createFile(newFileUri, { overwrite: true, ignoreIfExists: false });
    let finalFileText = '';
    

    vscode.workspace.openTextDocument(currentFileUri).then((doc) => {
        for (let i = 0; i < doc.lineCount; i++) {
            let line = doc.lineAt(i);
            if (line.text.match(regex)) {
                let formatted = formatLine(line.text);
                if(formatted) {
                    finalFileText += formatted + '\n';
                }
            }
        }
        
        wsEdit.insert(newFileUri, new vscode.Position(1, 1), finalFileText);
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
        if(LOG_OBJECTS.get(key)?.hook) {
            regexString += LOG_OBJECTS.get(key)?.hook + '|';        
        }
    }
    regexString = regexString.substr(0, regexString.length -1);
    regexString += ')';
    regex = new RegExp(regexString, 'i');
}

function formatLine(line: string) : string | null {
    for (const key of LOG_OBJECTS.keys()) {
        let logObject = LOG_OBJECTS.get(key);
        if(!logObject || !logObject.orderAnalyzer || line.search(logObject.hook) === -1) {
            continue;
        };
        if(key === LogType.triggerStarted || key === LogType.triggerFinished) {
            let correctTrigger;
            if(line.search('CODE_UNIT_STARTED') !== -1) {
                correctTrigger = LOG_OBJECTS.get(LogType.triggerStarted);
            } else {
                correctTrigger = LOG_OBJECTS.get(LogType.triggerFinished);
            }
            if(correctTrigger) {
                return line.replace(correctTrigger.matcher, correctTrigger.replacer);
            }
        }
        return line.replace(logObject.matcher, logObject.replacer);
    }
    return null;
}