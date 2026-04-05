
import * as valueModule from "./value.js";
import { symbols } from "./symbol.js";
import { Action, TaskAction, ExcepAction } from "./action.js";
import { PetContext } from "./context.js";

type PetValue = valueModule.PetValue;
type PetException = valueModule.PetException;
type PetFunc = valueModule.PetFunc;
type ObservableBunch = valueModule.ObservableBunch;
type MemberObserver = valueModule.MemberObserver;

export abstract class Task {
    parentTask: Task | null;
    context: PetContext;
    
    constructor(parentTask: Task | null) {
        this.parentTask = parentTask;
    }
    
    abstract advance(): Action;
    
    acceptReturnValue(returnValue: PetValue): Action {
        return new TaskAction(this);
    }
    
    handleException(exception: PetException): Action {
        return new TaskAction(this.parentTask);
    }
    
    createExcepAction(exception: PetException): ExcepAction {
        let evalState = exception.getMember(symbols.EVAL_STATE);
        if (!(evalState instanceof valueModule.EvalState)) {
            evalState = new valueModule.EvalState(this);
            exception.setMember(symbols.EVAL_STATE, evalState);
        }
        return new ExcepAction(exception);
    }
    
    createAwaitAction(
        bunch: ObservableBunch,
        location: PetValue,
        condition: PetFunc,
        taskToResume?: Task,
    ): ExcepAction {
        const exception = new valueModule.PetMap([
            [symbols.EXCEP_TYPE, symbols.AWAIT_EXCEP],
            [symbols.BUNCH, bunch],
            [symbols.LOC, location],
            [symbols.COND, condition],
        ]);
        if (typeof taskToResume !== "undefined") {
            const evalState = new valueModule.EvalState(taskToResume);
            exception.setMember(symbols.EVAL_STATE, evalState);
        }
        return this.createExcepAction(exception);
    }
}

enum MainTaskStage { Init, PrepModules, EvalModules }

export class MainTask extends Task {
    stage: MainTaskStage;
    moduleIndex: number;
    
    constructor(
        parentTask: Task | null = null,
        stage: MainTaskStage = MainTaskStage.Init,
        moduleIndex: number = 0,
    ) {
        super(parentTask);
        this.stage = stage;
        this.moduleIndex = moduleIndex;
    }
    
    advance(): Action {
        if (this.stage === MainTaskStage.Init) {
            const modulePath = this.context.entryPackage.mainModulePath;
            this.context.loadUserModule(modulePath);
            const nextTask = new MainTask(this.parentTask, MainTaskStage.PrepModules, 0);
            return new TaskAction(nextTask);
        } else if (this.stage === MainTaskStage.PrepModules) {
            // TODO: Await each user module which is being loaded.
            throw new Error("Not yet implemented");
        } else {
            throw new Error("Not yet implemented");
        }
    }
}

enum LoadModuleStage { Init, PrepStmts }

export class LoadModuleTask extends Task {
    modulePath: string;
    stage: LoadModuleStage;
    
    constructor(
        parentTask: Task | null,
        modulePath: string,
        stage: LoadModuleStage = LoadModuleStage.Init,
    ) {
        super(parentTask);
        this.modulePath = modulePath;
        this.stage = stage;
    }
    
    advance(): Action {
        throw new Error("Not yet implemented");
    }
}

export class AwaitCondTask extends Task {
    observer: MemberObserver;
    lastMemberValue?: PetValue;
    
    constructor(observer: MemberObserver, lastMemberValue?: PetValue) {
        super(observer.taskToResume);
        this.observer = observer;
        this.lastMemberValue = lastMemberValue;
    }
    
    callCondition(): Action {
        const memberValue = this.observer.getMemberValue();
        const condTask = new AwaitCondTask(this.observer, memberValue);
        const nextTask = this.observer.condition.call(condTask, [memberValue]);
        return new TaskAction(nextTask);
    }
    
    advance(): Action {
        return this.callCondition();
    }
    
    acceptReturnValue(returnValue: PetValue): Action {
        // TODO: Throw an error if `returnValue` is not an integer.
        const { bunch, location, condition, taskToResume } = this.observer;
        if (returnValue as bigint === 0n) {
            const memberValue = this.observer.getMemberValue();
            if (valueModule.valuesAreEqual(memberValue, this.lastMemberValue)) {
                return this.createAwaitAction(bunch, location, condition, taskToResume);
            } else {
                return this.callCondition();
            }
        } else {
            return new TaskAction(taskToResume);
        }
    }
}


