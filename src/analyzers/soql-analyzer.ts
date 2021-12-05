import * as vscode from 'vscode';
import { LogType } from './classes/helper';
import { LOG_OBJECTS } from './classes/helper';
import { TextWrap } from './classes/helper';
import { TypeWrap } from './classes/helper';
import { BooleanWrap } from './classes/helper';
import { Method } from './classes/helper';

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

export function analyzeSOQL() {
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
        const mapOfMethodNameToObject: Map<string, Method> = new Map<string, Method>();
        let lastMethod: Method = {name: 'null', numberOfQueries: 0, triggers: new Map<string, number>()};
        let lastTrigger: TextWrap = {text: ''};
        let correctLimitsInfoStarted: BooleanWrap = {is: false};
        let previousLine: TypeWrap = {type: LogType.userDebug};
        for (const line of filteredLines) {
            if(handleMethods(line, mainLogSection, previousLine, lastMethod, mapOfMethodNameToObject)) {continue;}
            if(handleSOQL(line, mainLogSection, previousLine, lastMethod, mapOfMethodNameToObject, lastTrigger)) {continue;}
            if(handleTriggers(line, mainLogSection, previousLine, lastTrigger)) {continue;}
            if(handleFlows(line, mainLogSection, previousLine)) {continue;}
            if(handleDebug(line, mainLogSection, previousLine)) {continue;}
            if(handleErrors(line, mainLogSection, previousLine, errorsSection)) {continue;}
            if(handleManagedPKG(line, mainLogSection, previousLine)) {continue;}
            if(handleLimits(line, limits, correctLimitsInfoStarted)) {continue;}
        }
        // Method SOQL info
        handleSOQLInfoSection(soqlInfoSection, mapOfMethodNameToObject);

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

function handleMethods(line:string, mainLogSection: string[], previousLine: TypeWrap, lastMethod: Method, mapOfMethodNameToObject: Map<string, Method>): boolean {
    if (line.startsWith(LOG_OBJECTS.get(LogType.methodEntry)!.marker) || line.startsWith(LOG_OBJECTS.get(LogType.methodExit)!.marker)) {
        if (ignorableClasses.has(line.replace(/\w+:\s+(\w+)\..+/i, '$1'))) {
            return true;
        }
        mainLogSection.push(line + '\n');
        previousLine.type = LogType.methodEntry;
        if (line.startsWith(LOG_OBJECTS.get(LogType.methodEntry)!.marker)) {
            if (!mapOfMethodNameToObject.get(line)) {
                lastMethod.name = line;
                lastMethod.numberOfQueries = 0;
                lastMethod.triggers = new Map<string, number>();
                mapOfMethodNameToObject.set(line, lastMethod);
            }
        }
        return true;
    }
    return false;
}

function handleSOQL(line:string, mainLogSection: string[], previousLine: TypeWrap, lastMethod: Method, mapOfMethodNameToObject: Map<string, Method>, lastTrigger: TextWrap): boolean {
    if (line.startsWith(LOG_OBJECTS.get(LogType.soqlExecuteBegin)!.marker)) {
        mainLogSection.push(line + ' (' + lastTrigger + ')\n');
        if (lastMethod.name === 'null') {
            previousLine.type = LogType.soqlExecuteBegin;
            return true;
        }
        if (mapOfMethodNameToObject.get(lastMethod.name)) {
            if(previousLine.type !== LogType.managedPKG) {
                mapOfMethodNameToObject.set(lastMethod.name, {name: lastMethod.name, numberOfQueries: lastMethod.numberOfQueries + 1, triggers: lastMethod.triggers});
                console.log(mapOfMethodNameToObject.get(lastMethod.name));
                
            }
            let currentSOQLCountForTrigger = mapOfMethodNameToObject.get(lastMethod.name)!.triggers.get(lastTrigger.text);
            if (!currentSOQLCountForTrigger) {
                mapOfMethodNameToObject.get(lastMethod.name)!.triggers.set(lastTrigger.text, 1);
            } else {
                mapOfMethodNameToObject.get(lastMethod.name)!.triggers.set(lastTrigger.text, currentSOQLCountForTrigger + 1);
            }
        }
        previousLine.type = LogType.soqlExecuteBegin;
        return true;
    }
    return false;
}

function handleTriggers(line: string, mainLogSection: string[], previousLine: TypeWrap, lastTrigger: TextWrap): boolean {
    if (line.startsWith(LOG_OBJECTS.get(LogType.triggerStarted)!.marker)) {
        mainLogSection.push(line + '\n');
        lastTrigger.text = line.replace(/TRIGGER_STARTED:\s+(.+)/i, '$1');
        previousLine.type = LogType.triggerStarted;
        return true;
    } else if(line.startsWith(LOG_OBJECTS.get(LogType.triggerFinished)!.marker)) {
        mainLogSection.push(line + '\n');
        previousLine.type = LogType.triggerFinished;
        return true;
    }
    return false;
}

function handleFlows(line: string, mainLogSection: string[], previousLine: TypeWrap): boolean {
    if(line.startsWith(LOG_OBJECTS.get(LogType.flowStart)!.marker)) {
        mainLogSection.push(line + '\n');
        previousLine.type = LogType.flowStart;
        return true;
    }
    return false;
}

function handleDebug(line: string, mainLogSection: string[], previousLine: TypeWrap): boolean {
    if (line.startsWith(LOG_OBJECTS.get(LogType.userDebug)!.marker)) {
        mainLogSection.push(line + '\n');
        previousLine.type = LogType.userDebug;
        return true;
    }
    return false;
}

function handleErrors(line: string, mainLogSection: string[], previousLine: TypeWrap, errorsSection: string[]): boolean {
    if (line.startsWith(LOG_OBJECTS.get(LogType.fatalError)!.marker)) {
        mainLogSection.push(line + '\n');
        if(errorsSection.length === 0) {
            errorsSection.push('Errors:\n');
        }
        errorsSection.push(line + '\n');
        previousLine.type = LogType.fatalError;
        return true;
    }
    return false;
}

function handleManagedPKG(line: string, mainLogSection: string[], previousLine: TypeWrap): boolean {
    if(line.startsWith(LOG_OBJECTS.get(LogType.managedPKG)!.marker)) {
        if(previousLine.type !== LogType.managedPKG) {
            console.log(previousLine.type);
            mainLogSection.push(line + '\n');
        }
        previousLine.type = LogType.managedPKG;
        return true;
    }
    return false;
}

function handleLimits(line: string, limits: Map<LogType, string>, correctLimitsInfoStarted: BooleanWrap): boolean {
    if (line.search(LOG_OBJECTS.get(LogType.limitStart)!.hook) !== -1) {
        correctLimitsInfoStarted.is = true;
        return true;
    } else if (line.startsWith(LOG_OBJECTS.get(LogType.limitEnd)!.hook)) {
        correctLimitsInfoStarted.is = false;
        return true;
    }
    if (correctLimitsInfoStarted.is === true) {
        populateLimitsInfo(line, limits);
        return true;
    }
    return false;
}

function handleSOQLInfoSection(soqlInfoSection: string[], mapOfMethodNameToObject: Map<string, Method>): void {
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
}


