
import { PetString, PetList, PetMap } from "./value.js";
import { symbols } from "./constants.js";

export class ModuleParser {
    modulePath: string;
    
    // `modulePath` must be an absolute path.
    constructor(modulePath: string) {
        this.modulePath = modulePath;
    }
    
    parseModule(): PetMap {
        // TODO: Implement.
        
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


