
import { PetSymbol } from "./value.js";

const symbolNames = [
    "NULL", "INT", "SYMBOL", "STR", "LIST", "MAP", "FUNC", "EVAL_STATE",
    "SYNTAX_ERROR", "TYPE_ERROR", "VALUE_ERROR", "STATE_ERROR", "PREP",
    "EVAL", "ACCESSED_VARS", "FILE_SYSTEM", "ATTR", "ATTRS", "ATTRS_COMP",
    "AWAIT_EXCEP", "BREAK_EXCEP", "BUILT_IN_MODULE", "BUNCH", "COL_NUM",
    "COMP_TYPE", "COMPS", "COND", "CONT_EXCEP", "DECL_COMP",
    "ERROR_EXCEP", "ERROR_TYPE", "EXCEP_TYPE", "EXPR", "EXPR_TYPE",
    "EXPRS", "EXPRS_COMP", "FILE_PATH", "FRAME", "FRAME_ENTRIES", "IDENT",
    "IDENT_COMP", "IDENT_EXPR", "IMPORT_VAR", "INT_COMP", "INT_EXPR",
    "INVOC", "INVOC_EXPR", "INVOC_STMT", "IS_FRAME", "IS_FRAME_ENTRY",
    "IS_PROC", "IS_SCOPE", "LINE_NUM", "LOC", "MESSAGE", "METHODS",
    "MODULE", "MODULE_TYPE", "NODE_TYPE", "PARENT", "PASS_EXCEP",
    "PETROL_MODULE", "PHASE", "PREP_PHASE", "PREP_VAR", "RET_EXCEP",
    "RET_LEVEL", "SCOPE", "STMT", "STMT_TYPE", "STMTS", "STMTS_COMP",
    "STR_COMP", "STR_EXPR", "VALUE", "VAR", "VAR_TYPE", "VARS",
    "WORK_PHASE", "WORK_VAR",
];
export const symbols: { [name: string]: PetSymbol } = {};
for (const name of symbolNames) {
    const symbol = new PetSymbol("#" + name)
    symbols[name] = symbol;
}


