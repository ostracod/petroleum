
import "./package.js";

import { PetSymbol, symbols } from "./symbol.js";
import { KnownValue, PetValue, toPetValue, toKnownValue, PetString, PetMap, MemberObserver, ObservableBunch, PetFunc, EvalState, valueMayHaveChanged } from "./value.js";
import { NotEqualFunc } from "./builtInFunc.js";
import { funcInvocationMethods, stmtsCompMethods } from "./methods.js";
import { ModuleParser } from "./moduleParser.js";
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
        args: (KnownValue | PetValue)[],
        acceptReturnValue: (value: PetValue) => Action,
    ): Action {
        return this.runTask(
            callFuncTask, { func, args: args.map((arg) => toPetValue(arg)) },
            acceptReturnValue,
        );
    }
    
    callWorkerMethod(
        worker: PetMap,
        key: PetSymbol | PetValue,
        args: (KnownValue | PetValue)[],
        acceptReturnValue: (value: PetValue) => Action,
    ): Action {
        const invocation: MethodInvocation = {
            worker,
            key: toKnownValue(key),
            args: args.map((arg) => toPetValue(arg)),
        };
        return this.runTask(callMethodTask, invocation, acceptReturnValue);
    }
}

export const mainTask: TaskDef<null, { moduleIndex: number }> = {
    getInitState: (params) => ({ moduleIndex: 0 }),
    stages: [
        (task) => {
            const modulePath = task.context.entryPackage.mainModulePath;
            task.context.loadUserModule(modulePath);
            return task.advanceStage({ moduleIndex: 0 });
        },
        (task) => {
            const { moduleIndex } = task.state;
            const moduleAmount = task.context.userModules.getLength();
            if (moduleIndex < moduleAmount) {
                return task.runTask(
                    awaitModulePrepTask, { moduleIndex },
                    (value) => task.repeatStage({ moduleIndex: moduleIndex + 1 }),
                );
            } else {
                return task.advanceStage({ moduleIndex: moduleAmount - 1 });
            }
        },
        (task) => {
            const { moduleIndex } = task.state;
            if (moduleIndex >= 0) {
                const module = task.context.userModules.getMember(moduleIndex).getMap();
                const stmtsComp = module.getMember(symbols.STMTS_COMP).getMap();
                return task.callWorkerMethod(
                    stmtsComp,
                    symbols.EVAL,
                    [],
                    (value) => task.repeatStage({ moduleIndex: moduleIndex - 1 }),
                );
            } else {
                return task.returnValue(null);
            }
        },
    ],
};

const awaitModulePrepTask: TaskDef<{ moduleIndex: number }, null> = {
    getInitState: (params) => null,
    stages: [
        (task) => {
            return task.awaitMember(
                task.context.userModules,
                BigInt(task.params.moduleIndex),
                new NotEqualFunc(null),
                task.advanceStage(null),
            );
        },
        (task) => {
            const modules = task.context.userModules;
            const module = modules.getMember(task.params.moduleIndex).getMap();
            const stmtsComp = module.getMember(symbols.STMTS_COMP).getMap();
            return task.awaitMember(
                stmtsComp,
                symbols.PHASE,
                new NotEqualFunc(symbols.PREP_PHASE),
                task.returnValue(null),
            );
        },
    ],
};

export const loadModuleTask: TaskDef<{ modulePath: string }, null> = {
    getInitState: (params) => null,
    stages: [
        (task) => {
            // TODO: Pass if file is missing.
            const { modulePath } = task.params;
            const moduleParser = new ModuleParser(modulePath, task.context.globalScope);
            const module = moduleParser.parseModule();
            task.context.setUserModule(modulePath, module);
            const stmtsComp = module.getMember(symbols.STMTS_COMP).getMap();
            return task.callWorkerMethod(
                stmtsComp,
                symbols.PREP,
                [],
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
                // TODO: Invoke #PREP method on `stmt`.
                task.context.scheduler.scheduleTask(dummyPrepTask, { stmt });
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
                stmtsComp.setMember(symbols.PHASE, symbols.WORK_PHASE);
                return task.returnValue(null);
            }
        },
    ],
};

