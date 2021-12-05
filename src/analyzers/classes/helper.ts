export enum LogType {
    triggerStarted,
    triggerFinished,
    validationRule,
    validationPass,
    validationFail,
    wfCriteriaBegin,
    wfCriteriaEnd,
    wfFieldUpdate,
    flowStart,
    userDebug,
    dmlBegin,
    fatalError,
    methodEntry,
    methodExit,
    soqlExecuteBegin,
    limitStart,
    limitSOQL,
    limitSOQLRows,
    limitDML,
    limitDMLRows,
    limitCPU,
    limitEnd,
    managedPKG,
    any
};

type LogTypeInfo = {
    hook: string,
    marker: string
    matcher: RegExp,
    replacer: string,
    orderAnalyzer: boolean,
    soqlAnalyzer: boolean
};
export type LogLine = {
    type: LogType,
    text: string,
    lineNumber: number
};
export type Method = {
    name: string, 
    numberOfQueries: number, 
    triggers: Map<string, number>
};
export type TextWrap = {
    text: string
};
export type TypeWrap = {
    type: LogType
};
export type BooleanWrap = {
    is: boolean
};

const LOG_MARKERS: Map<LogType, string> = new Map<LogType, string>([
    [LogType.triggerStarted,   'TRIGGER_STARTED'],
    [LogType.triggerFinished,  'TRIGGER_FINISHED'],
    [LogType.validationRule,   'VALIDATION_RULE'],
    [LogType.validationPass,   'VALIDATION_PASSED'],
    [LogType.validationFail,   'VALIDATION_FAILED'],
    [LogType.wfCriteriaBegin,  'WORKFLOW_RULE'],
    [LogType.wfCriteriaEnd,    'WORKFLOW_PASSED'],
    [LogType.wfFieldUpdate,    'WORKFLOW_UPDATE'],
    [LogType.flowStart,        'FLOW_START'],
    [LogType.userDebug,        'DEBUG'],
    [LogType.dmlBegin,         'DML'],
    [LogType.fatalError,       'ERROR'],
    [LogType.methodEntry,      'ENTER'],
    [LogType.methodExit,       'EXIT'],
    [LogType.soqlExecuteBegin, 'SOQL'],
    [LogType.managedPKG,       'MANAGED_PKG'],
]);

