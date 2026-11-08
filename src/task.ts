
import "./variable.js";

import { PetSymbol, symbols, spinCountSymbol } from "./symbol.js";
import { KnownValue, wrapKnownValue, PetValue, toPetValue, toKnownValue, toPetList, nullValue, PetString, PetList, PetMap, MemberObserver, ObservableBunch, PetFunc, UserFunc, EvalState, valueMayHaveChanged } from "./value.js";
import { NotEqualFunc } from "./builtInFunc.js";
import { getMethodWithDefault } from "./method.js";
import { createAwaitExcep, createSpinExcep, createErrorExcep, PetSyntaxError, ValueError, StateError, createSyntaxError, getDefaultExcepReport } from "./exception.js";
import { workerIsInvocation, getWorkerMethodMap, getFuncArgsComp, getStmtsComp, getLabeledAttrComps } from "./node.js";
import { createFrame, VarSpaceType, getVarSpaceType, getVariable, findVarValue, getVarValue, getScope } from "./variable.js";
import { Spinner } from "./scheduler.js";
import { PetContext } from "./context.js";

export interface Action {
    task: Task | null;
    run: () => Action;
}

export type Stage<ParamsT, StateT> = (task: Task<ParamsT, StateT>) => Action;

export interface TaskDef<ParamsT, StateT> {
    getInitState: (params: ParamsT) => StateT;
    getNodes?: (params: ParamsT) => { taskNode?: PetMap, callerNode?: PetMap };
    stages: Stage<ParamsT, StateT>[];
}

export interface TaskMembers<ParamsT, StateT> {
    parentTask: Task | null;
    stages: Stage<ParamsT, StateT>[];
    acceptReturnValue: (value: PetValue) => Action;
    handleException: (exception: PetValue) => Action;
    taskNode?: PetMap;
    callerNode?: PetMap;
}

interface MethodInvocation {
    worker: PetMap;
    key: KnownValue;
    args: PetValue[];
}

export const createMethodInvocation = (
    worker: PetMap,
    key: PetSymbol | PetValue,
    args: (KnownValue | PetValue)[],
): MethodInvocation => ({
    worker,
    key: toKnownValue(key),
    args: args.map((arg) => toPetValue(arg)),
});

export class Task<ParamsT = any, StateT = any> {
    context: PetContext;
    members: TaskMembers<ParamsT, StateT>;
    params: ParamsT;
    state: StateT;
    stageIndex: number;
    
    constructor(
        context: PetContext,
        members: TaskMembers<ParamsT, StateT>,
        params: ParamsT,
        state: StateT,
        stageIndex: number,
    ) {
        this.context = context;
        this.members = members;
        this.params = params;
        this.state = state;
        this.stageIndex = stageIndex;
    }
    
    getStageAction(): Action {
        const stage = this.members.stages[this.stageIndex];
        return {
            task: this,
            run: () => stage(this),
        };
    }
    
    advanceStage(nextState: StateT): Action {
        const nextStageIndex = this.stageIndex + 1;
        if (nextStageIndex > this.members.stages.length) {
            throw new Error("Cannot advance past final stage.");
        }
        const task = new Task(
            this.context,
            this.members,
            this.params,
            nextState,
            nextStageIndex,
        );
        return task.getStageAction();
    }
    
    repeatStage(nextState: StateT): Action {
        const task = new Task(
            this.context,
            this.members,
            this.params,
            nextState,
            this.stageIndex,
        );
        return task.getStageAction();
    }
    
    returnValue(value: KnownValue | PetValue): Action {
        return {
            task: this.members.parentTask,
            run: () => this.members.acceptReturnValue(toPetValue(value)),
        };
    }
    
    // `exception` must be populated with evaluation state.
    throwException(exception: PetMap | PetValue): Action {
        return {
            task: this.members.parentTask,
            run: () => this.members.handleException(toPetValue(exception)),
        };
    }
    
    runTask<T1, T2>(
        taskDef: TaskDef<T1, T2>,
        params: T1,
        acceptReturnValue: (value: PetValue) => Action,
        handleException?: (exception: PetValue) => Action,
    ): Action {
        if (typeof handleException === "undefined") {
            handleException = (exception) => this.throwException(exception);
        }
        return this.context.startTask(
            taskDef, params, this,
            acceptReturnValue, handleException,
        );
    }
    
