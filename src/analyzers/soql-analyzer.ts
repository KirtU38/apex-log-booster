import * as vscode from 'vscode';
import { LogType } from './classes/helper';
import { LOG_OBJECTS } from './classes/helper';

type Method = {
    name: string, 
    numberOfQueries: number, 
    triggers: Map<string, number>
};
type TextWrap = {
    text: string
};

const filePostfix = 'analyzedSOQL';
const ignorableClasses = new Set([
    'System',
    'AqTriggerHandler',
    'TriggerContext',
    'Triggers',
    'QueryFactory',
    'SObjectDescribeHelper',
    'ContactSelector',
    'SObjectSelector',
    'GovernorLimits',
    'GeneralSelector',
    'DMLHelper',
    'Log',
    'Aq',
    'ObjectIdentifier',
    'StringHelper',
    'UserSelector',
    'OpportunitySelector',
    'PSASelector',
    'GroupSelector',
    'LeadSelector',
    'AccountSelector',
    'SkilljarStudentSelector',
    'EnrichmentEngineSelector',
    'ActionSelector',
    'GroupMemberSelector'
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
    let filteredLines: string[] = [];
    
    // Sections
    let mainLogSection: string[] = [];
    let soqlInfoSection: string[] = [];
    let errorsSection: string[] = [];
    let limits: Map<LogType, string> = new Map<LogType, string>();

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
        let correctLimitsInfoStarted: boolean = false;
        let previousLine: LogType = LogType.userDebug;
        for (const line of filteredLines) {
            // Methods
            if (line.startsWith(LOG_OBJECTS.get(LogType.methodEntry)!.marker) || line.startsWith(LOG_OBJECTS.get(LogType.methodExit)!.marker)) {
                if (ignorableClasses.has(line.replace(/\w+:\s+(\w+)\..+/i, '$1'))) {
                    continue;
                }
                mainLogSection.push(line + '\n');
                previousLine = LogType.methodEntry;
                if (line.startsWith(LOG_OBJECTS.get(LogType.methodEntry)!.marker)) {
                    lastMethod = mapOfMethodNameToObject.get(line);
                    if (!lastMethod) {
                        mapOfMethodNameToObject.set(line, {name: line, numberOfQueries: 0, triggers: new Map<string, number>()});
                        lastMethod = mapOfMethodNameToObject.get(line);
                    }
                }
                continue;
            }

            // SOQL
            if (line.startsWith(LOG_OBJECTS.get(LogType.soqlExecuteBegin)!.marker)) {
                mainLogSection.push(line + ' (' + lastTrigger + ')\n');
                if (!lastMethod) {
                    previousLine = LogType.soqlExecuteBegin;
                    continue;
                }
                let currentMethod = mapOfMethodNameToObject.get(lastMethod.name);
                if (currentMethod) {
                    if(previousLine !== LogType.managedPKG) {
                        currentMethod.numberOfQueries++;
                    }
                    let currentSOQLCountForTrigger = currentMethod.triggers.get(lastTrigger);
                    if (!currentSOQLCountForTrigger) {
                        currentMethod.triggers.set(lastTrigger, 1);
                    } else {
                        currentMethod.triggers.set(lastTrigger, currentSOQLCountForTrigger + 1);
                    }
                }
                previousLine = LogType.soqlExecuteBegin;
                continue;
            }

            // TRIGGERS
            if (line.startsWith(LOG_OBJECTS.get(LogType.triggerStarted)!.marker)) {
                mainLogSection.push(line + '\n');
                lastTrigger = line.replace(/TRIGGER_STARTED:\s+(.+)/i, '$1');
                previousLine = LogType.triggerStarted;
                continue;
            } else if(line.startsWith(LOG_OBJECTS.get(LogType.triggerFinished)!.marker)) {
                mainLogSection.push(line + '\n');
                previousLine = LogType.triggerFinished;
                continue;
            }

            // FLOWS
            if(line.startsWith(LOG_OBJECTS.get(LogType.flowStart)!.marker)) {
                mainLogSection.push(line + '\n');
                previousLine = LogType.flowStart;
            }

            // DEBUG
            if (line.startsWith(LOG_OBJECTS.get(LogType.userDebug)!.marker)) {
                mainLogSection.push(line + '\n');
                previousLine = LogType.userDebug;
                continue;
            }

            // Errors
            if (line.startsWith(LOG_OBJECTS.get(LogType.fatalError)!.marker)) {
                mainLogSection.push(line + '\n');
                if(errorsSection.length === 0) {
                    errorsSection.push('Errors:\n');
                }
                errorsSection.push(line + '\n');
                previousLine = LogType.fatalError;
                continue;
            }

            // PACKAGE
            if(line.search(LOG_OBJECTS.get(LogType.managedPKG)!.marker) !== -1) {
                previousLine = LogType.managedPKG;
            }

            // Limits
            if (line.search(LOG_OBJECTS.get(LogType.limitStart)!.hook) !== -1) {
                correctLimitsInfoStarted = true;
                continue;
            } else if (line.startsWith(LOG_OBJECTS.get(LogType.limitEnd)!.hook)) {
                correctLimitsInfoStarted = false;
                continue;
            }
            if (correctLimitsInfoStarted) {
                populateLimitsInfo(line, limits);
            }
        }

        // Method SOQL info
        soqlInfoSection.push('Methods SOQL usage info:' + '\n');
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
            soqlInfoSection.push(method.numberOfQueries + ' - ' + method.name.replace(/ENTER:\s+(.+)/i, '$1') + ' - ' + triggersString + '\n');
        }

        // Print all sections
        let finalFileText: TextWrap = {text: ''};
        printMarkers(finalFileText);
        printLimits(limits, finalFileText);
        printSection(soqlInfoSection, finalFileText);
        printSection(errorsSection, finalFileText);
        printSection(mainLogSection, finalFileText);

        // Insert in the new document
        wsEdit.insert(newFileUri, new vscode.Position(1, 1), finalFileText.text);
        vscode.workspace.applyEdit(wsEdit).then(() => {
            vscode.workspace.openTextDocument(newFileUri);
            vscode.window.showInformationMessage('Log successfully analyzed!');
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

function populateLimitsInfo(line: string, limits: Map<LogType,string>) : void {
    if (line.startsWith(LOG_OBJECTS.get(LogType.limitSOQL)!.hook)) {
        limits.set(LogType.limitSOQL, line);
    } else if (line.startsWith(LOG_OBJECTS.get(LogType.limitSOQLRows)!.hook)) {
        limits.set(LogType.limitSOQLRows, line);
    } else if (line.startsWith(LOG_OBJECTS.get(LogType.limitDML)!.hook)) {
        limits.set(LogType.limitDML, line);
    } else if (line.startsWith(LOG_OBJECTS.get(LogType.limitDMLRows)!.hook)) {
        limits.set(LogType.limitDMLRows, line);
    } else if (line.startsWith(LOG_OBJECTS.get(LogType.limitCPU)!.hook)) {
        limits.set(LogType.limitCPU, line);
    }
}

function printSection(sectionArray: string[], finalFileText: TextWrap) : void {
    if(sectionArray.length === 0){
        return;
    }
    for (const e of sectionArray) {
        finalFileText.text += e;
    }
    finalFileText.text += '\n\n';
}

function printLimits(limits: Map<LogType,string>, finalFileText: TextWrap) : void {
    finalFileText.text += 'Limits:\n';
    finalFileText.text += limits.get(LogType.limitSOQL)!.trim() + '\n';
    finalFileText.text += limits.get(LogType.limitSOQLRows)!.trim() + '\n';
    finalFileText.text += limits.get(LogType.limitDML)!.trim() + '\n';
    finalFileText.text += limits.get(LogType.limitDMLRows)!.trim() + '\n';
    finalFileText.text += limits.get(LogType.limitCPU)!.trim() + '\n';
    finalFileText.text += '\n\n';
}

function printMarkers(finalFileText: TextWrap) : void {
    finalFileText.text += 'Avaliable markers:\n';
    for (const logObject of LOG_OBJECTS.values()) {
        if(logObject.soqlAnalyzer && logObject.marker) {
            finalFileText.text += logObject.marker + '\n';
        }
    }
    finalFileText.text += '\n\n';
}