export const LOG_OBJECTS: Map<LogType, LogTypeInfo> = new Map<LogType, LogTypeInfo>([
    [LogType.triggerStarted,   {hook: 'trigger event',            marker: LOG_MARKERS.get(LogType.triggerStarted)!,   matcher: /.+CODE_UNIT_STARTED.+trigger event (.+)\|.+\/(\w+)/i,  replacer: LOG_MARKERS.get(LogType.triggerStarted) + ':  $2 $1', orderAnalyzer: true,  soqlAnalyzer: true }],
    [LogType.triggerFinished,  {hook: 'trigger event',            marker: LOG_MARKERS.get(LogType.triggerFinished)!,  matcher: /.+CODE_UNIT_FINISHED.+trigger event (.+)\|.+\/(\w+)/i, replacer: LOG_MARKERS.get(LogType.triggerFinished) + ': $2 $1', orderAnalyzer: true,  soqlAnalyzer: true }],
    [LogType.validationRule,   {hook: 'VALIDATION_RULE',          marker: LOG_MARKERS.get(LogType.validationRule)!,   matcher: /.+VALIDATION_RULE\|\w+\|(\w+)/i,                       replacer: LOG_MARKERS.get(LogType.validationRule) + ':  $1',    orderAnalyzer: true,  soqlAnalyzer: false}],
    [LogType.validationPass,   {hook: 'VALIDATION_PASS',          marker: LOG_MARKERS.get(LogType.validationPass)!,   matcher: /.+VALIDATION_PASS/i,                                   replacer: LOG_MARKERS.get(LogType.validationPass)!,             orderAnalyzer: true,  soqlAnalyzer: false}],
    [LogType.validationFail,   {hook: 'VALIDATION_FAIL',          marker: LOG_MARKERS.get(LogType.validationFail)!,   matcher: /.+VALIDATION_PASS.*/i,                                 replacer: LOG_MARKERS.get(LogType.validationFail)!,             orderAnalyzer: true,  soqlAnalyzer: false}],
    [LogType.wfCriteriaBegin,  {hook: 'WF_CRITERIA_BEGIN',        marker: LOG_MARKERS.get(LogType.wfCriteriaBegin)!,  matcher: /.+WF_CRITERIA_BEGIN\|\[.+\]\|(.+)\|.+\|.+\|.+/i,       replacer: LOG_MARKERS.get(LogType.wfCriteriaBegin) + ':    $1', orderAnalyzer: true,  soqlAnalyzer: false}],
    [LogType.wfCriteriaEnd,    {hook: 'WF_CRITERIA_END',          marker: LOG_MARKERS.get(LogType.wfCriteriaEnd)!,    matcher: /.+WF_CRITERIA_END\|(\w+)/i,                            replacer: LOG_MARKERS.get(LogType.wfCriteriaEnd) + ':  $1',     orderAnalyzer: true,  soqlAnalyzer: false}],
    [LogType.wfFieldUpdate,    {hook: 'WF_FIELD_UPDATE',          marker: LOG_MARKERS.get(LogType.wfFieldUpdate)!,    matcher: /.+WF_FIELD_UPDATE\|(.+)/i,                             replacer: LOG_MARKERS.get(LogType.wfFieldUpdate) + ':  $1',     orderAnalyzer: true,  soqlAnalyzer: false}],
    [LogType.flowStart,        {hook: 'FLOW_START_INTERVIEW_END', marker: LOG_MARKERS.get(LogType.flowStart)!,        matcher: /.+FLOW_START_INTERVIEW_END\|.+\|(.+)/i,                replacer: LOG_MARKERS.get(LogType.flowStart) + ':       $1',    orderAnalyzer: true,  soqlAnalyzer: true }],
    [LogType.userDebug,        {hook: 'USER_DEBUG',               marker: LOG_MARKERS.get(LogType.userDebug)!,        matcher: /.+USER_DEBUG.+\|DEBUG\|(.*)/i,                         replacer: LOG_MARKERS.get(LogType.userDebug) + ': $1',          orderAnalyzer: true,  soqlAnalyzer: true }],
    [LogType.dmlBegin,         {hook: 'DML_BEGIN',                marker: LOG_MARKERS.get(LogType.dmlBegin)!,         matcher: /.+DML_BEGIN.+Op:(\w+)\|Type:(\w+)\|(Rows:\w+)/i,       replacer: LOG_MARKERS.get(LogType.dmlBegin) + ':   $1 $2 $3',   orderAnalyzer: true,  soqlAnalyzer: false}],
    [LogType.fatalError,       {hook: '\\|FATAL_ERROR',           marker: LOG_MARKERS.get(LogType.fatalError)!,       matcher: /.+FATAL_ERROR\|(.+)/i,                                 replacer: LOG_MARKERS.get(LogType.fatalError) + ': $1',         orderAnalyzer: true,  soqlAnalyzer: true }],
    [LogType.methodEntry,      {hook: 'METHOD_ENTRY',             marker: LOG_MARKERS.get(LogType.methodEntry)!,      matcher: /.+METHOD_ENTRY\|.+\|(.+)/i,                            replacer: LOG_MARKERS.get(LogType.methodEntry) + ': $1',        orderAnalyzer: false, soqlAnalyzer: true }],
    [LogType.methodExit,       {hook: '\\|METHOD_EXIT',           marker: LOG_MARKERS.get(LogType.methodExit)!,       matcher: /.+\|method_exit\|\[\d+\]\|*\w*\|(.+)/i,                replacer: LOG_MARKERS.get(LogType.methodExit) + ':  $1',        orderAnalyzer: false, soqlAnalyzer: true }],
    [LogType.soqlExecuteBegin, {hook: 'SOQL_EXECUTE_BEGIN',       marker: LOG_MARKERS.get(LogType.soqlExecuteBegin)!, matcher: /.+SOQL_EXECUTE_BEGIN\|.+\|(.+)/i,                      replacer: LOG_MARKERS.get(LogType.soqlExecuteBegin) + ':  $1',  orderAnalyzer: false, soqlAnalyzer: true }],
    // Limits info
    [LogType.limitStart,    {hook: 'LIMIT_USAGE_FOR_NS\\|\\(default\\)\\|', marker: '', matcher: /(.*)/, replacer: '$1', orderAnalyzer: false, soqlAnalyzer: true }],
    [LogType.limitEnd,      {hook: '  Number of Mobile Apex push calls:',   marker: '', matcher: /(.*)/, replacer: '$1', orderAnalyzer: false, soqlAnalyzer: true }],
    [LogType.limitSOQL,     {hook: '  Number of SOQL queries:',             marker: '', matcher: /(.*)/, replacer: '$1', orderAnalyzer: false, soqlAnalyzer: true }],
    [LogType.limitSOQLRows, {hook: '  Number of query rows:',               marker: '', matcher: /(.*)/, replacer: '$1', orderAnalyzer: false, soqlAnalyzer: true }],
    [LogType.limitDML,      {hook: '  Number of DML statements:',           marker: '', matcher: /(.*)/, replacer: '$1', orderAnalyzer: false, soqlAnalyzer: true }],
    [LogType.limitDMLRows,  {hook: '  Number of DML rows:',                 marker: '', matcher: /(.*)/, replacer: '$1', orderAnalyzer: false, soqlAnalyzer: true }],
    [LogType.limitCPU,      {hook: '  Maximum CPU time:',                   marker: '', matcher: /(.*)/, replacer: '$1', orderAnalyzer: false, soqlAnalyzer: true }],
    // To exclude SOQL from managed PKG from Methods SOQL count
    [LogType.managedPKG,    {hook: 'ENTERING_MANAGED_PKG', marker: LOG_MARKERS.get(LogType.managedPKG)!, matcher: /.+\|ENTERING_(MANAGED_PKG\|.+)/i, replacer: '$1', orderAnalyzer: false, soqlAnalyzer: true }],
]);