    spin(
        condition: PetFunc,
        message: PetString,
        nextAction: Action,
        workerNode?: PetMap,
    ): Action {
        const evalState = new EvalState(this, nextAction);
        const exception = createSpinExcep(condition, message, evalState, workerNode);
        const spinner = new Spinner(exception);
        return this.runTask(
            spinCondTask, { spinner },
            (value) => nextAction,
        );
    }
    
    awaitMember(
        bunch: ObservableBunch,
        location: KnownValue | PetValue,
        condition: PetFunc,
        message: string | PetString | null,
        nextAction: Action,
        workerNode?: PetMap,
    ): Action {
        const exception = createAwaitExcep(
            bunch,
            toKnownValue(location),
            condition,
            (typeof message === "string") ? new PetString(message) : message,
            new EvalState(this, nextAction),
            workerNode,
        );
        const observer = new MemberObserver(exception);
        return this.runTask(
            awaitCondTask, { observer },
            (value) => nextAction,
        );
    }
    
    awaitPhase(worker: PetMap, nextAction: Action): Action {
        return this.awaitMember(
            worker,
            symbols.PHASE,
            new NotEqualFunc(symbols.PREP_PHASE),
            null,
            nextAction,
        );
    }
    
    callFunction(
        func: PetFunc,
        args: (KnownValue | PetValue)[] | PetList,
        acceptReturnValue: (value: PetValue) => Action,
        options: {
            callerNode?: PetMap,
            handleException?: (exception: PetValue) => Action,
        } = {},
    ): Action {
        return this.runTask(
            callFuncTask, { func, args: toPetList(args), callerNode: options.callerNode },
            acceptReturnValue,
            options.handleException,
        );
    }
    
    callMethod(
        worker: PetMap,
        key: PetSymbol | PetValue,
        args: (KnownValue | PetValue)[],
        acceptReturnValue: (value: PetValue) => Action,
        handleException?: (exception: PetValue) => Action,
    ): Action {
        const invocation = createMethodInvocation(worker, key, args);
        return this.runTask(callMethodTask, invocation, acceptReturnValue, handleException);
    }
    
    scheduleMethod(
        worker: PetMap,
        key: PetSymbol | PetValue,
        args: (KnownValue | PetValue)[],
    ): void {
        const invocation = createMethodInvocation(worker, key, args);
        this.context.scheduler.scheduleTask(callMethodTask, invocation);
    }
    
    handleRetExcep(excepValue: PetValue): Action {
        const exception = excepValue.getMap();
        const excepType = exception.getMember(symbols.EXCEP_TYPE).getSymbol();
        if (excepType === symbols.RET_EXCEP) {
            const retLevel = exception.getMember(symbols.RET_LEVEL).getInt();
            if (retLevel <= 0n) {
                const value = exception.getMember(symbols.VALUE);
                return this.returnValue(value);
            } else {
                const excepCopy = exception.shallowCopy();
                excepCopy.setMember(symbols.RET_LEVEL, retLevel - 1n);
                return this.throwException(excepCopy);
            }
        }
        return this.throwException(exception);
    }
}

export const mainTask: TaskDef<null, { moduleIndex: number }> = {
    getInitState: (params) => ({ moduleIndex: 0 }),
    stages: [
        (task) => {
            const { moduleIndex } = task.state;
            const { userModules } = task.context;
            if (moduleIndex < userModules.length) {
                const module = userModules[moduleIndex];
                const stmtsComp = module.getMember(symbols.STMTS_COMP).getMap();
                return task.awaitPhase(
                    stmtsComp,
                    task.repeatStage({ moduleIndex: moduleIndex + 1 }),
                );
            } else {
                task.context.isPrepping = false;
                const globalFrame = createFrame(task.context.globalScope, null);
                for (const module of userModules) {
                    const scope = module.getMember(symbols.SCOPE).getMap();
                    const frame = createFrame(scope, globalFrame);
                    module.setMember(symbols.FRAME, frame);
                }
                return task.advanceStage({ moduleIndex: userModules.length - 1 });
            }
        },
        (task) => {
            const { moduleIndex } = task.state;
            if (moduleIndex >= 0) {
                const module = task.context.userModules[moduleIndex];
                const stmtsComp = module.getMember(symbols.STMTS_COMP).getMap();
                const scope = module.getMember(symbols.SCOPE).getMap();
                const parentScope = scope.getMember(symbols.PARENT);
                return task.callMethod(
                    stmtsComp, symbols.EVAL, [parentScope],
                    (value) => task.repeatStage({ moduleIndex: moduleIndex - 1 }),
                );
            } else {
                return task.returnValue(null);
            }
        },
    ],
};

