
import "./exception.js";
import { PetSymbol, symbols } from "./symbol.js";
import { KnownValue, PetString, PetMap } from "./value.js";
import { FuncDef, DefFunc } from "./builtInFunc.js";
import { createFrame } from "./variable.js";

interface BuiltInModuleDef {
    symbol: PetSymbol;
    createVarValues: () => { [name: string]: KnownValue };
    funcs: FuncDef[];
}

const fileSymbol = new PetSymbol("#FILE");
const dirSymbol = new PetSymbol("#DIR");
const fileSystemErrorSymbol = new PetSymbol("#FILE_SYSTEM_ERROR");

const createSymbolMap = (symbols: PetSymbol[]): { [name: string]: PetSymbol } => {
    const output: { [name: string]: PetSymbol } = {};
    for (const symbol of symbols) {
        output[symbol.displayName] = symbol;
    }
    return output;
}

const fileSystemSymbols = createSymbolMap([fileSymbol, dirSymbol, fileSystemErrorSymbol]);

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
    const output = new Map();
    for (const moduleDef of builtInModuleDefs) {
        const module = createBuiltInModule(moduleDef);
        output.set(moduleDef.symbol, module);
    }
    return output;
};

const builtInModuleDefs: BuiltInModuleDef[] = [
    {
        symbol: symbols.FILE_SYSTEM,
        createVarValues: () => fileSystemSymbols,
        funcs: [],
    },
];


