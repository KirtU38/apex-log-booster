import { off } from 'process';
import * as vscode from 'vscode';
import { LogType } from './classes/helper';
import { LOG_OBJECTS } from './classes/helper';
import { TextWrap } from './classes/helper';
import { TypeWrap } from './classes/helper';
import { BooleanWrap } from './classes/helper';
import { Method } from './classes/helper';
import { LogLine } from './classes/helper';
import { LogTypeInfo } from './classes/helper';

const filePostfix = 'analyzedSOQL';
let ignorableClasses: Set<string>;

export function analyzeSOQL() {
    if(!vscode.window.activeTextEditor) {
        return;
    }
    let currentFileUri = vscode.window.activeTextEditor.document.uri;
    let newFilePath = currentFileUri.toString().replace('.log', '-' + filePostfix + '.log');
    let newFileUri = vscode.Uri.parse(newFilePath);
    let wsEdit = new vscode.WorkspaceEdit();
    wsEdit.createFile(newFileUri, { overwrite: true, ignoreIfExists: false });

    // Variables from Settings
    let config = vscode.workspace.getConfiguration();
    let showLineNumbers: boolean = config.get('logFormat.showLineNumbers')!;
    let showDML: boolean = config.get('soqlAnalyzer.showDML')!;
    handeShowDMLSetting(showDML);
    let ignorableClassesString: string = config.get('soqlAnalyzer.ignoredClasses')!;
    populateIgnorableClasses(ignorableClassesString);
    // Main variables
    let filteredLines: LogLine[] = [];
    
    // Sections to print
    let mainLogSection: LogLine[] = [];
    let soqlInfoSection: string[] = [];
    let errorsSection: string[] = [];
    let limits: Map<LogType, string> = new Map<LogType, string>();

    // Main Logic
    vscode.workspace.openTextDocument(currentFileUri).then((doc) => {
        // First run to filter lines
        for (let i = 0; i < doc.lineCount; i++) {
            let line = doc.lineAt(i);
            let formatted = formatLine(line.text, i);
            if(formatted) {
                filteredLines.push(formatted);
            }
        }
        
        // Second run
        const mapOfMethodNameToObject: Map<string, Method> = new Map<string, Method>();
        let lastMethod: Method = {name: 'null', numberOfQueries: 0, triggers: new Map<string, number>()};
        let lastTrigger: TextWrap = {text: ''};
        let correctLimitsInfoStarted: BooleanWrap = {is: false};
        let previousLine: TypeWrap = {type: LogType.userDebug};
        for (const line of filteredLines) {
            if(handleMethods(line, mainLogSection, previousLine, lastMethod, mapOfMethodNameToObject)) {continue;}
            if(handleSOQL(line, mainLogSection, previousLine, lastMethod, mapOfMethodNameToObject, lastTrigger)) {continue;}
            if(handleTriggers(line, mainLogSection, previousLine, lastTrigger)) {continue;}
            if(handleDML(line, mainLogSection, showDML)) {continue;}
            if(handleFlows(line, mainLogSection, previousLine)) {continue;}
            if(handleDebug(line, mainLogSection, previousLine)) {continue;}
            if(handleErrors(line, mainLogSection, previousLine, errorsSection)) {continue;}
            if(handleManagedPKG(line, mainLogSection, previousLine)) {continue;}
            if(handleLimits(line, limits, correctLimitsInfoStarted)) {continue;}
        }
        // Methods SOQL info
        handleSOQLInfoSection(soqlInfoSection, mapOfMethodNameToObject);

        // Print all sections
        let finalFileText: TextWrap = {text: ''};
        printMarkers(finalFileText);
        printLimits(limits, finalFileText);
        printSQOLInfoSection(soqlInfoSection, finalFileText);
        printErrorSection(errorsSection, finalFileText);
        printMainSection(mainLogSection, finalFileText, showLineNumbers);

        // Insert in the new document
        wsEdit.insert(newFileUri, new vscode.Position(1, 1), finalFileText.text);
        vscode.workspace.applyEdit(wsEdit).then(() => {
            vscode.workspace.openTextDocument(newFileUri);
            vscode.window.showInformationMessage('Log successfully analyzed!');
        });
    });
}

function handeShowDMLSetting(showDML: boolean) {
    let dmlLTI: LogTypeInfo = LOG_OBJECTS.get(LogType.dmlBegin)!;
    if(showDML) {
        dmlLTI.soqlAnalyzer = true;
        LOG_OBJECTS.set(LogType.dmlBegin, dmlLTI);
    } else {
        dmlLTI.soqlAnalyzer = false;
        LOG_OBJECTS.set(LogType.dmlBegin, dmlLTI);
    }
}