export const prepModuleTask: TaskDef<{ module: PetMap }, null> = {
    getInitState: (params) => null,
    stages: [
        (task) => {
            const { module } = task.params;
            const stmtsComp = module.getMember(symbols.STMTS_COMP).getMap();
            const attrs = stmtsComp.getMember(symbols.ATTRS).getList();
            const attrComps = getLabeledAttrComps(attrs, "INIT");
            if (typeof attrComps !== "undefined") {
                const initStmtsComp = getStmtsComp(attrComps, 1);
                const scope = initStmtsComp.getMember(symbols.SCOPE).getMap();
                const moduleScope = module.getMember(symbols.SCOPE).getMap();
                const parentScope = moduleScope.getMember(symbols.PARENT).getMap();
                scope.setMember(symbols.PARENT, parentScope);
                return task.callMethod(
                    initStmtsComp, symbols.EVAL, [parentScope],
                    (value) => task.advanceStage(null),
                );
            }
            return task.advanceStage(null);
        },
        (task) => {
            const { module } = task.params;
            const stmtsComp = module.getMember(symbols.STMTS_COMP).getMap();
            return task.callMethod(
                stmtsComp, symbols.PREP, [],
                (value) => task.returnValue(null),
            );
        },
    ],
};

export const prepStmtsTask: TaskDef<{ stmtsComp: PetMap }, { stmtIndex: number }> = {
    getInitState: (params) => ({ stmtIndex: 0 }),
    stages: [
        (task) => {
            const stmts = task.params.stmtsComp.getMember(symbols.STMTS).getList();
            for (let index = 0; index < stmts.getLength(); index++) {
                const stmt = stmts.getMember(index).getMap();
                task.scheduleMethod(stmt, symbols.PREP, []);
            }
            return task.advanceStage({ stmtIndex: 0 });
        },
        (task) => {
            const { stmtsComp } = task.params;
            const { stmtIndex } = task.state;
            const stmts = stmtsComp.getMember(symbols.STMTS).getList();
            if (stmtIndex < stmts.getLength()) {
                const stmt = stmts.getMember(stmtIndex).getMap();
                return task.awaitPhase(
                    stmt,
                    task.repeatStage({ stmtIndex: stmtIndex + 1 }),
                );
            } else {
                return task.returnValue(null);
            }
        },
    ],
};

export const prepExprsTask: TaskDef<{ exprsComp: PetMap }, { exprIndex: number }> = {
    getInitState: (params) => ({ exprIndex: 0 }),
    stages: [
        (task) => {
            const exprs = task.params.exprsComp.getMember(symbols.EXPRS).getList();
            for (let index = 0; index < exprs.getLength(); index++) {
                const expr = exprs.getMember(index).getMap();
                task.scheduleMethod(expr, symbols.PREP, []);
            }
            return task.advanceStage({ exprIndex: 0 });
        },
        (task) => {
            const { exprsComp } = task.params;
            const { exprIndex } = task.state;
            const exprs = exprsComp.getMember(symbols.EXPRS).getList();
            if (exprIndex < exprs.getLength()) {
                const expr = exprs.getMember(exprIndex).getMap();
                return task.awaitPhase(
                    expr,
                    task.repeatStage({ exprIndex: exprIndex + 1 }),
                );
            } else {
                return task.returnValue(null);
            }
        },
    ],
};

export const prepWorkersTask: TaskDef<{ workers: PetMap[] }, { workerIndex: number }> = {
    getInitState: (params) => ({ workerIndex: 0 }),
    stages: [
        (task) => {
            for (const worker of task.params.workers) {
                task.scheduleMethod(worker, symbols.PREP, []);
            }
            return task.advanceStage({ workerIndex: 0 });
        },
        (task) => {
            const { workers } = task.params;
            const { workerIndex } = task.state;
            if (workerIndex < workers.length) {
                const worker = workers[workerIndex];
                return task.awaitPhase(
                    worker,
                    task.repeatStage({ workerIndex: workerIndex + 1 }),
                );
            } else {
                return task.returnValue(null);
            }
        },
    ],
};

