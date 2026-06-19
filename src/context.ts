
import "./scheduler.js";

import { symbols } from "./symbol.js";
import { KnownValue, PetString, PetList, PetMap } from "./value.js";
import { CoroEndError } from "./error.js";
import { UserPackage } from "./package.js";
import { Action, TaskDef, TaskMembers, Task, mainTask, loadModuleTask } from "./task.js";
import { Scheduler } from "./scheduler.js";

export class PetContext {
    entryPackage: UserPackage;
    scheduler: Scheduler;
    // This needs to be a PetList so that mainTask can await each element.
    userModules: PetList;
    // Map from absolute module path to index in `userModules`.
    userModuleIndexes: Map<string, number>;
    preppingWorkers: Set<PetMap>;
    globalScope: PetMap;
    
    constructor(entryPackagePath: string, applicationArgs: string[]) {
        this.entryPackage = new UserPackage(entryPackagePath);
        this.scheduler = new Scheduler(this);
        this.userModules = new PetList();
        this.userModuleIndexes = new Map();
        this.preppingWorkers = new Set();
        const globalVars: { [name: string]: KnownValue } = {
            NULL: null,
            TRUE: 1n,
            FALSE: 0n,
            CMD_LINE_ARGS: new PetList(applicationArgs.map((arg) => new PetString(arg))),
        };
        for (const symbol of Object.values(symbols)) {
            globalVars[symbol.displayName] = symbol;
        }
        const globalVarEntries = Object.entries(globalVars).map(
            ([name, value]) => [new PetString(name), value] as [KnownValue, KnownValue],
        );
        this.globalScope = new PetMap([
            [symbols.IS_SCOPE, 1n],
            [symbols.VARS, new PetMap(globalVarEntries)],
        ]);
    }
    
    run(): void {
        this.scheduler.scheduleTask(mainTask, null);
        while (true) {
            const hasRun = this.scheduler.runNextCoro();
            if (!hasRun) {
                break;
            }
        }
    }
    
    runTask<ParamsT, StateT>(taskDef: TaskDef<ParamsT, StateT>, params: ParamsT): Action {
        const members: TaskMembers<ParamsT, StateT> = {
            parentTask: null,
            stages: taskDef.stages,
            acceptReturnValue: (value) => {
                throw new CoroEndError(null);
            },
            handleException: (exception) => {
                throw new CoroEndError(exception);
            },
        };
        const task = new Task<ParamsT, StateT>(
            this,
            members,
            params,
            taskDef.getInitState(params),
            0,
        );
        return task.getStageAction();
    }
    
    loadUserModule(modulePath: string): void {
        if (this.userModuleIndexes.has(modulePath)) {
            return;
        }
        const moduleIndex = this.userModules.getLength();
        this.userModuleIndexes.set(modulePath, moduleIndex);
        this.userModules.addElement(null);
        this.scheduler.scheduleTask(loadModuleTask, { modulePath });
    }
    
    setUserModule(modulePath: string, module: PetMap): void {
        const moduleIndex = this.userModuleIndexes.get(modulePath);
        this.userModules.setMember(moduleIndex, module);
    }
}


