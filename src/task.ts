
import { PetValue, PetException, MemberObserver } from "./value.js";
import { Action, TaskAction } from "./action.js";
import { Scheduler } from "./scheduler.js";
import { PetContext } from "./context.js";

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
    memberValue: PetValue;
    
    constructor(observer: MemberObserver, memberValue: PetValue) {
        super(null);
        this.observer = observer;
        this.memberValue = memberValue;
    }
    
    advance(): Action {
        throw new Error("Not yet implemented");
    }
}