interface WorkersVarsParams {
    workers: PetMap[];
    scope: PetMap;
}

interface WorkersVarsState {
    workerIndex: number;
    varMap: PetMap;
}

export const workersVarsTask: TaskDef<WorkersVarsParams, WorkersVarsState> = {
    getInitState: (params) => ({ workerIndex: 0, varMap: new PetMap() }),
    stages: [
        (task) => {
            const { workers, scope } = task.params;
            const { workerIndex, varMap } = task.state;
            if (workerIndex >= workers.length) {
                return task.returnValue(varMap);
            }
            const worker = workers[workerIndex];
            return task.callMethod(
                worker, symbols.ACCESSED_VARS, [scope],
                (resultValue) => {
                    const resultMap = resultValue.getMap();
                    const names = resultMap.getKeys();
                    let nextVarMap: PetMap;
                    if (names.length > 0) {
                        nextVarMap = varMap.shallowCopy();
                        for (const name of names) {
                            const variable = resultMap.getMember(name);
                            nextVarMap.setMember(name, variable);
                        }
                    } else {
                        nextVarMap = varMap;
                    }
                    return task.repeatStage({
                        workerIndex: workerIndex + 1,
                        varMap: nextVarMap,
                    });
                },
            );
        },
    ],
};

interface EvalStmtsParams {
    stmtsComp: PetMap;
    varSpace: PetMap;
}

interface EvalStmtsState {
    stmtIndex: number;
    frame: PetMap | null;
}

export const evalStmtsTask: TaskDef<EvalStmtsParams, EvalStmtsState> = {
    getInitState: (params) => ({ stmtIndex: 0, frame: null }),
    stages: [
        (task) => {
            const { stmtsComp, varSpace } = task.params;
            const scope = stmtsComp.getMember(symbols.SCOPE).getMap();
            const parent = stmtsComp.getMember(symbols.PARENT).getMap();
            const moduleType = parent.getOptionalMember(symbols.MODULE_TYPE);
            let frame: PetMap;
            if (typeof moduleType === "undefined") {
                const varSpaceType = getVarSpaceType(varSpace);
                if (varSpaceType === VarSpaceType.Frame) {
                    const frameScope = varSpace.getMember(symbols.SCOPE).getMap();
                    if (frameScope === scope) {
                        frame = varSpace;
                    } else {
                        frame = createFrame(scope, varSpace);
                    }
                } else {
                    frame = createFrame(scope, null);
                }
            } else {
                frame = parent.getMember(symbols.FRAME).getMap();
            }
            return task.advanceStage({ stmtIndex: 0, frame });
        },
        (task) => {
            const stmts = task.params.stmtsComp.getMember(symbols.STMTS).getList();
            const { stmtIndex, frame } = task.state;
            if (stmtIndex < stmts.getLength()) {
                const stmt = stmts.getMember(stmtIndex).getMap();
                return task.callMethod(
                    stmt, symbols.EVAL, [frame],
                    (value) => task.repeatStage({ stmtIndex: stmtIndex + 1, frame }),
                );
            } else {
                return task.returnValue(null);
            }
        },
    ],
};

export interface AccumulatorNode<T> {
    element: T;
    previousNode?: AccumulatorNode<T>;
}

export const getAccumulatorElements = <T>(lastNode?: AccumulatorNode<T>): T[] => {
    const elements: T[] = [];
    let node = lastNode;
    while (typeof node !== "undefined") {
        elements.push(node.element);
        node = node.previousNode;
    }
    elements.reverse();
    return elements;
};

interface EvalExprsParams {
    exprsComp: PetMap;
    varSpace: PetMap;
}

interface EvalExprsState {
    exprIndex: number;
    lastAccumNode?: AccumulatorNode<PetValue>;
}

