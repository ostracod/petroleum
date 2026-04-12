
import { PetString, PetList } from "./value.js";
import { MainTask, LoadModuleTask } from "./task.js";
import { Scheduler } from "./scheduler.js";
import { PetPackage, UserPackage } from "./package.js";

export class PetContext {
    entryPackage: UserPackage;
    applicationArgs: PetList;
    scheduler: Scheduler;
    // This needs to be a PetList so that MainTask can await each element.
    userModules: PetList;
    userModuleIndexes: Map<string, number>;
    
    constructor(entryPackagePath: string, applicationArgs: string[]) {
        this.entryPackage = new UserPackage(entryPackagePath);
        this.applicationArgs = new PetList(applicationArgs.map((arg) => new PetString(arg)));
        this.scheduler = new Scheduler(this);
        this.userModules = new PetList();
        this.userModuleIndexes = new Map();
    }
    
    run(): void {
        const mainTask = new MainTask();
        this.scheduler.scheduleTask(mainTask);
        while (!this.scheduler.hasFinished()) {
            this.scheduler.runNextCoro();
        }
    }
    
    // `modulePath` must be an absolute path.
    loadUserModule(modulePath: string): void {
        if (this.userModuleIndexes.has(modulePath)) {
            return;
        }
        const moduleIndex = this.userModules.getLength();
        this.userModuleIndexes.set(modulePath, moduleIndex);
        this.userModules.addElement(null);
        const loadModuleTask = new LoadModuleTask(null, modulePath);
        this.scheduler.scheduleTask(loadModuleTask);
    }
}


