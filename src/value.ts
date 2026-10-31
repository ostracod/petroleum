
import "./symbol.js";

import { PetSymbol, symbols } from "./symbol.js";
import { DeferralException, ModulePos, modulePosToString, entityToModulePos, entityPosToString, PetTypeError, ValueError, createAwaitExcep } from "./exception.js";
import { createFrame, FuncSignature, getFuncSignature, pruneFrames } from "./variable.js";
import { Action, Task, awaitCondTask, callUserFuncTask } from "./task.js";
import { Scheduler } from "./scheduler.js";

// PetValueAndKey contains types which can be used as both values and Map keys.
export type PetValueAndKey = null | bigint | PetSymbol | PetList | PetMap | PetFunc | StackTrace;
export type KnownValue = PetString | PetValueAndKey;
export type MapKey = string | PetValueAndKey;

export const minIntValue = -(1n << 63n);
export const maxIntValue = (1n << 63n) - 1n;

const intMask = (1n << 63n) - 1n;
const signMask = 1n << 63n;

export const toSignedInt64 = (value: bigint): bigint => {
    if ((value & signMask) > 0n) {
        return -((~value & intMask) + 1n);
    } else {
        return value & intMask;
    }
};

export class PetValue {
    // Either `knownValue` is defined, or
    // `bunch` + `location` + `deferralMessage` are defined.
    knownValue?: KnownValue;
    bunch?: ObservableBunch;
    location?: KnownValue;
    deferralMessage?: string;
    
    constructor() {
        // Do nothing.
    }
    
    getKnownValue(): KnownValue {
        if (typeof this.knownValue === "undefined") {
            const value = this.bunch!.getOptionalMember(this.location!);
            if (typeof value === "undefined") {
                throw new DeferralException(
                    this.bunch!, this.location!, this.deferralMessage!,
                );
            }
            this.knownValue = value.getKnownValue();
            delete this.bunch;
            delete this.location;
            delete this.deferralMessage;
        }
        return this.knownValue;
    }
    
