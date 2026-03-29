
import { PetException } from "./value.js";
import { Scheduler } from "./scheduler.js";
import { PetContext } from "./context.js";

export abstract class Task {
    parentTask: Task | null;
    
    constructor(parentTask: Task | null) {
        this.parentTask = parentTask;
    }
    
    abstract advance(context: PetContext): Task | PetException | null;
    
    handleException(exception: PetException): Task | PetException | null {
        return this.parentTask;
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
    
    advance(context: PetContext): Task | PetException | null {
        if (this.stage === MainTaskStage.Init) {
            const modulePath = context.entryPackage.mainModulePath;
            context.loadUserModule(modulePath);
            return new MainTask(this.parentTask, MainTaskStage.PrepModules, 0);
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
    
    advance(context: PetContext): Task | PetException | null {
        throw new Error("Not yet implemented");
    }
}


