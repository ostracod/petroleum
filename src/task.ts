
import { PetContext } from "./context.js";
import { Action, AdvanceAction, ReturnAction, ExcepAction } from "./action.js";
import { ModuleParser } from "./moduleParser.js";
import { symbols } from "./symbol.js";
import * as funcModule from "./builtInFunc.js";
import * as valueModule from "./value.js";

type PetValue = valueModule.PetValue;
type PetList = valueModule.PetList;
type PetMap = valueModule.PetMap;
type PetException = valueModule.PetException;
type PetFunc = valueModule.PetFunc;
type EvalState = valueModule.EvalState;
type MemberObserver = valueModule.MemberObserver;
type ObservableBunch = valueModule.ObservableBunch;

export abstract class Task {
    parentTask: Task | null;
    context: PetContext;
    currentAction: Action;
    
    constructor(parentTask: Task | null) {
        this.parentTask = parentTask;
    }
    
    abstract advance(): Action;
    
    acceptReturnValue(returnValue: PetValue): Action {
        return new AdvanceAction(this);
    }
    
    handleException(exception: PetException): Action {
        return this.createExcepAction(exception);
    }
    
    createReturnAction(returnValue: PetValue): ReturnAction {
        return new ReturnAction(this.parentTask, returnValue);
    }
    
    // `exception` must be populated with evaluation state.
    createExcepAction(exception: PetException): ExcepAction {
        return new ExcepAction(this.parentTask, exception);
    }
    
    createAwaitAction(
        bunch: ObservableBunch,
        location: PetValue,
        condition: PetFunc,
        evalState: EvalState,
    ): ExcepAction {
        const exception = new valueModule.PetMap([
            [symbols.EXCEP_TYPE, symbols.AWAIT_EXCEP],
            [symbols.BUNCH, bunch],
            [symbols.LOC, location],
            [symbols.COND, condition],
            [symbols.EVAL_STATE, evalState],
        ]);
        return this.createExcepAction(exception);
    }
    
    awaitMember(
        bunch: ObservableBunch,
        location: PetValue,
        condition: PetFunc,
        nextAction: Action,
    ): Action {
        const observer = new valueModule.MemberObserver(
            bunch,
            valueModule.unwrapValue(location),
            condition,
            new valueModule.EvalState(this.currentAction, nextAction),
        );
        const awaitTask = new AwaitCondTask(observer);
        return new AdvanceAction(awaitTask);
    }
}

enum MainStage { LoadMainModule, PrepModules, EvalModules }

export class MainTask extends Task {
    stage: MainStage;
    moduleIndex: number;
    
    constructor(
        stage: MainStage = MainStage.LoadMainModule,
        moduleIndex: number = 0,
    ) {
        super(null);
        this.stage = stage;
        this.moduleIndex = moduleIndex;
    }
    
    advance(): Action {
        if (this.stage === MainStage.LoadMainModule) {
            const modulePath = this.context.entryPackage.mainModulePath;
            this.context.loadUserModule(modulePath);
            const nextTask = new MainTask(MainStage.PrepModules, 0);
            return new AdvanceAction(nextTask);
        } else if (this.stage === MainStage.PrepModules) {
            const moduleAmount = this.context.userModules.getLength();
            let nextTask: Task;
            if (this.moduleIndex < moduleAmount) {
                nextTask = new AwaitModulePrepTask(this, this.moduleIndex);
            } else {
                nextTask = new MainTask(MainStage.EvalModules, moduleAmount - 1);
            }
            return new AdvanceAction(nextTask);
        } else if (this.stage === MainStage.EvalModules) {
            if (this.moduleIndex >= 0) {
                const module = this.context.userModules.getMember(this.moduleIndex) as PetMap;
                const stmtsComp = module.getMember(symbols.STMTS_COMP) as PetMap;
                const nextTask = new EvalStmtsTask(this, stmtsComp);
                return new AdvanceAction(nextTask);
            } else {
                return this.createReturnAction(null);
            }
        }
    }
    
    acceptReturnValue(returnValue: PetValue): Action {
        let nextTask: Task;
        if (this.stage === MainStage.PrepModules) {
            nextTask = new MainTask(MainStage.PrepModules, this.moduleIndex + 1);
        } else if (this.stage === MainStage.EvalModules) {
            nextTask = new MainTask(MainStage.EvalModules, this.moduleIndex - 1);
        }
        return new AdvanceAction(nextTask);
    }
}

enum AwaitModulePrepStage { LoadModule, PrepModule }

class AwaitModulePrepTask extends Task {
    moduleIndex: number;
    stage: AwaitModulePrepStage;
    
    constructor(
        parent: Task | null,
        moduleIndex: number,
        stage: AwaitModulePrepStage = AwaitModulePrepStage.LoadModule,
    ) {
        super(parent);
        this.moduleIndex = moduleIndex;
        this.stage = stage;
    }
    
    advance(): Action {
        if (this.stage === AwaitModulePrepStage.LoadModule) {
            const nextTask = new AwaitModulePrepTask(
                this.parentTask,
                this.moduleIndex,
                AwaitModulePrepStage.PrepModule,
            );
            return this.awaitMember(
                this.context.userModules,
                BigInt(this.moduleIndex),
                new funcModule.NotEqualFunc(null),
                new AdvanceAction(nextTask),
            );
        } else if (this.stage === AwaitModulePrepStage.PrepModule) {
            const module = this.context.userModules.getMember(this.moduleIndex) as PetMap;
            const stmtsComp = module.getMember(symbols.STMTS_COMP) as PetMap;
            return this.awaitMember(
                stmtsComp,
                symbols.PHASE,
                new funcModule.NotEqualFunc(symbols.PREP_PHASE),
                this.createReturnAction(null),
            );
        }
    }
}