export const evalExprsTask: TaskDef<EvalExprsParams, EvalExprsState> = {
    getInitState: (params) => ({ exprIndex: 0 }),
    stages: [
        (task) => {
            const exprs = task.params.exprsComp.getMember(symbols.EXPRS).getList();
            const { exprIndex, lastAccumNode } = task.state;
            if (exprIndex < exprs.getLength()) {
                const expr = exprs.getMember(exprIndex).getMap();
                return task.callMethod(
                    expr, symbols.EVAL, [task.params.varSpace],
                    (value) => task.repeatStage({
                        exprIndex: exprIndex + 1,
                        lastAccumNode: { element: value, previousNode: lastAccumNode },
                    }),
                );
            } else {
                const values = getAccumulatorElements(lastAccumNode);
                const valueList = new PetList(values);
                return task.returnValue(valueList);
            }
        },
    ],
};

interface CallFuncParams {
    func: PetFunc;
    args: PetList;
    callerNode?: PetMap;
}

const callFuncTask: TaskDef<CallFuncParams, null> = {
    getInitState: (params) => null,
    getNodes: (params) => ({ callerNode: params.callerNode }),
    stages: [
        (task) => {
            const { func, args } = task.params;
            const minArgAmount = func.getMinArgAmount();
            const maxArgAmount = func.getMaxArgAmount();
            if (args.getLength() < minArgAmount) {
                throw new ValueError("Too few arguments passed to function.");
            }
            if (maxArgAmount !== null && args.getLength() > maxArgAmount) {
                throw new ValueError("Too many arguments passed to function.");
            }
            return func.call(task, args);
        },
    ],
};

export const awaitCondTask: TaskDef<{ observer: MemberObserver }, null> = {
    getInitState: (params) => null,
    stages: [
        (task) => {
            const { observer } = task.params;
            const memberValue = observer.getMemberValue();
            if (typeof memberValue === "undefined") {
                return task.throwException(observer.exception);
            }
            return task.callFunction(
                observer.getCondition(), [memberValue],
                (returnValue) => {
                    if (returnValue.getInt() === 0n) {
                        const newMemberValue = observer.getMemberValue();
                        if (typeof newMemberValue !== "undefined"
                                && valueMayHaveChanged(memberValue, newMemberValue)) {
                            return task.repeatStage(null);
                        } else {
                            return task.throwException(observer.exception);
                        }
                    } else {
                        return observer.getEvalState().actionToResume;
                    }
                },
            );
        },
    ],
};

export const spinCondTask: TaskDef<{ spinner: Spinner }, null> = {
    getInitState: (params) => null,
    stages: [
        (task) => {
            const { spinner } = task.params;
            return task.callFunction(
                spinner.getCondition(), [],
                (returnValue) => {
                    if (returnValue.getInt() === 0n) {
                        return task.throwException(spinner.exception);
                    } else {
                        return spinner.getEvalState().actionToResume;
                    }
                },
            );
        },
    ],
};

const checkGradeForEval = (worker: PetMap): void => {
    const gradeValue = worker.getOptionalMember(symbols.GRADE);
    if (typeof gradeValue === "undefined") {
        return;
    }
    const grade = gradeValue.getSymbol();
    let entity = worker;
    while (true) {
        const nextEntity = entity.getOptionalMember(symbols.PARENT);
        if (typeof nextEntity === "undefined") {
            break;
        }
        entity = nextEntity.getMap();
        const phaseValue = entity.getOptionalMember(symbols.PHASE);
        const nodeType = entity.getOptionalMember(symbols.NODE_TYPE);
        if (typeof phaseValue !== "undefined" && typeof nodeType !== "undefined") {
            const phase = phaseValue.getSymbol();
            if (grade === symbols.PREP_GRADE && phase === symbols.WORK_PHASE) {
                throw new StateError("Cannot evaluate prep-grade worker when parent is in work-phase.");
            }
            if (grade === symbols.WORK_GRADE && phase === symbols.PREP_PHASE) {
                throw new StateError("Cannot evaluate work-grade worker when parent is in prep-phase.");
            }
            break;
        }
    }
};

