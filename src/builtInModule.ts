
import "./exception.js";

import * as pathUtils from "path";
import { PetSymbol, symbols } from "./symbol.js";
import { KnownValue, PetValue, minIntValue, maxIntValue, PetString, PetList, PetMap } from "./value.js";
import { FuncDef, DefFunc } from "./builtInFunc.js";
import { PetException, ErrorException, PetTypeError, ValueError } from "./exception.js";
import { createFrame } from "./variable.js";
import { getPathName, getPathParent } from "./fileSystem.js";

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
            const result = getPathName(args[0].toStringStrict());
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

const jsonNumberRegex = /^(-?[0-9]+)?(\.[0-9]*)?([eE][-+]?[0-9]+)?$/;

const bigIntReviver = (key: string, value: any, context: { source?: string }): unknown => {
    if (typeof value !== "number") {
        return value;
    }
    const match = context.source!.match(jsonNumberRegex);
    if (match === null) {
        throw new ValueError("Could not parse JSON number.");
    }
    const leadingGroup = match[1];
    const decimalGroup = match[2];
    const exponentGroup = match[3];
    let isNegative: boolean;
    let leadingDigits: string;
    if (typeof leadingGroup === "undefined") {
        isNegative = false;
        leadingDigits = "";
    } else {
        if (leadingGroup.charAt(0) === "-") {
            isNegative = true;
            leadingDigits = leadingGroup.slice(1);
        } else {
            isNegative = false;
            leadingDigits = leadingGroup;
        }
    }
    const decimalDigits = (typeof decimalGroup === "undefined") ? "" : decimalGroup.slice(1);
    let exponent = (typeof exponentGroup === "undefined")
        ? 0
        : parseInt(exponentGroup.slice(1), 10);
    exponent -= decimalDigits.length;
    let digits = leadingDigits + decimalDigits;
    let allDigitsAreZero = true;
    for (let index = 0; index < digits.length; index++) {
        if (digits.charAt(index) !== "0") {
            allDigitsAreZero = false;
            break;
        }
    }
    if (allDigitsAreZero) {
        // Return early before checking for large exponent.
        return 0n;
    }
    if (exponent > 20) {
        // Avoid constructing massively large bigint.
        throw new ValueError("JSON number is outside signed 64-bit integer range.");
    }
    if (exponent > 0) {
        // Add `exponent` zeros.
        digits += "0".repeat(exponent);
    } else if (exponent < 0) {
        // Trim `abs(exponent)` digits, and make sure they are all zero.
        const trimIndex = Math.max(0, digits.length + exponent);
        for (let index = digits.length - 1; index >= trimIndex; index--) {
            if (digits.charAt(index) !== "0") {
                throw new ValueError("JSON number must be a whole number.");
            }
        }
        digits = digits.slice(0, trimIndex);
    }
    if (digits.length <= 0) {
        return 0n;
    }
    const intValue = BigInt(digits);
    return (isNegative) ? -intValue : intValue;
};

const jsonDataToValue = (jsonData: any): KnownValue => {
    if (typeof jsonData === "string") {
        return new PetString(jsonData);
    } else if (typeof jsonData === "bigint") {
        if (jsonData < minIntValue || jsonData > maxIntValue) {
            throw new ValueError("JSON number is outside signed 64-bit integer range.");
        }
        return jsonData;
    } else if (typeof jsonData === "boolean") {
        return jsonData ? 1n : 0n;
    } else if (jsonData === null) {
        return null;
    } else if (Array.isArray(jsonData)) {
        const elements = jsonData.map((jsonElement) => jsonDataToValue(jsonElement));
        return new PetList(elements);
    } else if (typeof jsonData === "object") {
        const jsonEntries = Object.entries(jsonData as { [key: string]: any });
        const fieldEntries: [KnownValue, KnownValue][] = jsonEntries.map(
            ([key, jsonMember]) => [new PetString(key), jsonDataToValue(jsonMember)],
        );
        return new PetMap(fieldEntries);
    } else {
        throw new PetTypeError("Unsupported JSON data type.");
    }
};

const valueToJsonData = (inputValue: PetValue, parents: KnownValue[] = []): unknown => {
    const value = inputValue.getKnownValue();
    if (parents.some((parent) => (parent === value))) {
        throw new ValueError("Cannot convert value with circular reference to JSON.");
    }
    if (value instanceof PetString) {
        return value.toString();
    } else if (typeof value === "bigint") {
        return JSON.rawJSON(`${value}`);
    } else if (value instanceof PetList) {
        const nextParents = [...parents, value];
        return value.elements.map((element) => valueToJsonData(element, nextParents));
    } else if (value instanceof PetMap) {
        const nextParents = [...parents, value];
        const dict: { [name: string]: unknown } = {};
        for (const field of value.fields.values()) {
            const { key } = field;
            if (!(key instanceof PetString)) {
                throw new PetTypeError("All map keys must be strings for JSON conversion.");
            }
            const jsonMember = valueToJsonData(field.value, nextParents);
            Object.defineProperty(
                dict,
                key.toString(),
                { value: jsonMember, enumerable: true },
            );
        }
        return dict;
    } else if (value === null) {
        return null;
    } else {
        throw new PetTypeError("Unsupported value type for JSON conversion.");
    }
};

const jsonFuncDefs: FuncDef[] = [
    {
        name: "PARSE",
        argAmount: 1,
        call: (task, args) => {
            const jsonText = args[0].toStringStrict();
            let jsonData: unknown;
            try {
                jsonData = JSON.parse(jsonText, bigIntReviver);
            } catch (error) {
                if (error instanceof PetException) {
                    throw error;
                }
                const message = (error instanceof Error) ? error.message : `${error}`;
                throw new ValueError(message);
            }
            const result = jsonDataToValue(jsonData);
            return task.returnValue(result);
        },
    },
    {
        name: "STR",
        minArgAmount: 1,
        maxArgAmount: 2,
        call: (task, args) => {
            const jsonData = valueToJsonData(args[0]);
            const indentation = (args.length > 1) ? args[1].toNumber() : undefined;
            const result = JSON.stringify(jsonData, undefined, indentation);
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
    {
        symbol: symbols.JSON,
        createVarValues: () => ({}),
        funcs: jsonFuncDefs,
    },
];


