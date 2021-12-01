import * as vscode from 'vscode';
import { LogType } from './classes/helper';
import { LOG_OBJECTS } from './classes/helper';

const filePostfix = 'analyzedSOQL';
const ignorableClasses = new Set([
    "System",
    "AqTriggerHandler",
    "TriggerContext",
    "Triggers",
    "QueryFactory",
    "SObjectDescribeHelper",
    "ContactSelector",
    "SObjectSelector",
    "GovernorLimits",
    "GeneralSelector",
    "DMLHelper",
    "Log",
    "Aq",
    "ObjectIdentifier",
    "StringHelper",
    "UserSelector",
    "OpportunitySelector",
    "PSASelector",
    "GroupSelector",
    "LeadSelector",
    "AccountSelector",
    "SkilljarStudentSelector",
    "EnrichmentEngineSelector",
    "ActionSelector",
    "GroupMemberSelector"
]);

export function analyzeSOQL() : void {
    if(!vscode.window.activeTextEditor) {
        return;
    }
    let currentFileUri = vscode.window.activeTextEditor.document.uri;
    let newFilePath = currentFileUri.toString().replace('.log', '-' + filePostfix + '.log');
    let newFileUri = vscode.Uri.parse(newFilePath);
    let wsEdit = new vscode.WorkspaceEdit();
    wsEdit.createFile(newFileUri, { overwrite: true, ignoreIfExists: false });
    let finalFileText = '';
    let allMethodsWithSOQL: string[] = [];

    vscode.workspace.openTextDocument(currentFileUri).then((doc) => {
        // Первый прогон выбрать и подписать только нужные лайны
        for (let i = 0; i < doc.lineCount; i++) {
            let line = doc.lineAt(i);
            let formatted = formatLine(line.text);
            if(formatted) {
                allMethodsWithSOQL.push(formatted + '   line:' + i);
            }
        }
        
        // Второй прогон
        let mapOfmethodNameToObject = {};
        let lastMethod = {};
        let lastTrigger = '';
        for (const line of allMethodsWithSOQL) {
            // Methods
            if (line.startsWith('ENTER') || line.startsWith('EXIT')) {
                if (ignorableClasses.has(line.replace(/\w+:\s+(\w+)\..+/i, '$1'))) {
                    continue;
                }
                finalFileText += line + '\n';
                if (line.startsWith('ENTER')) {
                    lastMethod = mapOfmethodNameToObject[line];
                    if (lastMethod == null) {
                        mapOfmethodNameToObject[line] = {name: line, numberOfQueries: 0, triggers: {}};
                        lastMethod = mapOfmethodNameToObject[line];
                    }
                }
            }

            // SOQL
            if (line.startsWith('SOQL')) {
                finalFileText += line + ' (' + lastTrigger + ')\n';
                if (lastMethod == null) {
                    continue;
                }
                if (mapOfmethodNameToObject[lastMethod.name] != null) {
                    let currentMethod = mapOfmethodNameToObject[lastMethod.name];
                    currentMethod.numberOfQueries++;
                    let currentSOQLCountForTrigger = currentMethod.triggers[lastTrigger];
                    if (currentSOQLCountForTrigger == null) {
                        currentMethod.triggers[lastTrigger] = 1;
                    } else {
                        currentMethod.triggers[lastTrigger] = currentMethod.triggers[lastTrigger] + 1;
                    }
                }
            }

            // TRIGGERS
            if (line.startsWith('TRIGGER STARTED')) {
                finalFileText += line + '\n';
                lastTrigger = line.replace(/TRIGGER STARTED:\s+(.+)/i, '$1');
            } else if(line.startsWith('TRIGGER FINISHED')) {
                finalFileText += line + '\n';
            }

            // Errors
            if (line.startsWith("ERROR")) {
                finalFileText += line + '\n';
            }
        }

        // Method SOQL info
        finalFileText += '\nMethods SOQL usage info:' + '\n';
        let listOfMethods = [];
        for (const methodName in mapOfmethodNameToObject) {
            if (mapOfmethodNameToObject[methodName].numberOfQueries > 0) {
                listOfMethods.push(mapOfmethodNameToObject[methodName]);
            }
        }
        listOfMethods.sort((a, b) => {
            return b.numberOfQueries - a.numberOfQueries;
        });
        for (const method of listOfMethods) {
            finalFileText += method.numberOfQueries + ' - ' + method.name.replace(/ENTER:\s+(.+)/i, '$1') + ' - ' + JSON.stringify(method.triggers) + '\n';
        }

        // Insert in new document
        wsEdit.insert(newFileUri, new vscode.Position(1, 1), finalFileText);
        vscode.workspace.applyEdit(wsEdit).then(() => {
            vscode.workspace.openTextDocument(newFileUri);
            vscode.window.showInformationMessage('Log successfully analyzed');
        });
    });
}

function formatLine(line: string) : string | null {
    for (const key of LOG_OBJECTS.keys()) {
        let logObject = LOG_OBJECTS.get(key);
        if(!logObject || !logObject.soqlAnalyzer || line.search(logObject.hook) === -1) {
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