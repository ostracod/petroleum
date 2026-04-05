
import { PetSymbol } from "./symbol.js";
import * as taskModule from "./task.js";
import { Scheduler } from "./scheduler.js";

type Task = taskModule.Task;

// PetValueAndKey contains types which can be used as both values and Map keys.
export type PetValueAndKey = null | bigint | PetSymbol | PetList | PetMap | PetFunc | EvalState;
export type PetValue = PetString | PetValueAndKey;
export type MapKey = string | PetValueAndKey;

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

export const valueToString = (value: PetValue, parents: PetValue[] = []): string => {
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

const valueToMapKey = (value: PetValue): MapKey => (
    (value instanceof PetString) ? value.toHexString() : value
);

export const valuesAreEqual = (value1: PetValue, value2: PetValue): boolean => {
    if (value1 instanceof PetString && value2 instanceof PetString) {
        const buffer1 = value1.toBuffer();
        const buffer2 = value2.toBuffer();
        return buffer1.equals(buffer2);
    } else {
        return (value1 === value2);
    }
}

export interface ObservableBunchIface<T extends PetValue = PetValue> {
    observatory: MemberObservatory<T>;
    getMember(location: T): PetValue;
}

export type ObservableBunch<T extends PetValue = PetValue> = PetValue & ObservableBunchIface<T>;

export class MemberObserver<T extends PetValue = PetValue> {
    bunch: ObservableBunch<T>;
    location: T;
    condition: PetFunc;
    taskToResume: Task;
    
    constructor(
        bunch: ObservableBunch<T>,
        location: T,
        condition: PetFunc,
        taskToResume: Task,
    ) {
        this.bunch = bunch;
        this.location = location;
        this.condition = condition;
        this.taskToResume = taskToResume;
    }
    
    getMemberValue(): PetValue {
        return this.bunch.getMember(this.location);
    }
}

class MemberObservatory<T extends PetValue> {
    bunch: ObservableBunch<T>;
    observers: Map<MapKey, Set<MemberObserver<T>>>;
    scheduler: Scheduler;
    
    constructor(bunch: ObservableBunch<T>) {
        this.bunch = bunch;
        this.observers = new Map();
    }
    
    addObserver(
        scheduler: Scheduler,
        location: T,
        condition: PetFunc,
        taskToResume: Task,
    ): void {
        this.scheduler = scheduler;
        const mapKey = valueToMapKey(location);
        let observers = this.observers.get(mapKey);
        if (typeof observers === "undefined") {
            observers = new Set();
            this.observers.set(mapKey, observers);
        }
        const observer = new MemberObserver(this.bunch, location, condition, taskToResume);
        observers.add(observer);
    }
    
    handleMemberChange(location: T): void {
        const mapKey = valueToMapKey(location);
        const observers = this.observers.get(mapKey);
        if (typeof observers === "undefined") {
            return;
        }
        this.observers.delete(mapKey);
        for (const observer of observers) {
            const condTask = new taskModule.AwaitCondTask(observer);
            this.scheduler.schedule(condTask);
        }
    }
}

export class PetList implements ObservableBunchIface<bigint> {
    elements: PetValue[];
    observatory: MemberObservatory<bigint>;
    
    constructor(elements: PetValue[] = []) {
        this.elements = elements;
        this.observatory = new MemberObservatory<bigint>(this);
    }
    
    getMember(index: number | bigint): PetValue {
        return this.elements[Number(index)];
    }
    
    setMember(index: number | bigint, value: PetValue): void {
        const lastValue = this.elements[Number(index)];
        this.elements[Number(index)] = value;
        if (typeof lastValue === "undefined" || !valuesAreEqual(lastValue, value)) {
            this.observatory.handleMemberChange(BigInt(index));
        }
    }
    
    getLength(): number {
        return this.elements.length;
    }
    
    addElement(value: PetValue): void {
        const index = this.elements.length;
        this.elements.push(value);
        this.observatory.handleMemberChange(BigInt(index));
    }
    
    toString(parents: PetValue[] = []): string {
        const nextParents = [...parents, this];
        const textList: string[] = [];
        for (const element of this.elements) {
            textList.push(valueToString(element, nextParents));
        }
        const elementsText = textList.join(", ");
        return `LIST (${elementsText})`;
    }
}

class PetField {
    key: PetValue;
    value: PetValue;
    
    constructor(key: PetValue, value: PetValue) {
        this.key = key;
        this.value = value;
    }
}

export class PetMap implements ObservableBunchIface<PetValue> {
    fields: Map<MapKey, PetField>;
    observatory: MemberObservatory<PetValue>;
    
    constructor(entries: [PetValue, PetValue][] = []) {
        this.fields = new Map();
        for (const entry of entries) {
            this.setMember(entry[0], entry[1]);
        }
        this.observatory = new MemberObservatory<PetValue>(this);
    }
    
    getMember(key: PetValue): PetValue | undefined {
        const mapKey = valueToMapKey(key);
        const field = this.fields.get(mapKey);
        return field?.value;
    }
    
    setMember(key: PetValue, value: PetValue): void {
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
        if (typeof lastValue === "undefined" || !valuesAreEqual(lastValue, value)) {
            this.observatory.handleMemberChange(key);
        }
    }
    
    toString(parents: PetValue[] = []): string {
        const nextParents = [...parents, this];
        const textList: string[] = [];
        this.fields.forEach(({ key, value }) => {
            const keyString = valueToString(key, nextParents);
            const valueString = valueToString(value, nextParents);
            textList.push(`(${keyString}) = (${valueString})`);
        });
        const fieldsText = textList.join(", ");
        return `MAP [FIELDS [${fieldsText}]]`;
    }
}

// PetExceptions have #EXCEP_TYPE and #EVAL_STATE fields.
export type PetException = PetMap;
export const PetException = PetMap;

export abstract class PetFunc {
    
    constructor() {
        // Do nothing.
    }
    
    abstract call(parentTask: Task, args: PetValue[]): Task;
    
    abstract toString(): string;
}

export abstract class BuiltInFunc extends PetFunc {
    
    toString(): string {
        return "<builtInFunc>";
    }
}

export class EvalState {
    task: Task;
    
    constructor(task: Task) {
        this.task = task;
    }
    
    toString(): string {
        throw new Error("Not yet implemented");
    }
}