export class LoadModuleTask extends Task {
    modulePath: string;
    
    // `modulePath` must be an absolute path.
    constructor(modulePath: string) {
        super(null);
        this.modulePath = modulePath;
    }
    
    advance(): Action {
        // TODO: Pass if file is missing.
        const moduleParser = new ModuleParser(this.modulePath);
        const module = moduleParser.parseModule();
        this.context.setUserModule(this.modulePath, module);
        const stmtsComp = module.getMember(symbols.STMTS_COMP) as PetMap;
        const nextTask = new PrepStmtsTask(this.parentTask, stmtsComp);
        return new AdvanceAction(nextTask);
    }
}

enum PrepStmtsStage { PrepStmts, AwaitStmts }

export class PrepStmtsTask extends Task {
    stmtsComp: PetMap;
    stage: PrepStmtsStage;
    stmtIndex: number;
    
    constructor(
        parent: Task | null,
        stmtsComp: PetMap,
        stage: PrepStmtsStage = PrepStmtsStage.PrepStmts,
        stmtIndex: number = 0,
    ) {
        super(parent);
        this.stmtsComp = stmtsComp;
        this.stage = stage;
        this.stmtIndex = stmtIndex;
    }
    
    advance(): Action {
        const stmts = this.stmtsComp.getMember(symbols.STMTS) as PetList;
        if (this.stage === PrepStmtsStage.PrepStmts) {
            for (let index = 0; index < stmts.getLength(); index++) {
                const stmt = stmts.getMember(index) as PetMap;
                // TODO: Invoke #PREP method on `stmt`.
                const task = new DummyPrepTask(null, stmt);
                this.context.scheduler.scheduleTask(task);
            }
            const nextTask = new PrepStmtsTask(
                this.parentTask,
                this.stmtsComp,
                PrepStmtsStage.AwaitStmts,
                0,
            );
            return new AdvanceAction(nextTask);
        } else if (this.stage === PrepStmtsStage.AwaitStmts) {
            if (this.stmtIndex < stmts.getLength()) {
                const stmt = stmts.getMember(this.stmtIndex) as PetMap;
                const nextTask = new PrepStmtsTask(
                    this.parentTask,
                    this.stmtsComp,
                    PrepStmtsStage.AwaitStmts,
                    this.stmtIndex + 1,
                );
                const nextAction = new AdvanceAction(nextTask);
                return this.awaitMember(
                    stmt,
                    symbols.PHASE,
                    new funcModule.NotEqualFunc(symbols.PREP_PHASE),
                    nextAction,
                );
            } else {
                this.stmtsComp.setMember(symbols.PHASE, symbols.WORK_PHASE);
                return this.createReturnAction(null);
            }
        }
    }
}

export class DummyPrepTask extends Task {
    stmt: PetMap;
    
    constructor(parent: Task | null, stmt: PetMap) {
        super(parent);
        this.stmt = stmt;
    }
    
    advance(): Action {
        this.stmt.setMember(symbols.PHASE, symbols.WORK_PHASE);
        return this.createReturnAction(null);
    }
}

export class EvalStmtsTask extends Task {
    stmtsComp: PetMap;
    stmtIndex: number;
    
    constructor(parent: Task | null, stmtsComp: PetMap, stmtIndex: number = 0) {
        super(parent);
        this.stmtsComp = stmtsComp;
        this.stmtIndex = stmtIndex;
    }
    
    advance(): Action {
        const stmts = this.stmtsComp.getMember(symbols.STMTS) as PetList;
        if (this.stmtIndex < stmts.getLength()) {
            const stmt = stmts.getMember(this.stmtIndex) as PetMap;
            // TODO: Invoke #EVAL method on `stmt`.
            const nextTask = new DummyEvalTask(this, stmt);
            return new AdvanceAction(nextTask);
        } else {
            return this.createReturnAction(null);
        }
    }
    
    acceptReturnValue(returnValue: PetValue): Action {
        const nextTask = new EvalStmtsTask(
            this.parentTask,
            this.stmtsComp,
            this.stmtIndex + 1,
        );
        return new AdvanceAction(nextTask);
    }
}

export class DummyEvalTask extends Task {
    stmt: PetMap;
    
    constructor(parent: Task | null, stmt: PetMap) {
        super(parent);
        this.stmt = stmt;
    }
    
    advance(): Action {
        console.log("Wow! I am the dummy eval task");
        console.log(this.stmt);
        return this.createReturnAction(null);
    }
}

export class AwaitCondTask extends Task {
    observer: MemberObserver;
    lastMemberValue?: PetValue;
    
    constructor(observer: MemberObserver, lastMemberValue?: PetValue) {
        super(observer.evalState.currentAction.task);
        this.observer = observer;
        this.lastMemberValue = lastMemberValue;
    }
    
    awaitObserver(): Action {
        const { bunch, location, condition, evalState } = this.observer;
        return this.createAwaitAction(bunch, location, condition, evalState);
    }
    
    callCondition(): Action {
        const memberValue = this.observer.getMemberValue();
        if (typeof memberValue === "undefined") {
            return this.awaitObserver();
        }
        const condTask = new AwaitCondTask(this.observer, memberValue);
        return this.observer.condition.call(condTask, [memberValue]);
    }
    
    advance(): Action {
        return this.callCondition();
    }
    
    acceptReturnValue(returnValue: PetValue): Action {
        // TODO: Throw an error if `returnValue` is not an integer.
        if (returnValue as bigint === 0n) {
            const memberValue = this.observer.getMemberValue();
            if (valueModule.valueMayHaveChanged(this.lastMemberValue, memberValue)) {
                return this.callCondition();
            } else {
                return this.awaitObserver();
            }
        } else {
            return this.observer.evalState.actionToResume;
        }
    }
}


