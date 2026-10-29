
import "./value.js";

import { PetSymbol, symbols } from "./symbol.js";
import { toSignedInt64, KnownValue, PetValue, wrapKnownValue, knownValueToLiteral, minIntValue, maxIntValue, stringToLiteral, compareValues, PetString, PetList, PetMap, PetFunc, EvalState, valuesAreEqual } from "./value.js";
import { PetTypeError, ValueError, StateError } from "./exception.js";
import { getChildWorkers } from "./node.js";
import { findVariable, findVarValue, getScope, createFrame } from "./variable.js";
import { Action, Task } from "./task.js";
import { PetContext } from "./context.js";
import { FileSystem } from "./fileSystem.js";

export interface FuncDef {
    name: string | null;
    argAmount?: number | null;
    // If argAmount is missing, minArgAmount and maxArgAmount must be defined.
    minArgAmount?: number;
    maxArgAmount?: number;
    call: (task: Task, args: PetValue[]) => Action;
}

export abstract class BuiltInFunc extends PetFunc {
    
    toString(): string {
        return "<builtInFunc>";
    }
    
    abstract callBuiltIn(task: Task, args: PetValue[]): Action;
    
    call(task: Task, args: PetList): Action {
        return this.callBuiltIn(task, args.elements);
    }
}

export class ConstantFunc extends BuiltInFunc {
    constantValue: KnownValue;
    
    constructor(constantValue: KnownValue) {
        super();
        this.constantValue = constantValue;
    }
    
    getMinArgAmount(): number {
        return 0;
    }
    
    getMaxArgAmount(): number | null {
        return null;
    }
    
    callBuiltIn(task: Task, args: PetValue[]): Action {
        return task.returnValue(this.constantValue);
    }
}

export class NotEqualFunc extends BuiltInFunc {
    comparisonValue: KnownValue;
    
    constructor(comparisonValue: KnownValue) {
        super();
        this.comparisonValue = comparisonValue;
    }
    
    getMinArgAmount(): number {
        return 1;
    }
    
    getMaxArgAmount(): number | null {
        return 1;
    }
    
    callBuiltIn(task: Task, args: PetValue[]): Action {
        const value = args[0].getKnownValue();
        const result = valuesAreEqual(value, this.comparisonValue) ? 0n : 1n;
        return task.returnValue(result);
    }
}

export class FileExistsFunc extends BuiltInFunc {
    fileSystem: FileSystem;
    path: string;
    
    constructor(fileSystem: FileSystem, path: string) {
        super();
        this.fileSystem = fileSystem;
        this.path = path;
    }
    
    getMinArgAmount(): number {
        return 0;
    }
    
    getMaxArgAmount(): number | null {
        return 0;
    }
    
    callBuiltIn(task: Task, args: PetValue[]): Action {
        const result = this.fileSystem.entityExists(this.path);
        return task.returnValue(result ? 1n : 0n);
    }
}

export class DefFunc extends BuiltInFunc {
    def: FuncDef;
    minArgAmount: number;
    maxArgAmount: number | null;
    
    constructor(def: FuncDef) {
        super();
        this.def = def;
        const { argAmount } = this.def;
        if (typeof argAmount === "undefined") {
            this.minArgAmount = this.def.minArgAmount!;
            this.maxArgAmount = this.def.maxArgAmount!;
        } else {
            this.minArgAmount = (argAmount === null) ? 0 : argAmount;
            this.maxArgAmount = argAmount;
        }
    }
    
    getMinArgAmount(): number {
        return this.minArgAmount;
    }
    
    getMaxArgAmount(): number | null {
        return this.maxArgAmount;
    }
    
    callBuiltIn(task: Task, args: PetValue[]): Action {
        return this.def.call(task, args);
    }
    
    override toString(): string {
        return this.def.name ?? super.toString();
    }
}

