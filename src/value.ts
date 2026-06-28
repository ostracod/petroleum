
import "./symbol.js";

import { PetSymbol, symbols } from "./symbol.js";
import { DeferralError, PetTypeError } from "./error.js";
import { Action, Task, awaitCondTask, getModule, createFrame, findVariable } from "./task.js";
import { Scheduler } from "./scheduler.js";

// PetValueAndKey contains types which can be used as both values and Map keys.
export type PetValueAndKey = null | bigint | PetSymbol | PetList | PetMap | PetFunc | EvalState;
export type KnownValue = PetString | PetValueAndKey;
export type MapKey = string | PetValueAndKey;

export class PetValue {
    knownValue?: KnownValue;
    bunch?: ObservableBunch;
    location?: KnownValue;
    
    constructor() {
        // Do nothing.
    }
    
    getKnownValue(): KnownValue {
        if (typeof this.knownValue === "undefined") {
            const value = this.bunch.getMember(this.location);
            if (typeof value === "undefined") {
                throw new DeferralError(this.bunch, this.location);
            }
            this.knownValue = value.getKnownValue();
            delete this.bunch;
            delete this.location;
        }
        return this.knownValue;
    }
    
    tryKnownValue(): KnownValue | undefined {
        try {
            return this.getKnownValue();
        } catch (error) {
            if (error instanceof DeferralError) {
                return undefined;
            }
            throw error;
        }
    }
    
    getInt(): bigint {
        const value = this.getKnownValue();
        if (typeof value !== "bigint") {
            throw new PetTypeError("Expected integer.");
        }
        return value;
    }
    
    getInstance<T>(classConstructor: abstract new (...args: any[]) => T, displayName: string): T {
        const value = this.getKnownValue();
        if (!(value instanceof classConstructor)) {
            throw new PetTypeError(`Expected ${displayName}.`);
        }
        return value;
    }
    
    getSymbol(): PetSymbol {
        return this.getInstance(PetSymbol, "symbol");
    }
    
    getPetString(): PetString {
        return this.getInstance(PetString, "string");
    }
    
    getList(): PetList {
        return this.getInstance(PetList, "list");
    }
    
    getMap(): PetMap {
        return this.getInstance(PetMap, "map");
    }
    
    getFunc(): PetFunc {
        return this.getInstance(PetFunc, "function");
    }
    
    getEvalState(): EvalState {
        return this.getInstance(EvalState, "evaluation state");
    }
    
    getObservableBunch(): ObservableBunch {
        const value = this.getKnownValue();
        if (!(value instanceof PetList || value instanceof PetMap)) {
            throw new PetTypeError(`Expected list or map.`);
        }
        return value;
    }
    
    toNumber(): number {
        return Number(this.getInt());
    }
    
    toString(parents: KnownValue[] = []): string {
        const value = this.getKnownValue();
        return valueToString(value, parents);
    };
    
    toMapKey(): MapKey {
        const value = this.getKnownValue();
        return valueToMapKey(value);
    };
}

const wrapKnownValue = (knownValue: KnownValue): PetValue => {
    const value = new PetValue();
    value.knownValue = knownValue;
    return value;
};

const wrapDeferredValue = (bunch: ObservableBunch, location: KnownValue): PetValue => {
    const value = new PetValue();
    value.bunch = bunch;
    value.location = location;
    return value;
};

export const toPetValue = (value: KnownValue | PetValue): PetValue => (
    (value instanceof PetValue) ? value : wrapKnownValue(value)
);

export const toKnownValue = (value: KnownValue | PetValue): KnownValue => (
    (value instanceof PetValue) ? value.getKnownValue() : value
);

const toMapKey = (value: KnownValue | PetValue): MapKey => (
    (value instanceof PetValue) ? value.toMapKey() : valueToMapKey(value)
);

export const toPetList = (values: (KnownValue | PetValue)[] | PetList): PetList => (
    (values instanceof PetList) ? values : new PetList(values)
);

export const nullValue = wrapKnownValue(null);

export const escapeChars: { [escape: string]: string } = {
    "\"": "\"",
    "n": "\n",
    "t": "\t",
    "\\": "\\",
};

const charEscapes: { [character: string]: string } = {};
for (const escape in escapeChars) {
    const character = escapeChars[escape];
    charEscapes[character] = escape;
}

export class PetString {
    text: string | null;
    buffer: Buffer | null;
    // `hexString` is used as a key in Maps.
    hexString: string | null;
    
