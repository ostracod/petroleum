
import "./scheduler.js";

import * as pathUtils from "path";
import { symbols } from "./symbol.js";
import { PetValue, KnownValue, PetString, MemberObserver, PetList, PetMap } from "./value.js";
import { BuiltInFunc, DefFunc, globalFuncDefs } from "./builtInFunc.js";
import { createProcedure, globalProcDefs } from "./procedure.js";
import { PetException, CoroEndException, getExcepReport } from "./exception.js";
import { ModuleParser } from "./moduleParser.js";
import { PackageResolver } from "./package.js";
import { Action, TaskDef, TaskMembers, Task, mainTask, prepModuleTask } from "./task.js";
import { Spinner, Coroutine, Scheduler } from "./scheduler.js";

export class PetContext {
    applicationArgs: string[];
    scheduler: Scheduler;
    userModules: PetMap[];
    // Map from absolute module path to index in `userModules`.
    userModuleIndexes: Map<string, number>;
    preppingWorkers: Set<PetMap>;
    globalScope: PetMap;
    isPrepping: boolean;
    aggregatedExceps: PetMap[];
    hasReportedProblem: boolean;
    
    constructor(entryPackagePath: string, applicationArgs: string[]) {
        this.applicationArgs = applicationArgs;
        this.scheduler = new Scheduler(this);
        this.userModules = [];
        this.userModuleIndexes = new Map();
        this.preppingWorkers = new Set();
        this.globalScope = this.createGlobalScope();
        this.isPrepping = true;
        this.aggregatedExceps = [];
        this.hasReportedProblem = false;
        const packageResolver = new PackageResolver(entryPackagePath, this.globalScope);
        let entryPackage: PetMap | null;
        let exceptions: PetMap[];
        try {
            ({ entryPackage, exceptions } = packageResolver.resolvePackages());
        } catch (error) {
            if (error instanceof PetException) {
                exceptions = [error.mapValue.getMap()];
            } else {
                throw error;
            }
        }
        if (exceptions.length > 0) {
            for (const exception of exceptions) {
                this.reportException(exception);
            }
        } else {
            const mainModule = entryPackage.getMember(symbols.MAIN_MODULE).getMap();
            this.addUserModule(mainModule);
        }
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
        if (this.hasReportedProblem) {
            return;
        }
        this.scheduler.scheduleTask(mainTask, null);
        let isStuckSpinning = false;
        while (!this.hasReportedProblem) {
            const hasRun = this.scheduler.runNextCoro();
            if (!hasRun) {
                break;
            }
            isStuckSpinning = this.scheduler.isStuckSpinning();
            if (isStuckSpinning) {
                break;
            }
        }
        const { waitingObservers } = this.scheduler;
        const isStuck = (isStuckSpinning || waitingObservers.size > 0);
        if (!this.hasReportedProblem && isStuck) {
            if (this.aggregatedExceps.length > 0) {
                for (const exception of this.aggregatedExceps) {
                    this.reportException(exception);
                }
            } else {
                for (const observer of waitingObservers) {
                    this.reportObserver(observer);
                }
                if (isStuckSpinning) {
                    let coroutine = this.scheduler.spinCoros.firstCoro;
                    while (coroutine !== null) {
                        this.reportSpinner(coroutine.spinner);
                        coroutine = coroutine.nextCoro;
                    }
                }
            }
        }
    }
    
    startTask<ParamsT, StateT>(
        taskDef: TaskDef<ParamsT, StateT>,
        params: ParamsT,
        parentTask: Task | null,
        acceptReturnValue: (value: PetValue) => Action,
        handleException: (exception: PetValue) => Action,
    ): Action {
        const members: TaskMembers<ParamsT, StateT> = {
            parentTask,
            stages: taskDef.stages,
            acceptReturnValue,
            handleException,
            ...taskDef.getNodes?.(params),
        };
        const initState = taskDef.getInitState(params)
        const task = new Task<ParamsT, StateT>(this, members, params, initState, 0);
        return task.getStageAction();
    };
    
    runTask<ParamsT, StateT>(taskDef: TaskDef<ParamsT, StateT>, params: ParamsT): Action {
        return this.startTask(
            taskDef, params, null,
            (value) => {
                throw new CoroEndException(null);
            },
            (exception) => {
                throw new CoroEndException(exception);
            },
        );
    }
    
    hasUserModule(absModulePath: string): boolean {
        return this.userModuleIndexes.has(absModulePath);
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
    
    handleUncaughtExcep(exception: PetMap): void {
        if (this.isPrepping) {
            this.aggregatedExceps.push(exception);
        } else {
            this.reportException(exception);
        }
    }
    
    reportProblem(description: string): void {
        if (!this.hasReportedProblem) {
            console.log("");
        }
        console.log(description);
        console.log("");
        this.hasReportedProblem = true;
    }
    
    reportException(exception: PetMap): void {
        this.reportProblem(getExcepReport(exception));
    }
    
    reportObserver(observer: MemberObserver): void {
        this.reportProblem(observer.getStuckReport());
    }
    
    reportSpinner(spinner: Spinner): void {
        this.reportProblem(spinner.getStuckReport());
    }
}


