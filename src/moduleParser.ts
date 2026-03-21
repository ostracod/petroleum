
import * as fs from "fs";
import { escapeChars, PetValue, PetString, PetList, PetMap } from "./value.js";
import { symbols } from "./constants.js";

interface ContentPos {
    lineNumber: BigInt;
    columnNumber: BigInt;
}

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

const getCompPos = (component: PetMap): ContentPos => ({
    lineNumber: component.getMember(symbols.LINE_NUM) as BigInt,
    columnNumber: component.getMember(symbols.COL_NUM) as BigInt,
});

const posToFields = (pos: ContentPos): [PetValue, PetValue][] => ([
    [symbols.LINE_NUM, pos.lineNumber],
    [symbols.COL_NUM, pos.columnNumber],
]);

const getCompPosFields = (component: PetMap): [PetValue, PetValue][] => (
    posToFields(getCompPos(component))
);

const invocCompIsValid = (component: PetMap): boolean => {
    const compType = component.getMember(symbols.COMP_TYPE);
    if (compType === symbols.IDENT_COMP) {
        return true;
    }
    if (compType !== symbols.EXPRS_COMP) {
        return false;
    }
    const expressions = component.getMember(symbols.EXPRS) as PetList;
    return (expressions.getLength() === 1);
};

const setParents = (maps: PetMap[], parent: PetValue): void => {
    for (const map of maps) {
        map.setMember(symbols.PARENT, parent);
    }
}

