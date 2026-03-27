
import { PetException } from "./value.js";
import { Scheduler } from "./scheduler.js";

export abstract class Task {
    parentTask: Task | null;
    
    constructor(parentTask: Task | null) {
        this.parentTask = parentTask;
    }
    
    abstract advance(scheduler: Scheduler): Task | PetException | null;
    
    handleException(exception: PetException): Task | PetException | null {
        return this.parentTask;
    }
}