const getTypeSymbol = (value: KnownValue): PetSymbol => {
    if (value === null) {
        return symbols.NULL;
    } else if (typeof value === "bigint") {
        return symbols.INT;
    } else if (value instanceof PetSymbol) {
        return symbols.SYMBOL;
    } else if (value instanceof PetString) {
        return symbols.STR;
    } else if (value instanceof PetList) {
        return symbols.LIST;
    } else if (value instanceof PetMap) {
        return symbols.MAP;
    } else if (value instanceof PetFunc) {
        return symbols.FUNC;
    } else if (value instanceof EvalState) {
        return symbols.EVAL_STATE;
    } else {
        throw new PetTypeError("Erm, what the sigma?");
    }
};

const intDigitSet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

const checkBase = (base: bigint): void => {
    if (base < 2 || base > intDigitSet.length) {
        throw new ValueError(`Base must be between 2 and ${intDigitSet.length} inclusive.`);
    }
};

const intToString = (intValue: bigint, base: bigint): string => {
    checkBase(base);
    let isNegative: boolean;
    let leftOverValue: bigint;
    if (intValue < 0) {
        isNegative = true;
        leftOverValue = -intValue;
    } else {
        isNegative = false;
        leftOverValue = intValue;
    }
    const digits: string[] = [];
    while (leftOverValue > 0) {
        const digitValue = leftOverValue % base;
        const digit = intDigitSet.charAt(Number(digitValue));
        digits.push(digit);
        leftOverValue /= base;
    }
    if (digits.length <= 0) {
        digits.push(intDigitSet.charAt(0));
    }
    digits.reverse();
    const text = digits.join("");
    return isNegative ? "-" + text : text;
};

const parseBigInt = (text: string, base: bigint): bigint => {
    checkBase(base);
    if (text.length < 1) {
        throw new ValueError("Cannot parse empty string as integer.");
    }
    const firstChar = text.charAt(0);
    let isNegative: boolean;
    let startIndex: number;
    if (firstChar === "-") {
        isNegative = true;
        startIndex = 1;
    } else {
        isNegative = false;
        startIndex = 0;
    }
    if (startIndex >= text.length) {
        throw new ValueError("Missing digit after minus sign.");
    }
    const uppercaseText = text.toUpperCase();
    let accumulator = 0n;
    let placeValue = 1n;
    for (let index = uppercaseText.length - 1; index >= startIndex; index--) {
        const digit = uppercaseText.charAt(index);
        const digitValue = intDigitSet.indexOf(digit);
        if (digitValue < 0 || digitValue >= base) {
            throw new ValueError(`String ${stringToLiteral(text)} contains invalid digit in base ${base}.`);
        }
        accumulator += BigInt(digitValue) * placeValue;
        placeValue *= base;
    }
    return isNegative ? -accumulator : accumulator;
};

const randBinAmount = 1024;
const randBinsBigInt = BigInt(randBinAmount);

// Generates a random integer between 0 and maxValue inclusive in an "almost uniform" way.
const randomIntHelper = (maxValue: bigint): bigint => {
    const endValue = maxValue + 1n;
    if (endValue < 1000000n) {
        return BigInt(Math.floor(Math.random() * Number(endValue)));
    }
    const binIndex = BigInt(Math.floor(Math.random() * randBinAmount));
    const rangeMin = endValue * binIndex / randBinsBigInt;
    const rangeEnd = endValue * (binIndex + 1n) / randBinsBigInt;
    const rangeMax = rangeEnd - 1n;
    return randomIntHelper(rangeMax - rangeMin) + rangeMin;
};

const generateRandomInt = (minValue: bigint, maxValue: bigint): bigint => {
    if (minValue > maxValue) {
        throw new ValueError("Minimum value must not be bigger than maximum value.");
    }
    return randomIntHelper(maxValue - minValue) + minValue;
};

const assertWorkerUnprepped = (context: PetContext, worker: PetMap): void => {
    const phase = worker.getMember(symbols.PHASE).getSymbol();
    if (phase !== symbols.PREP_PHASE || context.preppingWorkers.has(worker)) {
        throw new StateError("Cannot clone code which has begun prepping.");
    }
};

