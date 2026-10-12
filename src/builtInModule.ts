
import "./exception.js";

import * as pathUtils from "path";
import { PetSymbol, symbols } from "./symbol.js";
import { KnownValue, PetString, PetList, PetMap } from "./value.js";
import { FuncDef, DefFunc } from "./builtInFunc.js";
import { PetException, ErrorException } from "./exception.js";
import { createFrame } from "./variable.js";
import { getPathParent } from "./fileSystem.js";

interface BuiltInModuleDef {
    symbol: PetSymbol;
    createVarValues: () => { [name: string]: KnownValue };
    funcs: FuncDef[];
}

const fileSymbol = new PetSymbol("#FILE");
const dirSymbol = new PetSymbol("#DIR");
const fileSystemErrorSymbol = new PetSymbol("#FILE_SYSTEM_ERROR");

const createSymbolMap = (inputSymbols: PetSymbol[]): { [name: string]: PetSymbol } => {
    const output: { [name: string]: PetSymbol } = {};
    for (const symbol of inputSymbols) {
        output[symbol.displayName] = symbol;
    }
    return output;
};

const fileSystemSymbols = createSymbolMap([fileSymbol, dirSymbol, fileSystemErrorSymbol]);

class FileSystemError extends ErrorException {
    
    constructor(message: string) {
        super(fileSystemErrorSymbol, message);
    }
}

const createBuiltInModule = (moduleDef: BuiltInModuleDef): PetMap => {
    const varMap = new PetMap();
    const scope = new PetMap([
        [symbols.IS_SCOPE, 1n],
        [symbols.VARS, varMap],
        [symbols.PERMA_FRAME, null],
    ]);
    const valueDict = moduleDef.createVarValues();
    const valueMap = new Map(Object.entries(valueDict));
    for (const funcDef of moduleDef.funcs) {
        const func = new DefFunc(funcDef);
        const { name } = funcDef;
        if (name === null) {
            throw new Error("All built-in module functions must have names.");
        }
        valueMap.set(name, func);
    }
    for (const [key, value] of valueMap.entries()) {
        const name = new PetString(key);
        const variable = new PetMap([
            [symbols.VAR_TYPE, symbols.PREP_VAR],
            [symbols.IDENT, name],
            [symbols.VALUE, value],
            [symbols.SCOPE, scope],
        ]);
        varMap.setMember(name, variable);
    }
    const frame = createFrame(scope, null);
    const module = new PetMap([
        [symbols.MODULE_TYPE, symbols.BUILT_IN_MODULE],
        [symbols.SYMBOL, moduleDef.symbol],
        [symbols.SCOPE, scope],
        [symbols.FRAME, frame],
    ]);
    scope.setMember(symbols.MODULE, module);
    return module;
};

export const createBuiltInModules = (): Map<PetSymbol, PetMap> => {
    const output = new Map<PetSymbol, PetMap>();
    for (const moduleDef of builtInModuleDefs) {
        const module = createBuiltInModule(moduleDef);
        output.set(moduleDef.symbol, module);
    }
    return output;
};

const fileSystemFuncDefs: FuncDef[] = [
    {
        name: "EXISTS",
        argAmount: 1,
        call: (task, args) => {
            const result = task.context.fileSystem.entityExists(args[0].toStringStrict());
            return task.returnValue(result ? 1n : 0n);
        },
    },
    {
        name: "TYPE",
        argAmount: 1,
        call: (task, args) => {
            const path = args[0].toStringStrict();
            const isDirectory = task.context.fileSystem.entityIsDirectory(path);
            const result = isDirectory ? dirSymbol : fileSymbol;
            return task.returnValue(result);
        },
    },
    {
        name: "READ_FILE",
        argAmount: 1,
        call: (task, args) => {
            const buffer = task.context.fileSystem.readFile(args[0].toStringStrict());
            return task.returnValue(new PetString(buffer));
        },
    },
    {
        name: "READ_DIR",
        argAmount: 1,
        call: (task, args) => {
            const fileNames = task.context.fileSystem.readDirectory(args[0].toStringStrict());
            const result = new PetList(fileNames.map((name) => new PetString(name)));
            return task.returnValue(result);
        },
    },
    {
        name: "WRITE_FILE",
        argAmount: 2,
        call: (task, args) => {
            const buffer = args[1].getPetString().toBuffer();
            task.context.fileSystem.writeFile(args[0].toStringStrict(), buffer);
            return task.returnValue(null);
        },
    },
    {
        name: "NEW_DIR",
        argAmount: 1,
        call: (task, args) => {
            task.context.fileSystem.createDirectory(args[0].toStringStrict());
            return task.returnValue(null);
        },
    },
    {
        name: "DEL_FILE",
        argAmount: 1,
        call: (task, args) => {
            task.context.fileSystem.deleteFile(args[0].toStringStrict());
            return task.returnValue(null);
        },
    },
    {
        name: "DEL_DIR",
        argAmount: 1,
        call: (task, args) => {
            const { fileSystem } = task.context;
            const path = args[0].toStringStrict();
            if (!fileSystem.entityIsDirectory(path)) {
                throw new FileSystemError("Expected directory.");
            }
            fileSystem.deleteDirectory(path);
            return task.returnValue(null);
        },
    },
    {
        name: "PATH_NAME",
        argAmount: 1,
        call: (task, args) => {
            const result = pathUtils.basename(args[0].toStringStrict());
            return task.returnValue(new PetString(result));
        },
    },
    {
        name: "PATH_PARENT",
        argAmount: 1,
        call: (task, args) => {
            const path = args[0].toStringStrict();
            const parentPath = getPathParent(path);
            const result = (parentPath === null) ? null : new PetString(parentPath);
            return task.returnValue(result);
        },
    },
    {
        name: "JOIN_PATHS",
        argAmount: 1,
        call: (task, args) => {
            const pathSegments = args[0].getList().elements.map(
                (element) => element.toStringStrict(),
            );
            const result = pathUtils.join(...pathSegments);
            return task.returnValue(new PetString(result));
        },
    },
    {
        name: "NORM_PATH",
        argAmount: 1,
        call: (task, args) => {
            const result = pathUtils.normalize(args[0].toStringStrict());
            return task.returnValue(new PetString(result));
        },
    },
    {
        name: "IS_ABS_PATH",
        argAmount: 1,
        call: (task, args) => {
            const result = pathUtils.isAbsolute(args[0].toStringStrict());
            return task.returnValue(result ? 1n : 0n);
        },
    },
    {
        name: "ABS_PATH",
        argAmount: 1,
        call: (task, args) => {
            const result = task.context.fileSystem.getAbsolutePath(args[0].toStringStrict());
            return task.returnValue(new PetString(result));
        },
    },
    {
        name: "REL_PATH",
        argAmount: 2,
        call: (task, args) => {
            const refPath = args[0].toStringStrict();
            const targetPath = args[1].toStringStrict();
            const result = task.context.fileSystem.getRelativePath(refPath, targetPath);
            return task.returnValue(new PetString(result));
        },
    },
];

const builtInModuleDefs: BuiltInModuleDef[] = [
    {
        symbol: symbols.FILE_SYSTEM,
        createVarValues: () => fileSystemSymbols,
        funcs: fileSystemFuncDefs.map((funcDef) => ({
            ...funcDef,
            call: (task, args) => {
                try {
                    return funcDef.call(task, args);
                } catch (error) {
                    if (error instanceof PetException || !(error instanceof Error)) {
                        throw error;
                    }
                    throw new FileSystemError(error.message);
                }
            },
        })),
    },
];


