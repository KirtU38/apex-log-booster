import * as vscode from 'vscode';
import { LogType } from './classes/helper';
import { LOG_OBJECTS } from './classes/helper';

const filePostfix = 'analyzedSOQL';
type Method = {
    name: string, 
    numberOfQueries: number, 
    triggers: Map<string, number>
};
type TextWrap = {
    text: string
};
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
    let finalFileText: TextWrap = {text: ''};
    let filteredLines: string[] = [];

    vscode.workspace.openTextDocument(currentFileUri).then((doc) => {
        // Первый прогон выбрать и подписать только нужные лайны
        for (let i = 0; i < doc.lineCount; i++) {
            let line = doc.lineAt(i);
            let formatted = formatLine(line.text);
            if(formatted) {
                filteredLines.push(formatted);
            }
        }
        
        // Второй прогон
        let mapOfMethodNameToObject: Map<string, Method> = new Map<string, Method>();
        let lastMethod: Method | undefined;
        let lastTrigger = '';
        for (const line of filteredLines) {
            // Methods
            if (line.startsWith('ENTER') || line.startsWith('EXIT')) {
                if (ignorableClasses.has(line.replace(/\w+:\s+(\w+)\..+/i, '$1'))) {
                    continue;
                }
                finalFileText.text += line + '\n';
                if (line.startsWith('ENTER')) {
                    lastMethod = mapOfMethodNameToObject.get(line);
                    if (!lastMethod) {
                        mapOfMethodNameToObject.set(line, {name: line, numberOfQueries: 0, triggers: new Map<string, number>()});
                        lastMethod = mapOfMethodNameToObject.get(line);
                    }
                }
                continue;
            }

            // SOQL
            if (line.startsWith('SOQL')) {
                finalFileText.text += line + ' (' + lastTrigger + ')\n';
                if (!lastMethod) {
                    continue;
                }
                let currentMethod = mapOfMethodNameToObject.get(lastMethod.name);
                if (currentMethod) {
                    currentMethod.numberOfQueries++;
                    console.log(currentMethod);
                    
                    let currentSOQLCountForTrigger = currentMethod.triggers.get(lastTrigger);
                    if (!currentSOQLCountForTrigger) {
                        currentMethod.triggers.set(lastTrigger, 1);
                    } else {
                        currentMethod.triggers.set(lastTrigger, currentSOQLCountForTrigger + 1);
                    }
                }
                continue;
            }

            // TRIGGERS
            if (line.startsWith('TRIGGER STARTED')) {
                finalFileText.text += line + '\n';
                lastTrigger = line.replace(/TRIGGER STARTED:\s+(.+)/i, '$1');
                continue;
            } else if(line.startsWith('TRIGGER FINISHED')) {
                finalFileText.text += line + '\n';
                continue;
            }

            // Errors
            if (line.startsWith("ERROR")) {
                finalFileText.text += line + '\n';
            }
        }

        // Method SOQL info
        finalFileText.text += '\nMethods SOQL usage info:' + '\n';
        let listOfMethods: Method[] = [];
        for (const methodName of mapOfMethodNameToObject.keys()) {
            let currentMethod = mapOfMethodNameToObject.get(methodName);
            if(!currentMethod) {
                continue;
            }
            if (currentMethod.numberOfQueries > 0) {
                listOfMethods.push(currentMethod);
            }
        }
        listOfMethods.sort((a, b) => {
            return b.numberOfQueries - a.numberOfQueries;
        });
        
        for (const method of listOfMethods) {
            // Flatten method.triggers map
            let triggersString: string = '(';
            for(const t of method.triggers.keys()) {
                triggersString += t + ': ' + method.triggers.get(t) + ', ';
            }
            triggersString = triggersString.substr(0, triggersString.length - 2);
            triggersString += ')';
            // Print
            finalFileText.text += method.numberOfQueries + ' - ' + method.name.replace(/ENTER:\s+(.+)/i, '$1') + ' - ' + triggersString + '\n';
        }

        // Insert in new document
        wsEdit.insert(newFileUri, new vscode.Position(1, 1), finalFileText.text);
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
