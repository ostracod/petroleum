
import "./package.js";

import { symbols } from "./symbol.js";
import { PetValue, PetList, PetMap, PetException, MemberObserver, ObservableBunch, FuncCaller, PetFunc, EvalState, unwrapValue, valueMayHaveChanged } from "./value.js";
import { NotEqualFunc } from "./builtInFunc.js";
import { funcInvocationMethods } from "./methods.js";
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
    handleException: (exception: PetException) => Action;
}

interface MethodInvocation {
    worker: PetMap;
    key: PetValue;
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
    
    returnValue(value: PetValue): Action {
        return {
            task: this.members.parentTask,
            run: () => this.members.acceptReturnValue(value),
        };
    }
    
    // `exception` must be populated with evaluation state.
    throwException(exception: PetException): Action {
        return {
            task: this.members.parentTask,
            run: () => this.members.handleException(exception),
        };
    }
    
    runTask<T1, T2>(
        taskDef: TaskDef<T1, T2>,
        params: T1,
        acceptReturnValue: (value: PetValue) => Action,
        handleException?: (exception: PetException) => Action,
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
        location: PetValue,
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
        location: PetValue,
        condition: PetFunc,
        nextAction: Action,
    ): Action {
        const observer = new MemberObserver(
            bunch,
            unwrapValue(location),
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
        args: PetValue[],
        acceptReturnValue: (value: PetValue) => Action,
    ): Action {
        const { handleException } = this.members;
        const caller: FuncCaller = { task: this, acceptReturnValue, handleException };
        return {
            task: this,
            run: () => func.call(caller, args),
        };
    }
    
    callWorkerMethod(
        worker: PetMap,
        key: PetValue,
        args: PetValue[],
        acceptReturnValue: (value: PetValue) => Action,
    ): Action {
        const invocation: MethodInvocation = { worker, key, args };
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
                const module = task.context.userModules.getMember(moduleIndex) as PetMap;
                const stmtsComp = module.getMember(symbols.STMTS_COMP) as PetMap;
                return task.runTask(
                    evalStmtsTask, { stmtsComp },
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
            const module = modules.getMember(task.params.moduleIndex) as PetMap;
            const stmtsComp = module.getMember(symbols.STMTS_COMP) as PetMap;
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
            const moduleParser = new ModuleParser(modulePath);
            const module = moduleParser.parseModule();
            task.context.setUserModule(modulePath, module);
            const stmtsComp = module.getMember(symbols.STMTS_COMP) as PetMap;
            return task.runTask(
                prepStmtsTask, { stmtsComp },
                (value) => task.returnValue(null),
            );
        },
    ],
};

const prepStmtsTask: TaskDef<{ stmtsComp: PetMap }, { stmtIndex: number }> = {
    getInitState: (params) => ({ stmtIndex: 0 }),
    stages: [
        (task) => {
            const stmts = task.params.stmtsComp.getMember(symbols.STMTS) as PetList;
            for (let index = 0; index < stmts.getLength(); index++) {
                const stmt = stmts.getMember(index) as PetMap;
                // TODO: Invoke #PREP method on `stmt`.
                task.context.scheduler.scheduleTask(dummyPrepTask, { stmt });
            }
            return task.advanceStage({ stmtIndex: 0 });
        },
        (task) => {
            const { stmtsComp } = task.params;
            const { stmtIndex } = task.state;
            const stmts = stmtsComp.getMember(symbols.STMTS) as PetList;
            if (stmtIndex < stmts.getLength()) {
                const stmt = stmts.getMember(stmtIndex) as PetMap;
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

const evalStmtsTask: TaskDef<{ stmtsComp: PetMap }, { stmtIndex: number }> = {
    getInitState: (params) => ({ stmtIndex: 0 }),
    stages: [
        (task) => {
            const stmts = task.params.stmtsComp.getMember(symbols.STMTS) as PetList;
            const { stmtIndex } = task.state;
            if (stmtIndex < stmts.getLength()) {
                const stmt = stmts.getMember(stmtIndex) as PetMap;
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
                    // TODO: Throw an error if `returnValue` is not an integer.
                    if (returnValue as bigint === 0n) {
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

const workerIsInvocation = (worker: PetMap): boolean => {
    const nodeType = worker.getMember(symbols.NODE_TYPE);
    if (nodeType === symbols.STMT) {
        const stmtType = worker.getMember(symbols.STMT_TYPE);
        return (stmtType === symbols.INVOC_STMT);
    } else if (nodeType === symbols.EXPR) {
        const exprType = worker.getMember(symbols.EXPR_TYPE);
        return (exprType === symbols.INVOC_EXPR);
    }
    return false;
};

const callMethodTask: TaskDef<MethodInvocation, null> = {
    getInitState: (params) => null,
    stages: [
        (task) => {
            const { worker, key: methodKey } = task.params;
            if (methodKey === symbols.PREP) {
                const phase = worker.getMember(symbols.PHASE);
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
            let methodMap: PetMap;
            if (workerIsInvocation(worker)) {
                const invocable = worker.getMember(symbols.INVOC);
                if (invocable instanceof PetFunc) {
                    methodMap = funcInvocationMethods;
                } else {
                    const procedure = invocable as PetMap;
                    methodMap = procedure.getMember(symbols.METHODS) as PetMap;
                }
            } else {
                // TODO: Support calling methods on more types of workers.
                throw new Error("Not yet implemented");
            }
            const method = methodMap.getMember(methodKey) as PetFunc;
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

const determineInvocTask: TaskDef<{ worker: PetMap }, null> = {
    getInitState: (params) => null,
    stages: [
        (task) => {
            const { worker } = task.params;
            const comps = worker.getMember(symbols.COMPS) as PetList;
            const firstComp = comps.getMember(0) as PetMap;
            const compType = firstComp.getMember(symbols.COMP_TYPE);
            if (compType === symbols.IDENT_COMP) {
                // TODO: Read value of variable.
                throw new Error("Not yet implemented");
                const invocable = null;
                
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