const checkCodeToClone = (context: PetContext, code: PetMap): void => {
    if (code.hasKey(symbols.PHASE)) {
        assertWorkerUnprepped(context, code);
        return;
    }
    const workers = getChildWorkers(code);
    for (const worker of workers) {
        assertWorkerUnprepped(context, worker);
    }
};

interface CloneScopes {
    original: PetMap;
    copy: PetMap;
}

const cloneScopeHelper = (scope: PetMap): PetMap => {
    const scopeCopy = scope.shallowCopy();
    const vars = scope.getMember(symbols.VARS).getMap();
    const varsCopy = new PetMap();
    for (const field of vars.fields.values()) {
        const varName = field.key;
        const variable = field.value.getMap();
        const variableCopy = variable.shallowCopy();
        variableCopy.setMember(symbols.SCOPE, scopeCopy);
        varsCopy.setMember(varName, variableCopy);
    }
    scopeCopy.setMember(symbols.VARS, varsCopy);
    return scopeCopy;
};

const cloneScope = (
    stmtsComp: PetMap,
    scope: PetMap,
    lastScopes: CloneScopes | null,
): PetMap => {
    const scopeCopy = cloneScopeHelper(scope);
    scopeCopy.setMember(symbols.STMTS_COMP, stmtsComp);
    if (lastScopes !== null) {
        // Any number of scopes may be inserted between statement sequence components.
        // We need to clone these interstitial scopes too.
        let iterScopes: CloneScopes = { original: scope, copy: scopeCopy };
        while (true) {
            const parentScope = iterScopes.original.getMember(symbols.PARENT).getMap();
            if (parentScope === lastScopes.original) {
                iterScopes.copy.setMember(symbols.PARENT, lastScopes.copy);
                break;
            }
            if (parentScope.hasKey(symbols.STMTS_COMP)) {
                throw new ValueError("Found scope belonging to unexpected statement sequence component.");
            }
            const parentScopeCopy = cloneScopeHelper(parentScope);
            iterScopes.copy.setMember(symbols.PARENT, parentScopeCopy);
            iterScopes = { original: parentScope, copy: parentScopeCopy };
        }
    }
    return scopeCopy;
};

// `parent` is a node or a component.
// `codeList` is a list of nodes or components.
const cloneCodeList = (
    parent: PetMap,
    codeList: PetList,
    lastScopes: CloneScopes | null,
): PetList => {
    const codeCopies = codeList.elements.map((code) => {
        const codeCopy = cloneCode(code.getMap(), lastScopes);
        codeCopy.setMember(symbols.PARENT, parent);
        return codeCopy;
    });
    return new PetList(codeCopies);
};

// `code` is a node or a component.
const cloneCode = (code: PetMap, lastScopes: CloneScopes | null): PetMap => {
    if (code.hasKey(symbols.NODE_TYPE)) {
        const codeCopy = code.shallowCopy();
        const comps = code.getMember(symbols.COMPS).getList();
        const compsCopy = cloneCodeList(codeCopy, comps, lastScopes);
        codeCopy.setMember(symbols.COMPS, compsCopy);
        return codeCopy;
    }
    const compTypeValue = code.getOptionalMember(symbols.COMP_TYPE);
    if (typeof compTypeValue !== "undefined") {
        const codeCopy = code.shallowCopy();
        const compType = compTypeValue.getSymbol();
        if (compType === symbols.DECL_COMP) {
            if (lastScopes !== null) {
                const variable = code.getMember(symbols.VAR).getMap();
                const varName = variable.getMember(symbols.IDENT).getPetString();
                const variableCopy = findVariable(lastScopes.copy, varName);
                codeCopy.setMember(symbols.VAR, variableCopy);
            }
        } else if (compType === symbols.ATTRS_COMP) {
            const attrs = code.getMember(symbols.ATTRS).getList();
            const attrsCopy = cloneCodeList(codeCopy, attrs, lastScopes);
            codeCopy.setMember(symbols.ATTRS, attrsCopy);
        } else if (compType === symbols.EXPRS_COMP) {
            const exprs = code.getMember(symbols.EXPRS).getList();
            const exprsCopy = cloneCodeList(codeCopy, exprs, lastScopes);
            codeCopy.setMember(symbols.EXPRS, exprsCopy);
        } else if (compType === symbols.STMTS_COMP) {
            const scope = code.getMember(symbols.SCOPE).getMap();
            const scopeCopy = cloneScope(codeCopy, scope, lastScopes);
            codeCopy.setMember(symbols.SCOPE, scopeCopy);
            const nextScopes: CloneScopes = { original: scope, copy: scopeCopy };
            const attrs = code.getMember(symbols.ATTRS).getList();
            const attrsCopy = cloneCodeList(codeCopy, attrs, nextScopes);
            codeCopy.setMember(symbols.ATTRS, attrsCopy);
            const stmts = code.getMember(symbols.STMTS).getList();
            const stmtsCopy = cloneCodeList(codeCopy, stmts, nextScopes);
            codeCopy.setMember(symbols.STMTS, stmtsCopy);
        }
        return codeCopy;
    }
    throw new PetTypeError("Expected node or component.");
};