    constructor(data: string | Buffer) {
        if (typeof data === "string") {
            this.buffer = null;
            this.text = data;
        } else {
            this.buffer = data;
            this.text = null;
        }
        this.hexString = null;
    }
    
    toString(): string {
        if (this.text === null) {
            this.text = this.buffer.toString("utf8");
        }
        return this.text;
    }
    
    toBuffer(): Buffer {
        if (this.buffer === null) {
            this.buffer = Buffer.from(this.text, "utf8");
        }
        return this.buffer;
    }
    
    toHexString(): string {
        if (this.hexString === null) {
            this.hexString = this.toBuffer().toString("hex");
        }
        return this.hexString;
    }
    
    toStringLiteral(): string {
        const text = this.toString();
        const literalParts: string[] = [];
        for (let index = 0; index < text.length; index++) {
            let character = text.charAt(index);
            let literalPart: string;
            const escape = charEscapes[character];
            if (typeof escape !== "undefined") {
                literalPart = "\\" + escape;
            } else {
                literalPart = character;
            }
            literalParts.push(literalPart);
        }
        return "\"" + literalParts.join("") + "\"";
    }
}

export const valueToString = (value: KnownValue, parents: KnownValue[] = []): string => {
    if (value === null) {
        return "NULL";
    } else if (value instanceof PetString) {
        return (parents.length > 0) ? value.toStringLiteral() : value.toString();
    } else if (value instanceof PetList || value instanceof PetMap) {
        if (parents.some((parent) => (parent === value))) {
            return "...";
        } else {
            return value.toString(parents);
        }
    } else {
        return value.toString();
    }
};

const valueToMapKey = (value: KnownValue): MapKey => {
    return (value instanceof PetString) ? value.toHexString() : value;
};

export const valuesAreEqual = (value1: KnownValue, value2: KnownValue): boolean => {
    if (value1 instanceof PetString && value2 instanceof PetString) {
        const buffer1 = value1.toBuffer();
        const buffer2 = value2.toBuffer();
        return buffer1.equals(buffer2);
    } else {
        return (value1 === value2);
    }
}

export const valueMayHaveChanged = (oldValue: PetValue, newValue: PetValue): boolean => {
    const oldKnownValue = oldValue.tryKnownValue();
    const newKnownValue = newValue.tryKnownValue();
    const oldValueIsDeferred = (typeof oldKnownValue === "undefined");
    const newValueIsDeferred = (typeof newKnownValue === "undefined");
    if (oldValueIsDeferred && newValueIsDeferred) {
        return !(valuesAreEqual(oldValue.bunch, newValue.bunch)
            && valuesAreEqual(oldValue.location, newValue.location));
    } else if (oldValueIsDeferred || newValueIsDeferred) {
        return true;
    } else {
        return !valuesAreEqual(oldKnownValue, newKnownValue);
    }
};

export interface ObservableBunchIface {
    observatory: MemberObservatory;
    getMember(location: KnownValue | PetValue): PetValue | undefined;
}

export type ObservableBunch = KnownValue & ObservableBunchIface;

const deferMember = (bunch: ObservableBunch, location: KnownValue): PetValue => {
    const value = bunch.getMember(location);
    return (typeof value === "undefined") ? wrapDeferredValue(bunch, location) : value;
};

export class MemberObserver {
    bunch: ObservableBunch;
    location: KnownValue;
    condition: PetFunc;
    evalState: EvalState;
    
    constructor(
        bunch: ObservableBunch,
        location: KnownValue,
        condition: PetFunc,
        evalState: EvalState,
    ) {
        this.bunch = bunch;
        this.location = location;
        this.condition = condition;
        this.evalState = evalState;
    }
    
    getMemberValue(): PetValue | undefined {
        return this.bunch.getMember(this.location);
    }
}

class MemberObservatory {
    bunch: ObservableBunch;
    observers: Map<MapKey, Set<MemberObserver>>;
    scheduler: Scheduler;
    
    constructor(bunch: ObservableBunch) {
        this.bunch = bunch;
        this.observers = new Map();
    }
    
    addObserver(
        scheduler: Scheduler,
        inputLocation: PetValue,
        condition: PetFunc,
        evalState: EvalState,
    ): void {
        this.scheduler = scheduler;
        const location = inputLocation.getKnownValue();
        const mapKey = valueToMapKey(location);
        let observers = this.observers.get(mapKey);
        if (typeof observers === "undefined") {
            observers = new Set();
            this.observers.set(mapKey, observers);
        }
        const observer = new MemberObserver(this.bunch, location, condition, evalState);
        observers.add(observer);
    }
    
