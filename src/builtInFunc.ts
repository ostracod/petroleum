
import * as taskModule from "./task.js";
import * as actionModule from "./action.js";
import { PetValue, PetFunc } from "./value.js";

type Action = actionModule.Action;
type Task = taskModule.Task;

export abstract class BuiltInFunc extends PetFunc {
    
    toString(): string {
        return "<builtInFunc>";
    }
}

class ReturnTrueFunc extends BuiltInFunc {
    
    call(parentTask: Task, args: PetValue[]): Action {
        return new actionModule.ReturnAction(parentTask, 1n);
    }
}

export const returnTrueFunc = new ReturnTrueFunc();


