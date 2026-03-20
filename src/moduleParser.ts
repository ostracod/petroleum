
import * as fs from "fs";
import { PetValue, PetString, PetList, PetMap } from "./value.js";
import { symbols } from "./constants.js";

const identifierSymbols = new Set("_.?!:;'`+-*/%=<>~&|^#$".split(""));

const isDigit = (character: string): boolean => {
    const charCode = character.charCodeAt(0);
    return (charCode >= 48 && charCode <= 57);
};

const isIdentFirstChar = (character: string): boolean => {
    const charCode = character.charCodeAt(0);
    return ((charCode >= 65 && charCode <= 90) || (charCode >= 97 && charCode <= 122)
        || identifierSymbols.has(character));
};

const isIdentChar = (character: string): boolean => (
    isIdentFirstChar(character) || isDigit(character)
);

export class ModuleParser {
    modulePath: string;
    moduleContent: string;
    contentIndex: number;
    lineNumber: number;
    columnNumber: number;
    
    // `modulePath` must be an absolute path.
    constructor(modulePath: string) {
        this.modulePath = modulePath;
    }
    
    peekText(length: number): string | null {
        const endIndex = this.contentIndex + length;
        if (endIndex > this.moduleContent.length) {
            return null;
        } else {
            return this.moduleContent.substring(this.contentIndex, endIndex);
        }
    }
    
    advance(amount: number): void {
        let count = 0;
        while (count < amount && this.contentIndex < this.moduleContent.length) {
            const character = this.moduleContent.charAt(this.contentIndex);
            if (character === "\n") {
                this.lineNumber += 1;
                this.columnNumber = 1;
            } else {
                this.columnNumber += 1;
            }
            this.contentIndex += 1;
            count += 1;
        }
    }
    
    readText(length: number): string | null {
        const output = this.peekText(length);
        if (output !== null) {
            this.advance(length);
        }
        return output;
    }
    
    skipText(textToSkip: string): void {
        const charAmount = textToSkip.length;
        const text = this.peekText(charAmount);
        if (text === textToSkip) {
            this.advance(charAmount);
        }
    }
    
    // The length of each string in `chars` must be 1.
    skipChars(charsToSkip: string[]): void {
        while (true) {
            const character = this.peekText(1);
            if (!charsToSkip.includes(character)) {
                break;
            }
            this.advance(1);
        }
    }
    
    matchChars(match: (character: string) => boolean): string {
        const chars: string[] = [];
        while (true) {
            const character = this.peekText(1);
            if (character === null || !match(character)) {
                break;
            }
            chars.push(character);
            this.advance(1);
        }
        return chars.join("");
    }
    
    readIdentifier(): string {
        return this.matchChars(isIdentChar);
    }
    
    getContentPosFields(): [PetValue, PetValue][] {
        return [
            [symbols.LINE_NUM, BigInt(this.lineNumber)],
            [symbols.COL_NUM, BigInt(this.columnNumber)],
        ];
    }
    
    parseIntComp(): PetMap {
        const posFields = this.getContentPosFields();
        const intText = this.matchChars(isDigit);
        const intValue = parseInt(intText, 10);
        return new PetMap([
            [symbols.COMP_TYPE, symbols.INT_COMP],
            [symbols.INT, BigInt(intValue)],
            ...posFields,
        ]);
    }
    
    parseStrComp(): PetMap {
        throw new Error("Not yet implemented");
    }
    
    parseIdentComp(): PetMap {
        throw new Error("Not yet implemented");
    }
    
    parseDeclComp(): PetMap {
        throw new Error("Not yet implemented");
    }
    
    parseStmtsComp(): PetMap {
        throw new Error("Not yet implemented");
    }
    
    parseExprsComp(): PetMap {
        throw new Error("Not yet implemented");
    }
    
    parseAttrsComp(): PetMap {
        throw new Error("Not yet implemented");
    }
    
    parseComponent(): PetMap | null {
        const firstChar = this.peekText(1);
        if (firstChar === null) {
            return null;
        } else if (isDigit(firstChar)) {
            return this.parseIntComp();
        } else if (firstChar === "\"") {
            return this.parseStrComp();
        } else if (isIdentFirstChar(firstChar)) {
            return this.parseIdentComp();
        } else if (firstChar === "@") {
            return this.parseDeclComp();
        } else if (firstChar === "{") {
            return this.parseStmtsComp();
        } else if (firstChar === "(") {
            return this.parseExprsComp();
        } else if (firstChar === "[") {
            return this.parseAttrsComp();
        } else {
            throw new Error(`Unexpected character "${firstChar}"`);
        }
    }
    
    // Returns a list of components belonging to a node.
    parseComponents(): PetMap[] {
        const output: PetMap[] = [];
        while (true) {
            const component = this.parseComponent();
            if (component === null) {
                break;
            }
            output.push(component);
            this.skipChars([" "]);
        }
        return output;
    }
    
    // Returns lists of components belonging to nodes in a sequence.
    parseCompsSequence(): PetMap[][] {
        const output: PetMap[][] = [];
        while (true) {
            this.skipChars([" ", "\n"]);
            const components = this.parseComponents();
            if (components.length <= 0) {
                break;
            }
            output.push(components);
            this.skipText(",");
        }
        return output;
    }
    
    parseModule(): PetMap {
        this.moduleContent = fs.readFileSync(this.modulePath, "utf8");
        this.contentIndex = 0;
        this.lineNumber = 1;
        this.columnNumber = 1;
        
        // TODO: Parse statement sequence.
        
        const attributes = new PetList();
        const statements = new PetList();
        const scope = null;
        const stmtsComp = new PetMap([
            [symbols.COMP_TYPE, symbols.stmtsComp],
            [symbols.ATTRS, attributes],
            [symbols.STMTS, statements],
            [symbols.SCOPE, scope],
            [symbols.PHASE, symbols.PREP_PHASE],
            [symbols.LINE_NUM, 0n],
            [symbols.COL_NUM, 0n],
        ]);
        const module = new PetMap([
            [symbols.MODULE_TYPE, symbols.PETROL_MODULE],
            [symbols.FILE_PATH, new PetString(this.modulePath)],
            [symbols.STMTS_COMP, stmtsComp],
            [symbols.SCOPE, scope],
        ]);
        stmtsComp.setMember(symbols.PARENT, module);
        return module;
    }
}