export const callMethodTask: TaskDef<MethodInvocation, null> = {
    getInitState: (params) => null,
    getNodes: (params) => ({ taskNode: params.worker }),
    stages: [
        (task) => {
            const { worker, key: methodKey } = task.params;
            if (methodKey === symbols.EVAL) {
                checkGradeForEval(worker);
            }
            if (methodKey === symbols.PREP) {
                const phase = worker.getMember(symbols.PHASE).getSymbol();
                if (phase === symbols.WORK_PHASE) {
                    return task.returnValue(null);
                }
                if (task.context.preppingWorkers.has(worker)) {
                    return task.awaitPhase(
                        worker,
                        task.returnValue(null),
                    );
                }
                task.context.preppingWorkers.add(worker);
                if (workerIsInvocation(worker)) {
                    return task.runTask(
                        determineInvocTask, { worker },
                        (value) => task.advanceStage(null),
                    );
                }
            } else {
                return task.callMethod(
                    worker, symbols.PREP, [],
                    (value) => task.advanceStage(null),
                );
            }
            return task.advanceStage(null);
        },
        (task) => {
            const { worker, key: methodKey } = task.params;
            const methodMap = getWorkerMethodMap(task.context.workerMethodsMap, worker);
            const method = getMethodWithDefault(methodMap, methodKey);
            const callerNode = (method instanceof UserFunc) ? worker : undefined;
            return task.callFunction(
                method, [worker, ...task.params.args],
                (returnValue) => {
                    if (methodKey === symbols.PREP) {
                        worker.setMember(symbols.PHASE, symbols.WORK_PHASE);
                        task.context.preppingWorkers.delete(worker);
                    }
                    let nextReturnValue: PetValue;
                    if (methodKey === symbols.PREP) {
                        nextReturnValue = nullValue;
                    } else {
                        nextReturnValue = returnValue;
                    }
                    return task.returnValue(nextReturnValue);
                },
                { callerNode },
            );
        },
    ],
};

const determineInvocTask: TaskDef<{ worker: PetMap }, null> = {
    getInitState: (params) => null,
    stages: [
        (task) => {
            const { worker } = task.params;
            const scope = getScope(worker);
            const comps = worker.getMember(symbols.COMPS).getList();
            const firstComp = comps.getMember(0).getMap();
            const compType = firstComp.getMember(symbols.COMP_TYPE).getSymbol();
            if (compType === symbols.IDENT_COMP) {
                const identifier = firstComp.getMember(symbols.IDENT).getPetString();
                const variable = getVariable(scope, identifier);
                const invocable = getVarValue(scope, variable);
                worker.setMember(symbols.INVOC, invocable);
                return task.returnValue(null);
            } else if (compType === symbols.EXPRS_COMP) {
                const grade = firstComp.getMember(symbols.GRADE).getSymbol();
                if (grade !== symbols.PREP_GRADE) {
                    throw createSyntaxError(
                        "Expected prep-grade expression sequence component.", firstComp,
                    );
                }
                const exprs = firstComp.getMember(symbols.EXPRS).getList();
                if (exprs.getLength() !== 1) {
                    throw createSyntaxError(
                        "Expected 1 expression in sequence.", firstComp,
                    );
                }
                return task.callMethod(
                    firstComp, symbols.EVAL, [scope],
                    (returnValue) => {
                        const listValue = returnValue.getList();
                        worker.setMember(symbols.INVOC, listValue.getMember(0));
                        return task.returnValue(null);
                    },
                );
            } else {
                throw new PetSyntaxError("First component in invocation is invalid.");
            }
        },
    ],
};

interface EvalFuncParams {
    invocNode: PetMap;
    varSpace: PetMap;
}

export const evalFuncTask: TaskDef<EvalFuncParams, { args: PetValue[] | null }> = {
    getInitState: (params) => ({ args: null }),
    stages: [
        (task) => {
            const argsComp = getFuncArgsComp(task.params.invocNode);
            if (argsComp === null) {
                return task.advanceStage({ args: [] });
            }
            return task.callMethod(
                argsComp, symbols.EVAL, [task.params.varSpace],
                (value) => task.advanceStage({ args: value.getList().elements }),
            );
        },
        (task) => {
            const func = task.params.invocNode.getMember(symbols.INVOC).getFunc();
            return task.callFunction(
                func, task.state.args!,
                (value) => task.returnValue(value),
                { callerNode: task.params.invocNode },
            );
        },
    ],
};

interface CallUserFuncParams {
    userFunc: UserFunc;
    argValues: PetList;
    bodyFrame: PetMap;
}