const createStmtsComp = (
    statements: PetMap[],
    attributes: PetMap[],
    pos: ContentPos,
): PetMap => {
    const stmtsComp = new PetMap([
        [symbols.COMP_TYPE, symbols.STMTS_COMP],
        [symbols.ATTRS, new PetList(attributes)],
        [symbols.STMTS, new PetList(statements)],
        // TODO: Specify scope.
        
        [symbols.PHASE, symbols.PREP_PHASE],
        [symbols.LINE_NUM, 0n],
        [symbols.COL_NUM, 0n],
    ]);
    setParents(attributes, stmtsComp);
    setParents(statements, stmtsComp);
    return stmtsComp;
};

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
    
    getPos(): ContentPos {
        return {
            lineNumber: BigInt(this.lineNumber),
            columnNumber: BigInt(this.columnNumber),
        };
    }
    
    getPosFields(): [PetValue, PetValue][] {
        return posToFields(this.getPos());
    }
    
    throwError(message: string, pos?: ContentPos): void {
        if (typeof pos === "undefined") {
            pos = this.getPos();
        }
        throw new Error(`Syntax error on line ${pos.lineNumber}, column ${pos.columnNumber} of ${this.modulePath}: ${message}`);
    }
    
    parseIntComp(): PetMap {
        const posFields = this.getPosFields();
        const intText = this.matchChars(isDigit);
        const intValue = parseInt(intText, 10);
        return new PetMap([
            [symbols.COMP_TYPE, symbols.INT_COMP],
            [symbols.INT, BigInt(intValue)],
            ...posFields,
        ]);
    }
    
    parseStrComp(): PetMap {
        const posFields = this.getPosFields();
        // Pass over quotation mark.
        this.advance(1);
        const chars: string[] = [];
        while (true) {
            let character = this.readText(1);
            if (character === null) {
                this.throwError("Missing end quotation mark.");
            } else if (character === "\"") {
                break;
            } else if (character === "\\") {
                const pos = this.getPos();
                const escape = this.readText(1);
                if (escape === null) {
                    this.throwError("Missing escaped string character.", pos);
                }
                character = escapeChars[escape];
                if (typeof character === "undefined") {
                    this.throwError(`Unknown escaped string character "${escape}".`, pos);
                }
            }
            chars.push(character);
        }
        const text = chars.join("");
        return new PetMap([
            [symbols.COMP_TYPE, symbols.STR_COMP],
            [symbols.STR, new PetString(text)],
            ...posFields,
        ]);
    }
    
    parseIdentComp(): PetMap {
        const posFields = this.getPosFields();
        const identifier = this.readIdentifier();
        return new PetMap([
            [symbols.COMP_TYPE, symbols.IDENT_COMP],
            [symbols.IDENT, new PetString(identifier)],
            ...posFields,
        ]);
    }
    
    parseDeclComp(): PetMap {
        const posFields = this.getPosFields();
        // Pass over "@" symbol.
        this.advance(1);
        const identifier = this.readIdentifier();
        const variable = new PetMap([
            [symbols.VAR_TYPE, null],
            [symbols.IDENT, new PetString(identifier)],
            // TODO: Specify parent scope.
            
        ]);
        return new PetMap([
            [symbols.COMP_TYPE, symbols.DECL_COMP],
            [symbols.VAR, variable],
            ...posFields,
        ]);
    }
    
    parseStmtsComp(): PetMap {
        const pos = this.getPos();
        // Pass over curly brace.
        this.advance(1);
        const { statements, attributes } = this.parseStmtSequence();
        const endBracePos = this.getPos();
        const character = this.readText(1);
        if (character !== "}") {
            this.throwError("Expected close curly brace.", endBracePos);
        }
        return createStmtsComp(statements, attributes, pos);
    }
    
    parseExprsComp(): PetMap {
        const posFields = this.getPosFields();
        // Pass over parenthesis.
        this.advance(1);
        const compsSequence = this.parseCompsSequence();
        const expressions = compsSequence.map(this.compsToExpression);
        const endParenPos = this.getPos();
        const character = this.readText(1);
        if (character !== ")") {
            this.throwError("Expected close parenthesis.", endParenPos);
        }
        const exprsComp = new PetMap([
            [symbols.COMP_TYPE, symbols.EXPRS_COMP],
            [symbols.EXPRS, new PetList(expressions)],
            [symbols.PHASE, symbols.PREP_PHASE],
            ...posFields,
        ])
        setParents(expressions, exprsComp);
        return exprsComp;
    }
    
    parseAttrsComp(): PetMap {
        const posFields = this.getPosFields();
        // Pass over bracket.
        this.advance(1);
        const compsSequence = this.parseCompsSequence();
        const attributes = compsSequence.map(this.compsToAttribute);
        const endBracketPos = this.getPos();
        const character = this.readText(1);
        if (character !== "]") {
            this.throwError("Expected close bracket.", endBracketPos);
        }
        const attrsComp = new PetMap([
            [symbols.COMP_TYPE, symbols.ATTRS_COMP],
            [symbols.ATTRS, new PetList(attributes)],
            ...posFields,
        ])
        setParents(attributes, attrsComp);
        return attrsComp;
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
            return null;
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
    
    compsToExpression(components: PetMap[]): PetMap {
        const firstComp = components[0];
        const pos = getCompPos(firstComp);
        const commonFields: [PetValue, PetValue][] = [
            [symbols.NODE_TYPE, symbols.EXPR],
            [symbols.COMPS, new PetList(components)],
            [symbols.PHASE, symbols.PREP_PHASE],
            ...posToFields(pos),
        ];
        let expression: PetMap;
        const firstCompType = firstComp.getMember(symbols.COMP_TYPE);
        if (components.length > 1) {
            if (!invocCompIsValid(firstComp)) {
                this.throwError("Invalid invocable component", pos);
            }
            expression = new PetMap([
                [symbols.EXPR_TYPE, symbols.INVOC_EXPR],
                [symbols.INVOC, null],
                ...commonFields,
            ]);
        } else if (firstCompType === symbols.INT_COMP) {
            expression = new PetMap([
                [symbols.EXPR_TYPE, symbols.INT_EXPR],
                [symbols.INT, firstComp.getMember(symbols.INT)],
                ...commonFields,
            ]);
        } else if (firstCompType === symbols.STR_COMP) {
            expression = new PetMap([
                [symbols.EXPR_TYPE, symbols.STR_EXPR],
                [symbols.STR, firstComp.getMember(symbols.STR)],
                ...commonFields,
            ]);
        } else if (firstCompType === symbols.IDENT_COMP) {
            expression = new PetMap([
                [symbols.EXPR_TYPE, symbols.IDENT_EXPR],
                [symbols.IDENT, firstComp.getMember(symbols.IDENT)],
                [symbols.VAR, null],
                ...commonFields,
            ]);
        } else {
            this.throwError("Unknown expression type", pos);
        }
        setParents(components, expression);
        return expression;
    }
    
    compsToAttribute(components: PetMap[]): PetMap {
        return new PetMap([
            [symbols.NODE_TYPE, symbols.ATTR],
            [symbols.COMPS, new PetList(components)],
            ...getCompPosFields(components[0]),
        ]);
    }
    
    parseStmtSequence(): { statements: PetMap[], attributes: PetMap[] } {
        const compsSequence = this.parseCompsSequence();
        let statementIndex = 0;
        const firstComps = compsSequence[statementIndex];
        let attributes: PetMap[] = [];
        if (firstComps.length === 1) {
            const firstComp = firstComps[0];
            if (firstComp.getMember(symbols.COMP_TYPE) === symbols.ATTRS_COMP) {
                const attrsList = firstComp.getMember(symbols.ATTRS) as PetList;
                attributes = attrsList.getMembers() as PetMap[];
                statementIndex += 1;
            }
        }
        const statements: PetMap[] = [];
        while (statementIndex < compsSequence.length) {
            const components = compsSequence[statementIndex];
            const firstComp = components[0];
            const pos = getCompPos(firstComp);
            if (!invocCompIsValid(firstComp)) {
                this.throwError("Invalid invocable component", pos);
            }
            const statement = new PetMap([
                [symbols.NODE_TYPE, symbols.STMT],
                [symbols.STMT_TYPE, symbols.INVOC_STMT],
                [symbols.INVOC, null],
                [symbols.PHASE, symbols.PREP_PHASE],
                [symbols.COMPS, new PetList(components)],
                ...posToFields(pos),
            ]);
            setParents(components, statement);
            statements.push(statement);
            statementIndex += 1;
        }
        return { statements, attributes };
    }
    
    parseModule(): PetMap {
        this.moduleContent = fs.readFileSync(this.modulePath, "utf8");
        this.contentIndex = 0;
        this.lineNumber = 1;
        this.columnNumber = 1;
        const { statements, attributes } = this.parseStmtSequence();
        const character = this.peekText(1);
        if (character !== null) {
            this.throwError(`Unexpected character "${character}"`);
        }
        const dummyPos: ContentPos = { lineNumber: 0n, columnNumber: 0n };
        const stmtsComp = createStmtsComp(statements, attributes, dummyPos);
        const module = new PetMap([
            [symbols.MODULE_TYPE, symbols.PETROL_MODULE],
            [symbols.FILE_PATH, new PetString(this.modulePath)],
            [symbols.STMTS_COMP, stmtsComp],
            // TODO: Specify scope.
            
        ]);
        stmtsComp.setMember(symbols.PARENT, module);
        return module;
    }
}