    tryKnownValue(): KnownValue | undefined {
        try {
            return this.getKnownValue();
        } catch (error) {
            if (error instanceof DeferralException) {
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
    
    getInstance<T>(
        classConstructor: abstract new (...args: any[]) => T,
        displayName: string,
    ): T {
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
    
    getStringOrNull(): PetString | null {
        const value = this.getKnownValue();
        if (!(value === null || value instanceof PetString)) {
            throw new PetTypeError("Expected string or null.");
        }
        return value;
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
    
    getStackTrace(): StackTrace {
        return this.getInstance(StackTrace, "stack trace");
    }
    
    getEvalState(): EvalState {
        return this.getInstance(EvalState, "evaluation state");
    }
    
    getSliceableBunch(): SliceableBunch {
        const value = this.getKnownValue();
        if (!(value instanceof PetString || value instanceof PetList)) {
            throw new PetTypeError("Expected string or list.");
        }
        return value;
    }
    
    getObservableBunch(): ObservableBunch {
        const value = this.getKnownValue();
        if (!(value instanceof PetList || value instanceof PetMap)) {
            throw new PetTypeError("Expected list or map.");
        }
        return value;
    }
    
    toNumber(): number {
        return Number(this.getInt());
    }
    
    // If the known value is a PetString, returns the string content in quotes.
    toLiteral(parents: KnownValue[] = []): string {
        const value = this.getKnownValue();
        return knownValueToLiteral(value, parents);
    }
    
    // If the known value is a PetString, returns the unquoted string content.
    toMessage(): string {
        const value = this.getKnownValue();
        return knownValueToMessage(value);
    }
    
    toStringStrict(): string {
        return this.getPetString().toString();
    }
    
    toMapKey(): MapKey {
        const value = this.getKnownValue();
        return knownValueToMapKey(value);
    }
}

export const wrapKnownValue = (knownValue: KnownValue): PetValue => {
    const value = new PetValue();
    value.knownValue = knownValue;
    return value;
};

const wrapDeferredValue = (
    bunch: ObservableBunch,
    location: KnownValue,
    message: string,
): PetValue => {
    const value = new PetValue();
    value.bunch = bunch;
    value.location = location;
    value.deferralMessage = message;
    return value;
};

export const toPetValue = (value: KnownValue | PetValue): PetValue => (
    (value instanceof PetValue) ? value : wrapKnownValue(value)
);

export const toKnownValue = (value: KnownValue | PetValue): KnownValue => (
    (value instanceof PetValue) ? value.getKnownValue() : value
);

const toMapKey = (value: KnownValue | PetValue): MapKey => (
    (value instanceof PetValue) ? value.toMapKey() : knownValueToMapKey(value)
);

const toLiteral = (value: KnownValue | PetValue): string => (
    (value instanceof PetValue) ? value.toLiteral() : knownValueToLiteral(value)
);

export const toPetList = (values: (KnownValue | PetValue)[] | PetList): PetList => (
    (values instanceof PetList) ? values : new PetList(values)
);

export const nullValue = wrapKnownValue(null);

export const escapeChars: { [escape: string]: string } = {
    "\"": "\"",
    "'": "'",
    "n": "\n",
    "t": "\t",
    "\\": "\\",
};

const charEscapes: { [character: string]: string } = {};
for (const escape in escapeChars) {
    const character = escapeChars[escape];
    // Don't escape apostrophes in PetString.toLiteral.
    if (character !== "'") {
        charEscapes[character] = escape;
    }
}

const checkSliceIndexes = (
    bunchLength: number,
    startIndex: number,
    endIndex: number,
): void => {
    if (startIndex < 0 || startIndex > bunchLength) {
        throw new ValueError(`Start index ${startIndex} is invalid.`);
    }
    if (endIndex < 0 || endIndex > bunchLength) {
        throw new ValueError(`End index ${endIndex} is invalid.`);
    }
    if (startIndex > endIndex) {
        throw new ValueError("Start index cannot be greater than end index.");
    }
};

export const stringToLiteral = (text: string): string => {
    const literalParts: string[] = [];
    for (let index = 0; index < text.length; index++) {
        const character = text.charAt(index);
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
};

// Return -1 if value1 < value2, 1 if value1 > value2, and 0 if value1 === value2.
export const compareValues = (inputValue1: PetValue, inputValue2: PetValue): number => {
    const value1 = inputValue1.getKnownValue();
    const value2 = inputValue2.getKnownValue();
    if (typeof value1 === "bigint" && typeof value2 === "bigint") {
        if (value1 < value2) {
            return -1;
        } else if (value1 > value2) {
            return 1;
        } else {
            return 0;
        }
    } else if (value1 instanceof PetString && value2 instanceof PetString) {
        return value1.compare(value2);
    } else {
        throw new PetTypeError("Comparison values must both be integers or strings.");
    }
};

export interface SliceableBunchIface<ElemT, SliceT extends KnownValue> {
    getLength(): number;
    getElement(index: number): ElemT;
    valueToElement(value: PetValue): ElemT;
    elementsAreEqual(element1: ElemT, element2: ElemT): boolean;
    slice(startIndex: number, endIndex: number): SliceT;
    valueToSlice(value: PetValue): SliceT;
    sliceMatches(startIndex: number, slice: SliceT): boolean;
}

// This type must be defined as `SliceableBunchIface & KnownValue` instead of
// `KnownValue & SliceableBunchIface`, because type intersection in TypeScript
// is not commutative...!
export type SliceableBunch<ElemT = any, SliceT extends KnownValue = KnownValue> = SliceableBunchIface<ElemT, SliceT> & KnownValue;

export class PetString implements SliceableBunchIface<number, PetString> {
    // Either `text` or `buffer` are non-null.
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
    
    getElement(index: number): number {
        const buffer = this.toBuffer();
        if (index < 0 || index >= buffer.length) {
            throw new ValueError(`Index ${index} is outside of string.`);
        }
        return buffer[index];
    }
    
    valueToElement(value: PetValue): number {
        const charCode = value.toNumber();
        if (charCode < 0 || charCode > 255) {
            throw new ValueError("Character code must be between 0 and 255.");
        }
        return charCode;
    }
    
    elementsAreEqual(element1: number, element2: number): boolean {
        return (element1 === element2);
    }
    
    getLength(): number {
        return this.toBuffer().length;
    }
    
    compare(otherString: PetString): number {
        const buffer1 = this.toBuffer();
        const buffer2 = otherString.toBuffer();
        for (let index = 0; index < buffer1.length; index++) {
            if (index >= buffer2.length) {
                return 1;
            }
            const value1 = buffer1[index];
            const value2 = buffer2[index];
            if (value1 < value2) {
                return -1;
            } else if (value1 > value2) {
                return 1;
            }
        }
        return (buffer2.length > buffer1.length) ? -1 : 0;
    }
    
    slice(startIndex: number, endIndex: number): PetString {
        const buffer = this.toBuffer();
        checkSliceIndexes(buffer.length, startIndex, endIndex);
        const subBuffer = buffer.subarray(startIndex, endIndex);
        return new PetString(subBuffer);
    }
    
    valueToSlice(value: PetValue): PetString {
        return value.getPetString();
    }
    
    sliceMatches(startIndex: number, slice: PetString): boolean {
        const sliceBuffer = slice.toBuffer();
        const endIndex = startIndex + sliceBuffer.length;
        return (sliceBuffer.compare(this.toBuffer(), startIndex, endIndex) === 0);
    }
    
    toString(): string {
        if (this.text === null) {
            this.text = this.buffer!.toString("utf8");
        }
        return this.text;
    }
    
    toBuffer(): Buffer {
        if (this.buffer === null) {
            this.buffer = Buffer.from(this.text!, "utf8");
        }
        return this.buffer;
    }
    
    toHexString(): string {
        if (this.hexString === null) {
            this.hexString = this.toBuffer().toString("hex");
        }
        return this.hexString;
    }
    
    toLiteral(): string {
        return stringToLiteral(this.toString());
    }
}

export const knownValueToLiteral = (value: KnownValue, parents: KnownValue[] = []): string => {
    if (value === null) {
        return "NULL";
    } else if (value instanceof PetString) {
        return value.toLiteral();
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

export const knownValueToMessage = (value: KnownValue): string => (
    (value instanceof PetString) ? value.toString() : knownValueToLiteral(value)
);

const knownValueToMapKey = (value: KnownValue): MapKey => (
    (value instanceof PetString) ? value.toHexString() : value
);

export const valuesAreEqual = (value1: KnownValue, value2: KnownValue): boolean => {
    if (value1 instanceof PetString && value2 instanceof PetString) {
        const buffer1 = value1.toBuffer();
        const buffer2 = value2.toBuffer();
        return buffer1.equals(buffer2);
    } else {
        return (value1 === value2);
    }
};

export const valueMayHaveChanged = (oldValue: PetValue, newValue: PetValue): boolean => {
    const oldKnownValue = oldValue.tryKnownValue();
    const newKnownValue = newValue.tryKnownValue();
    const oldValueIsDeferred = (typeof oldKnownValue === "undefined");
    const newValueIsDeferred = (typeof newKnownValue === "undefined");
    if (oldValueIsDeferred && newValueIsDeferred) {
        return !(valuesAreEqual(oldValue.bunch!, newValue.bunch!)
            && valuesAreEqual(oldValue.location!, newValue.location!));
    } else if (oldValueIsDeferred || newValueIsDeferred) {
        return true;
    } else {
        return !valuesAreEqual(oldKnownValue, newKnownValue);
    }
};

export interface ObservableBunchIface {
    observatory: MemberObservatory;
    getOptionalMember(location: KnownValue | PetValue): PetValue | undefined;
    getMember(location: KnownValue | PetValue): PetValue;
    setMember(location: KnownValue | PetValue, value: KnownValue | PetValue): void;
    deferMember(location: KnownValue | PetValue, message: string): PetValue;
}

export type ObservableBunch = ObservableBunchIface & KnownValue;

const deferMember = (
    bunch: ObservableBunch,
    location: KnownValue,
    message: string,
): PetValue => {
    const value = bunch.getOptionalMember(location);
    return (typeof value === "undefined")
        ? wrapDeferredValue(bunch, location, message)
        : value;
};

export class MemberObserver {
    bunch: ObservableBunch;
    location: KnownValue;
    condition: PetFunc;
    message: PetString | null;
    evalState: EvalState;
    
    constructor(
        bunch: ObservableBunch,
        location: KnownValue,
        condition: PetFunc,
        message: PetString | null,
        evalState: EvalState,
    ) {
        this.bunch = bunch;
        this.location = location;
        this.condition = condition;
        this.message = message;
        this.evalState = evalState;
    }
    
    getMemberValue(): PetValue | undefined {
        return this.bunch.getOptionalMember(this.location);
    }
    
    createAwaitExcep(): PetMap {
        return createAwaitExcep(
            this.bunch, this.location, this.condition, this.message, this.evalState,
        );
    }
    
    getStuckReport(): string {
        let header = "Stuck awaiting member";
        if (this.message !== null) {
            header += ": " + this.message.toString();
        }
        return header + "\n" + this.evalState.toString();
    }
}

class MemberObservatory {
    bunch: ObservableBunch;
    observers: Map<MapKey, MemberObserver[]>;
    scheduler: Scheduler;
    
    constructor(bunch: ObservableBunch) {
        this.bunch = bunch;
        this.observers = new Map();
    }
    
    addObserver(
        scheduler: Scheduler,
        location: KnownValue,
        condition: PetFunc,
        message: PetString | null,
        evalState: EvalState,
    ): void {
        this.scheduler = scheduler;
        const mapKey = knownValueToMapKey(location);
        let observers = this.observers.get(mapKey);
        if (typeof observers === "undefined") {
            observers = [];
            this.observers.set(mapKey, observers);
        }
        const observer = new MemberObserver(
            this.bunch, location, condition, message, evalState,
        );
        observers.push(observer);
        if (message !== null) {
            this.scheduler.observersToReport.add(observer);
        }
    }
    
    handleMemberChange(location: KnownValue): void {
        const mapKey = knownValueToMapKey(location);
        const observers = this.observers.get(mapKey);
        if (typeof observers === "undefined") {
            return;
        }
        this.observers.delete(mapKey);
        for (const observer of observers) {
            this.scheduler.observersToReport.delete(observer);
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

export class PetList implements ObservableBunchIface, SliceableBunchIface<PetValue, PetList> {
    elements: PetValue[];
    observatory: MemberObservatory;
    
    constructor(elements: (KnownValue | PetValue)[] = []) {
        this.elements = elements.map((element) => toPetValue(element));
        this.observatory = new MemberObservatory(this);
    }
    
    getOptionalMember(index: ListIndex): PetValue | undefined {
        const numberIndex = listIndexToNumber(index);
        if (numberIndex < 0) {
            throw new ValueError("List index cannot be negative.");
        }
        return this.elements[numberIndex];
    }
    
    getMember(index: ListIndex): PetValue {
        const value = this.getOptionalMember(index);
        if (typeof value === "undefined") {
            const numberIndex = listIndexToNumber(index);
            throw new ValueError(`Index ${numberIndex} is outside of list.`);
        }
        return value;
    }
    
    getElement(index: number): PetValue {
        return this.getMember(index);
    }
    
    valueToElement(value: PetValue): PetValue {
        return value;
    }
    
    elementsAreEqual(element1: PetValue, element2: PetValue): boolean {
        return valuesAreEqual(element1.getKnownValue(), element2.getKnownValue());
    }
    
    setMemberHelper(index: number, value: PetValue): void {
        const lastValue = this.elements[index];
        this.elements[index] = value;
        if (typeof lastValue === "undefined" || valueMayHaveChanged(lastValue, value)) {
            this.observatory.handleMemberChange(BigInt(index));
        }
    }
    
    setMember(index: ListIndex, inputValue: KnownValue | PetValue): void {
        const value = toPetValue(inputValue);
        const numberIndex = listIndexToNumber(index);
        if (numberIndex < 0 || numberIndex >= this.elements.length) {
            throw new ValueError(`Index ${numberIndex} is outside of list.`);
        }
        this.setMemberHelper(numberIndex, value);
    }
    
    deferMember(index: ListIndex, message: string): PetValue {
        return deferMember(this, listIndexToBigInt(index), message);
    }
    
    getLength(): number {
        return this.elements.length;
    }
    
    slice(startIndex: number, endIndex: number): PetList {
        checkSliceIndexes(this.elements.length, startIndex, endIndex);
        const subElements = this.elements.slice(startIndex, endIndex);
        return new PetList(subElements);
    }
    
    valueToSlice(value: PetValue): PetList {
        return value.getList();
    }
    
    sliceMatches(startIndex: number, slice: PetList): boolean {
        for (let offset = 0; offset < slice.getLength(); offset++) {
            const element1 = this.elements[startIndex + offset].getKnownValue();
            const element2 = slice.elements[offset].getKnownValue();
            if (!valuesAreEqual(element1, element2)) {
                return false;
            }
        }
        return true;
    }
    
    truncate(length: number): void {
        if (length < 0) {
            throw new ValueError("Truncation length cannot be negative.");
        }
        if (length > this.elements.length) {
            throw new ValueError("Truncation length cannot be greater than list length.");
        }
        this.elements.length = length;
    }
    
    addElements(inputValues: PetValue[], inputIndex?: number): void {
        // Guard against inserting a list into itself.
        const values = (inputValues === this.elements) ? inputValues.slice() : inputValues;
        const insertIndex = inputIndex ?? this.elements.length;
        if (insertIndex < 0 || insertIndex > this.elements.length) {
            throw new ValueError("Insertion index is out of bounds.");
        }
        for (let index = this.elements.length - 1; index >= insertIndex; index--) {
            const value = this.elements[index];
            this.setMemberHelper(index + values.length, value);
        }
        for (let offset = 0; offset < values.length; offset++) {
            const value = values[offset];
            this.setMemberHelper(insertIndex + offset, value);
        }
    }
    
    addElement(value: PetValue, index?: number): void {
        this.addElements([value], index);
    }
    
    deleteElements(amount: number, inputIndex?: number): void {
        if (amount < 0) {
            throw new ValueError("Cannot delete a negative number of elements.");
        }
        const deleteIndex = inputIndex ?? (this.elements.length - amount);
        if (deleteIndex < 0 || deleteIndex + amount > this.elements.length) {
            throw new ValueError("Cannot delete element which is out of bounds.");
        }
        for (let index = deleteIndex; index < this.elements.length - amount; index++) {
            const value = this.elements[index + amount];
            this.setMemberHelper(index, value);
        }
        this.elements.length -= amount;
    }
    
    deleteElement(index?: number): void {
        this.deleteElements(1, index);
    }
    
    reverse(): void {
        const elements = this.elements.slice();
        for (let srcIndex = 0; srcIndex < elements.length; srcIndex++) {
            const destIndex = elements.length - 1 - srcIndex;
            this.setMemberHelper(destIndex, elements[srcIndex]);
        }
    }
    
    toString(parents: KnownValue[] = []): string {
        const nextParents = [...parents, this];
        const textList: string[] = [];
        for (const element of this.elements) {
            textList.push(element.toLiteral(nextParents));
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
            const key = toKnownValue(entry[0]);
            this.addField(key, toPetValue(entry[1]));
        }
    }
    
    getOptionalMember(key: KnownValue | PetValue): PetValue | undefined {
        const mapKey = toMapKey(key);
        const field = this.fields.get(mapKey);
        return field?.value;
    }
    
    getMember(key: KnownValue | PetValue): PetValue {
        const value = this.getOptionalMember(key);
        if (typeof value === "undefined") {
            throw new ValueError(`Key ${toLiteral(key)} does not exist in map.`);
        }
        return value;
    }
    
    setMember(inputKey: KnownValue | PetValue, inputValue: KnownValue | PetValue): void {
        const key = toKnownValue(inputKey);
        const value = toPetValue(inputValue);
        const mapKey = knownValueToMapKey(key);
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
    
    deferMember(key: KnownValue | PetValue, message: string): PetValue {
        return deferMember(this, toKnownValue(key), message);
    }
    
    hasKey(key: KnownValue | PetValue): boolean {
        return (typeof this.getOptionalMember(key) !== "undefined");
    }
    
    addField(inputKey: KnownValue | PetValue, value: KnownValue | PetValue): void {
        const key = toKnownValue(inputKey);
        if (this.hasKey(key)) {
            throw new ValueError(`Duplicate map key ${knownValueToLiteral(key)}.`);
        }
        this.setMember(key, value);
    }
    
    deleteField(key: KnownValue | PetValue): void {
        const mapKey = toMapKey(key);
        if (!this.fields.has(mapKey)) {
            throw new ValueError(`Key ${toLiteral(key)} does not exist in map.`);
        }
        this.fields.delete(mapKey);
    }
    
    toString(parents: KnownValue[] = []): string {
        const nextParents = [...parents, this];
        const textList: string[] = [];
        this.fields.forEach(({ key, value }) => {
            const keyString = knownValueToLiteral(key, nextParents);
            const valueString = value.toLiteral(nextParents);
            textList.push(`(${keyString}) = (${valueString})`);
        });
        const fieldsText = textList.join(", ");
        return `MAP [FIELDS [${fieldsText}]]`;
    }
    
    shallowCopy(): PetMap {
        const fields = Array.from(this.fields.values());
        return new PetMap(fields.map((field) => [field.key, field.value]));
    }
    
    getKeys(): KnownValue[] {
        return Array.from(this.fields.values()).map((field) => field.key);
    }
}

export abstract class PetFunc {
    
    constructor() {
        // Do nothing.
    }
    
    abstract getMinArgAmount(): number;
    
    // Should return null if the function has no maximum amount of arguments.
    abstract getMaxArgAmount(): number | null;
    
    abstract call(task: Task, args: PetList): Action;
    
    abstract toString(): string;
}

export class UserFunc extends PetFunc {
    // Statement sequence component which contains the function body.
    stmtsComp: PetMap;
    // Following the parents of `topFrame` leads to `bottomFrame`. All of the frames
    // from `topFrame` to `bottomFrame` are pruned to only contain necessary entries.
    topFrame: PetMap | null;
    bottomFrame: PetMap | null;
    // `bottomFrame` may be modified so its parent is the frame of `permaFrameScope`.
    permaFrameScope: PetMap | null;
    signature: FuncSignature;
    
    constructor(stmtsComp: PetMap, varSpace: PetMap, accessedVars: PetMap) {
        super();
        this.stmtsComp = stmtsComp;
        const { topFrame, bottomFrame, permaFrameScope } = pruneFrames(
            varSpace, accessedVars,
        );
        this.topFrame = topFrame;
        this.bottomFrame = bottomFrame;
        this.permaFrameScope = permaFrameScope;
        this.signature = getFuncSignature(this.stmtsComp);
    }
    
    getMinArgAmount(): number {
        return this.signature.minArgAmount;
    }
    
    getMaxArgAmount(): number | null {
        return this.signature.maxArgAmount;
    }
    
    call(task: Task, argValues: PetList): Action {
        const scope = this.stmtsComp.getMember(symbols.SCOPE).getMap();
        const bodyFrame = createFrame(scope, this.topFrame);
        if (this.permaFrameScope !== null) {
            const permaFrame = this.permaFrameScope.getMember(symbols.PERMA_FRAME).getKnownValue();
            if (permaFrame instanceof PetMap) {
                const bottomFrame = this.bottomFrame ?? bodyFrame;
                bottomFrame.setMember(symbols.PARENT, permaFrame);
            } else if (permaFrame !== null) {
                throw new PetTypeError("#PERMA_FRAME field must store a map or null.");
            }
        }
        return task.runTask(
            callUserFuncTask, { userFunc: this, argValues, bodyFrame },
            (value) => task.returnValue(value),
        );
    }
    
    toString(): string {
        const posText = entityPosToString(this.stmtsComp);
        return `<User function on ${posText}>`;
    }
}

export abstract class StackTrace {
    
    abstract getEntries(): ModulePos[];
    
    getTopEntry(): ModulePos | undefined {
        const entries = this.getEntries();
        return (entries.length > 0) ? entries[0] : undefined;
    }
    
    toString(): string {
        const lines = this.getEntries().map((pos, index) => {
            const isFirstEntry = (index === 0);
            const prefix = isFirstEntry ? "On " : "Called from ";
            return prefix + modulePosToString(pos, isFirstEntry);
        });
        return lines.join("\n");
    }
}

export class EvalState extends StackTrace {
    currentTask: Task;
    actionToResume: Action;
    pos?: ModulePos;
    
    constructor(currentTask: Task, actionToResume: Action, pos?: ModulePos) {
        super();
        this.currentTask = currentTask;
        this.actionToResume = actionToResume;
        this.pos = pos;
    }
    
    getEntries(): ModulePos[] {
        const output: ModulePos[] = [];
        if (typeof this.pos !== "undefined") {
            output.push(this.pos);
        }
        let task: Task | null = this.currentTask;
        let topNode: PetMap | null = null;
        while (task !== null) {
            if (topNode === null) {
                const { taskNode } = task.members;
                if (typeof taskNode !== "undefined") {
                    topNode = taskNode;
                    const nodePos = entityToModulePos(taskNode);
                    if (typeof this.pos === "undefined"
                            || nodePos.lineNumber !== this.pos.lineNumber
                            || nodePos.modulePath !== this.pos.modulePath) {
                        output.push(nodePos);
                    }
                }
            } else {
                const { callerNode } = task.members;
                if (typeof callerNode !== "undefined") {
                    output.push(entityToModulePos(callerNode));
                }
            }
            task = task.members.parentTask;
        }
        return output;
    }
}

export class PackageResolverTrace extends StackTrace {
    pos?: ModulePos;
    
    constructor(pos?: ModulePos) {
        super();
        this.pos = pos;
    }
    
    getEntries(): ModulePos[] {
        const output: ModulePos[] = [];
        if (typeof this.pos !== "undefined") {
            output.push(this.pos);
        }
        return output;
    }
}