export const callUserFuncTask: TaskDef<CallUserFuncParams, { argIndex: number }> = {
    getInitState: (params) => ({ argIndex: 0 }),
    stages: [
        (task) => {
            const { userFunc, argValues, bodyFrame } = task.params;
            const { args, argsVar } = userFunc.signature;
            if (typeof args === "undefined") {
                const frameEntry = findVarValue(bodyFrame, argsVar!);
                frameEntry.setMember(symbols.VALUE, argValues);
                return task.advanceStage({ argIndex: argValues.getLength() });
            }
            let { argIndex } = task.state;
            while (argIndex < argValues.getLength()) {
                const arg = args[argIndex];
                const argValue = argValues.getMember(argIndex);
                const frameEntry = findVarValue(bodyFrame, arg.variable);
                frameEntry.setMember(symbols.VALUE, argValue);
                argIndex += 1;
            }
            if (argIndex >= args.length) {
                return task.advanceStage({ argIndex });
            }
            const optionalArg = args[argIndex];
            return task.callMethod(
                optionalArg.defaultValueExpr!, symbols.EVAL, [bodyFrame],
                (values) => {
                    const argValue = values.getList().getMember(0);
                    const frameEntry = findVarValue(bodyFrame, optionalArg.variable);
                    frameEntry.setMember(symbols.VALUE, argValue);
                    return task.repeatStage({ argIndex: argIndex + 1 });
                },
            );
        },
        (task) => {
            const { userFunc, bodyFrame } = task.params;
            return task.callMethod(
                userFunc.stmtsComp, symbols.EVAL, [bodyFrame],
                (value) => task.returnValue(null),
                (exception) => task.handleRetExcep(exception),
            );
        },
    ],
};

export const handleExcepTask: TaskDef<{ exception: PetValue }, null> = {
    getInitState: (params) => null,
    stages: [
        (task) => {
            const { scheduler } = task.context;
            const exception = task.params.exception.getMap();
            const excepType = exception.getMember(symbols.EXCEP_TYPE).getKnownValue();
            if (excepType === symbols.SPIN_EXCEP) {
                const excepCopy = exception.shallowCopy();
                const countValue = exception.getOptionalMember(spinCountSymbol);
                const count = (countValue?.toNumber() ?? 0) + 1;
                excepCopy.setMember(spinCountSymbol, BigInt(count));
                const spinner = new Spinner(excepCopy);
                scheduler.scheduleSpinner(spinner);
            } else if (excepType === symbols.AWAIT_EXCEP) {
                const bunch = exception.getMember(symbols.BUNCH).getObservableBunch();
                bunch.observatory.addObserver(scheduler, exception);
            } else {
                task.context.addExcepToReport(exception);
            }
            return task.returnValue(null);
        },
    ],
};

interface ExcepReportParams {
    lastExcep: PetMap;
    reporterIndex: number | null;
}

export const excepReportTask: TaskDef<{ exception: PetMap }, ExcepReportParams> = {
    getInitState: (params) => ({ lastExcep: params.exception, reporterIndex: null }),
    stages: [
        (task) => {
            const { excepReporters } = task.context;
            const { lastExcep } = task.state;
            const reporterIndex = task.state.reporterIndex ?? (excepReporters.length - 1);
            if (reporterIndex < 0) {
                const excepText = getDefaultExcepReport(lastExcep);
                return task.returnValue(new PetString(excepText));
            }
            const excepReporter = excepReporters[reporterIndex];
            const handleException = (excepValue: PetValue): Action => {
                const exception = excepValue.getMap();
                const excepType = exception.getMember(symbols.EXCEP_TYPE).getKnownValue();
                if (excepType === symbols.SPIN_EXCEP || excepType === symbols.AWAIT_EXCEP) {
                    return task.throwException(exception);
                } else {
                    return task.repeatStage({
                        lastExcep: exception,
                        reporterIndex: reporterIndex - 1,
                    });
                }
            };
            return task.callFunction(
                excepReporter, [lastExcep],
                (value) => {
                    const knownValue = value.getKnownValue();
                    const nextAction = task.returnValue(knownValue);
                    if (!(knownValue instanceof PetString)) {
                        const typeError = createErrorExcep(
                            symbols.TYPE_ERROR,
                            "Exception reporter must return a string.",
                            excepReporter.getModulePos(),
                            new EvalState(task, nextAction),
                        );
                        return handleException(wrapKnownValue(typeError));
                    }
                    return nextAction;
                },
                { handleException },
            );
        },
    ],
};