const dummyPrepTask: TaskDef<{ stmt: PetMap }, null> = {
    getInitState: (params) => null,
    stages: [
        (task) => {
            task.params.stmt.setMember(symbols.PHASE, symbols.WORK_PHASE);
            return task.returnValue(null);
        },
    ],
};

export const evalStmtsTask: TaskDef<{ stmtsComp: PetMap }, { stmtIndex: number }> = {
    getInitState: (params) => ({ stmtIndex: 0 }),
    stages: [
        (task) => {
            const stmts = task.params.stmtsComp.getMember(symbols.STMTS).getList();
            const { stmtIndex } = task.state;
            if (stmtIndex < stmts.getLength()) {
                const stmt = stmts.getMember(stmtIndex).getMap();
                // TODO: Invoke #EVAL method on `stmt`.
                return task.runTask(
                    dummyEvalTask, { stmt },
                    (value) => task.repeatStage({ stmtIndex: stmtIndex + 1 }),
                );
            } else {
                return task.returnValue(null);
            }
        },
    ],
};

const dummyEvalTask: TaskDef<{ stmt: PetMap }, null> = {
    getInitState: (params) => null,
    stages: [
        (task) => {
            console.log("Wow! I am the dummy eval task");
            console.log(task.params.stmt);
            return task.returnValue(null);
        },
    ],
};

const callFuncTask: TaskDef<{ func: PetFunc, args: PetValue[] }, null> = {
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

const nodeIsInvocation = (node: PetMap, nodeType: PetSymbol): boolean => {
    if (nodeType === symbols.STMT) {
        const stmtType = node.getMember(symbols.STMT_TYPE).getSymbol();
        return (stmtType === symbols.INVOC_STMT);
    } else if (nodeType === symbols.EXPR) {
        const exprType = node.getMember(symbols.EXPR_TYPE).getSymbol();
        return (exprType === symbols.INVOC_EXPR);
    }
    return false;
};

const workerIsInvocation = (worker: PetMap): boolean => {
    const nodeTypeValue = worker.getMember(symbols.NODE_TYPE);
    if (typeof nodeTypeValue === "undefined") {
        return false;
    }
    const nodeType = nodeTypeValue.getSymbol();
    return nodeIsInvocation(worker, nodeType);
};

const getWorkerMethodMap = (worker: PetMap): PetMap => {
    const nodeTypeValue = worker.getMember(symbols.NODE_TYPE);
    if (typeof nodeTypeValue !== "undefined") {
        const nodeType = nodeTypeValue.getSymbol();
        if (nodeIsInvocation(worker, nodeType)) {
            const invocable = worker.getMember(symbols.INVOC).getKnownValue();
            if (invocable instanceof PetFunc) {
                return funcInvocationMethods;
            } else {
                const procedure = invocable as PetMap;
                return procedure.getMember(symbols.METHODS).getMap();
            }
        }
        // TODO: Support calling methods on more types of nodes.
        throw new Error("Not yet implemented");
    }
    const compTypeValue = worker.getMember(symbols.COMP_TYPE);
    if (typeof compTypeValue !== "undefined") {
        const compType = compTypeValue.getSymbol();
        if (compType === symbols.STMTS_COMP) {
            return stmtsCompMethods;
        }
        // TODO: Support calling methods on more types of components.
        throw new Error("Not yet implemented");
    }
    throw new Error("Expected worker.");
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
            if (methodKey === symbols.EVAL) {
                return task.callWorkerMethod(
                    worker, symbols.PREP, [],
                    (value) => task.advanceStage(null),
                );
            }
            return task.advanceStage(null);
        },
        (task) => {
            const { worker, key: methodKey } = task.params;
            const methodMap = getWorkerMethodMap(worker);
            const method = methodMap.getMember(methodKey).getFunc();
            return task.callFunction(
                method, [worker, ...task.params.args],
                (returnValue) => {
                    if (methodKey === symbols.PREP) {
                        worker.setMember(symbols.PHASE, symbols.WORK_PHASE);
                        task.context.preppingWorkers.delete(worker);
                    }
                    let nextReturnValue: PetValue;
                    if (methodKey === symbols.EVAL) {
                        nextReturnValue = returnValue;
                    } else {
                        nextReturnValue = null;
                    }
                    return task.returnValue(nextReturnValue);
                },
            );
        },
    ],
};

