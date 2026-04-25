
// Import this module first so we can define classes in the correct order.
import { MainTask, LoadModuleTask } from "./task.js";

import { Scheduler } from "./scheduler.js";
import { UserPackage } from "./package.js";
import { PetString, PetList, PetMap } from "./value.js";

export class PetContext {
    entryPackage: UserPackage;
    applicationArgs: PetList;
    scheduler: Scheduler;
    // This needs to be a PetList so that MainTask can await each element.
    userModules: PetList;
    // Map from absolute module path to index in `userModules`.
    userModuleIndexes: Map<string, number>;
    preppingWorkers: Set<PetMap>;
    
    constructor(entryPackagePath: string, applicationArgs: string[]) {
        this.entryPackage = new UserPackage(entryPackagePath);
        this.applicationArgs = new PetList(applicationArgs.map((arg) => new PetString(arg)));
        this.scheduler = new Scheduler(this);
        this.userModules = new PetList();
        this.userModuleIndexes = new Map();
        this.preppingWorkers = new Set();
    }
    
    run(): void {
        const mainTask = new MainTask();
        this.scheduler.scheduleTask(mainTask);
        while (!this.scheduler.hasFinished()) {
            this.scheduler.runNextCoro();
        }
    }
    
    loadUserModule(modulePath: string): void {
        if (this.userModuleIndexes.has(modulePath)) {
            return;
        }
        const moduleIndex = this.userModules.getLength();
        this.userModuleIndexes.set(modulePath, moduleIndex);
        this.userModules.addElement(null);
        const loadModuleTask = new LoadModuleTask(modulePath);
        this.scheduler.scheduleTask(loadModuleTask);
    }
    
    setUserModule(modulePath: string, module: PetMap): void {
        const moduleIndex = this.userModuleIndexes.get(modulePath);
        this.userModules.setMember(moduleIndex, module);
    }
}