function populateIgnorableClasses(ignorableClassesString: string) {
    ignorableClasses = new Set<string>();
    if(ignorableClassesString.length === 0) {
        return;
    }
    for (const className of ignorableClassesString.split(',')) {
        let trimmed = className.trim();
        if(trimmed.length === 0) {
            continue;
        }
        ignorableClasses.add(trimmed);
    }
}

function formatLine(line: string, i: number) : LogLine | null {
    for (const logType of LOG_OBJECTS.keys()) {
        let logInfoObject = LOG_OBJECTS.get(logType);
        if(!logInfoObject || !logInfoObject.soqlAnalyzer || line.search(logInfoObject.hook) === -1) {
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

function handleMethods(line: LogLine, mainLogSection: LogLine[], previousLine: TypeWrap, lastMethod: Method, mapOfMethodNameToObject: Map<string, Method>): boolean {
    if (line.type === LogType.methodEntry || line.type === LogType.methodExit) {
        if (ignorableClasses.size > 0 && ignorableClasses.has(line.text.replace(/\w+:\s+(\w+)\.*.*/i, '$1'))) {
            return true;
        }
        previousLine.type = LogType.methodEntry;
        mainLogSection.push(line);
        if (line.type === LogType.methodEntry) {
            if (mapOfMethodNameToObject.has(line.text)) {
                lastMethod.name = mapOfMethodNameToObject.get(line.text)!.name;
                lastMethod.numberOfQueries = mapOfMethodNameToObject.get(line.text)!.numberOfQueries;
                lastMethod.triggers = mapOfMethodNameToObject.get(line.text)!.triggers;
            } else {
                lastMethod.name = line.text;
                lastMethod.numberOfQueries = 0;
                lastMethod.triggers = new Map<string, number>();
                mapOfMethodNameToObject.set(lastMethod.name, { name: lastMethod.name, numberOfQueries: lastMethod.numberOfQueries, triggers: lastMethod.triggers });
            }
        }
        return true;
    }
    return false;
}

function handleSOQL(line: LogLine, mainLogSection: LogLine[], previousLine: TypeWrap, lastMethod: Method, mapOfMethodNameToObject: Map<string, Method>, lastTrigger: TextWrap): boolean {
    if (line.type === LogType.soqlExecuteBegin) {
        mainLogSection.push(line);
        if (lastMethod.name === 'null') {
            previousLine.type = LogType.soqlExecuteBegin;
            return true;
        }
        if (mapOfMethodNameToObject.has(lastMethod.name)) {
            if (previousLine.type !== LogType.managedPKG) {
                mapOfMethodNameToObject.set(lastMethod.name, { name: lastMethod.name, numberOfQueries: lastMethod.numberOfQueries + 1, triggers: lastMethod.triggers });
                let currentSOQLCountForTrigger = mapOfMethodNameToObject.get(lastMethod.name)!.triggers.get(lastTrigger.text);
                if (!currentSOQLCountForTrigger) {
                    mapOfMethodNameToObject.get(lastMethod.name)!.triggers.set(lastTrigger.text, 1);
                } else {
                    mapOfMethodNameToObject.get(lastMethod.name)!.triggers.set(lastTrigger.text, currentSOQLCountForTrigger + 1);
                }
            }
        }
        previousLine.type = LogType.soqlExecuteBegin;
        return true;
    }
    return false;
}

function handleTriggers(line: LogLine, mainLogSection: LogLine[], previousLine: TypeWrap, lastTrigger: TextWrap): boolean {
    if (line.type === LogType.triggerStarted) {
        mainLogSection.push(line);
        lastTrigger.text = line.text.replace(/TRIGGER_STARTED:\s+(.+)/i, '$1');
        previousLine.type = LogType.triggerStarted;
        return true;
    } else if(line.type === LogType.triggerFinished) {
        mainLogSection.push(line);
        previousLine.type = LogType.triggerFinished;
        return true;
    }
    return false;
}

function handleFlows(line: LogLine, mainLogSection: LogLine[], previousLine: TypeWrap): boolean {
    if(line.type === LogType.flowStart) {
        mainLogSection.push(line);
        previousLine.type = LogType.flowStart;
        return true;
    }
    return false;
}

function handleDebug(line: LogLine, mainLogSection: LogLine[], previousLine: TypeWrap): boolean {
    if (line.type === LogType.userDebug) {
        mainLogSection.push(line);
        previousLine.type = LogType.userDebug;
        return true;
    }
    return false;
}

function handleErrors(line: LogLine, mainLogSection: LogLine[], previousLine: TypeWrap, errorsSection: string[]): boolean {
    if (line.type === LogType.fatalError) {
        mainLogSection.push(line);
        if(errorsSection.length === 0) {
            errorsSection.push('Errors:');
        }
        errorsSection.push(line.text);
        previousLine.type = LogType.fatalError;
        return true;
    }
    return false;
}

function handleManagedPKG(line: LogLine, mainLogSection: LogLine[], previousLine: TypeWrap): boolean {
    if(line.type === LogType.managedPKG) {
        if(previousLine.type !== LogType.managedPKG) {
            mainLogSection.push(line);
        }
        previousLine.type = LogType.managedPKG;
        return true;
    }
    return false;
}

function handleLimits(line: LogLine, limits: Map<LogType, string>, correctLimitsInfoStarted: BooleanWrap): boolean {
    if (line.text.search(LOG_OBJECTS.get(LogType.limitStart)!.hook) !== -1) {
        correctLimitsInfoStarted.is = true;
        return true;
    } else if (line.text.startsWith(LOG_OBJECTS.get(LogType.limitEnd)!.hook)) {
        correctLimitsInfoStarted.is = false;
        return true;
    }
    if (correctLimitsInfoStarted.is === true) {
        populateLimitsInfo(line.text, limits);
        return true;
    }
    return false;
}

function handleSOQLInfoSection(soqlInfoSection: string[], mapOfMethodNameToObject: Map<string, Method>): void {
    soqlInfoSection.push('Methods SOQL usage info:');
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
        
        let totalSOQLQueries = 0;
        for (const method of listOfMethods) {
            // Flatten method.triggers map
            let triggersString: string = '(';
            for(const t of method.triggers.keys()) {
                triggersString += t + ': ' + method.triggers.get(t) + ', ';
            }
            triggersString = triggersString.substr(0, triggersString.length - 2);
            triggersString += ')';
            soqlInfoSection.push(method.numberOfQueries + ' - ' + method.name.replace(/ENTER:\s+(.+)/i, '$1') + ' - ' + triggersString);
            totalSOQLQueries += method.numberOfQueries;
        }
        soqlInfoSection.push(totalSOQLQueries + ' - Total SOQL Queries from Apex Methods');
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

function printMainSection(sectionArray: LogLine[], finalFileText: TextWrap, showLineNumbers: boolean) : void {
    if(sectionArray.length === 0) {
        return;
    }
    for (const e of sectionArray) {
        let lineNumber = '';
        if(showLineNumbers) {
            lineNumber = ' :' + e.lineNumber;
        }
        finalFileText.text += e.text + lineNumber + '\n';
    }
    finalFileText.text += '\n';
}

function printSQOLInfoSection(soqlInfoSection: string[], finalFileText: TextWrap) : void {
    if(soqlInfoSection.length === 0) {
        return;
    }
    for (const e of soqlInfoSection) {
        finalFileText.text += e + '\n';
    }
    finalFileText.text += '\n';
}

function printErrorSection(errorsSection: string[], finalFileText: TextWrap) : void {
    if(errorsSection.length === 0) {
        return;
    }
    for (const e of errorsSection) {
        finalFileText.text += e + '\n';
    }
    finalFileText.text += '\n';
}

function printLimits(limits: Map<LogType,string>, finalFileText: TextWrap) : void {
    finalFileText.text += 'Limits:\n';
    finalFileText.text += limits.get(LogType.limitSOQL)!.trim() + '\n';
    finalFileText.text += limits.get(LogType.limitSOQLRows)!.trim() + '\n';
    finalFileText.text += limits.get(LogType.limitDML)!.trim() + '\n';
    finalFileText.text += limits.get(LogType.limitDMLRows)!.trim() + '\n';
    finalFileText.text += limits.get(LogType.limitCPU)!.trim() + '\n';
    finalFileText.text += '\n';
}

function printMarkers(finalFileText: TextWrap) : void {
    finalFileText.text += 'Avaliable markers:\n';
    for (const logObject of LOG_OBJECTS.values()) {
        if(logObject.soqlAnalyzer && logObject.marker) {
            finalFileText.text += '- ' + logObject.marker + '\n';
        }
    }
    finalFileText.text += '\n';
}
function handleDML(line: LogLine, mainLogSection: LogLine[], showDML: boolean): boolean {
    if(!showDML) {
        return false;
    }
    if(line.type !== LogType.dmlBegin) {
        return false;
    }
    mainLogSection.push(line);
    return true;
}