    handleMemberChange(location: KnownValue): void {
        const mapKey = valueToMapKey(location);
        const observers = this.observers.get(mapKey);
        if (typeof observers === "undefined") {
            return;
        }
        this.observers.delete(mapKey);
        for (const observer of observers) {
            this.scheduler.scheduleTask(awaitCondTask, { observer });
        }
    }
}

type ListIndex = number | KnownValue | PetValue;

const listIndexToNumber = (value: ListIndex): number => {
    if (typeof value === "number") {
        return value;
    } else if (typeof value === "bigint") {
        return Number(value);
    } else if (value instanceof PetValue) {
        return value.toNumber();
    } else {
        throw new PetTypeError("Expected integer.");
    }
};

const listIndexToBigInt = (value: ListIndex): bigint => {
    if (typeof value === "number") {
        return BigInt(value);
    } else if (typeof value === "bigint") {
        return value;
    } else if (value instanceof PetValue) {
        return value.getInt();
    } else {
        throw new PetTypeError("Expected integer.");
    }
};

export class PetList implements ObservableBunchIface {
    elements: PetValue[];
    observatory: MemberObservatory;
    
    constructor(elements: (KnownValue | PetValue)[] = []) {
        this.elements = elements.map((element) => toPetValue(element));
        this.observatory = new MemberObservatory(this);
    }
    
    getMember(index: ListIndex): PetValue | undefined {
        return this.elements[listIndexToNumber(index)];
    }
    
    setMember(index: ListIndex, inputValue: KnownValue | PetValue): void {
        const value = toPetValue(inputValue);
        const numberIndex = listIndexToNumber(index);
        const lastValue = this.elements[numberIndex];
        this.elements[numberIndex] = value;
        if (typeof lastValue === "undefined" || valueMayHaveChanged(lastValue, value)) {
            this.observatory.handleMemberChange(listIndexToBigInt(index));
        }
    }
    
    deferMember(index: ListIndex): PetValue {
        return deferMember(this, listIndexToBigInt(index));
    }
    
    getLength(): number {
        return this.elements.length;
    }
    
    addElement(value: KnownValue | PetValue): void {
        const index = this.elements.length;
        this.elements.push(toPetValue(value));
        this.observatory.handleMemberChange(listIndexToBigInt(index));
    }
    
    toString(parents: KnownValue[] = []): string {
        const nextParents = [...parents, this];
        const textList: string[] = [];
        for (const element of this.elements) {
            textList.push(element.toString(nextParents));
        }
        const elementsText = textList.join(", ");
        return `LIST (${elementsText})`;
    }
    
    shallowCopy(): PetList {
        return new PetList(this.elements.slice());
    }
}

class PetField {
    key: KnownValue;
    value: PetValue;
    
    constructor(key: KnownValue, value: PetValue) {
        this.key = key;
        this.value = value;
    }
}

export class PetMap implements ObservableBunchIface {
    fields: Map<MapKey, PetField>;
    observatory: MemberObservatory;
    
    constructor(entries: [KnownValue | PetValue, KnownValue | PetValue][] = []) {
        this.fields = new Map();
        this.observatory = new MemberObservatory(this);
        for (const entry of entries) {
            this.setMember(toKnownValue(entry[0]), toPetValue(entry[1]));
        }
    }
    
    getMember(key: KnownValue | PetValue): PetValue | undefined {
        const mapKey = toMapKey(key);
        const field = this.fields.get(mapKey);
        return field?.value;
    }
    
    setMember(inputKey: KnownValue | PetValue, inputValue: KnownValue | PetValue): void {
        const key = toKnownValue(inputKey);
        const value = toPetValue(inputValue);
        const mapKey = valueToMapKey(key);
        let lastValue: PetValue | undefined;
        let field = this.fields.get(mapKey);
        if (typeof field === "undefined") {
            field = new PetField(key, value);
            this.fields.set(mapKey, field);
        } else {
            lastValue = field.value;
            field.value = value;
        }
        if (typeof lastValue === "undefined" || valueMayHaveChanged(lastValue, value)) {
            this.observatory.handleMemberChange(key);
        }
    }
    
    deferMember(key: KnownValue | PetValue): PetValue {
        return deferMember(this, toKnownValue(key));
    }
    
