
import "./node.js";

import { PetSymbol, symbols } from "./symbol.js";
import { KnownValue, PetValue, toPetValue, toKnownValue, toPetList, PetList, PetMap, MemberObserver, ObservableBunch, PetFunc, EvalState, valueMayHaveChanged } from "./value.js";
import { NotEqualFunc } from "./builtInFunc.js";
import { getMethodWithDefault } from "./method.js";
import { SetProcParts } from "./procedure.js";
import { workerIsInvocation, getWorkerMethodMap, getFuncArgsComp } from "./node.js";
import { createFrame, VarSpaceType, getVarSpaceType, findVariable, getVarValue, getScope } from "./variable.js";
import { PetContext } from "./context.js";

export interface Action {
    task: Task | null;
    run: () => Action;
}

export type Stage<ParamsT, StateT> = (task: Task<ParamsT, StateT>) => Action;

export interface TaskDef<ParamsT, StateT> {
    getInitState: (params: ParamsT) => StateT;
    stages: Stage<ParamsT, StateT>[];
}

export interface TaskMembers<ParamsT, StateT> {
    parentTask: Task | null;
    stages: Stage<ParamsT, StateT>[];
    acceptReturnValue: (value: PetValue) => Action;
    handleException: (exception: PetValue) => Action;
}

interface MethodInvocation {
    worker: PetMap;
    key: KnownValue;
    args: PetValue[];
}

