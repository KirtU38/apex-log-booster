type Log = {
    hook: string,
    matcher: RegExp,
    replacer: string,
    orderAnalyzer: boolean,
    soqlAnalyzer: boolean
};

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
};

export const LOG_OBJECTS = new Map<LogType, Log>([
    [LogType.triggerStarted,   {hook: 'trigger event',            matcher: /.+CODE_UNIT_STARTED.+trigger event (.+)\|.+\/(\w+)/i,  replacer: 'TRIGGER STARTED:  $2 $1',    orderAnalyzer: true,  soqlAnalyzer: true }],
    [LogType.triggerFinished,  {hook: 'trigger event',            matcher: /.+CODE_UNIT_FINISHED.+trigger event (.+)\|.+\/(\w+)/i, replacer: 'TRIGGER FINISHED: $2 $1',    orderAnalyzer: true,  soqlAnalyzer: true }],
    [LogType.validationRule,   {hook: 'VALIDATION_RULE',          matcher: /.+VALIDATION_RULE\|\w+\|(\w+)/i,                       replacer: 'VALIDATION RULE:  $1',       orderAnalyzer: true,  soqlAnalyzer: false}],
    [LogType.validationPass,   {hook: 'VALIDATION_PASS',          matcher: /.+VALIDATION_PASS/i,                                   replacer: 'VALIDATION PASSED',          orderAnalyzer: true,  soqlAnalyzer: false}],
    [LogType.validationFail,   {hook: 'VALIDATION_FAIL',          matcher: /.+VALIDATION_PASS.*/i,                                 replacer: 'VALIDATION FAILED',          orderAnalyzer: true,  soqlAnalyzer: false}],
    [LogType.wfCriteriaBegin,  {hook: 'WF_CRITERIA_BEGIN',        matcher: /.+WF_CRITERIA_BEGIN\|\[.+\]\|(.+)\|.+\|.+\|.+/i,       replacer: 'WORKFLOW RULE:    $1',       orderAnalyzer: true,  soqlAnalyzer: false}],
    [LogType.wfCriteriaEnd,    {hook: 'WF_CRITERIA_END',          matcher: /.+WF_CRITERIA_END\|(\w+)/i,                            replacer: 'WORKFLOW PASSED:  $1',       orderAnalyzer: true,  soqlAnalyzer: false}],
    [LogType.wfFieldUpdate,    {hook: 'WF_FIELD_UPDATE',          matcher: /.+WF_FIELD_UPDATE\|(.+)/i,                             replacer: 'WORKFLOW UPDATE:  $1',       orderAnalyzer: true,  soqlAnalyzer: false}],
    [LogType.flowStart,        {hook: 'FLOW_START_INTERVIEW_END', matcher: /.+FLOW_START_INTERVIEW_END\|.+\|(.+)/i,                replacer: 'FLOW START:       $1',       orderAnalyzer: true,  soqlAnalyzer: false}],
    [LogType.userDebug,        {hook: 'USER_DEBUG',               matcher: /.+USER_DEBUG.+\|DEBUG\|(.*)/i,                         replacer: 'DEBUG: $1',                  orderAnalyzer: true,  soqlAnalyzer: true }],
    [LogType.dmlBegin,         {hook: 'DML_BEGIN',                matcher: /.+DML_BEGIN.+Op:(\w+)\|Type:(\w+)\|(Rows:\w+)/i,       replacer: 'DML:   $1 $2 $3',            orderAnalyzer: true,  soqlAnalyzer: false}],
    [LogType.fatalError,       {hook: '\\|FATAL_ERROR',           matcher: /.+FATAL_ERROR\|(.+)/i,                                 replacer: 'ERROR: $1',                  orderAnalyzer: true,  soqlAnalyzer: true }],
    [LogType.methodEntry,      {hook: 'METHOD_ENTRY',             matcher: /.+METHOD_ENTRY\|.+\|(.+)/i,                            replacer: 'ENTER: $1',                  orderAnalyzer: false, soqlAnalyzer: true }],
    [LogType.methodExit,       {hook: 'METHOD_EXIT',              matcher: /.+METHOD_EXIT\|.+\|.+\|(.+)/i,                         replacer: 'EXIT:  $1',                  orderAnalyzer: false, soqlAnalyzer: true }],
    [LogType.soqlExecuteBegin, {hook: 'SOQL_EXECUTE_BEGIN',       matcher: /.+SOQL_EXECUTE_BEGIN\|.+\|(.+)/i,                      replacer: 'SOQL:  $1',                  orderAnalyzer: false, soqlAnalyzer: true }],
]);