    toString(parents: KnownValue[] = []): string {
        const nextParents = [...parents, this];
        const textList: string[] = [];
        this.fields.forEach(({ key, value }) => {
            const keyString = valueToString(key, nextParents);
            const valueString = value.toString(nextParents);
            textList.push(`(${keyString}) = (${valueString})`);
        });
        const fieldsText = textList.join(", ");
        return `MAP [FIELDS [${fieldsText}]]`;
    }
    
    shallowCopy(): PetMap {
        const fields = Array.from(this.fields.values());
        return new PetMap(fields.map((field) => [field.key, field.value]));
    }
}

export abstract class PetFunc {
    
    constructor() {
        // Do nothing.
    }
    
    // Should return null if the function can accept any number of arguments.
    abstract getArgAmount(): number | null;
    
    abstract call(task: Task, args: PetList): Action;
    
    abstract toString(): string;
}

export interface FuncSignature {
    argNames?: PetString[];
    argsName?: PetString;
}

export class UserFunc extends PetFunc {
    // Statement sequence component which contains the function body.
    stmtsComp: PetMap;
    // `parentFrame` and its parents are pruned to only contain necessary frame entries.
    parentFrame: PetMap | null;
    // `bottomFrame` will be modified so its parent is the module frame.
    bottomFrame: PetMap | null;
    // `argNames` and `argsName` are mutually exclusive.
    argNames?: PetString[];
    argsName?: PetString;
    // Parent module of `stmtsComp`.
    module: PetMap;
    
    constructor(stmtsComp: PetMap, parentFrame: PetMap | null, signature: FuncSignature) {
        super();
        this.stmtsComp = stmtsComp;
        this.parentFrame = parentFrame;
        if (this.parentFrame !== null) {
            this.bottomFrame = this.parentFrame;
            while (true) {
                const nextFrame = this.bottomFrame.getMember(symbols.PARENT);
                if (typeof nextFrame === "undefined") {
                    break;
                }
                this.bottomFrame = nextFrame.getMap();
            }
        }
        const { argNames, argsName } = signature;
        if (typeof argNames === "undefined") {
            this.argsName = argsName;
        } else {
            this.argNames = argNames;
        }
        this.module = getModule(this.stmtsComp);
    }
    
    getArgAmount(): number | null {
        return (typeof this.argNames === "undefined") ? null : this.argNames.length;
    }
    
    call(task: Task, args: PetList): Action {
        const scope = this.stmtsComp.getMember(symbols.SCOPE).getMap();
        const topFrame = createFrame(scope, this.parentFrame);
        if (typeof this.argNames === "undefined") {
            const frameEntry = findVariable(topFrame, this.argsName);
            frameEntry.setMember(symbols.VALUE, args);
        } else {
            for (let index = 0; index < this.argNames.length; index++) {
                const argName = this.argNames[index];
                const arg = args.getMember(index);
                const frameEntry = findVariable(topFrame, argName);
                frameEntry.setMember(symbols.VALUE, arg);
            }
        }
        const moduleFrame = this.module.getMember(symbols.FRAME).getMap();
        const bottomFrame = this.bottomFrame ?? topFrame;
        bottomFrame.setMember(symbols.PARENT, moduleFrame);
        return task.callMethod(
            this.stmtsComp, symbols.EVAL, [topFrame],
            (value) => task.returnValue(null),
            (excepValue) => {
                const exception = excepValue.getMap();
                const excepType = exception.getMember(symbols.EXCEP_TYPE).getSymbol();
                if (excepType === symbols.RET_EXCEP) {
                    const retLevel = exception.getMember(symbols.RET_LEVEL).getInt();
                    if (retLevel <= 0n) {
                        const value = exception.getMember(symbols.VALUE);
                        task.returnValue(value);
                    } else {
                        const excepCopy = exception.shallowCopy();
                        excepCopy.setMember(symbols.RET_LEVEL, retLevel - 1n);
                        return task.throwException(excepCopy);
                    }
                }
                return task.throwException(exception);
            },
        );
    }
    
    toString(): string {
        // TODO: Use a better string representation.
        return "<userFunc>";
    }
}

export class EvalState {
    currentTask: Task;
    actionToResume: Action;
    
    constructor(currentTask: Task, actionToResume: Action) {
        this.currentTask = currentTask;
        this.actionToResume = actionToResume;
    }
    
    toString(): string {
        throw new Error("Not yet implemented");
    }
}


