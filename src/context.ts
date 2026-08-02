
import "./scheduler.js";

import * as pathUtils from "path";
import { symbols } from "./symbol.js";
import { PetValue, KnownValue, PetString, PetList, PetMap } from "./value.js";
import { BuiltInFunc, DefFunc, globalFuncDefs } from "./builtInFunc.js";
import { createProcedure, globalProcDefs } from "./procedure.js";
import { CoroEndError } from "./error.js";
import { ModuleParser } from "./moduleParser.js";
import { resolvePackages } from "./package.js";
import { Action, TaskDef, TaskMembers, Task, mainTask, prepModuleTask } from "./task.js";
import { Scheduler } from "./scheduler.js";

export class PetContext {
    applicationArgs: string[];
    scheduler: Scheduler;
    userModules: PetMap[];
    // Map from absolute module path to index in `userModules`.
    userModuleIndexes: Map<string, number>;
    preppingWorkers: Set<PetMap>;
    globalScope: PetMap;
    
    constructor(entryPackagePath: string, applicationArgs: string[]) {
        this.applicationArgs = applicationArgs;
        this.scheduler = new Scheduler(this);
        this.userModules = [];
        this.userModuleIndexes = new Map();
        this.preppingWorkers = new Set();
        this.globalScope = this.createGlobalScope();
        const entryPackage = resolvePackages(entryPackagePath, this.globalScope);
        const mainModule = entryPackage.getMember(symbols.MAIN_MODULE).getMap();
        this.addUserModule(mainModule);
    }
    
    createGlobalScope(): PetMap {
        const globalVarDict: { [name: string]: KnownValue } = {
            NULL: null,
            TRUE: 1n,
            FALSE: 0n,
            CMD_LINE_ARGS: new PetList(this.applicationArgs.map((arg) => new PetString(arg))),
        };
        for (const symbol of Object.values(symbols)) {
            globalVarDict[symbol.displayName] = symbol;
        }
        for (const funcDef of globalFuncDefs) {
            const { name } = funcDef;
            if (name === null) {
                throw new Error("All global functions must have names.");
            }
            const func = new DefFunc(funcDef);
            globalVarDict[name] = func;
        }
        for (const procDef of globalProcDefs) {
            const proc = createProcedure(procDef);
            globalVarDict[procDef.name] = proc;
        }
        const globalVars: PetMap[] = [];
        const globalVarEntries: [PetString, PetMap][] = [];
        for (const [name, value] of Object.entries(globalVarDict)) {
            const nameString = new PetString(name);
            const globalVar = new PetMap([
                [symbols.VAR_TYPE, symbols.PREP_VAR],
                [symbols.IDENT, nameString],
                [symbols.VALUE, value],
            ]);
            globalVars.push(globalVar);
            globalVarEntries.push([nameString, globalVar]);
        }
        const globalScope = new PetMap([
            [symbols.IS_SCOPE, 1n],
            [symbols.VARS, new PetMap(globalVarEntries)],
        ]);
        for (const globalVar of globalVars) {
            globalVar.setMember(symbols.SCOPE, globalScope);
        }
        return globalScope;
    };
    
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
    
    addUserModule(module: PetMap): void {
        const modulePath = module.getMember(symbols.FILE_PATH).toString();
        this.userModuleIndexes.set(modulePath, this.userModules.length);
        this.userModules.push(module);
        this.scheduler.scheduleTask(prepModuleTask, { module });
    }
    
    loadUserModule(parentPackage: PetMap, relModulePath: string): PetMap {
        const packagePath = parentPackage.getMember(symbols.DIR_PATH).toString();
        const absModulePath = pathUtils.resolve(pathUtils.join(packagePath, relModulePath));
        const userModuleIndex = this.userModuleIndexes.get(absModulePath);
        if (typeof userModuleIndex !== "undefined") {
            return this.userModules[userModuleIndex];
        }
        const moduleParser = new ModuleParser(parentPackage, absModulePath, this.globalScope);
        const module = moduleParser.parseModule();
        this.addUserModule(module);
        return module;
    }
}