export const globalFuncDefs: FuncDef[] = [
    {
        name: "NEG",
        argAmount: 1,
        call: (task, args) => {
            const result = -args[0].getInt();
            return task.returnValue(toSignedInt64(result));
        },
    },
    {
        name: "ADD",
        argAmount: 2,
        call: (task, args) => {
            const result = args[0].getInt() + args[1].getInt();
            return task.returnValue(toSignedInt64(result));
        },
    },
    {
        name: "SUB",
        argAmount: 2,
        call: (task, args) => {
            const result = args[0].getInt() - args[1].getInt();
            return task.returnValue(toSignedInt64(result));
        },
    },
    {
        name: "MUL",
        argAmount: 2,
        call: (task, args) => {
            const result = args[0].getInt() * args[1].getInt();
            return task.returnValue(toSignedInt64(result));
        },
    },
    {
        name: "DIV",
        argAmount: 2,
        call: (task, args) => {
            const denominator = args[1].getInt();
            if (denominator === 0n) {
                throw new ValueError("Cannot divide by zero.");
            }
            const result = args[0].getInt() / denominator;
            return task.returnValue(toSignedInt64(result));
        },
    },
    {
        name: "MOD",
        argAmount: 2,
        call: (task, args) => {
            const denominator = args[1].getInt();
            if (denominator === 0n) {
                throw new ValueError("Cannot divide by zero.");
            }
            const result = args[0].getInt() % denominator;
            return task.returnValue(toSignedInt64(result));
        },
    },
    {
        name: "NOT",
        argAmount: 1,
        call: (task, args) => {
            const result = !(args[0].getInt() !== 0n);
            return task.returnValue(result ? 1n : 0n);
        },
    },
    {
        name: "OR",
        argAmount: 2,
        call: (task, args) => {
            const result = (args[0].getInt() !== 0n || args[1].getInt() !== 0n);
            return task.returnValue(result ? 1n : 0n);
        },
    },
    {
        name: "AND",
        argAmount: 2,
        call: (task, args) => {
            const result = (args[0].getInt() !== 0n && args[1].getInt() !== 0n);
            return task.returnValue(result ? 1n : 0n);
        },
    },
    {
        name: "XOR",
        argAmount: 2,
        call: (task, args) => {
            const result = ((args[0].getInt() !== 0n) !== (args[1].getInt() !== 0n));
            return task.returnValue(result ? 1n : 0n);
        },
    },
    {
        name: "BIT_NOT",
        argAmount: 1,
        call: (task, args) => {
            const result = ~args[0].getInt();
            return task.returnValue(result);
        },
    },
    {
        name: "BIT_OR",
        argAmount: 2,
        call: (task, args) => {
            const result = (args[0].getInt() | args[1].getInt());
            return task.returnValue(result);
        },
    },
    {
        name: "BIT_AND",
        argAmount: 2,
        call: (task, args) => {
            const result = (args[0].getInt() & args[1].getInt());
            return task.returnValue(result);
        },
    },
    {
        name: "BIT_XOR",
        argAmount: 2,
        call: (task, args) => {
            const result = (args[0].getInt() ^ args[1].getInt());
            return task.returnValue(result);
        },
    },
    {
        name: "SHIFT_LEFT",
        argAmount: 2,
        call: (task, args) => {
            const result = (args[0].getInt() << args[1].getInt());
            return task.returnValue(toSignedInt64(result));
        },
    },
    {
        name: "SHIFT_RIGHT",
        argAmount: 2,
        call: (task, args) => {
            const result = (args[0].getInt() >> args[1].getInt());
            return task.returnValue(toSignedInt64(result));
        },
    },
    {
        name: "EQUAL",
        argAmount: 2,
        call: (task, args) => {
            const result = valuesAreEqual(args[0].getKnownValue(), args[1].getKnownValue());
            return task.returnValue(result ? 1n : 0n);
        },
    },
    {
        name: "NOT_EQUAL",
        argAmount: 2,
        call: (task, args) => {
            const result = !valuesAreEqual(args[0].getKnownValue(), args[1].getKnownValue());
            return task.returnValue(result ? 1n : 0n);
        },
    },
    {
        name: "GREATER",
        argAmount: 2,
        call: (task, args) => {
            const result = (compareValues(args[0], args[1]) > 0);
            return task.returnValue(result ? 1n : 0n);
        },
    },
    {
        name: "LESS",
        argAmount: 2,
        call: (task, args) => {
            const result = (compareValues(args[0], args[1]) < 0);
            return task.returnValue(result ? 1n : 0n);
        },
    },
    {
        name: "GREATER_EQUAL",
        argAmount: 2,
        call: (task, args) => {
            const result = (compareValues(args[0], args[1]) >= 0);
            return task.returnValue(result ? 1n : 0n);
        },
    },
    {
        name: "LESS_EQUAL",
        argAmount: 2,
        call: (task, args) => {
            const result = (compareValues(args[0], args[1]) <= 0);
            return task.returnValue(result ? 1n : 0n);
        },
    },
    {
        name: "RAND_INT",
        argAmount: 2,
        call: (task, args) => {
            const result = generateRandomInt(args[0].getInt(), args[1].getInt());
            return task.returnValue(result);
        },
    },
    {
        name: "SYMBOL",
        argAmount: 1,
        call: (task, args) => {
            const result = new PetSymbol(args[0].toStringStrict());
            return task.returnValue(result);
        },
    },
    {
        name: "TYPE",
        argAmount: 1,
        call: (task, args) => {
            const result = getTypeSymbol(args[0].getKnownValue());
            return task.returnValue(result);
        },
    },
    {
        name: "LEN",
        argAmount: 1,
        call: (task, args) => {
            const bunch = args[0].getKnownValue();
            let length: number;
            if (bunch instanceof PetString || bunch instanceof PetList) {
                length = bunch.getLength();
            } else if (bunch instanceof PetMap) {
                length = bunch.fields.size;
            } else {
                throw new PetTypeError("Bunch must be a string, list, or map.");
            }
            return task.returnValue(BigInt(length));
        },
    },
    {
        name: "TRUNC",
        argAmount: 2,
        call: (task, args) => {
            args[0].getList().truncate(args[1].toNumber());
            return task.returnValue(null);
        },
    },
    {
        name: "MEMBER",
        argAmount: 2,
        call: (task, args) => {
            const bunch = args[0].getKnownValue();
            const location = args[1];
            let member: PetValue;
            if (bunch instanceof PetString) {
                const index = location.toNumber();
                const charCode = bunch.getCharCode(index);
                member = wrapKnownValue(BigInt(charCode));
            } else if (bunch instanceof PetList || bunch instanceof PetMap) {
                member = bunch.getMember(location);
            } else {
                throw new PetTypeError("Bunch must be a string, list, or map.");
            }
            return task.returnValue(member);
        },
    },
    {
        name: "SET_MEMBER",
        argAmount: 3,
        call: (task, args) => {
            args[0].getObservableBunch().setMember(args[1], args[2]);
            return task.returnValue(null);
        },
    },
    {
        name: "DEFER_MEMBER",
        argAmount: 3,
        call: (task, args) => {
            const bunch = args[0].getObservableBunch();
            const result = bunch.deferMember(args[1], args[2].toMessage());
            return task.returnValue(result);
        },
    },
    {
        name: "ADD_ELEM",
        minArgAmount: 2,
        maxArgAmount: 3,
        call: (task, args) => {
            const index = (args.length > 2) ? args[2].toNumber() : undefined;
            args[0].getList().addElement(args[1], index);
            return task.returnValue(null);
        },
    },
    {
        name: "ADD_ELEMS",
        minArgAmount: 2,
        maxArgAmount: 3,
        call: (task, args) => {
            const index = (args.length > 2) ? args[2].toNumber() : undefined;
            const { elements } = args[1].getList();
            args[0].getList().addElements(elements, index);
            return task.returnValue(null);
        },
    },
    {
        name: "DEL_ELEM",
        minArgAmount: 1,
        maxArgAmount: 2,
        call: (task, args) => {
            const index = (args.length > 1) ? args[1].toNumber() : undefined;
            args[0].getList().deleteElement(index);
            return task.returnValue(null);
        },
    },
    {
        name: "DEL_ELEMS",
        minArgAmount: 2,
        maxArgAmount: 3,
        call: (task, args) => {
            const index = (args.length > 2) ? args[2].toNumber() : undefined;
            args[0].getList().deleteElements(args[1].toNumber(), index);
            return task.returnValue(null);
        },
    },
    {
        name: "DEL_FIELD",
        argAmount: 2,
        call: (task, args) => {
            args[0].getMap().deleteField(args[1]);
            return task.returnValue(null);
        },
    },
    {
        name: "SLICE",
        argAmount: 3,
        call: (task, args) => {
            const bunch = args[0].getKnownValue();
            if (bunch instanceof PetString || bunch instanceof PetList) {
                const result = bunch.slice(args[1].toNumber(), args[2].toNumber());
                return task.returnValue(result);
            } else {
                throw new PetTypeError("Bunch must be string or list.");
            }
        },
    },
    {
        name: "REVERSE",
        argAmount: 1,
        call: (task, args) => {
            args[0].getList().reverse();
            return task.returnValue(null);
        },
    },
    {
        name: "CONCAT",
        argAmount: 1,
        call: (task, args) => {
            const bunches = args[0].getList();
            if (bunches.getLength() <= 0) {
                throw new ValueError("Cannot concatenate empty list of bunches.");
            }
            const firstBunch = bunches.getMember(0).getKnownValue();
            if (firstBunch instanceof PetString) {
                const buffers = bunches.elements.map((element) => (
                    element.getPetString().toBuffer()
                ));
                const result = new PetString(Buffer.concat(buffers));
                return task.returnValue(result);
            } else if (firstBunch instanceof PetList) {
                const joinedElements: PetValue[] = [];
                for (const listValue of bunches.elements) {
                    const list = listValue.getList();
                    for (const element of list.elements) {
                        joinedElements.push(element);
                    }
                }
                const result = new PetList(joinedElements);
                return task.returnValue(result);
            } else {
                throw new PetTypeError("Concatenation bunches must be strings or lists.");
            }
        },
    },
    {
        name: "STR",
        minArgAmount: 1,
        maxArgAmount: 2,
        call: (task, args) => {
            const arg = args[0].getKnownValue();
            let result: PetString;
            if (args.length > 1) {
                if (typeof arg !== "bigint") {
                    throw new PetTypeError("Base can only be provided if first argument is an integer.");
                }
                const base = args[1].getInt();
                result = new PetString(intToString(arg, base));
            } else {
                result = (arg instanceof PetString)
                    ? arg
                    : new PetString(knownValueToLiteral(arg));
            }
            return task.returnValue(result);
        },
    },
    {
        name: "PARSE_INT",
        minArgAmount: 1,
        maxArgAmount: 2,
        call: (task, args) => {
            const text = args[0].toStringStrict();
            const base = (args.length > 1) ? args[1].getInt() : 10n;
            const result = parseBigInt(text, base);
            if (result < minIntValue) {
                throw new ValueError("Integer magnitude is too big to parse.");
            }
            if (result > maxIntValue) {
                throw new ValueError("Integer is too big to parse.");
            }
            return task.returnValue(result);
        },
    },
    {
        name: "CHAR",
        argAmount: 1,
        call: (task, args) => {
            const charCode = args[0].toNumber();
            if (charCode < 0 || charCode > 255) {
                throw new ValueError("Invalid character code.");
            }
            const result = new PetString(Buffer.from([charCode]));
            return task.returnValue(result);
        },
    },
    {
        name: "KEYS",
        argAmount: 1,
        call: (task, args) => {
            const keys = args[0].getMap().getKeys();
            const result = new PetList(keys);
            return task.returnValue(result);
        },
    },
    {
        name: "HAS_KEY",
        argAmount: 2,
        call: (task, args) => {
            const result = args[0].getMap().hasKey(args[1]);
            return task.returnValue(result ? 1n : 0n);
        },
    },
    {
        name: "MIN_ARG_AMOUNT",
        argAmount: 1,
        call: (task, args) => {
            const minArgAmount = args[0].getFunc().getMinArgAmount();
            return task.returnValue(BigInt(minArgAmount));
        },
    },
    {
        name: "MAX_ARG_AMOUNT",
        argAmount: 1,
        call: (task, args) => {
            const maxArgAmount = args[0].getFunc().getMaxArgAmount();
            const result = (maxArgAmount === null) ? null : BigInt(maxArgAmount);
            return task.returnValue(result);
        },
    },
    {
        name: "CALL",
        minArgAmount: 1,
        maxArgAmount: 2,
        call: (task, args) => {
            const func = args[0].getFunc();
            const funcArgs = (args.length > 1)
                ? args[1].getList().shallowCopy()
                : ([] as PetValue[]);
            return task.callFunction(
                func, funcArgs,
                (value) => task.returnValue(value),
            );
        },
    },
    {
        name: "CALL_METHOD",
        minArgAmount: 2,
        maxArgAmount: 3,
        call: (task, args) => {
            const worker = args[0].getMap();
            const methodKey = args[1];
            const methodArgs = (args.length > 2)
                ? args[2].getList().elements.slice()
                : ([] as PetValue[]);
            return task.callMethod(
                worker, methodKey, methodArgs,
                (value) => task.returnValue(value),
            );
        },
    },
    {
        name: "CLONE_CODE",
        argAmount: 1,
        call: (task, args) => {
            const code = args[0].getMap();
            checkCodeToClone(task.context, code);
            const result = cloneCode(code, null);
            return task.returnValue(result);
        },
    },
    {
        name: "SCOPE",
        argAmount: 1,
        call: (task, args) => {
            const result = getScope(args[0].getMap());
            return task.returnValue(result);
        },
    },
    {
        name: "FIND_VAR",
        argAmount: 2,
        call: (task, args) => {
            const result = findVariable(args[0].getMap(), args[1].getPetString());
            return task.returnValue(result);
        },
    },
    {
        name: "FIND_VAR_VALUE",
        argAmount: 2,
        call: (task, args) => {
            const result = findVarValue(args[0].getMap(), args[1].getMap());
            return task.returnValue(result);
        },
    },
    {
        name: "NEW_FRAME",
        argAmount: 2,
        call: (task, args) => {
            const parentScope = args[1].getKnownValue();
            if (parentScope !== null && !(parentScope instanceof PetMap)) {
                throw new PetTypeError("Parent scope must be map or null");
            }
            const result = createFrame(args[0].getMap(), parentScope);
            return task.returnValue(result);
        },
    },
    {
        name: "PRINT",
        argAmount: 1,
        call: (task, args) => {
            task.context.logger.print(args[0].toMessage());
            return task.returnValue(null);
        },
    },
];


