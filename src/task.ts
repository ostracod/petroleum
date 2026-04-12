
import { PetContext } from "./context.js";
import { Action, AdvanceAction, ExcepAction, createAwaitAction } from "./action.js";
import { symbols } from "./symbol.js";
import * as valueModule from "./value.js";

type PetValue = valueModule.PetValue;
type PetException = valueModule.PetException;
type MemberObserver = valueModule.MemberObserver;

export abstract class Task {
    parentTask: Task | null;
    context: PetContext;
    
    constructor(parentTask: Task | null) {
        this.parentTask = parentTask;
    }
    
    abstract advance(): Action;
    
    acceptReturnValue(returnValue: PetValue): Action {
        return new AdvanceAction(this);
    }
    
    handleException(exception: PetException): Action {
        return new ExcepAction(exception);
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
            return new AdvanceAction(nextTask);
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
        super(observer.actionToResume.task);
        this.observer = observer;
        this.lastMemberValue = lastMemberValue;
    }
    
    callCondition(): Action {
        const memberValue = this.observer.getMemberValue();
        const condTask = new AwaitCondTask(this.observer, memberValue);
        return this.observer.condition.call(condTask, [memberValue]);
    }
    
    advance(): Action {
        return this.callCondition();
    }
    
    acceptReturnValue(returnValue: PetValue): Action {
        // TODO: Throw an error if `returnValue` is not an integer.
        const { bunch, location, condition, actionToResume } = this.observer;
        if (returnValue as bigint === 0n) {
            const memberValue = this.observer.getMemberValue();
            if (valueModule.valueMayHaveChanged(this.lastMemberValue, memberValue)) {
                return createAwaitAction(bunch, location, condition, actionToResume);
            } else {
                return this.callCondition();
            }
        } else {
            return actionToResume;
        }
    }
}