const createMethodInvocation = (
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
        const members: TaskMembers<T1, T2> = {
            parentTask: this,
            stages: taskDef.stages,
            acceptReturnValue,
            handleException,
        };
        const task = new Task<T1, T2>(
            this.context,
            members,
            params,
            taskDef.getInitState(params),
            0,
        );
        return task.getStageAction();
    }
    
    throwAwaitExcep(
        bunch: ObservableBunch,
        location: KnownValue,
        condition: PetFunc,
        evalState: EvalState,
    ): Action {
        const exception = new PetMap([
            [symbols.EXCEP_TYPE, symbols.AWAIT_EXCEP],
            [symbols.BUNCH, bunch],
            [symbols.LOC, location],
            [symbols.COND, condition],
            [symbols.EVAL_STATE, evalState],
            // TODO: Add #MESSAGE field.
        ]);
        return this.throwException(exception);
    }
    
    throwObserverAwait(observer: MemberObserver): Action {
        const { bunch, location, condition, evalState } = observer;
        return this.throwAwaitExcep(bunch, location, condition, evalState);
    }
    
    awaitMember(
        bunch: ObservableBunch,
        location: KnownValue | PetValue,
        condition: PetFunc,
        nextAction: Action,
    ): Action {
        const observer = new MemberObserver(
            bunch,
            toKnownValue(location),
            condition,
            new EvalState(this, nextAction),
        );
        return this.runTask(
            awaitCondTask, { observer },
            (value) => nextAction,
        );
    }
    
    callFunction(
        func: PetFunc,
        args: (KnownValue | PetValue)[] | PetList,
        acceptReturnValue: (value: PetValue) => Action,
    ): Action {
        return this.runTask(
            callFuncTask, { func, args: toPetList(args) },
            acceptReturnValue,
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
                return task.awaitMember(
                    stmtsComp,
                    symbols.PHASE,
                    new NotEqualFunc(symbols.PREP_PHASE),
                    task.repeatStage({ moduleIndex: moduleIndex + 1 }),
                );
            } else {
                for (const module of userModules) {
                    const scope = module.getMember(symbols.SCOPE).getMap();
                    const frame = createFrame(scope, null);
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
                return task.awaitMember(
                    stmt,
                    symbols.PHASE,
                    new NotEqualFunc(symbols.PREP_PHASE),
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
                return task.awaitMember(
                    expr,
                    symbols.PHASE,
                    new NotEqualFunc(symbols.PREP_PHASE),
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
                return task.awaitMember(
                    worker,
                    symbols.PHASE,
                    new NotEqualFunc(symbols.PREP_PHASE),
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
            const moduleType = parent.getMember(symbols.MODULE_TYPE);
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

interface EvalExprsParams {
    exprsComp: PetMap;
    varSpace: PetMap;
}

interface EvalExprsState {
    exprIndex: number;
    returnValues: PetValue[];
}

export const evalExprsTask: TaskDef<EvalExprsParams, EvalExprsState> = {
    getInitState: (params) => ({ exprIndex: 0, returnValues: [] }),
    stages: [
        (task) => {
            const exprs = task.params.exprsComp.getMember(symbols.EXPRS).getList();
            const { exprIndex, returnValues } = task.state;
            if (exprIndex < exprs.getLength()) {
                const expr = exprs.getMember(exprIndex).getMap();
                return task.callMethod(
                    expr, symbols.EVAL, [task.params.varSpace],
                    (value) => task.repeatStage({
                        exprIndex: exprIndex + 1,
                        returnValues: [...returnValues, value],
                    }),
                );
            } else {
                const valueList = new PetList(returnValues);
                return task.returnValue(valueList);
            }
        },
    ],
};

const callFuncTask: TaskDef<{ func: PetFunc, args: PetList }, null> = {
    getInitState: (params) => null,
    stages: [
        (task) => {
            return task.params.func.call(task, task.params.args);
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
                return task.throwObserverAwait(observer);
            }
            return task.callFunction(
                observer.condition, [memberValue],
                (returnValue) => {
                    if (returnValue.getInt() === 0n) {
                        const newMemberValue = observer.getMemberValue();
                        if (valueMayHaveChanged(memberValue, newMemberValue)) {
                            return task.repeatStage(null);
                        } else {
                            return task.throwObserverAwait(observer);
                        }
                    } else {
                        return observer.evalState.actionToResume;
                    }
                },
            );
        },
    ],
};

const callMethodTask: TaskDef<MethodInvocation, null> = {
    getInitState: (params) => null,
    stages: [
        (task) => {
            const { worker, key: methodKey } = task.params;
            if (methodKey === symbols.PREP) {
                const phase = worker.getMember(symbols.PHASE).getSymbol();
                if (phase === symbols.WORK_PHASE) {
                    return task.returnValue(null);
                }
                if (task.context.preppingWorkers.has(worker)) {
                    return task.awaitMember(
                        worker,
                        symbols.PHASE,
                        new NotEqualFunc(symbols.PREP_PHASE),
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
            }
            if (methodKey === symbols.EVAL || methodKey === symbols.ACCESSED_VARS) {
                return task.callMethod(
                    worker, symbols.PREP, [],
                    (value) => task.advanceStage(null),
                );
            }
            return task.advanceStage(null);
        },
        (task) => {
            const { worker, key: methodKey } = task.params;
            const methodMap = getWorkerMethodMap(worker);
            const method = getMethodWithDefault(methodMap, methodKey);
            return task.callFunction(
                method, [worker, ...task.params.args],
                (returnValue) => {
                    if (methodKey === symbols.PREP) {
                        worker.setMember(symbols.PHASE, symbols.WORK_PHASE);
                        task.context.preppingWorkers.delete(worker);
                    }
                    let nextReturnValue: PetValue;
                    if (methodKey === symbols.PREP) {
                        nextReturnValue = null;
                    } else {
                        nextReturnValue = returnValue;
                    }
                    return task.returnValue(nextReturnValue);
                },
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
                const variable = findVariable(scope, identifier);
                const invocable = getVarValue(scope, variable);
                worker.setMember(symbols.INVOC, invocable);
                return task.returnValue(null);
            } else if (compType === symbols.EXPRS_COMP) {
                return task.callMethod(
                    firstComp, symbols.EVAL, [scope],
                    (returnValue) => {
                        worker.setMember(symbols.INVOC, returnValue);
                        return task.returnValue(null);
                    },
                );
            } else {
                throw new Error("First component in invocation is invalid");
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
                func, task.state.args,
                (value) => task.returnValue(value),
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
            const evalState = exception.getMember(symbols.EVAL_STATE).getEvalState();
            if (excepType === symbols.PASS_EXCEP) {
                scheduler.scheduleAction(evalState.actionToResume, false);
            } else if (excepType === symbols.AWAIT_EXCEP) {
                const bunch = exception.getMember(symbols.BUNCH).getObservableBunch();
                const location = exception.getMember(symbols.LOC);
                const condition = exception.getMember(symbols.COND).getFunc();
                bunch.observatory.addObserver(scheduler, location, condition, evalState);
            } else {
                // TODO: Handle unexpected exception.
                
            }
            return task.returnValue(null);
        },
    ],
};

export const setProcPrepTask: TaskDef<{ stmt: PetMap, parts: SetProcParts }, null> = {
    getInitState: (params) => null,
    stages: [
        (task) => {
            const { stmt, parts } = task.params;
            const { varName, moduleComp, valueComp } = parts;
            const scope = getScope(stmt);
            if (typeof moduleComp === "undefined") {
                const destVar = findVariable(scope, varName);
                stmt.setMember(symbols.DEST_VAR, destVar);
                return task.advanceStage(null);
            }
            return task.callMethod(
                moduleComp, symbols.EVAL, [scope],
                (listValue) => {
                    const module = listValue.getList().getMember(0).getMap();
                    const moduleScope = module.getMember(symbols.SCOPE).getMap();
                    const moduleVars = moduleScope.getMember(symbols.VARS).getMap();
                    const destVar = moduleVars.getMember(varName);
                    stmt.setMember(symbols.DEST_VAR, destVar);
                    return task.advanceStage(null);
                },
            );
        },
        (task) => {
            const { parts: { valueComp } } = task.params;
            return task.callMethod(
                valueComp, symbols.PREP, [],
                (value) => task.returnValue(null),
            );
        },
    ],
};


