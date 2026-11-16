
import { PetContext } from "./context.js";

export class Petroleum {
    #context: PetContext;
    
    constructor(packagePath: string, args: string[] = []) {
        this.#context = new PetContext(packagePath, args);
    }
    
    run(): void {
        this.#context.run();
    }
    
    hasReportedProblem(): boolean {
        return this.#context.hasReportedProblem();
    }
}


