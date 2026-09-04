
export class PetSymbol {
    displayName: string;
    
    constructor(displayName: string) {
        this.displayName = displayName;
    }
    
    toString() {
        return this.displayName;
    }
}

const symbolNames = [
    "NULL", "INT", "SYMBOL", "STR", "LIST", "MAP", "FUNC", "EVAL_STATE",
    "SYNTAX_ERROR", "TYPE_ERROR", "VALUE_ERROR", "STATE_ERROR", "PREP",
    "EVAL", "ACCESSED_VARS", "FILE_SYSTEM", "ATTR", "ATTRS", "ATTRS_COMP",
    "AWAIT_EXCEP", "BREAK_EXCEP", "BUILT_IN_MODULE", "BUNCH", "COL_NUM",
    "COMP_TYPE", "COMPS", "COND", "CONT_EXCEP", "DECL_COMP", "DEPS", "DEST_VAR", "DIR_PATH",
    "ERROR_EXCEP", "ERROR_TYPE", "EXCEP_TYPE", "EXPR", "EXPR_TYPE",
    "EXPRS", "EXPRS_COMP", "FILE_PATH", "FRAME", "FRAME_ENTRIES", "GRADE", "IDENT",
    "IDENT_COMP", "IDENT_EXPR", "IMPORT_VAR", "INT_COMP", "INT_EXPR",
    "INVOC", "INVOC_EXPR", "INVOC_STMT", "IS_FRAME", "IS_FRAME_ENTRY",
    "IS_PROC", "IS_SCOPE", "LINE_NUM", "LOC", "MAIN_MODULE", "MESSAGE", "METHODS",
    "MODULE", "MODULE_TYPE", "NODE_TYPE", "PACK", "PARENT", "PASS_EXCEP",
    "PETROL_MODULE", "PHASE", "PREP_GRADE", "PREP_PHASE", "PREP_VAR", "RET_EXCEP",
    "RET_LEVEL", "SCOPE", "SPECIFIER", "SRC_VAR", "STMT", "STMT_TYPE", "STMTS", "STMTS_COMP",
    "STR_COMP", "STR_EXPR", "VALUE", "VAR", "VAR_TYPE", "VARS", "VER",
    "WORK_GRADE", "WORK_PHASE", "WORK_VAR",
];
export const symbols: { [name: string]: PetSymbol } = {};
for (const name of symbolNames) {
    const symbol = new PetSymbol("#" + name)
    symbols[name] = symbol;
}