export const reportExcepsTask: TaskDef<null, null> = {
    getInitState: (params) => null,
    stages: [
        (task) => {
            const exception = task.context.popExcepToReport();
            if (exception === null) {
                return task.returnValue(null);
            }
            const { reportingExceps } = task.context;
            reportingExceps.add(exception);
            return task.runTask(
                excepReportTask, { exception },
                (value) => {
                    if (reportingExceps.has(exception)) {
                        const excepText = value.toStringStrict();
                        reportingExceps.delete(exception);
                        task.context.logger.reportException(exception, excepText);
                    }
                    return task.repeatStage(null);
                },
            );
        },
    ],
};

interface SortListParams {
    elements: PetValue[];
    compare: PetFunc;
}

interface SortListState {
    sortedHalf1?: PetValue[];
    sortedHalf2?: PetValue[];
    halfIndex1?: number;
    halfIndex2?: number;
    lastAccumNode?: AccumulatorNode<PetValue>;
}

const getMiddleIndex = (elements: PetValue[]): number => Math.floor(elements.length / 2);

// This is a merge sort. We gather the result as a linked list
// to avoid mutating the task state.
export const sortListTask: TaskDef<SortListParams, SortListState> = {
    getInitState: (params) => ({}),
    stages: [
        (task) => {
            const { elements, compare } = task.params;
            if (elements.length <= 1) {
                return task.returnValue(new PetList(elements));
            }
            const middleIndex = getMiddleIndex(elements);
            const half1 = elements.slice(0, middleIndex);
            return task.runTask(
                sortListTask, { elements: half1, compare },
                (listValue) => {
                    const sortedHalf1 = listValue.getList().elements;
                    return task.advanceStage({ sortedHalf1 });
                },
            );
        },
        (task) => {
            const { elements, compare } = task.params;
            const { sortedHalf1 } = task.state;
            const middleIndex = getMiddleIndex(elements);
            const half2 = elements.slice(middleIndex);
            return task.runTask(
                sortListTask, { elements: half2, compare },
                (listValue) => {
                    const sortedHalf2 = listValue.getList().elements;
                    return task.advanceStage({
                        sortedHalf1,
                        sortedHalf2,
                        halfIndex1: 0,
                        halfIndex2: 0,
                    });
                },
            );
        },
        (task) => {
            const { compare } = task.params;
            const { state } = task;
            const sortedHalf1 = state.sortedHalf1!;
            const sortedHalf2 = state.sortedHalf2!;
            const halfIndex1 = state.halfIndex1!;
            const halfIndex2 = state.halfIndex2!;
            const { lastAccumNode } = state;
            const element1 = sortedHalf1[halfIndex1];
            const element2 = sortedHalf2[halfIndex2];
            const reachedEnd1 = (typeof element1 === "undefined");
            const reachedEnd2 = (typeof element2 === "undefined");
            const addElement1 = (): Action => task.repeatStage({
                sortedHalf1,
                sortedHalf2,
                halfIndex1: halfIndex1 + 1,
                halfIndex2,
                lastAccumNode: { element: element1, previousNode: lastAccumNode },
            });
            const addElement2 = (): Action => task.repeatStage({
                sortedHalf1,
                sortedHalf2,
                halfIndex1,
                halfIndex2: halfIndex2 + 1,
                lastAccumNode: { element: element2, previousNode: lastAccumNode },
            });
            if (reachedEnd1) {
                if (reachedEnd2) {
                    const sortedElements = getAccumulatorElements(lastAccumNode);
                    return task.returnValue(new PetList(sortedElements));
                } else {
                    return addElement2();
                }
            } else if (reachedEnd2) {
                return addElement1();
            }
            return task.callFunction(
                compare, [element1, element2],
                (comparisonValue) => {
                    const comparison = comparisonValue.getInt();
                    return (comparison <= 0n) ? addElement1() : addElement2();
                },
            );
        },
    ],
};