// varSpace is either a frame or a scope.
// Returns a variable or frame entry.
const findVariable = (varSpace: PetMap, name: PetString): PetMap | null => {
    let scope: PetMap;
    let frame: PetMap | null;
    const isScope = varSpace.getMember(symbols.IS_SCOPE);
    if (typeof isScope !== "undefined" && isScope.getInt() !== 0n) {
        scope = varSpace;
        frame = null;
    } else {
        const isFrame = varSpace.getMember(symbols.IS_FRAME);
        if (typeof isFrame !== "undefined" && isFrame.getInt() !== 0n) {
            frame = varSpace;
            scope = frame.getMember(symbols.SCOPE).getMap();
        } else {
            throw new Error("Invalid variable space.");
        }
    }
    while (true) {
        if (frame !== null) {
            const frameEntries = frame.getMember(symbols.FRAME_ENTRIES).getMap();
            const frameEntry = frameEntries.getMember(name);
            if (typeof frameEntry !== "undefined") {
                return frameEntry.getMap();
            }
        }
        const variables = scope.getMember(symbols.VARS).getMap();
        const variable = variables.getMember(name);
        if (typeof variable !== "undefined") {
            return variable.getMap();
        }
        let parentFrame: PetValue | undefined;
        if (frame !== null) {
            parentFrame = frame.getMember(symbols.PARENT);
        }
        if (typeof parentFrame !== "undefined") {
            frame = parentFrame.getMap();
            scope = frame.getMember(symbols.SCOPE).getMap();
        } else {
            const parentScope = scope.getMember(symbols.PARENT);
            if (typeof parentScope === "undefined") {
                break;
            }
            scope = parentScope.getMap();
            frame = null;
        }
    }
    return null;
};

// varSpace is either a frame or a scope.
const getVarValue = (varSpace: PetMap, name: PetString): PetValue => {
    const result = findVariable(varSpace, name);
    if (result === null) {
        throw new Error(`Could not find variable "name.toString()".`);
    }
    return result.getMember(symbols.VALUE);
};

// `entity` is a node or a component.
const getScope = (entity: PetMap): PetMap => {
    while (true) {
        const scope = entity.getMember(symbols.SCOPE);
        if (typeof scope !== "undefined") {
            return scope.getMap();
        }
        const parent = entity.getMember(symbols.PARENT);
        if (typeof parent === "undefined") {
            throw new Error("Could not get scope.");
        }
        entity = parent.getMap();
    }
};

const determineInvocTask: TaskDef<{ worker: PetMap }, null> = {
    getInitState: (params) => null,
    stages: [
        (task) => {
            const { worker } = task.params;
            const comps = worker.getMember(symbols.COMPS).getList();
            const firstComp = comps.getMember(0).getMap();
            const compType = firstComp.getMember(symbols.COMP_TYPE).getSymbol();
            if (compType === symbols.IDENT_COMP) {
                const scope = getScope(worker);
                const identifier = firstComp.getMember(symbols.IDENT).getPetString();
                const invocable = getVarValue(scope, identifier);
                worker.setMember(symbols.INVOC, invocable);
                return task.returnValue(null);
            } else if (compType === symbols.EXPRS_COMP) {
                // TODO: Create frame.
                throw new Error("Not yet implemented");
                const frame = null;
                
                return task.callWorkerMethod(
                    firstComp, symbols.EVAL, [frame],
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


